// src/router/pipeline.ts
// 12-stage routing pipeline
import { probeLocalRuntimes } from '../hardware/local-runtime';
import { AhoCorasick } from 'aho-corasick';
import { LLMRouterStage } from './llm-router-stage';
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
                // Continue to next stage on error
            }
        }
        // No stage made a decision - should not happen with safe-cloud-default
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
        // Hardware probe doesn't make routing decisions, just provides context
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
        // This would query telemetry for recent tool failures
        // For now, return null (no escalation)
        return null;
    }
}
// Stage 3: Turn Envelope
export class TurnEnvelopeStage {
    name = 'turn-envelope';
    async execute(context) {
        // Turn type is already classified in the request
        context.turnType = context.request.turnType;
        // This stage classifies but doesn't decide
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
        // If no models fit, we'll fall through to context overflow fallback
        if (context.filteredModels.length === 0) {
            return null;
        }
        return null;
    }
}
// Stage 5: Low-Intensity Gate
export class LowIntensityGateStage {
    fleet;
    name = 'low-intensity-gate';
    constructor(fleet) {
        this.fleet = fleet;
    }
    async execute(context) {
        const { turnType, requiredCapabilities } = context.request;
        // Structural tier hint based on turn type
        let preferredTier = null;
        switch (turnType) {
            case 'tool_result':
                preferredTier = 'economical-cloud';
                break;
            case 'planning':
                preferredTier = 'frontier-cloud';
                break;
            case 'subagent':
                preferredTier = 'economical-cloud';
                break;
            case 'main_loop':
            default:
                preferredTier = null; // No strong preference
        }
        // Score models by capability match
        const candidates = context.filteredModels.map((model) => ({
            model,
            score: this.capabilityScore(model, requiredCapabilities),
        }));
        candidates.sort((a, b) => b.score - a.score);
        // If there's a strong tier preference and a good match, route
        if (preferredTier) {
            const tierMatches = candidates.filter((c) => c.model.tier === preferredTier);
            if (tierMatches.length > 0 && tierMatches[0].score > 0.7) {
                return this.createDecision(tierMatches[0].model, 'low-intensity-gate', context);
            }
        }
        // Update filtered models with scoring
        context.filteredModels = candidates.map((c) => c.model);
        return null;
    }
    capabilityScore(model, required) {
        const caps = model.capabilities;
        let score = 0;
        score += (1 - Math.abs(caps.reasoning - required.reasoning)) * 0.4;
        score += (1 - Math.abs(caps.codeGen - required.codeGen)) * 0.3;
        score += (1 - Math.abs(caps.toolUse - required.toolUse)) * 0.3;
        return score;
    }
    createDecision(model, reasonCode, context) {
        return {
            provider: model.provider,
            model: model.id,
            tier: model.tier,
            reasoning: `Low-intensity gate: ${reasonCode}`,
            estimatedCost: model.pricing.fallbackCostPer1M * (context.request.estimatedInputTokens / 1_000_000),
            estimatedLatencyMs: 100, // Placeholder
            confidence: 0.7,
            fallbackChain: [],
            sessionPinned: false,
            stage: 'low-intensity-gate',
        };
    }
}
// Stage 6: Session Pin
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
            // Pinned model not in filtered set (context overflow?) - break pin
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
// Stage 7: Deterministic Triage
export class DeterministicTriageStage {
    name = 'deterministic-triage';
    keywordMatcher;
    constructor() {
        // Build Aho-Corasick automaton for keyword matching
        const keywords = [
            // Local/cheap triggers
            { word: 'format', tier: 'zero-tier' },
            { word: 'lint', tier: 'zero-tier' },
            { word: 'jsdoc', tier: 'zero-tier' },
            { word: 'regex', tier: 'zero-tier' },
            { word: 'unit test', tier: 'zero-tier' },
            { word: 'typo', tier: 'zero-tier' },
            { word: 'fix typo', tier: 'zero-tier' },
            { word: 'comment', tier: 'zero-tier' },
            // Frontier triggers
            { word: 'race condition', tier: 'frontier-cloud' },
            { word: 'memory leak', tier: 'frontier-cloud' },
            { word: 'architecture', tier: 'frontier-cloud' },
            { word: 'system design', tier: 'frontier-cloud' },
            { word: 'concurrency', tier: 'frontier-cloud' },
            { word: 'deadlock', tier: 'frontier-cloud' },
        ];
        this.keywordMatcher = new AhoCorasick();
        for (const kw of keywords) {
            this.keywordMatcher.add(kw.word, kw.tier);
        }
        this.keywordMatcher.build();
    }
    async execute(context) {
        const promptText = this.extractPromptText(context.request.messages);
        const matches = this.keywordMatcher.search(promptText);
        if (matches.length > 0) {
            // Get the highest priority match
            const tierPriority = {
                'frontier-cloud': 3,
                'economical-cloud': 2,
                'zero-tier': 1,
            };
            let bestMatch = null;
            for (const match of matches) {
                const tier = match.output;
                if (!bestMatch || tierPriority[tier] > tierPriority[bestMatch.tier]) {
                    bestMatch = { tier, keyword: match.word };
                }
            }
            if (bestMatch) {
                // Find best model in that tier
                const tierModels = context.filteredModels.filter((m) => m.tier === bestMatch.tier);
                if (tierModels.length > 0) {
                    return {
                        provider: tierModels[0].provider,
                        model: tierModels[0].id,
                        tier: bestMatch.tier,
                        reasoning: `Keyword match: "${bestMatch.keyword}" -> ${bestMatch.tier}`,
                        estimatedCost: tierModels[0].pricing.fallbackCostPer1M * (context.request.estimatedInputTokens / 1_000_000),
                        estimatedLatencyMs: 50,
                        confidence: 0.8,
                        fallbackChain: [],
                        sessionPinned: false,
                        stage: 'deterministic-triage',
                    };
                }
            }
        }
        // Cyclomatic complexity analysis for code blocks
        const complexity = this.analyzeComplexity(promptText);
        if (complexity > 15) {
            const frontierModels = context.filteredModels.filter((m) => m.tier === 'frontier-cloud');
            if (frontierModels.length > 0) {
                return {
                    provider: frontierModels[0].provider,
                    model: frontierModels[0].id,
                    tier: 'frontier-cloud',
                    reasoning: `High cyclomatic complexity (${complexity}) -> frontier-cloud`,
                    estimatedCost: frontierModels[0].pricing.fallbackCostPer1M * (context.request.estimatedInputTokens / 1_000_000),
                    estimatedLatencyMs: 100,
                    confidence: 0.85,
                    fallbackChain: [],
                    sessionPinned: false,
                    stage: 'deterministic-triage',
                };
            }
        }
        return null;
    }
    extractPromptText(messages) {
        return messages
            .filter((m) => m.role === 'user')
            .map((m) => typeof m.content === 'string' ? m.content : '')
            .join('\n\n');
    }
    analyzeComplexity(text) {
        // Extract code blocks and analyze
        const codeBlocks = text.match(/```[\s\S]*?```/g) || [];
        let totalComplexity = 0;
        for (const block of codeBlocks) {
            // Simple heuristic: count control flow keywords
            const keywords = [
                'if', 'else', 'for', 'while', 'switch', 'case',
                'catch', 'try', 'finally', '&&', '||', '?',
            ];
            for (const kw of keywords) {
                const regex = new RegExp(`\\b${kw}\\b`, 'g');
                const matches = block.match(regex);
                if (matches)
                    totalComplexity += matches.length;
            }
        }
        return totalComplexity;
    }
}
// Stage 8: Local Zero-Tier
export class LocalZeroTierStage {
    hardwareInfo;
    config;
    name = 'local-zero-tier';
    constructor(hardwareInfo, config) {
        this.hardwareInfo = hardwareInfo;
        this.config = config;
    }
    async execute(context) {
        // Only route to local if hardware supports it
        if (this.hardwareInfo.probe !== 'full_local') {
            return null;
        }
        // Find local models in fleet
        const localModels = context.filteredModels.filter((m) => m.tier === 'zero-tier');
        if (localModels.length === 0) {
            return null;
        }
        // Probe to see which are actually loaded
        const localRuntimes = await probeLocalRuntimes();
        const loadedModels = localRuntimes.filter((r) => r.loaded);
        if (loadedModels.length === 0) {
            return null;
        }
        // Match loaded models to fleet
        const availableLocal = localModels.filter((m) => loadedModels.some((r) => r.id === m.id && r.provider === m.provider));
        if (availableLocal.length === 0) {
            return null;
        }
        // Route to first available local model
        const selected = availableLocal[0];
        return {
            provider: selected.provider,
            model: selected.id,
            tier: 'zero-tier',
            reasoning: `Local zero-tier: ${selected.id} loaded in ${selected.provider}`,
            estimatedCost: 0,
            estimatedLatencyMs: 2000, // Local inference typically slower TTFT
            confidence: 0.7,
            fallbackChain: [],
            sessionPinned: false,
            stage: 'local-zero-tier',
        };
    }
}
// Stage 9: Triage Cloud Fallback
export class TriageCloudFallbackStage {
    name = 'triage-cloud-fallback';
    async execute(context) {
        // For trivial prompts not claimed by local, route to first healthy economical model
        const economicalModels = context.filteredModels.filter((m) => m.tier === 'economical-cloud');
        if (economicalModels.length > 0) {
            const selected = economicalModels[0];
            return {
                provider: selected.provider,
                model: selected.id,
                tier: 'economical-cloud',
                reasoning: 'Triage cloud fallback: first healthy economical model',
                estimatedCost: selected.pricing.fallbackCostPer1M * (context.request.estimatedInputTokens / 1_000_000),
                estimatedLatencyMs: 200,
                confidence: 0.6,
                fallbackChain: [],
                sessionPinned: false,
                stage: 'triage-cloud-fallback',
            };
        }
        return null;
    }
}
// Stage 10: Embedding Matcher (HyDRA-style)
export class EmbeddingMatcherStage {
    embedder;
    centroids;
    name = 'embedding-matcher';
    constructor(embedder, centroids) {
        this.embedder = embedder;
        this.centroids = centroids;
    }
    async execute(context) {
        // Placeholder for ONNX embedding matching
        // This would:
        // 1. Embed the prompt
        // 2. Project to 3D requirement space (Reasoning, CodeGen, ToolUse)
        // 3. Match against cluster centroids
        // 4. Apply shortfall gate and multi-objective scoring
        // For now, return null to fall through to safe cloud default
        return null;
    }
}
// Stage 11: Safe Cloud Default
export class SafeCloudDefaultStage {
    name = 'safe-cloud-default';
    async execute(context) {
        // First healthy economical-cloud model that fits context
        const economicalModels = context.filteredModels.filter((m) => m.tier === 'economical-cloud' && m.health.status === 'healthy');
        if (economicalModels.length > 0) {
            const selected = economicalModels[0];
            return {
                provider: selected.provider,
                model: selected.id,
                tier: 'economical-cloud',
                reasoning: 'Safe cloud default: first healthy economical model',
                estimatedCost: selected.pricing.fallbackCostPer1M * (context.request.estimatedInputTokens / 1_000_000),
                estimatedLatencyMs: 300,
                confidence: 0.5,
                fallbackChain: [],
                sessionPinned: false,
                stage: 'safe-cloud-default',
            };
        }
        // Fallback to any healthy model
        const anyHealthy = context.filteredModels.filter((m) => m.health.status === 'healthy');
        if (anyHealthy.length > 0) {
            const selected = anyHealthy[0];
            return {
                provider: selected.provider,
                model: selected.id,
                tier: selected.tier,
                reasoning: 'Safe cloud default: first healthy model (any tier)',
                estimatedCost: selected.pricing.fallbackCostPer1M * (context.request.estimatedInputTokens / 1_000_000),
                estimatedLatencyMs: 500,
                confidence: 0.4,
                fallbackChain: [],
                sessionPinned: false,
                stage: 'safe-cloud-default',
            };
        }
        return null;
    }
}
// Stage 12: Context Overflow Fallback
export class ContextOverflowFallbackStage {
    name = 'context-overflow-fallback';
    async execute(context) {
        // Find the model with the largest context window that fits
        const sortedByContext = [...context.filteredModels].sort((a, b) => b.contextWindow - a.contextWindow);
        const estimatedTokens = context.request.estimatedInputTokens;
        for (const model of sortedByContext) {
            if (model.contextWindow >= estimatedTokens && model.health.status === 'healthy') {
                return {
                    provider: model.provider,
                    model: model.id,
                    tier: model.tier,
                    reasoning: `Context overflow fallback: largest model fitting ${estimatedTokens} tokens`,
                    estimatedCost: model.pricing.fallbackCostPer1M * (estimatedTokens / 1_000_000),
                    estimatedLatencyMs: 500,
                    confidence: 0.3,
                    fallbackChain: [],
                    sessionPinned: false,
                    stage: 'context-overflow-fallback',
                };
            }
        }
        // Last resort - any model
        if (sortedByContext.length > 0) {
            const model = sortedByContext[0];
            return {
                provider: model.provider,
                model: model.id,
                tier: model.tier,
                reasoning: 'Emergency fallback: largest available model',
                estimatedCost: model.pricing.fallbackCostPer1M * (estimatedTokens / 1_000_000),
                estimatedLatencyMs: 1000,
                confidence: 0.1,
                fallbackChain: [],
                sessionPinned: false,
                stage: 'context-overflow-fallback',
            };
        }
        throw new Error('No models available for routing');
    }
}
// Factory function to create all pipeline stages
export function createPipelineStages(hardwareInfo, fleet, sessionId, getSessionPin, store, config, embedder, centroids) {
    const llmRouterStage = new LLMRouterStage(config, store);
    return [
        new HardwareProbeStage(hardwareInfo),
        new LoopEscalationStage(sessionId, getSessionPin, store),
        new TurnEnvelopeStage(),
        new ContextFitStage(fleet),
        new LowIntensityGateStage(fleet),
        new SessionPinStage(sessionId, getSessionPin, store),
        // DEFAULT: LLM Router Stage (replaces deterministic triage as primary)
        llmRouterStage,
        // Fallback stages if LLM router fails
        new DeterministicTriageStage(),
        new LocalZeroTierStage(hardwareInfo, {}),
        new TriageCloudFallbackStage(),
        new EmbeddingMatcherStage(embedder, centroids),
        new SafeCloudDefaultStage(),
        new ContextOverflowFallbackStage(),
    ];
}
//# sourceMappingURL=pipeline.js.map