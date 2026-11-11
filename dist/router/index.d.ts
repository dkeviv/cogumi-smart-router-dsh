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
export declare class SmartRouter {
    private deps;
    private pipeline;
    private hardwareInfo;
    private initialized;
    private lastDecision;
    constructor(deps: SmartRouterDeps);
    initialize(): Promise<void>;
    route(request: RoutingRequest): Promise<RoutingDecision>;
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