import { Context } from '@deepseek-ai/cordis';
import { SmartRouter } from '../router';
import { TelemetryStore } from '../telemetry';
import { RoutingDecision, SmartRouterConfig } from '../types';
import { StandaloneRouterClient } from '../router/standalone-router-client';
import { LLMRouterStage } from '../router/llm-router-stage';
declare module '../router' {
    interface SmartRouter {
        getLastDecision(): RoutingDecision | undefined;
        getFleetMode(): 'scoped' | 'all';
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
export declare function registerSmartRouterCommand(deps: SmartRouterCommandDeps): void;
/** Inject active model indicator at end of response */
export declare function injectActiveModelIndicator(decision: RoutingDecision | undefined): string;
//# sourceMappingURL=index.d.ts.map