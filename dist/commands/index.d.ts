import { Context } from '@deepseek-ai/cordis';
import { SmartRouter } from '../router/index.js';
import { TelemetryStore } from '../telemetry/index.js';
import { RoutingDecision, SmartRouterConfig } from '../types/index.js';
import { StandaloneRouterClient } from '../router/standalone-router-client.js';
import { LLMRouterStage } from '../router/llm-router-stage.js';
declare module '../router/index.js' {
    interface SmartRouter {
        getLastDecision(): RoutingDecision | undefined;
    }
}
export interface SmartRouterCommandDeps {
    router: SmartRouter;
    store: TelemetryStore;
    ctx: Context;
    config: SmartRouterConfig;
    llmRouterStage: LLMRouterStage;
    routerClient: StandaloneRouterClient;
}
export interface SmartRouterCommandDeps {
    router: SmartRouter;
    store: TelemetryStore;
    ctx: Context;
    config: SmartRouterConfig;
    llmRouterStage: LLMRouterStage;
    routerClient: StandaloneRouterClient;
}
export declare function registerSmartRouterCommand(deps: SmartRouterCommandDeps): void;
/** Inject active model indicator at end of response */
export declare function injectActiveModelIndicator(decision: RoutingDecision | undefined): string;
//# sourceMappingURL=index.d.ts.map