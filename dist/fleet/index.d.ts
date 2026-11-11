import { ModelProfile, Tier, HardwareInfo, SmartRouterConfig } from '../types';
export interface FleetConfig {
    modelsPath?: string;
    hardwareInfo: HardwareInfo;
    config: SmartRouterConfig;
    enabledModels?: string[];
    allModels?: ModelProfile[];
}
export interface FleetManager {
    fleet: ModelProfile[];
    loadFleet(config: FleetConfig): Promise<void>;
    getAvailableModels(tier?: Tier): ModelProfile[];
    getModelById(id: string): ModelProfile | undefined;
    startHealthChecks(): void;
    stopHealthChecks(): void;
}
export declare const fleetManager: FleetManager;
export default fleetManager;
//# sourceMappingURL=index.d.ts.map