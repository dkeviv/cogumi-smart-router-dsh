// src/commands/formatters.ts
// Formatters for slash command output (embedded widget snapshots)
import { aggregateSessionStatsFromFleet } from '../telemetry/aggregator';
export const SMART_ROUTER_USAGE = '/smart-router auto | custom';
export function parseSmartRouterArgs(args) {
    const tokens = args.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
        return { command: 'auto' };
    }
    if (tokens[0] === 'auto') {
        return { command: 'auto', subcommand: tokens[1] };
    }
    if (tokens[0] === 'custom') {
        return { command: 'custom', subcommand: tokens[1], provider: tokens[2], modelId: tokens.slice(3).join(' ') };
    }
    // Default to auto for unknown commands
    return { command: 'auto' };
}
/** Resolve concrete model ID for display (never show bare 'auto') */
function resolveHistoryModelId(entry, fleet) {
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
export function formatStatusMessage(router, decision) {
    const lines = [
        `🧠 Smart Router Active`,
        `━━━━━━━━━━━━━━━━━━`,
        `Fleet mode: ${router.getFleetMode?.() || 'scoped'}`,
        `Fleet size: ${router.getFleet().length}`,
    ];
    if (!decision) {
        lines.push('Last routing: (none yet)');
        return lines.join('\n');
    }
    const provider = decision.provider;
    const model = decision.model;
    const tier = decision.tier;
    const stage = decision.stage;
    const reason = decision.reasoning;
    const latency = decision.estimatedLatencyMs;
    const cost = decision.estimatedCost;
    const pinned = decision.sessionPinned ? ' 📌' : '';
    lines.push(`Active Model: ${provider}/${model}${pinned}`, `Tier: ${tier}`, `Stage: ${stage}`, `Reason: ${reason}`, `Latency: ~${latency}ms | Est. Cost: $${cost.toFixed(6)}`);
    return lines.join('\n');
}
export function formatHistoryMessage(entries, options) {
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
function formatUsd(value) {
    if (!Number.isFinite(value))
        return 'n/a';
    if (Math.abs(value) >= 1)
        return `$${value.toFixed(4)}`;
    return `$${value.toFixed(6)}`;
}
function formatShare(value) {
    if (value === null)
        return 'n/a';
    return `${(value * 100).toFixed(1)}%`;
}
function formatMean(value, suffix) {
    if (value === null)
        return 'n/a';
    if (suffix === 'ms')
        return `${value.toFixed(1)}${suffix}`;
    return `${formatUsd(value)}${suffix}`;
}
export function formatStatsMessage(entries, options) {
    const snapshot = aggregateSessionStatsFromFleet(entries, options?.fleet, options?.priceCatalog);
    if (snapshot.entry_count === 0) {
        return 'No routing stats yet (empty telemetry window).';
    }
    const costBasisLabel = snapshot.cost_basis === 'actual'
        ? 'actual'
        : snapshot.cost_basis === 'mixed'
            ? `mixed (${snapshot.actual_usage_count}/${snapshot.entry_count} actual)`
            : 'estimated';
    const lines = [
        `📊 Smart Router Stats`,
        `━━━━━━━━━━━━━━━━━━`,
        `Entries: ${snapshot.entry_count}`,
        `Cost (${costBasisLabel}): total ${formatUsd(snapshot.total_cost_usd)} | avg ${formatMean(snapshot.mean_cost_usd, '')}`,
        `Latency: total ${snapshot.total_latency_ms.toFixed(0)}ms | avg ${formatMean(snapshot.mean_latency_ms, 'ms')}`,
        `Planning delegate: ${formatShare(snapshot.planning_delegate_share)} (direct ${formatShare(snapshot.direct_share)})`,
        `Local vs Cloud: local ${formatShare(snapshot.local_share)} | cloud ${formatShare(snapshot.cloud_share)}`,
        `Role costs:`,
        `  primary (pinned): ${snapshot.role_cost.primary.count} | ${formatUsd(snapshot.role_cost.primary.total_cost_usd)}`,
        `  planning_delegate: ${snapshot.role_cost.planning_delegate.count} | ${formatUsd(snapshot.role_cost.planning_delegate.total_cost_usd)}`,
        `  other: ${snapshot.role_cost.other.count} | ${formatUsd(snapshot.role_cost.other.total_cost_usd)}`,
    ];
    if (snapshot.actual_usage_count > 0) {
        lines.push(`Actual usage: ${snapshot.actual_usage_count}/${snapshot.entry_count} entries${snapshot.actual_total_tokens !== null ? ` | ${snapshot.actual_total_tokens} tokens` : ''}`);
    }
    if (snapshot.frontier_savings_usd !== undefined) {
        lines.push(`Vs frontier savings: ${formatUsd(snapshot.frontier_savings_usd)} (${snapshot.cost_basis === 'estimated' ? 'est.' : 'actuals preferred'})`);
    }
    else {
        lines.push('Vs frontier savings: (frontier prices unavailable)');
    }
    return lines.join('\n');
}
function formatTps(value) {
    return value === null ? 'n/a' : `${value.toFixed(1)} tok/s`;
}
function formatGb(value) {
    return value === null ? 'unknown' : `${value.toFixed(1)} GiB`;
}
function formatPing(label, ping) {
    if (!ping.available)
        return `  ${label}: unreachable`;
    return `  ${label}: up, model ${ping.hasLoadedModel ? 'loaded (warm)' : 'not loaded (cold)'}`;
}
export function formatPlacementPlanMessage(report) {
    const lines = [
        `Placement plan (read-only, schema v${report.schemaVersion}) — ${report.generatedAt}`,
        `Recommendation: ${report.recommendation}`,
        `Bottleneck: ${report.bottleneck.guess} — ${report.bottleneck.rationale}`,
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
export function formatDoctorMessage(report) {
    const check = (ok, label) => `${ok ? '✓' : '✗'} ${label}`;
    const lines = [
        'smart-router doctor (read-only)',
        check(report.encoder.resident, `encoder resident (${report.encoder.model})`),
        check(report.hardware.probe === 'full_local', `hardware probe: ${report.hardware.probe}`),
        check(!report.disk.constrained, `disk: ${formatGb(report.disk.freeGb)} free${report.disk.constrained ? ' [constrained]' : ''}`),
        check(report.localModel.lmStudio.available || report.localModel.ollama.available, 'local runtime reachable (LM Studio / Ollama)'),
        check(report.localModel.warm, `local model ${report.localModel.warm ? 'warm' : 'cold/not loaded'}`),
        check(report.throughput.viable, `throughput: ${report.throughput.classification}, viable=${report.throughput.viable}${report.throughput.classification === 'cold-only' ? ' (cold-only windows fail closed)' : ''}`),
        `Bottleneck: ${report.bottleneck.guess} — ${report.bottleneck.rationale}`,
        `Recommendation: ${report.recommendation}`,
        'Policy: quality-preserving — under resource pressure local is reported unavailable and routing escalates safely; encoder fidelity is never weakened.',
    ];
    return lines.join('\n');
}
/** Format router model selection UI for /smart-router auto */
export function formatAutoSelectionMessage(routerClient, currentModelId) {
    const models = routerClient.getAvailableModels();
    const lines = [
        `🤖 Select Router Model`,
        `━━━━━━━━━━━━━━━━━━`,
        `Current: ${currentModelId}`,
        ``,
        `Available models:`,
    ];
    for (const model of models) {
        const marker = model.modelId === currentModelId ? ' →' : '';
        lines.push(`  ${model.label}${marker}`);
        lines.push(`    ${model.description}`);
        lines.push(`    Size: ${(model.sizeBytes / 1024 / 1024).toFixed(0)} MB | Quant: ${model.dtype}`);
        lines.push(``);
    }
    lines.push(`Usage: /smart-router auto <model-id>`);
    lines.push(`Example: /smart-router auto dkeviv/Qwen3-0.6B-DQ-ONNX-bucket`);
    return lines.join('\n');
}
/** Format custom model selection UI for /smart-router custom */
export function formatCustomSelectionMessage(fleet) {
    // Group by provider
    const byProvider = new Map();
    for (const model of fleet) {
        if (!byProvider.has(model.provider))
            byProvider.set(model.provider, []);
        byProvider.get(model.provider).push(model);
    }
    const lines = [
        `🎯 Select Model (Custom)`,
        `━━━━━━━━━━━━━━━━━━`,
        `Choose from available models by provider:`,
        ``,
    ];
    for (const [provider, models] of byProvider) {
        lines.push(`📦 ${provider.toUpperCase()}`);
        // Group by tier
        const byTier = new Map();
        for (const model of models) {
            if (!byTier.has(model.tier))
                byTier.set(model.tier, []);
            byTier.get(model.tier).push(model);
        }
        for (const [tier, tierModels] of byTier) {
            const tierEmoji = tier === 'zero-tier' ? '🏠' : tier === 'economical-cloud' ? '☁️' : '🚀';
            lines.push(`  ${tierEmoji} ${tier}`);
            for (const model of tierModels) {
                const cost = model.pricing.fallbackCostPer1M;
                const costStr = cost === 0 ? 'Free' : `$${cost.toFixed(2)}/1M`;
                lines.push(`    ${model.id} | ${costStr} | ${model.contextWindow.toLocaleString()}ctx | cap: R${(model.capabilities.reasoning * 100).toFixed(0)} C${(model.capabilities.codeGen * 100).toFixed(0)} T${(model.capabilities.toolUse * 100).toFixed(0)}`);
            }
        }
        lines.push(``);
    }
    lines.push(`Usage: /smart-router custom <provider> <model-id>`);
    lines.push(`Example: /smart-router custom anthropic claude-3.5-sonnet`);
    return lines.join('\n');
}
/** Format active model indicator for end-of-response */
export function formatActiveModelIndicator(decision) {
    if (!decision)
        return '';
    const pinned = decision.sessionPinned ? ' 📌' : '';
    return `\n\n---\n*Routed via: ${decision.provider}/${decision.model} (${decision.tier})${pinned} | Stage: ${decision.stage} | ~${decision.estimatedLatencyMs}ms*`;
}
//# sourceMappingURL=formatters.js.map