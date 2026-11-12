import { SmartRouter } from '../router/index.js';
import { RoutingDecision } from '../types/index.js';
/** Format status message for /cogumi-smart-router */
export declare function formatStatusMessage(router: SmartRouter, decision: RoutingDecision | undefined): string;
/** Format active model indicator for end-of-response */
export declare function formatActiveModelIndicator(decision: RoutingDecision | undefined): string;
//# sourceMappingURL=formatters.d.ts.map