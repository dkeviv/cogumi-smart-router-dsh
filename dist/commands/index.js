// src/commands/index.ts
// Slash command handlers for /cogumi-smart-router
import { formatStatusMessage, formatActiveModelIndicator } from './formatters';
export function registerSmartRouterCommand(deps) {
    const { router, store, ctx, config, llmRouterStage, routerClient } = deps;
    // Register main command: on/off + status
    ctx.command('cogumi-smart-router', '[command:string]', {
        description: 'Cogumi Smart Router: on (enable) | off (disable) | status',
    })
        .action(async (argv) => {
        try {
            const { command } = argv;
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
                const current = routerClient.getCurrentModel();
                ctx.ui.notify(`Current router model: ${current}`, 'info');
                return;
            }
            if (cmd === 'model' && argv.args) {
                await routerClient.switchModel(argv.args);
                const current = routerClient.getCurrentModel();
                ctx.ui.notify(`✅ Router model switched to: ${current}`, 'info');
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