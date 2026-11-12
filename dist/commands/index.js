// src/commands/index.ts
// Slash command handlers for /cogumi-smart-router
import { formatStatusMessage, formatActiveModelIndicator } from './formatters.js';
// Simple model name -> HuggingFace model ID mapping
const ROUTER_MODEL_MAP = {
    'qwen3-0.6b': 'dkeviv/Qwen3-0.6B-DQ-ONNX-bucket',
    'qwen3.5-0.8b': 'dkeviv/Qwen3.5-0.8B-Text-ONNX-WebGPU-QDQ-bucket',
};
const ROUTER_MODEL_LABELS = {
    'qwen3-0.6b': 'Qwen3 0.6B (Fast, 370 MB)',
    'qwen3.5-0.8b': 'Qwen3.5 0.8B (Smarter, 490 MB)',
};
function formatModelOptions() {
    const lines = [
        'Select router model:',
        '',
    ];
    for (const [key, label] of Object.entries(ROUTER_MODEL_LABELS)) {
        lines.push(`  ${key} — ${label}`);
    }
    lines.push('');
    lines.push('Usage: /cogumi-smart-router model <name>');
    lines.push('Example: /cogumi-smart-router model qwen3-0.6b');
    return lines.join('\n');
}
function resolveModelId(input) {
    const normalized = input.toLowerCase().trim();
    return ROUTER_MODEL_MAP[normalized] || null;
}
export function registerSmartRouterCommand(deps) {
    const { router, store, ctx, config, llmRouterStage, routerClient } = deps;
    // Register main command: on/off + status
    ctx.command('cogumi-smart-router', '[command:string] [arg:string]', {
        description: 'Cogumi Smart Router: on | off | status | model [name]',
    })
        .action(async (argv) => {
        try {
            const { command, arg } = argv;
            const cmd = (command || 'status').toLowerCase();
            if (cmd === 'on' || cmd === 'enable') {
                config.enabled = true;
                llmRouterStage.setEnabled(true);
                ctx.ui.notify('✅ Cogumi Smart Router enabled', 'info');
                return;
            }
            if (cmd === 'off' || cmd === 'disable') {
                config.enabled = false;
                llmRouterStage.setEnabled(false);
                ctx.ui.notify('⏹️ Cogumi Smart Router disabled. Use `/model <provider/model>` to manually select.', 'info');
                return;
            }
            if (cmd === 'model') {
                if (!arg) {
                    // Show options to select
                    ctx.ui.notify(formatModelOptions(), 'info');
                    return;
                }
                const modelId = resolveModelId(arg);
                if (!modelId) {
                    ctx.ui.notify(`❌ Unknown model: ${arg}\n\n${formatModelOptions()}`, 'error');
                    return;
                }
                await routerClient.switchModel(modelId);
                const current = routerClient.getCurrentModel();
                // Show simple name
                const simpleName = Object.keys(ROUTER_MODEL_MAP).find(k => ROUTER_MODEL_MAP[k] === current) || current;
                ctx.ui.notify(`✅ Router model switched to: ${simpleName}`, 'info');
                return;
            }
            // Default: show status
            const decision = router.getLastDecision?.();
            const message = formatStatusMessage(router, decision);
            ctx.ui.notify(message, 'info');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(message, 'error');
        }
    });
}
/** Inject active model indicator at end of response */
export function injectActiveModelIndicator(decision) {
    return formatActiveModelIndicator(decision);
}
//# sourceMappingURL=index.js.map