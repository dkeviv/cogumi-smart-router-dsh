// src/commands/formatters.ts
// Formatters for slash command output (embedded widget snapshots)

import { SmartRouter } from '../router/index.js';
import { RoutingDecision } from '../types/index.js';
import { StandaloneRouterClient } from '../router/standalone-router-client.js';

/** Format status message for /cogumi-smart-router */
export function formatStatusMessage(
  router: SmartRouter,
  decision: RoutingDecision | undefined
): string {
  const lines = [
    `🧠 Cogumi Smart Router`,
    `━━━━━━━━━━━━━━━━━━`,
  ];

  if (!decision) {
    lines.push(`Status: ${router.getFleet().length > 0 ? 'Ready' : 'No models in fleet'}`);
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

  lines.push(
    `Status: Active`,
    `Router Model: ${router.getLastDecision?.() ? 'Loaded' : 'Loading...'}`,
    `Active Model: ${provider}/${model}${pinned}`,
    `Tier: ${tier}`,
    `Stage: ${stage}`,
    `Reason: ${reason}`,
    `Latency: ~${latency}ms | Est. Cost: $${cost.toFixed(6)}`,
  );
  return lines.join('\n');
}

/** Format active model indicator for end-of-response */
export function formatActiveModelIndicator(decision: RoutingDecision | undefined): string {
  if (!decision) return '';
  const pinned = decision.sessionPinned ? ' 📌' : '';
  return `\n\n---\n*Routed via: ${decision.provider}/${decision.model} (${decision.tier})${pinned} | Stage: ${decision.stage} | ~${decision.estimatedLatencyMs}ms*`;
}