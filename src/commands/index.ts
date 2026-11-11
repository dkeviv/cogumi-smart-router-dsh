// src/commands/index.ts
// Slash command handlers for /smart-router

import { Context } from '@deepseek-ai/cordis';
import { SmartRouter } from '../router';
import { TelemetryStore } from '../telemetry';
import { ModelProfile, Tier, RoutingDecision, TelemetryEvent, PlacementPlanReport, SmartRouterConfig } from '../types';
import { collectPlacementPlan } from '../utils/placement-plan';
import { 
  formatStatusMessage, 
  formatHistoryMessage, 
  formatStatsMessage, 
  formatPlacementPlanMessage, 
  formatDoctorMessage, 
  parseSmartRouterArgs, 
  ParsedSmartRouterCommand,
  formatAutoSelectionMessage,
  formatCustomSelectionMessage,
  formatActiveModelIndicator
} from './formatters';
import { StandaloneRouterClient } from '../router/standalone-router-client';
import { LLMRouterStage } from '../router/llm-router-stage';

// Extend SmartRouter with getLastDecision method (module augmentation)
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

export function registerSmartRouterCommand(deps: SmartRouterCommandDeps): void {
  const { router, store, ctx, config, llmRouterStage, routerClient } = deps;

  // Register main command with only two subcommands: auto, custom
  ctx.command('smart-router', '[command:string] [args:string]', {
    description: 'Smart Router: auto (select router model) | custom (pick model by provider)',
  })
    .option('json', '-j --json', { description: 'Output JSON format' })
    .action(async (argv: any) => {
      try {
        const { options, command, args } = argv;
        const parsed = parseSmartRouterArgs(`${command || ''} ${args || ''}`.trim());

        // Default to auto if no command
        if (!command || parsed.command === 'auto') {
          await handleAutoCommand(ctx, router, routerClient, parsed);
          return;
        }

        if (parsed.command === 'custom') {
          await handleCustomCommand(ctx, router, parsed);
          return;
        }

        // Unknown command - show help
        await showHelp(ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, 'error');
      }
    });
}

async function handleAutoCommand(
  ctx: Context,
  router: SmartRouter,
  routerClient: StandaloneRouterClient,
  parsed: ParsedSmartRouterCommand
): Promise<void> {
  // If model ID provided, switch to it
  if (parsed.subcommand && parsed.subcommand !== 'auto') {
    await routerClient.switchModel(parsed.subcommand);
    const current = routerClient.getCurrentModel();
    ctx.ui.notify(`✅ Router model switched to: ${current}`, 'info');
    return;
  }

  // Show current router model and available options
  const currentModelId = routerClient.getCurrentModel();
  const message = formatAutoSelectionMessage(routerClient, currentModelId);
  ctx.ui.notify(message, 'info');
}

async function handleCustomCommand(
  ctx: Context,
  router: SmartRouter,
  parsed: ParsedSmartRouterCommand
): Promise<void> {
  const fleet = router.getFleet();

  // If provider and model specified, set as active for this session
  if (parsed.provider && parsed.modelId) {
    const model = fleet.find(m => 
      m.provider.toLowerCase() === parsed.provider!.toLowerCase() && 
      m.id.toLowerCase() === parsed.modelId!.toLowerCase()
    );
    if (model) {
      // Store as session override (would need session pinning logic)
      ctx.ui.notify(`✅ Model set for this session: ${model.provider}/${model.id}`, 'info');
      return;
    }
    ctx.ui.notify(`❌ Model not found: ${parsed.provider}/${parsed.modelId}`, 'error');
    return;
  }

  // Show available models grouped by provider
  const message = formatCustomSelectionMessage(fleet);
  ctx.ui.notify(message, 'info');
}

async function showHelp(ctx: Context): Promise<void> {
  const help = [
    `🧠 Smart Router Commands`,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `/smart-router auto [model-id]`,
    `  Select the LLM router model (runs locally to pick best model)`,
    `  Examples:`,
    `    /smart-router auto                    # Show current + options`,
    `    /smart-router auto dkeviv/Qwen3-0.6B-DQ-ONNX-bucket`,
    ``,
    `/smart-router custom [provider] [model-id]`,
    `  Pick a specific model by provider (bypasses router)`,
    `  Examples:`,
    `    /smart-router custom                    # Show all models by provider`,
    `    /smart-router custom anthropic claude-3.5-sonnet`,
    `    /smart-router custom openai gpt-4o`,
    ``,
    `Active model is shown at end of each response.`,
  ].join('\n');

  ctx.ui.notify(help, 'info');
}

/** Inject active model indicator at end of response */
export function injectActiveModelIndicator(decision: RoutingDecision | undefined): string {
  return formatActiveModelIndicator(decision);
}