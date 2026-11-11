import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime } from '@deepseek-ai/dsh-llm';
import { Session } from '@deepseek-ai/dsh-session';
import { SystemInfoProvider } from '@deepseek-ai/dsh-home-paths';
import { SmartRouterConfig, RoutingRequest, RoutingDecision, ModelProfile, HardwareInfo } from '../types';
import { TelemetryStore } from '../telemetry';
export interface SmartRouterDeps {
    ctx: Context;
    llm: LlmRuntime;
    session: Session;
    systemInfo: SystemInfoProvider;
    config: SmartRouterConfig;
    telemetryStore: TelemetryStore;
}
export interface ContextCompactionResult {
    messages: any[];
    wasCompacted: boolean;
    disclaimer: string | null;
    originalTokenCount: number;
    compactedTokenCount: number;
}
export declare class SmartRouter {
    private deps;
    private pipeline;
    private hardwareInfo;
    private initialized;
    private lastDecision;
    constructor(deps: SmartRouterDeps);
    initialize(): Promise<void>;
    route(request: RoutingRequest): Promise<RoutingDecision>;
    /**
     * Show pre-routing notification to user
     */
    private showPreRoutingMessage;
    /**
     * Smart context compaction when input exceeds model's context window
     * Returns compacted messages with disclaimer
     */
    compactContext(messages: any[], targetContextWindow: number, reserveTokens?: number): Promise<ContextCompactionResult>;
    /**
     * Summarize older messages using a lightweight call
     * In production, this could use a small local model or a cheap API call
     */
    private summarizeMessages;
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