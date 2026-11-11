// src/router/pipeline.ts
// Simplified routing pipeline for cogumi-smart-router
// Stages: Hardware Probe → Loop Escalation → Turn Envelope → Context-Fit Gate → Session Pin → LLM Router (DEFAULT)

import {
  PipelineContext,
  PipelineStage,
  PipelineStageHandler,
  RoutingDecision,
  ModelProfile,
  Tier,
  RequiredCapabilities,
  SmartRouterConfig,
} from '../types';
import { AhoCorasick } from 'aho-corasick';
import { LLMRouterStage } from './llm-router-stage';

export interface PipelineStageConstructor {
  new (...args: any[]): PipelineStageHandler;
}

export class RouterPipeline {
  private stages: PipelineStageHandler[] = [];

  constructor(stages: PipelineStageHandler[]) {
    this.stages = stages;
  }

  async execute(context: PipelineContext): Promise<RoutingDecision> {
    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      context.currentStage = i;

      try {
        const decision = await stage.execute(context);
        if (decision) {
          context.stageResults.push({
            name: stage.name,
            passed: true,
            decision,
            details: {},
          });
          return decision;
        }
        context.stageResults.push({
          name: stage.name,
          passed: false,
          decision: null,
          details: {},
        });
      } catch (error) {
        context.stageResults.push({
          name: stage.name,
          passed: false,
          decision: null,
          details: { error: String(error) },
        });
        // Re-throw RouterError to bubble up to user
        throw error;
      }
    }

    throw new Error('Pipeline completed without routing decision');
  }

  getStages(): PipelineStageHandler[] {
    return [...this.stages];
  }
}

// Stage 1: Hardware Probe
export class HardwareProbeStage implements PipelineStageHandler {
  name: PipelineStage = 'hardware-probe';

  constructor(private hardwareInfo: any) {}

  async execute(context: PipelineContext): Promise<RoutingDecision | null> {
    context.hardware = this.hardwareInfo;
    return null;
  }
}

// Stage 2: Loop Escalation
export class LoopEscalationStage implements PipelineStageHandler {
  name: PipelineStage = 'loop-escalation';

  constructor(
    private sessionId: string,
    private getSessionPin: (sessionId: string) => Promise<any>,
    private store: any
  ) {}

  async execute(context: PipelineContext): Promise<RoutingDecision | null> {
    // Check for repeated tool failures in session
    // For now, return null (no escalation)
    return null;
  }
}

// Stage 3: Turn Envelope
export class TurnEnvelopeStage implements PipelineStageHandler {
  name: PipelineStage = 'turn-envelope';

  async execute(context: PipelineContext): Promise<RoutingDecision | null> {
    context.turnType = context.request.turnType;
    return null;
  }
}

// Stage 4: Context-Fit Gate
export class ContextFitStage implements PipelineStageHandler {
  name: PipelineStage = 'context-fit-gate';

  constructor(private fleet: ModelProfile[]) {}

  async execute(context: PipelineContext): Promise<RoutingDecision | null> {
    const estimatedTokens = context.request.estimatedInputTokens;
    context.filteredModels = this.fleet.filter(
      (m) => m.contextWindow >= estimatedTokens
    );

    if (context.filteredModels.length === 0) {
      throw new Error(`No models available with context window >= ${estimatedTokens} tokens`);
    }

    return null;
  }
}

// Stage 5: Session Pin
export class SessionPinStage implements PipelineStageHandler {
  name: PipelineStage = 'session-pin';

  constructor(
    private sessionId: string,
    private getSessionPin: (sessionId: string) => Promise<any>,
    private store: any
  ) {}

  async execute(context: PipelineContext): Promise<RoutingDecision | null> {
    const pin = await this.getSessionPin(this.sessionId);
    if (!pin) return null;

    // Check if compaction occurred (would break pin)
    if (context.request.messages.some((m) => m.role === 'system' && m.content.includes('compaction'))) {
      await this.store.breakPin(this.sessionId);
      return null;
    }

    // Verify pinned model is still healthy and available
    const pinnedModel = context.filteredModels.find(
      (m) => m.id === pin.pinnedModelId && m.provider === pin.pinnedProvider
    );

    if (!pinnedModel) {
      await this.store.breakPin(this.sessionId);
      return null;
    }

    return {
      provider: pinnedModel.provider,
      model: pinnedModel.id,
      tier: pinnedModel.tier,
      reasoning: `Session pinned: ${pin.pinReason}`,
      estimatedCost: pinnedModel.pricing.fallbackCostPer1M * (context.request.estimatedInputTokens / 1_000_000),
      estimatedLatencyMs: 50,
      confidence: 0.95,
      fallbackChain: [],
      sessionPinned: true,
      stage: 'session-pin',
    };
  }
}

// Factory function to create pipeline stages
export function createPipelineStages(
  hardwareInfo: any,
  fleet: ModelProfile[],
  sessionId: string,
  getSessionPin: (sessionId: string) => Promise<any>,
  store: any,
  config: SmartRouterConfig
): PipelineStageHandler[] {
  const llmRouterStage = new LLMRouterStage(config, store);
  
  return [
    new HardwareProbeStage(hardwareInfo),
    new LoopEscalationStage(sessionId, getSessionPin, store),
    new TurnEnvelopeStage(),
    new ContextFitStage(fleet),
    new SessionPinStage(sessionId, getSessionPin, store),
    // DEFAULT: LLM Router Stage (throws on failure)
    llmRouterStage,
  ];
}