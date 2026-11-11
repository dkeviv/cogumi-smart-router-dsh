import { SmartRouterConfig, RoutingRequest, RoutingDecision, PipelineContext } from '../types';
export interface RouterModelConfig {
    modelId: string;
    label: string;
    description: string;
    dtype: 'q4f16' | 'q8';
    sizeBytes: number;
}
export declare const ROUTER_MODEL_OPTIONS: RouterModelConfig[];
export declare class StandaloneRouterClient {
    private config;
    private telemetryStore;
    private model;
    private tokenizer;
    private currentModelId;
    private isInitialized;
    private initPromise;
    constructor(config: SmartRouterConfig, telemetryStore: any);
    initialize(modelId?: string): Promise<void>;
    private _initialize;
    private getDefaultRouterModelId;
    route(request: RoutingRequest, context: PipelineContext): Promise<RoutingDecision | null>;
    private parseDecision;
    private estimateLatency;
    private buildFallbackChain;
    switchModel(modelId: string): Promise<void>;
    getCurrentModel(): string;
    getAvailableModels(): RouterModelConfig[];
    isReady(): boolean;
    dispose(): Promise<void>;
}
//# sourceMappingURL=standalone-router-client.d.ts.map