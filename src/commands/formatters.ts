// src/commands/formatters.ts
// Formatters for slash command output (embedded widget snapshots)

import { SmartRouter } from '../router';
import { TelemetryEvent, ModelProfile, RoutingDecision, PlacementPlanReport } from '../types';
import { aggregateSessionStatsFromFleet } from '../telemetry/aggregator';

export const SMART_ROUTER_USAGE =
  '/smart-router [status] | history [limit] | stats [limit] | mode scoped|all | pricing refresh | export dataset [--limit N] | export telemetry-contrib [--limit N] [--embeddings] | feedback good|bad | unpin | plan [--json] | doctor';

export interface ParsedSmartRouterCommand {
  command: 'status' | 'history' | 'stats' | 'mode' | 'pricing' | 'export' | 'feedback' | 'unpin' | 'plan' | 'doctor';
  limit?: number;
  mode?: 'scoped' | 'all';
  subcommand?: 'dataset' | 'telemetry-contrib' | 'refresh';
  rating?: 'good' | 'bad';
  format?: 'text' | 'json';
  includeEmbeddings?: boolean;
}

export function parseSmartRouterArgs(args: string): ParsedSmartRouterCommand {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens[0] === 'status') {
    return { command: 'status' };
  }

  if (tokens[0] === 'plan' && (tokens.length === 1 || (tokens.length === 2 && tokens[1] === '--json'))) {
    return { command: 'plan', format: tokens[1] === '--json' ? 'json' : 'text' };
  }

  if (tokens[0] === 'doctor' && tokens.length === 1) {
    return { command: 'doctor' };
  }

  if (tokens[0] === 'history') {
    return { command: 'history', limit: parseHistoryLimit(tokens[1]) };
  }

  if (tokens[0] === 'stats') {
    return { command: 'stats', limit: parseHistoryLimit(tokens[1]) };
  }

  if (tokens[0] === 'mode' && (tokens[1] === 'scoped' || tokens[1] === 'all')) {
    return { command: 'mode', mode: tokens[1] };
  }

  if (tokens[0] === 'pricing' && tokens[1] === 'refresh') {
    return { command: 'pricing', subcommand: 'refresh' };
  }

  if (tokens[0] === 'export' && tokens[1] === 'dataset') {
    return {
      command: 'export',
      subcommand: 'dataset',
      limit: parseExportLimit(tokens.slice(2)),
    };
  }

  if (tokens[0] === 'export' && tokens[1] === 'telemetry-contrib') {
    return {
      command: 'export',
      subcommand: 'telemetry-contrib',
      limit: parseExportLimit(tokens.slice(2)),
      includeEmbeddings: tokens.includes('--embeddings'),
    };
  }

  if (tokens[0] === 'feedback' && (tokens[1] === 'good' || tokens[1] === 'bad')) {
    return { command: 'feedback', rating: tokens[1] };
  }

  if (tokens[0] === 'unpin' && tokens.length === 1) {
    return { command: 'unpin' };
  }

  throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
}

function parseHistoryLimit(raw: string | undefined): number {
  if (raw === undefined) {
    return 20; // Default limit
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
  }
  return Math.min(parsed, 100);
}

