// src/index.ts
// Main plugin entry point for DSH Cordis
import { createSmartRouter, SmartRouter } from './router';
import { createTelemetryStore } from './telemetry';
import { registerSmartRouterCommand } from './commands';
import { probeHardware } from './hardware/probe';
import { fleetManager } from './fleet';
import { LLMRouterStage } from './router/llm-router-stage';
import { StandaloneRouterClient } from './router/standalone-router-client';
export const name = 'smart-router';
export function apply(ctx, config) {
    // Get required services
    const llm = ctx.require('llm');
    const session = ctx.require('session');
    const systemInfo = ctx.require('systemInfo');
    // Create telemetry store
    const telemetryStore = createTelemetryStore({
        retentionDays: config.telemetry?.retentionDays || 30,
    });
    // Create smart router
    const routerDeps = {
        ctx,
        llm,
        session,
        systemInfo,
        config: config,
        telemetryStore,
    };
    const router = createSmartRouter(routerDeps);
    ctx.smartRouter = router;
    // Create LLM Router Stage and Standalone Router Client
    const llmRouterStage = new LLMRouterStage(config, telemetryStore);
    const routerClient = new StandaloneRouterClient(config, telemetryStore);
    // Initialize router on startup
    ctx.on('ready', async () => {
        if (config.enabled) {
            try {
                await router.initialize();
                await llmRouterStage.initialize();
                await routerClient.initialize();
                console.log('[smart-router] Initialized successfully');
                // Register slash commands
                registerSmartRouterCommand({
                    router,
                    store: telemetryStore,
                    ctx,
                    config: config,
                    llmRouterStage,
                    routerClient,
                });
                // Hook into model selection
                hookModelSelection(ctx, router, telemetryStore);
                // Hook into agent loop for fallback
                hookAgentLoop(ctx, router);
            }
            catch (error) {
                console.error('[smart-router] Initialization failed:', error);
            }
        }
    });
    // Cleanup on dispose
    ctx.on('dispose', () => {
        telemetryStore.close();
        fleetManager.stopHealthChecks();
        // Dispose router model
        if (routerClient && typeof routerClient.dispose === 'function') {
            routerClient.dispose();
        }
    });
}
function hookModelSelection(ctx, router, store) {
    // Hook into LLM before-stream to auto-route when no model specified
    ctx.llm?.on('before-stream', async (options) => {
        // Only auto-route if using smart-router/auto model
        if (options.model === 'smart-router/auto' || options.provider === 'smart-router') {
            try {
                // Build routing request from context
                const request = await buildRoutingRequest(ctx, options);
                const decision = await router.route(request);
                // Override with routed model
                return {
                    ...options,
                    provider: decision.provider,
                    model: decision.model,
                };
            }
            catch (error) {
                console.error('[smart-router] Routing failed:', error);
                // Fall through to default behavior
            }
        }
        return options;
    });
}
async function buildRoutingRequest(ctx, options) {
    const sessionId = ctx.session?.id || 'default';
    // Get messages from context (simplified)
    const messages = ctx.session?.messages || [];
    // Estimate tokens (rough approximation)
    const estimatedInputTokens = estimateTokens(messages);
    // Classify turn type
    const turnType = classifyTurnType(messages, options);
    // Determine required capabilities
    const requiredCapabilities = inferRequiredCapabilities(messages, options);
    return {
        messages,
        tools: options.tools,
        turnType,
        estimatedInputTokens,
        requiredCapabilities,
        sessionId,
        turnId: `turn-${Date.now()}`,
    };
}
function estimateTokens(messages) {
    let total = 0;
    for (const msg of messages) {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        total += Math.ceil(content.length / 4); // Rough approximation: 4 chars per token
    }
    return total;
}
function classifyTurnType(messages, options) {
    // Check if last message is a tool result
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'tool') {
        return 'tool_result';
    }
    // Check for planning indicators
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
        const content = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '';
        if (content.includes('plan') || content.includes('architecture') || content.includes('design')) {
            return 'planning';
        }
    }
    // Check for subagent metadata
    if (options.subagent) {
        return 'subagent';
    }
    return 'main_loop';
}
function inferRequiredCapabilities(messages, options) {
    // Simple heuristic based on message content
    const content = messages
        .filter((m) => m.role === 'user')
        .map((m) => typeof m.content === 'string' ? m.content : '')
        .join('\n');
    let reasoning = 0.5;
    let codeGen = 0.5;
    let toolUse = 0.5;
    if (content.includes('debug') || content.includes('fix') || content.includes('error')) {
        reasoning = 0.7;
        codeGen = 0.7;
    }
    if (content.includes('test') || content.includes('refactor')) {
        codeGen = 0.8;
    }
    if (content.includes('search') || content.includes('find') || content.includes('look up')) {
        toolUse = 0.8;
    }
    return { reasoning, codeGen, toolUse, vision: false, functionCalling: true };
}
function hookAgentLoop(ctx, router) {
    // Hook into agent/request-error waterfall for context overflow fallback
    ctx.waterfall('agent/request-error', async (ctx, next, error) => {
        if (error?.code === 'CONTEXT_WINDOW_EXCEEDED' || error?.message?.includes('context')) {
            const sessionId = ctx.session?.id || 'default';
            const fallback = await router.getContextOverflowFallback(sessionId);
            if (fallback) {
                return { kind: 'retry', model: fallback.model, provider: fallback.provider };
            }
        }
        return next();
    });
}
// Export types and utilities for external use
export { SmartRouter, createSmartRouter, probeHardware, fleetManager, LLMRouterStage, StandaloneRouterClient, };
export { TelemetryStore, createTelemetryStore, } from './telemetry';
//# sourceMappingURL=index.js.map