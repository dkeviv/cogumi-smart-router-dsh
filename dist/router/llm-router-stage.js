// src/router/llm-router-stage.ts
// LLM Router Stage - DEFAULT routing stage (after Session Pin, before Deterministic Triage)
import { StandaloneRouterClient } from './standalone-router-client';
export class LLMRouterStage {
    config;
    telemetryStore;
    name = 'llm-router';
    routerClient = null;
    enabled = true;
    constructor(config, telemetryStore) {
        this.config = config;
        this.telemetryStore = telemetryStore;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    isEnabled() {
        return this.enabled;
    }
    async initialize() {
        if (!this.routerClient) {
            this.routerClient = new StandaloneRouterClient(this.config, this.telemetryStore);
            await this.routerClient.initialize();
        }
    }
    async execute(context) {
        if (!this.enabled)
            return null;
        if (!this.routerClient)
            await this.initialize();
        // Skip if session is already pinned (handled by SessionPinStage earlier)
        if (context.decisionSoFar?.sessionPinned)
            return null;
        // Skip if no models available
        if (context.filteredModels.length === 0)
            return null;
        const startTime = Date.now();
        try {
            const decision = await this.routerClient.route(context.request, context);
            if (decision) {
                // Add routing latency to decision
                decision.estimatedLatencyMs += Date.now() - startTime;
                return decision;
            }
        }
        catch (error) {
            console.warn('[smart-router] LLMRouterStage error, falling through:', error);
        }
        return null; // Fall through to deterministic triage
    }
    getRouterClient() {
        return this.routerClient;
    }
    async switchRouterModel(modelId) {
        if (this.routerClient) {
            await this.routerClient.switchModel(modelId);
        }
    }
    getAvailableRouterModels() {
        return this.routerClient?.getAvailableModels() || [];
    }
}
//# sourceMappingURL=llm-router-stage.js.map