function parseExportLimit(tokens: string[]): number {
  let limit = 100;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--limit') {
      const raw = tokens[i + 1];
      if (raw === undefined) {
        throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
      }
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
      }
      limit = Math.min(parsed, 1000);
      i += 1;
      continue;
    }
    if (token?.startsWith('--limit=')) {
      const raw = token.slice('--limit='.length);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Usage: ${SMART_ROUTER_USAGE}`);
      }
      limit = Math.min(parsed, 1000);
      continue;
    }
  }
  return limit;
}

/** Resolve concrete model ID for display (never show bare 'auto') */
function resolveHistoryModelId(
  entry: Pick<TelemetryEvent, 'model' | 'provider'>,
  fleet?: readonly ModelProfile[]
): string {
  const modelId = entry.model;
  if (modelId !== 'auto' && modelId !== 'smart-router/auto') {
    return modelId;
  }

  const profile = fleet?.find((m) => m.id === 'auto' || m.provider + '/' + m.id === entry.provider + '/auto');
  if (profile) {
    return `${profile.provider}/${profile.id}`;
  }

  return `${entry.provider}/auto`;
}

export function formatStatusMessage(
  router: SmartRouter,
  decision: RoutingDecision | undefined
): string {
  const lines = [
    `Fleet mode: ${router.getFleetMode?.() || 'scoped'}`,
    `Fleet size: ${router.getFleet().length}`,
  ];

  const fleetMembers = router.getFleet()
    .map((profile) => `${profile.provider}/${profile.id}`)
    .sort();

  if (fleetMembers.length > 0) {
    lines.push('Fleet members:');
    for (const member of fleetMembers) {
      lines.push(`  - ${member}`);
    }
  } else {
    lines.push('Fleet members: (none)');
  }

  // Pricing freshness (TODO: get from store)
  // const stalenessLine = formatPricingStalenessLine(runtime.priceCatalog);

  if (!decision) {
    lines.push('Last routing decision: (none yet)');
    return lines.join('\n');
  }

  lines.push(
    `Model: ${decision.provider}/${decision.model}`,
    `Stage: ${decision.stage}`,
    `Reason: ${decision.reasoning}`,
    `Latency: ${decision.estimatedLatencyMs}ms`,
  );
  return lines.join('\n');
}

export function formatHistoryMessage(
  entries: readonly TelemetryEvent[],
  options?: { fleet?: readonly ModelProfile[] },
): string {
  if (entries.length === 0) {
    return 'No routing history yet.';
  }

  const fleet = options?.fleet;
  return entries
    .map((entry) => {
      const modelId = resolveHistoryModelId(entry, fleet);
      return `${new Date(entry.timestamp).toISOString()} | ${modelId} | ${entry.stage} | ${entry.turnType} | ${entry.latencyMs}ms`;
    })
    .join('\n');
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  if (Math.abs(value) >= 1) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(6)}`;
}

function formatShare(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatMean(value: number | null, suffix: string): string {
  if (value === null) {
    return 'n/a';
  }
  if (suffix === 'ms') {
    return `${value.toFixed(1)}${suffix}`;
  }
  return `${formatUsd(value)}${suffix}`;
}

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
    primary: { count: number; total_cost_usd: number };
    planning_delegate: { count: number; total_cost_usd: number };
    other: { count: number; total_cost_usd: number };
  };
  cost_basis: 'actual' | 'mixed' | 'estimated';
  actual_usage_count: number;
  actual_total_tokens: number | null;
  frontier_savings_usd?: number;
}

export function formatStatsMessage(
  entries: readonly TelemetryEvent[],
  options?: {
    fleet?: readonly ModelProfile[];
    priceCatalog?: Map<string, { provider: string; input: number; output: number; lastUpdated: number }> | null;
  },
): string {
  const snapshot = aggregateSessionStatsFromFleet(
    entries,
    options?.fleet,
    options?.priceCatalog
  );

  if (snapshot.entry_count === 0) {
    return 'No routing stats yet (empty telemetry window).';
  }

  const costBasisLabel =
    snapshot.cost_basis === 'actual'
      ? 'actual'
      : snapshot.cost_basis === 'mixed'
        ? `mixed (${snapshot.actual_usage_count}/${snapshot.entry_count} actual)`
        : 'estimated';

  const lines = [
    `Entries: ${snapshot.entry_count}`,
    `Cost (${costBasisLabel}): total ${formatUsd(snapshot.total_cost_usd)} | mean ${formatMean(snapshot.mean_cost_usd, '')}`,
    `Latency: total ${snapshot.total_latency_ms.toFixed(0)}ms | mean ${formatMean(snapshot.mean_latency_ms, 'ms')}`,
    `Planning delegate share: ${formatShare(snapshot.planning_delegate_share)} (direct ${formatShare(snapshot.direct_share)})`,
    `Local vs cloud (when known): local ${formatShare(snapshot.local_share)} | cloud ${formatShare(snapshot.cloud_share)}`,
    'Role cost breakdown:',
    `  primary (pin path): ${snapshot.role_cost.primary.count} | ${formatUsd(snapshot.role_cost.primary.total_cost_usd)}`,
    `  planning_delegate: ${snapshot.role_cost.planning_delegate.count} | ${formatUsd(snapshot.role_cost.planning_delegate.total_cost_usd)}`,
    `  other: ${snapshot.role_cost.other.count} | ${formatUsd(snapshot.role_cost.other.total_cost_usd)}`,
  ];

  if (snapshot.actual_usage_count > 0) {
    lines.push(
      `Actual usage: ${snapshot.actual_usage_count}/${snapshot.entry_count} entries with host-reported tokens` +
        (snapshot.actual_total_tokens !== null
          ? ` | ${snapshot.actual_total_tokens} actual tokens`
          : ''),
    );
  }

  if (snapshot.frontier_savings_usd !== undefined) {
    lines.push(
      `Vs always-frontier savings: ${formatUsd(snapshot.frontier_savings_usd)} (${snapshot.cost_basis === 'estimated' ? 'est.' : 'actuals preferred, est. when missing'})`,
      '  formula: sum max(0, tokens/1e6 * frontier_cost_per_1m - cost); tokens/cost prefer actuals; omitted when prices missing',
    );
  } else {
    lines.push('Vs always-frontier savings: (omitted — frontier prices unavailable)');
  }

  return lines.join('\n');
}

