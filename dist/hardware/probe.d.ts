import { HardwareInfo } from '../types/index.js';
export interface HardwareProbeConfig {
    minMemoryGbForLocal: number;
    minMemoryGbForClassification: number;
    batteryThresholdPercent: number;
}
export declare const DEFAULT_HARDWARE_PROBE_CONFIG: HardwareProbeConfig;
export declare function probeHardware(config?: HardwareProbeConfig): Promise<HardwareInfo>;
//# sourceMappingURL=probe.d.ts.map