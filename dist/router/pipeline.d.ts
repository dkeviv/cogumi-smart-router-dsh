import { PipelineContext, PipelineStage, PipelineStageHandler, RoutingDecision, ModelProfile, SmartRouterConfig } from '../types';
export interface PipelineStageConstructor {
    new (...args: any[]): PipelineStageHandler;
}
export declare class RouterPipeline {
    private stages;
    constructor(stages: PipelineStageHandler[]);
    execute(context: PipelineContext): Promise<RoutingDecision>;
    getStages(): PipelineStageHandler[];
}
export declare class HardwareProbeStage implements PipelineStageHandler {
    private hardwareInfo;
    name: PipelineStage;
    constructor(hardwareInfo: any);
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
export declare class LoopEscalationStage implements PipelineStageHandler {
    private sessionId;
    private getSessionPin;
    private store;
    name: PipelineStage;
    constructor(sessionId: string, getSessionPin: (sessionId: string) => Promise<any>, store: any);
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
export declare class TurnEnvelopeStage implements PipelineStageHandler {
    name: PipelineStage;
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
export declare class ContextFitStage implements PipelineStageHandler {
    private fleet;
    name: PipelineStage;
    constructor(fleet: ModelProfile[]);
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
export declare class LowIntensityGateStage implements PipelineStageHandler {
    private fleet;
    name: PipelineStage;
    constructor(fleet: ModelProfile[]);
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
    private capabilityScore;
    private createDecision;
}
export declare class SessionPinStage implements PipelineStageHandler {
    private sessionId;
    private getSessionPin;
    private store;
    name: PipelineStage;
    constructor(sessionId: string, getSessionPin: (sessionId: string) => Promise<any>, store: any);
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
export declare class DeterministicTriageStage implements PipelineStageHandler {
    name: PipelineStage;
    private keywordMatcher;
    constructor();
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
    private extractPromptText;
    private analyzeComplexity;
}
export declare class LocalZeroTierStage implements PipelineStageHandler {
    private hardwareInfo;
    private config;
    name: PipelineStage;
    constructor(hardwareInfo: any, config: any);
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
export declare class TriageCloudFallbackStage implements PipelineStageHandler {
    name: PipelineStage;
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
export declare class EmbeddingMatcherStage implements PipelineStageHandler {
    private embedder;
    private centroids;
    name: PipelineStage;
    constructor(embedder: any, centroids: any);
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
export declare class SafeCloudDefaultStage implements PipelineStageHandler {
    name: PipelineStage;
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
export declare class ContextOverflowFallbackStage implements PipelineStageHandler {
    name: PipelineStage;
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
export declare function createPipelineStages(hardwareInfo: any, fleet: ModelProfile[], sessionId: string, getSessionPin: (sessionId: string) => Promise<any>, store: any, config: SmartRouterConfig, embedder?: any, centroids?: any): PipelineStageHandler[];
//# sourceMappingURL=pipeline.d.ts.map