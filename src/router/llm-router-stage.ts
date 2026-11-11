// src/router/llm-router-stage.ts
// LLM Router Stage - DEFAULT routing stage (after Session Pin, before Deterministic Triage)

import { PipelineContext, PipelineStage, PipelineStageHandler, RoutingDecision, ModelProfile, SmartRouterConfig } from '../types';
import { StandaloneRouterClient } from './standalone-router-client';

export class LLMRouterStage implements PipelineStageHandler {
  name: PipelineStage = 'llm-router';
  private routerClient: StandaloneRouterClient | null = null;
  private enabled = true;

  constructor(
    private config: SmartRouterConfig,
    private telemetryStore: any
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async initialize(): Promise<void> {
    if (!this.routerClient) {
      this.routerClient = new StandaloneRouterClient(this.config, this.telemetryStore);
      await this.routerClient.initialize();
    }
  }

  async execute(context: PipelineContext): Promise<RoutingDecision | null> {
    if (!this.enabled) return null;
    if (!this.routerClient) await this.initialize();

    // Skip if session is already pinned (handled by SessionPinStage earlier)
    if (context.decisionSoFar?.sessionPinned) return null;

    // Skip if no models available
    if (context.filteredModels.length === 0) return null;

    const startTime = Date.now();

    try {
      const decision = await this.routerClient!.route(context.request, context);
      
      if (decision) {
        // Add routing latency to decision
        decision.estimatedLatencyMs += Date.now() - startTime;
        return decision;
      }
    } catch (error) {
      console.warn('[smart-router] LLMRouterStage error, falling through:', error);
    }

    return null; // Fall through to deterministic triage
  }

  getRouterClient(): StandaloneRouterClient | null {
    return this.routerClient;
  }

  async switchRouterModel(modelId: string): Promise<void> {
    if (this.routerClient) {
      await this.routerClient.switchModel(modelId);
    }
  }

  getAvailableRouterModels() {
    return this.routerClient?.getAvailableModels() || [];
  }
}