import { Context } from '@deepseek-ai/cordis';
import { SmartRouterConfig } from './types';
import { createSmartRouter, SmartRouter } from './router';
import { probeHardware } from './hardware/probe';
import { fleetManager } from './fleet';
import { LLMRouterStage } from './router/llm-router-stage';
import { StandaloneRouterClient } from './router/standalone-router-client';
declare module '@deepseek-ai/cordis' {
    interface Context {
        smartRouter: SmartRouter;
    }
}
export interface PluginConfig extends SmartRouterConfig {
}
export declare const name = "smart-router";
export declare function apply(ctx: Context, config: PluginConfig): void;
export { SmartRouter, createSmartRouter, probeHardware, fleetManager, LLMRouterStage, StandaloneRouterClient, };
export { TelemetryStore, createTelemetryStore, } from './telemetry';
export type { SmartRouterConfig, SmartRouterDeps, RoutingDecision, RoutingRequest, ModelProfile, Tier, TurnType, PipelineStage, HardwareInfo, TelemetryEvent, SessionStatsSnapshot, PlacementPlanReport, } from './types';
//# sourceMappingURL=index.d.ts.map