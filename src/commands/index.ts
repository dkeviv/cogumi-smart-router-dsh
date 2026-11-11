// src/commands/index.ts
// Slash command handlers for /smart-router

import { Context } from '@deepseek-ai/cordis';
import { SmartRouter } from '../router';
import { TelemetryStore } from '../telemetry';
import { aggregateSessionStatsFromFleet } from '../telemetry/aggregator';
import { ModelProfile, Tier, RoutingDecision, TelemetryEvent, SessionStatsSnapshot, PlacementPlanReport } from '../types';
import { collectPlacementPlan } from '../utils/placement-plan';
import { formatStatusMessage, formatHistoryMessage, formatStatsMessage, formatPlacementPlanMessage, formatDoctorMessage, parseSmartRouterArgs, ParsedSmartRouterCommand } from './formatters';

export interface SmartRouterCommandDeps {
  router: SmartRouter;
  store: TelemetryStore;
  ctx: Context;
}

export function registerSmartRouterCommand(deps: SmartRouterCommandDeps): void {
  const { router, store, ctx } = deps;

  ctx.command('smart-router', '[args:string]', {
    description: 'Show routing status/history/stats, switch fleet mode (scoped|all), refresh pricing, or export dataset',
  })
    .option('json', '-j --json', { description: 'Output JSON format for plan command' })
    .action(async (options: { json?: boolean }, args: string) => {
      try {
        const parsed = parseSmartRouterArgs(args);

        if (parsed.command === 'status') {
          const decision = router.getLastDecision?.();
          ctx.ui.notify(formatStatusMessage(router, decision), 'info');
          return;
        }

        if (parsed.command === 'history') {
          const rows = await store.listTelemetry({ limit: parsed.limit });
          ctx.ui.notify(
            formatHistoryMessage(rows, { fleet: router.getFleet() }),
            'info',
          );
          return;
        }

        if (parsed.command === 'stats') {
          const rows = await store.listTelemetry({ limit: parsed.limit });
          ctx.ui.notify(
            formatStatsMessage(rows, {
              fleet: router.getFleet(),
              priceCatalog: null, // TODO: get from store
            }),
            'info',
          );
          return;
        }

        if (parsed.command === 'pricing') {
          const { modelCount, lastUpdated } = await router.refreshPricing();
          ctx.ui.notify(
            `Pricing refreshed: ${modelCount} models loaded (last_updated: ${lastUpdated}). Fleet rebuilt (${router.getFleet().length} models).`,
            'info',
          );
          return;
        }

        if (parsed.command === 'export' && parsed.subcommand === 'dataset') {
          // TODO: implement dataset export
          ctx.ui.notify('Dataset export not yet implemented.', 'info');
          return;
        }

        if (parsed.command === 'export' && parsed.subcommand === 'telemetry-contrib') {
          // TODO: implement telemetry contrib export
          ctx.ui.notify('Telemetry contrib export not yet implemented.', 'info');
          return;
        }

        if (parsed.command === 'feedback') {
          // TODO: implement feedback
          ctx.ui.notify('Feedback requires SMART_ROUTER_DATASET=1.', 'info');
          return;
        }

        if (parsed.command === 'plan' || parsed.command === 'doctor') {
          const report = await collectPlacementPlan({
            encoderCachePath: '.dsh-smart-router/models',
            diskPath: process.cwd(),
          });

          if (parsed.command === 'plan' && options.json) {
            ctx.ui.notify(JSON.stringify(report, null, 2), 'info');
            return;
          }

          ctx.ui.notify(
            parsed.command === 'doctor'
              ? formatDoctorMessage(report)
              : formatPlacementPlanMessage(report),
            'info',
          );
          return;
        }

        if (parsed.command === 'unpin') {
          const sessionId = ctx.session?.id || 'default';
          const pin = await store.getSessionPin(sessionId);
          if (!pin) {
            ctx.ui.notify('No session pin to clear.', 'info');
            return;
          }

          await store.breakPin(sessionId);
          ctx.ui.notify(
            `Cleared session pin (was ${pin.pinnedModelId}). Next request will run full routing.`,
            'info',
          );
          return;
        }

        if (parsed.command === 'mode' && parsed.mode) {
          await router.setFleetMode(parsed.mode);
          ctx.ui.notify(
            `Fleet mode set to ${parsed.mode} (${router.getFleet().length} models)`,
            'info',
          );
          return;
        }

        // Default: show status
        const decision = router.getLastDecision?.();
        ctx.ui.notify(formatStatusMessage(router, decision), 'info');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, 'error');
      }
    });
}

// Extend SmartRouter with getLastDecision method
declare module '../router' {
  interface SmartRouter {
    getLastDecision(): RoutingDecision | undefined;
    getFleetMode(): 'scoped' | 'all';
  }
}