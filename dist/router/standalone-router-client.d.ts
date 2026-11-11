import { SmartRouterConfig, RoutingRequest, RoutingDecision, PipelineContext } from '../types';
export declare class RouterError extends Error {
    readonly originalError?: Error | undefined;
    constructor(message: string, originalError?: Error | undefined);
}
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
    route(request: RoutingRequest, context: PipelineContext): Promise<RoutingDecision>;
    private parseDecision;
    private estimateLatency;
    private buildFallbackChain;
    switchModel(modelId: string): Promise<void>;
    getCurrentModel(): string;
    isReady(): boolean;
    dispose(): Promise<void>;
}
//# sourceMappingURL=standalone-router-client.d.ts.map