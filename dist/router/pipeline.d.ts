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
export declare class SessionPinStage implements PipelineStageHandler {
    private sessionId;
    private getSessionPin;
    private store;
    name: PipelineStage;
    constructor(sessionId: string, getSessionPin: (sessionId: string) => Promise<any>, store: any);
    execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
export declare function createPipelineStages(hardwareInfo: any, fleet: ModelProfile[], sessionId: string, getSessionPin: (sessionId: string) => Promise<any>, store: any, config: SmartRouterConfig): PipelineStageHandler[];
//# sourceMappingURL=pipeline.d.ts.map