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

export interface ContextCompactionResult {
  messages: any[];
  wasCompacted: boolean;
  disclaimer: string | null;
  originalTokenCount: number;
  compactedTokenCount: number;
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
      enabledModels: [],
      allModels: [],
    });

    // Create pipeline stages
    const stages = createPipelineStages(
      this.hardwareInfo,
      fleetManager.fleet,
      '',
      async (sessionId) => this.deps.telemetryStore.getSessionPin(sessionId),
      this.deps.telemetryStore,
      this.deps.config,
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
      filteredModels: [...fleetManager.fleet],
      stageResults: [],
      currentStage: 0,
      decisionSoFar: null,
    };

    // Check session pin first (before pipeline)
    if (this.deps.config.sessionPinning) {
      const pin = await this.deps.telemetryStore.getSessionPin(request.sessionId);
      if (pin) {
        const pinnedModel = fleetManager.getModelById(pin.pinnedModelId);
        if (pinnedModel && pinnedModel.health.status === 'healthy' && pinnedModel.provider === pin.pinnedProvider) {
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
        await this.deps.telemetryStore.breakPin(request.sessionId);
      }
    }

    // Show pre-routing message
    this.showPreRoutingMessage(request);

    // Run pipeline
    let decision: RoutingDecision;
    try {
      decision = await this.pipeline.execute(context);
    } catch (error) {
      if (error instanceof RouterError) throw error;
      throw new RouterError(
        'Routing pipeline failed. Use `/model <provider/model>` to manually select.',
        error instanceof Error ? error : undefined
      );
    }

    // Handle context window mismatch for the selected model
    const selectedModel = fleetManager.getModelById(decision.model);
    let compactionResult: ContextCompactionResult | null = null;
    
    if (selectedModel && request.estimatedInputTokens > selectedModel.contextWindow) {
      compactionResult = await this.compactContext(request.messages, selectedModel.contextWindow);
      // Add compaction info to decision for downstream use
      decision.contextCompaction = compactionResult;
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

  /**
   * Show pre-routing notification to user
   */
  private showPreRoutingMessage(request: RoutingRequest): void {
    // This would be sent via the DSH UI notification system
    // For now, we'll attach it to the request for the hook to pick up
    (request as any)._preRoutingMessage = `🔄 Routing request...`;
    
    // The hook in index.ts will pick this up and show via ctx.ui.notify
    if (this.deps.ctx?.ui?.notify) {
      this.deps.ctx.ui.notify(`🔄 Routing to best model...`, 'info');
    }
  }

  /**
   * Smart context compaction when input exceeds model's context window
   * Returns compacted messages with disclaimer
   */
  async compactContext(
    messages: any[], 
    targetContextWindow: number,
    reserveTokens: number = 2000 // Reserve for response
  ): Promise<ContextCompactionResult> {
    const availableTokens = targetContextWindow - reserveTokens;
    const originalTokenCount = this.estimateTotalTokens(messages);
    
    if (originalTokenCount <= availableTokens) {
      return {
        messages,
        wasCompacted: false,
        disclaimer: null,
        originalTokenCount,
        compactedTokenCount: originalTokenCount,
      };
    }

    // Strategy: Keep system message, recent messages, and summarize older ones
    const systemMessages = messages.filter(m => m.role === 'system');
    const userAssistantMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
    
    // Always keep the last N messages intact (recent context)
    const keepRecent = 10; // Keep last 10 messages full
    const recentMessages = userAssistantMessages.slice(-keepRecent);
    const olderMessages = userAssistantMessages.slice(0, -keepRecent);
    
    let compactedMessages = [...systemMessages];
    let currentTokens = this.estimateTotalTokens(compactedMessages);
    
    // Add recent messages first (most important)
    for (const msg of recentMessages) {
      const msgTokens = this.estimateMessageTokens(msg);
      if (currentTokens + msgTokens <= availableTokens) {
        compactedMessages.push(msg);
        currentTokens += msgTokens;
      }
    }
    
    // If we still have room, summarize older messages
    if (olderMessages.length > 0 && currentTokens < availableTokens * 0.8) {
      const summary = await this.summarizeMessages(olderMessages);
      if (summary) {
        const summaryMsg = {
          role: 'system' as const,
          content: `[Conversation Summary]\n${summary}\n[End Summary]`
        };
        const summaryTokens = this.estimateMessageTokens(summaryMsg);
        if (currentTokens + summaryTokens <= availableTokens) {
          compactedMessages.push(summaryMsg);
          currentTokens += summaryTokens;
        }
      }
    }
    
    // If still over, truncate oldest recent messages
    while (currentTokens > availableTokens && compactedMessages.length > systemMessages.length + 2) {
      // Remove oldest non-system message
      const idx = compactedMessages.findIndex(m => m.role !== 'system');
      if (idx > 0) {
        const removed = compactedMessages.splice(idx, 1)[0];
        currentTokens -= this.estimateMessageTokens(removed);
      } else {
        break;
      }
    }
    
    const disclaimer = `⚠️ **Context Compacted**: Conversation was ${originalTokenCount} tokens but model only supports ${availableTokens} tokens. ${olderMessages.length > 0 ? `${olderMessages.length} older messages were summarized.` : 'Oldest messages were truncated.'} Some context may be lost.`;
    
    return {
      messages: compactedMessages,
      wasCompacted: true,
      disclaimer,
      originalTokenCount,
      compactedTokenCount: currentTokens,
    };
  }

  /**
   * Summarize older messages using a lightweight call
   * In production, this could use a small local model or a cheap API call
   */
  private async summarizeMessages(messages: any[]): Promise<string | null> {
    // For now, create a simple extractive summary
    // In production, this could call a small summarization model
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
    const assistantMessages = messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n');
    
    if (!userMessages && !assistantMessages) return null;
    
    const summaryParts = [];
    if (userMessages) {
      // Extract key topics from user messages (first 200 chars each)
      const topics = userMessages.split('\n').slice(0, 5).map(t => t.substring(0, 150)).join('; ');
      summaryParts.push(`User discussed: ${topics}`);
    }
    if (assistantMessages) {
      const topics = assistantMessages.split('\n').slice(0, 3).map(t => t.substring(0, 150)).join('; ');
      summaryParts.push(`Assistant covered: ${topics}`);
    }
    
    return summaryParts.join('\n');
  }

  /**
   * Estimate total tokens in messages
   */
  private estimateTotalTokens(messages: any[]): number {
    return messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
  }

  /**
   * Estimate tokens in a single message (rough: 4 chars = 1 token)
   */
  private estimateMessageTokens(message: any): number {
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
    return Math.ceil(content.length / 4) + 10; // +10 for role/overhead
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
      outputTokens: 0,
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
    const fleet = fleetManager.getAvailableModels();
    const sorted = fleet.sort((a, b) => b.contextWindow - a.contextWindow);
    return null;
  }

  async refreshPricing(): Promise<{ modelCount: number; lastUpdated: string }> {
    return { modelCount: fleetManager.fleet.length, lastUpdated: new Date().toISOString() };
  }
}

export function createSmartRouter(deps: SmartRouterDeps): SmartRouter {
  return new SmartRouter(deps);
}