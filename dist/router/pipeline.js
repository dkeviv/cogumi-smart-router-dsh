// src/router/pipeline.ts
// Simplified routing pipeline for cogumi-smart-router
// Stages: Hardware Probe → Loop Escalation → Turn Envelope → Context-Fit Gate → Session Pin → LLM Router (DEFAULT)
import { LLMRouterStage } from './llm-router-stage.js';
export class RouterPipeline {
    stages = [];
    constructor(stages) {
        this.stages = stages;
    }
    async execute(context) {
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
            }
            catch (error) {
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
    getStages() {
        return [...this.stages];
    }
}
// Stage 1: Hardware Probe
export class HardwareProbeStage {
    hardwareInfo;
    name = 'hardware-probe';
    constructor(hardwareInfo) {
        this.hardwareInfo = hardwareInfo;
    }
    async execute(context) {
        context.hardware = this.hardwareInfo;
        return null;
    }
}
// Stage 2: Loop Escalation
export class LoopEscalationStage {
    sessionId;
    getSessionPin;
    store;
    name = 'loop-escalation';
    constructor(sessionId, getSessionPin, store) {
        this.sessionId = sessionId;
        this.getSessionPin = getSessionPin;
        this.store = store;
    }
    async execute(context) {
        // Check for repeated tool failures in session
        // For now, return null (no escalation)
        return null;
    }
}
// Stage 3: Turn Envelope
export class TurnEnvelopeStage {
    name = 'turn-envelope';
    async execute(context) {
        context.turnType = context.request.turnType;
        return null;
    }
}
// Stage 4: Context-Fit Gate
export class ContextFitStage {
    fleet;
    name = 'context-fit-gate';
    constructor(fleet) {
        this.fleet = fleet;
    }
    async execute(context) {
        const estimatedTokens = context.request.estimatedInputTokens;
        context.filteredModels = this.fleet.filter((m) => m.contextWindow >= estimatedTokens);
        if (context.filteredModels.length === 0) {
            throw new Error(`No models available with context window >= ${estimatedTokens} tokens`);
        }
        return null;
    }
}
// Stage 5: Session Pin
export class SessionPinStage {
    sessionId;
    getSessionPin;
    store;
    name = 'session-pin';
    constructor(sessionId, getSessionPin, store) {
        this.sessionId = sessionId;
        this.getSessionPin = getSessionPin;
        this.store = store;
    }
    async execute(context) {
        const pin = await this.getSessionPin(this.sessionId);
        if (!pin)
            return null;
        // Check if compaction occurred (would break pin)
        if (context.request.messages.some((m) => m.role === 'system' && m.content.includes('compaction'))) {
            await this.store.breakPin(this.sessionId);
            return null;
        }
        // Verify pinned model is still healthy and available
        const pinnedModel = context.filteredModels.find((m) => m.id === pin.pinnedModelId && m.provider === pin.pinnedProvider);
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
export function createPipelineStages(hardwareInfo, fleet, sessionId, getSessionPin, store, config) {
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
//# sourceMappingURL=pipeline.js.map