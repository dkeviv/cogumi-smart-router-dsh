import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime } from '@deepseek-ai/dsh-llm';
import { Session } from '@deepseek-ai/dsh-session';
import { SystemInfoProvider } from '@deepseek-ai/dsh-home-paths';
import { SmartRouterConfig, RoutingRequest, RoutingDecision, ModelProfile, HardwareInfo, ContextCompactionResult, Message } from '../types/index.js';
import { TelemetryStore } from '../telemetry/index.js';
export interface SmartRouterDeps {
    ctx: Context;
    llm: LlmRuntime;
    session: Session;
    systemInfo: SystemInfoProvider;
    config: SmartRouterConfig;
    telemetryStore: TelemetryStore;
}
export declare class SmartRouter {
    private deps;
    private pipeline;
    private hardwareInfo;
    private initialized;
    private lastDecision;
    private readonly keepRecentMessages;
    constructor(deps: SmartRouterDeps);
    initialize(): Promise<void>;
    route(request: RoutingRequest): Promise<RoutingDecision>;
    /**
     * Smart context compaction when input exceeds model's context window
     * 1. Always keep system messages
     * 2. Keep recent N messages intact (configurable, default 20)
     * 3. Summarize older messages into a system message block
     * 4. Fallback truncation if still over limit
     */
    compactContext(messages: Message[], targetContextWindow: number, reserveTokens?: number): Promise<ContextCompactionResult>;
    /**
     * Summarize older messages using a lightweight approach.
     * In production, this could call a small local model or a cheap API call.
     * For now, uses extractive summarization.
     */
    private summarizeMessages;
    /**
     * Extract key points from text using simple extractive summarization
     */
    private extractKeyPoints;
    /**
     * Estimate total tokens in messages
     */
    private estimateTotalTokens;
    /**
     * Estimate tokens in a single message (rough: 4 chars = 1 token)
     */
    private estimateMessageTokens;
    private recordTelemetry;
    getFleet(): ModelProfile[];
    getHardwareInfo(): HardwareInfo | null;
    getContextOverflowFallback(sessionId: string): Promise<RoutingDecision | null>;
    refreshPricing(): Promise<{
        modelCount: number;
        lastUpdated: string;
    }>;
}
export declare function createSmartRouter(deps: SmartRouterDeps): SmartRouter;
//# sourceMappingURL=index.d.ts.map