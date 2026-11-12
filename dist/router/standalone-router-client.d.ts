import { SmartRouterConfig, RoutingRequest, RoutingDecision, PipelineContext } from '../types/index.js';
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
    /** Get simple model name (e.g., "qwen3-0.6b" instead of full HuggingFace ID) */
    getCurrentSimpleModelName(): string;
    isReady(): boolean;
    dispose(): Promise<void>;
}
//# sourceMappingURL=standalone-router-client.d.ts.map