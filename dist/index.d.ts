import { Context } from '@deepseek-ai/cordis';
import { SmartRouterConfig } from './types/index.js';
import { createSmartRouter, SmartRouter } from './router/index.js';
import { probeHardware } from './hardware/probe.js';
import { fleetManager } from './fleet/index.js';
import { LLMRouterStage } from './router/llm-router-stage.js';
import { StandaloneRouterClient } from './router/standalone-router-client.js';
import { RouterError } from './router/standalone-router-client.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        smartRouter: SmartRouter;
    }
}
export interface PluginConfig extends SmartRouterConfig {
}
export declare const name = "cogumi-smart-router";
export declare function apply(ctx: Context, config: PluginConfig): void;
export { SmartRouter, createSmartRouter, probeHardware, fleetManager, LLMRouterStage, StandaloneRouterClient, RouterError, };
export { TelemetryStore, createTelemetryStore, } from './telemetry/index.js';
export type { SmartRouterConfig, SmartRouterDeps, RoutingDecision, RoutingRequest, ModelProfile, Tier, TurnType, PipelineStage, HardwareInfo, TelemetryEvent, SessionStatsSnapshot, PlacementPlanReport, } from './types/index.js';
//# sourceMappingURL=index.d.ts.map