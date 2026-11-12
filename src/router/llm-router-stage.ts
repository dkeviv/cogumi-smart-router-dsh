// src/router/llm-router-stage.ts
// LLM Router Stage - DEFAULT routing stage (after Session Pin, before Deterministic Triage)
// If LLM router fails, throws RouterError to inform user

import { PipelineContext, PipelineStage, PipelineStageHandler, RoutingDecision, SmartRouterConfig } from '../types/index.js';
import { StandaloneRouterClient, RouterError } from './standalone-router-client.js';

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

  async execute(context: PipelineContext): Promise<RoutingDecision> {
    if (!this.enabled) {
      throw new RouterError('LLM router is disabled. Enable it in plugin config or use `/model <provider/model>` to manually select a model.');
    }
    if (!this.routerClient) await this.initialize();

    // Skip if session is already pinned (handled by SessionPinStage earlier)
    if (context.decisionSoFar?.sessionPinned) {
      throw new RouterError('Session is pinned to a model. Use `/model <provider/model>` to override or unpin session.');
    }

    // Skip if no models available
    if (context.filteredModels.length === 0) {
      throw new RouterError('No models available in fleet after filtering. Check your model configuration.');
    }

    const startTime = Date.now();

    try {
      const decision = await this.routerClient!.route(context.request, context);
      
      if (decision) {
        // Add routing latency to decision
        decision.estimatedLatencyMs += Date.now() - startTime;
        return decision;
      }
      
      throw new RouterError('LLM router returned no decision');
    } catch (error) {
      if (error instanceof RouterError) throw error;
      throw new RouterError(
        'LLM router failed. The router model may be unavailable or the request too complex. ' +
        'Use `/model <provider/model>` to manually select a model.',
        error instanceof Error ? error : undefined
      );
    }
  }

  getRouterClient(): StandaloneRouterClient | null {
    return this.routerClient;
  }

  async switchRouterModel(modelId: string): Promise<void> {
    if (this.routerClient) {
      await this.routerClient.switchModel(modelId);
    }
  }
}