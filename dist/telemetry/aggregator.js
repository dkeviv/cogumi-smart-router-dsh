// src/telemetry/aggregator.ts
// Telemetry aggregation for stats command
export function aggregateSessionStatsFromFleet(entries, fleet, priceCatalog) {
    if (entries.length === 0) {
        return emptySnapshot();
    }
    const fleetMap = new Map(fleet?.map((m) => [m.id, m]) || []);
    const priceMap = new Map(priceCatalog || []);
    let totalCost = 0;
    let totalLatency = 0;
    let actualUsageCount = 0;
    let actualTotalTokens = null;
    let actualCount = 0;
    let planningDelegateCount = 0;
    let directCount = 0;
    let localCount = 0;
    let cloudCount = 0;
    let knownLocalCloudCount = 0;
    const roleCost = {
        primary: { count: 0, total_cost_usd: 0 },
        planning_delegate: { count: 0, total_cost_usd: 0 },
        other: { count: 0, total_cost_usd: 0 },
    };
    for (const entry of entries) {
        const modelProfile = fleetMap.get(entry.model);
        const isLocal = modelProfile?.tier === 'zero-tier';
        const isPlanningDelegate = entry.planningDelegatePrimaryModelId !== undefined;
        // Cost calculation
        let cost = entry.cost;
        let costBasis = 'estimated';
        if (entry.inputTokens > 0 || entry.outputTokens > 0) {
            const price = priceMap.get(entry.model);
            if (price) {
                cost = (entry.inputTokens / 1_000_000) * price.input + (entry.outputTokens / 1_000_000) * price.output;
                costBasis = 'actual';
                actualCount++;
                actualTotalTokens = (actualTotalTokens || 0) + entry.inputTokens + entry.outputTokens;
            }
        }
        totalCost += cost;
        totalLatency += entry.latencyMs;
        // Role classification
        if (isPlanningDelegate) {
            planningDelegateCount++;
            roleCost.planning_delegate.count++;
            roleCost.planning_delegate.total_cost_usd += cost;
        }
        else if (entry.sessionPinned) {
            directCount++;
            roleCost.primary.count++;
            roleCost.primary.total_cost_usd += cost;
        }
        else {
            directCount++;
            roleCost.other.count++;
            roleCost.other.total_cost_usd += cost;
        }
        // Local vs cloud
        if (isLocal !== undefined) {
            knownLocalCloudCount++;
            if (isLocal)
                localCount++;
            else
                cloudCount++;
        }
    }
    const entryCount = entries.length;
    const meanCost = entryCount > 0 ? totalCost / entryCount : null;
    const meanLatency = entryCount > 0 ? totalLatency / entryCount : null;
    let costBasis = 'estimated';
    if (actualCount === entryCount)
        costBasis = 'actual';
    else if (actualCount > 0)
        costBasis = 'mixed';
    // Calculate vs-frontier savings
    let frontierSavings;
    if (fleet) {
        const frontierModels = fleet.filter((m) => m.tier === 'frontier-cloud');
        if (frontierModels.length > 0) {
            // Use average frontier cost
            const avgFrontierCost = frontierModels.reduce((sum, m) => sum + m.pricing.fallbackCostPer1M, 0) / frontierModels.length;
            let savings = 0;
            for (const entry of entries) {
                const tokens = entry.inputTokens + entry.outputTokens;
                if (tokens > 0) {
                    const frontierCost = (tokens / 1_000_000) * avgFrontierCost;
                    savings += Math.max(0, frontierCost - entry.cost);
                }
            }
            frontierSavings = savings;
        }
    }
    return {
        entry_count: entryCount,
        total_cost_usd: totalCost,
        mean_cost_usd: meanCost,
        total_latency_ms: totalLatency,
        mean_latency_ms: meanLatency,
        planning_delegate_share: entryCount > 0 ? planningDelegateCount / entryCount : null,
        direct_share: entryCount > 0 ? directCount / entryCount : null,
        local_share: knownLocalCloudCount > 0 ? localCount / knownLocalCloudCount : null,
        cloud_share: knownLocalCloudCount > 0 ? cloudCount / knownLocalCloudCount : null,
        role_cost: {
            primary: roleCost.primary,
            planning_delegate: roleCost.planning_delegate,
            other: roleCost.other,
        },
        cost_basis: costBasis,
        actual_usage_count: actualCount,
        actual_total_tokens: actualTotalTokens,
        frontier_savings_usd: frontierSavings,
    };
}
function emptySnapshot() {
    return {
        entry_count: 0,
        total_cost_usd: 0,
        mean_cost_usd: null,
        total_latency_ms: 0,
        mean_latency_ms: null,
        planning_delegate_share: null,
        direct_share: null,
        local_share: null,
        cloud_share: null,
        role_cost: {
            primary: { count: 0, total_cost_usd: 0 },
            planning_delegate: { count: 0, total_cost_usd: 0 },
            other: { count: 0, total_cost_usd: 0 },
        },
        cost_basis: 'estimated',
        actual_usage_count: 0,
        actual_total_tokens: null,
    };
}
//# sourceMappingURL=aggregator.js.map