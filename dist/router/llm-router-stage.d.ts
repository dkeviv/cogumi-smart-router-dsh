import { PipelineContext, PipelineStage, PipelineStageHandler, RoutingDecision, SmartRouterConfig } from '../types';
import { StandaloneRouterClient } from './standalone-router-client';
export declare class LLMRouterStage implements PipelineStageHandler {
    private config;
    private telemetryStore;
    name: PipelineStage;
    private routerClient;
    private enabled;
    constructor(config: SmartRouterConfig, telemetryStore: any);
    setEnabled(enabled: boolean): void;
    isEnabled(): boolean;
    initialize(): Promise<void>;
    execute(context: PipelineContext): Promise<RoutingDecision>;
    getRouterClient(): StandaloneRouterClient | null;
    switchRouterModel(modelId: string): Promise<void>;
}
//# sourceMappingURL=llm-router-stage.d.ts.map