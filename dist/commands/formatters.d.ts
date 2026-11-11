import { SmartRouter } from '../router';
import { TelemetryEvent, ModelProfile, RoutingDecision, PlacementPlanReport } from '../types';
import { StandaloneRouterClient } from '../router/standalone-router-client';
export declare const SMART_ROUTER_USAGE = "/smart-router auto | custom";
export interface ParsedSmartRouterCommand {
    command: 'auto' | 'custom';
    subcommand?: string;
    modelId?: string;
    provider?: string;
}
export declare function parseSmartRouterArgs(args: string): ParsedSmartRouterCommand;
export declare function formatStatusMessage(router: SmartRouter, decision: RoutingDecision | undefined): string;
export declare function formatHistoryMessage(entries: readonly TelemetryEvent[], options?: {
    fleet?: readonly ModelProfile[];
}): string;
export interface SessionStatsSnapshot {
    entry_count: number;
    total_cost_usd: number;
    mean_cost_usd: number | null;
    total_latency_ms: number;
    mean_latency_ms: number | null;
    planning_delegate_share: number | null;
    direct_share: number | null;
    local_share: number | null;
    cloud_share: number | null;
    role_cost: {
        primary: {
            count: number;
            total_cost_usd: number;
        };
        planning_delegate: {
            count: number;
            total_cost_usd: number;
        };
        other: {
            count: number;
            total_cost_usd: number;
        };
    };
    cost_basis: 'actual' | 'mixed' | 'estimated';
    actual_usage_count: number;
    actual_total_tokens: number | null;
    frontier_savings_usd?: number;
}
export declare function formatStatsMessage(entries: readonly TelemetryEvent[], options?: {
    fleet?: readonly ModelProfile[];
    priceCatalog?: Map<string, {
        provider: string;
        input: number;
        output: number;
        lastUpdated: number;
    }> | null;
}): string;
export declare function formatPlacementPlanMessage(report: PlacementPlanReport): string;
export declare function formatDoctorMessage(report: PlacementPlanReport): string;
/** Format router model selection UI for /smart-router auto */
export declare function formatAutoSelectionMessage(routerClient: StandaloneRouterClient, currentModelId: string): string;
/** Format custom model selection UI for /smart-router custom */
export declare function formatCustomSelectionMessage(fleet: ModelProfile[]): string;
/** Format active model indicator for end-of-response */
export declare function formatActiveModelIndicator(decision: RoutingDecision | undefined): string;
//# sourceMappingURL=formatters.d.ts.map