function formatTps(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(1)} tok/s`;
}

function formatGb(value: number | null): string {
  return value === null ? 'unknown' : `${value.toFixed(1)} GiB`;
}

function formatPing(label: string, ping: PlacementPlanReport['localModel']['lmStudio']): string {
  if (!ping.available) {
    return `  ${label}: unreachable`;
  }
  return `  ${label}: up, model ${ping.hasLoadedModel ? 'loaded (warm)' : 'not loaded (cold)'}`;
}

export function formatPlacementPlanMessage(report: PlacementPlanReport): string {
  const lines = [
    `Placement plan (read-only, schema v${report.schemaVersion}) — ${report.generatedAt}`,
    `Recommendation: ${report.recommendation}`,
    `Bottleneck guess: ${report.bottleneck.guess} — ${report.bottleneck.rationale}`,
    `Encoder: ${report.encoder.resident ? 'resident' : 'not resident'} (${report.encoder.model}) at ${report.encoder.cachePath}`,
    `Local model: ${report.localModel.warm ? 'warm' : report.localModel.coldStartExpected ? 'cold (load on first request)' : 'unavailable'}`,
    formatPing('LM Studio', report.localModel.lmStudio),
    formatPing('Ollama', report.localModel.ollama),
    `Hardware: ${report.hardware.platform}/${report.hardware.arch}, total ${formatGb(report.hardware.totalMemoryGb)}, free ${formatGb(report.hardware.freeMemoryGb)}, probe=${report.hardware.probe}`,
    `Disk (${report.disk.path}): free ${formatGb(report.disk.freeGb)}${report.disk.constrained ? ' [constrained]' : ''}`,
    `Throughput: ${report.throughput.classification} | warm median ${formatTps(report.throughput.warmMedianTps)} (${report.throughput.warmSamples} samples) | cold median ${formatTps(report.throughput.coldMedianTps)} (${report.throughput.coldSamples} samples) | threshold ${report.throughput.thresholdTps} tok/s | viable=${report.throughput.viable}`,
    `Policy: quality-preserving — on resource pressure: ${report.policy.onResourcePressure}`,
  ];
  return lines.join('\n');
}

export function formatDoctorMessage(report: PlacementPlanReport): string {
  const check = (ok: boolean, label: string): string => `${ok ? '✓' : '✗'} ${label}`;
  const lines = [
    'smart-router doctor (read-only)',
    check(report.encoder.resident, `encoder resident (${report.encoder.model})`),
    check(report.hardware.probe === 'full_local', `hardware probe: ${report.hardware.probe}`),
    check(!report.disk.constrained, `disk: ${formatGb(report.disk.freeGb)} free${report.disk.constrained ? ' [constrained]' : ''}`),
    check(
      report.localModel.lmStudio.available || report.localModel.ollama.available,
      'local runtime reachable (LM Studio / Ollama)',
    ),
    check(report.localModel.warm, `local model ${report.localModel.warm ? 'warm' : 'cold/not loaded'}`),
    check(
      report.throughput.viable,
      `throughput: ${report.throughput.classification}, viable=${report.throughput.viable}${report.throughput.classification === 'cold-only' ? ' (cold-only windows fail closed)' : ''}`,
    ),
    `Bottleneck guess: ${report.bottleneck.guess} — ${report.bottleneck.rationale}`,
    `Recommendation: ${report.recommendation}`,
    'Policy: quality-preserving — under resource pressure local is reported unavailable and routing escalates safely; encoder fidelity is never weakened.',
  ];
  return lines.join('\n');
}