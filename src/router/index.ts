// src/router/index.ts
// Main SmartRouter class

import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime } from '@deepseek-ai/dsh-llm';
import { Session } from '@deepseek-ai/dsh-session';
import { SystemInfoProvider } from '@deepseek-ai/dsh-home-paths';

import {
  SmartRouterConfig,
  RoutingRequest,
  RoutingDecision,
  ModelProfile,
  Tier,
  PipelineStage,
  PipelineContext,
  HardwareInfo,
  TelemetryEvent,
} from '../types';

import { fleetManager } from '../fleet';
import { probeHardware } from '../hardware/probe';
import { TelemetryStore } from '../telemetry';
import { createPipelineStages, RouterPipeline } from './pipeline';
import { RouterError } from './standalone-router-client';

export interface SmartRouterDeps {
  ctx: Context;
  llm: LlmRuntime;
  session: Session;
  systemInfo: SystemInfoProvider;
  config: SmartRouterConfig;
  telemetryStore: TelemetryStore;
}

export class SmartRouter {
  private pipeline: RouterPipeline;
  private hardwareInfo: HardwareInfo | null = null;
  private initialized = false;
  private lastDecision: RoutingDecision | null = null;

  constructor(private deps: SmartRouterDeps) {
    this.pipeline = new RouterPipeline([]);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Probe hardware
    if (this.deps.config.hardwareProbe) {
      this.hardwareInfo = await probeHardware();
    } else {
      this.hardwareInfo = {
        platform: process.platform,
        arch: process.arch,
        totalMemoryGb: 0,
        freeMemoryGb: 0,
        probe: 'disabled',
        localRuntimeAvailable: false,
      };
    }

    // Load fleet
    await fleetManager.loadFleet({
      hardwareInfo: this.hardwareInfo,
      config: this.deps.config,
      // TODO: Get enabled models and all models from DSH registry
      enabledModels: [],
      allModels: [],
    });

    // Create pipeline stages
    const stages = createPipelineStages(
      this.hardwareInfo,
      fleetManager.fleet,
      '', // sessionId - will be set per request
      async (sessionId) => this.deps.telemetryStore.getSessionPin(sessionId),
      this.deps.telemetryStore,
      this.deps.config, // Pass config for LLM Router Stage
    );

    this.pipeline = new RouterPipeline(stages);
    this.initialized = true;
  }

  async route(request: RoutingRequest): Promise<RoutingDecision> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    // Create pipeline context
    const context: PipelineContext = {
      request,
      hardware: this.hardwareInfo!,
      turnType: request.turnType,
      filteredModels: [...fleetManager.fleet], // Start with full fleet
      stageResults: [],
      currentStage: 0,
      decisionSoFar: null,
    };

    // Check session pin first (before pipeline)
    if (this.deps.config.sessionPinning) {
      const pin = await this.deps.telemetryStore.getSessionPin(request.sessionId);
      if (pin) {
        // Verify pinned model is available and healthy
        const pinnedModel = fleetManager.getModelById(pin.pinnedModelId);
        if (pinnedModel && pinnedModel.health.status === 'healthy' && pinnedModel.provider === pin.pinnedProvider) {
          // Check context fit
          if (pinnedModel.contextWindow >= request.estimatedInputTokens) {
            const decision: RoutingDecision = {
              provider: pinnedModel.provider,
              model: pinnedModel.id,
              tier: pinnedModel.tier,
              reasoning: `Session pinned: ${pin.pinReason}`,
              estimatedCost: pinnedModel.pricing.fallbackCostPer1M * (request.estimatedInputTokens / 1_000_000),
              estimatedLatencyMs: 50,
              confidence: 0.95,
              fallbackChain: [],
              sessionPinned: true,
              stage: 'session-pin',
            };

            await this.recordTelemetry(request, context, decision, startTime);
            this.lastDecision = decision;
            return decision;
          }
        }
        // Pin broken - will run full pipeline
        await this.deps.telemetryStore.breakPin(request.sessionId);
      }
    }

    // Run pipeline
    let decision: RoutingDecision;
    try {
      decision = await this.pipeline.execute(context);
    } catch (error) {
      if (error instanceof RouterError) throw error;
      throw new RouterError(
        'Routing pipeline failed. ' +
        'Use `/model <provider/model>` to manually select a model.',
        error instanceof Error ? error : undefined
      );
    }

    // Pin the model if configured
    if (this.deps.config.sessionPinning && !decision.sessionPinned) {
      await this.deps.telemetryStore.setSessionPin(request.sessionId, {
        pinnedModelId: decision.model,
        pinnedProvider: decision.provider,
        pinReason: decision.reasoning,
        hasEverSwitched: false,
        consecutiveUpstreamErrors: 0,
      });
    }

    // Record telemetry
    await this.recordTelemetry(request, context, decision, startTime);

    this.lastDecision = decision;
    return decision;
  }

  private async recordTelemetry(
    request: RoutingRequest,
    context: PipelineContext,
    decision: RoutingDecision,
    startTime: number
  ): Promise<void> {
    if (!this.deps.config.telemetry.enabled) return;

    const event: TelemetryEvent = {
      id: `${request.sessionId}-${request.turnId || Date.now()}`,
      timestamp: Date.now(),
      sessionId: request.sessionId,
      turnId: request.turnId || `turn-${Date.now()}`,
      provider: decision.provider,
      model: decision.model,
      tier: decision.tier,
      stage: decision.stage,
      reasonCode: decision.stage,
      reasoning: decision.reasoning,
      cost: decision.estimatedCost,
      latencyMs: Date.now() - startTime,
      sessionPinned: decision.sessionPinned,
      fallbackChain: decision.fallbackChain.map((m) => m.id),
      inputTokens: request.estimatedInputTokens,
      outputTokens: 0, // Will be updated after streaming
      planningDelegatePrimaryModelId: decision.features?.planning_delegate?.primary_model_id,
      planningDelegateModelId: decision.features?.planning_delegate?.delegate_model_id,
      turnType: request.turnType,
    };

    await this.deps.telemetryStore.record(event);
  }

  getFleet(): ModelProfile[] {
    return fleetManager.fleet;
  }

  getHardwareInfo(): HardwareInfo | null {
    return this.hardwareInfo;
  }

  getLastDecision(): RoutingDecision | undefined {
    return this.lastDecision || undefined;
  }

  async getContextOverflowFallback(sessionId: string): Promise<RoutingDecision | null> {
    // Find largest model that fits
    const fleet = fleetManager.getAvailableModels();
    const sorted = fleet.sort((a, b) => b.contextWindow - a.contextWindow);

    // TODO: Get session's estimated tokens from context
    // For now return null
    return null;
  }

  async refreshPricing(): Promise<{ modelCount: number; lastUpdated: string }> {
    // TODO: Fetch LiteLLM pricing
    return { modelCount: fleetManager.fleet.length, lastUpdated: new Date().toISOString() };
  }
}

export function createSmartRouter(deps: SmartRouterDeps): SmartRouter {
  return new SmartRouter(deps);
}