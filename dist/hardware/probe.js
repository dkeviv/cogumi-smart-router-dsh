// src/hardware/probe.ts
// Hardware capability detection for local inference gating
import os from 'node:os';
import { execSync } from 'node:child_process';
export const DEFAULT_HARDWARE_PROBE_CONFIG = {
    minMemoryGbForLocal: 16,
    minMemoryGbForClassification: 8,
    batteryThresholdPercent: 20,
};
export async function probeHardware(config = DEFAULT_HARDWARE_PROBE_CONFIG) {
    const totalMemory = getTotalMemoryGb();
    const freeMemory = getFreeMemoryGb();
    const { batteryLevel, isPluggedIn } = await getBatteryInfo();
    const localRuntimeAvailable = await checkLocalRuntimeAvailability();
    let probe = 'disabled';
    if (totalMemory >= config.minMemoryGbForLocal) {
        if (batteryLevel !== undefined && !isPluggedIn && batteryLevel < config.batteryThresholdPercent) {
            probe = 'disabled';
        }
        else {
            probe = 'full_local';
        }
    }
    else if (totalMemory >= config.minMemoryGbForClassification) {
        probe = 'classification_only';
    }
    else {
        probe = 'disabled';
    }
    return {
        platform: process.platform,
        arch: process.arch,
        totalMemoryGb: totalMemory,
        freeMemoryGb: freeMemory,
        batteryLevel,
        isPluggedIn,
        probe,
        localRuntimeAvailable,
    };
}
function getTotalMemoryGb() {
    // Use Node's os.totalmem() for cross-platform
    return Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10;
}
function getFreeMemoryGb() {
    return Math.round(os.freemem() / (1024 * 1024 * 1024) * 10) / 10;
}
async function getBatteryInfo() {
    // macOS battery check via pmset
    if (process.platform === 'darwin') {
        try {
            const output = execSync('pmset -g batt', { encoding: 'utf8', timeout: 2000 });
            const lines = output.split('\n');
            for (const line of lines) {
                if (line.includes('%')) {
                    const match = line.match(/(\d+)%;/);
                    if (match) {
                        const level = parseInt(match[1], 10);
                        const charging = line.includes('charging') || line.includes('AC Power');
                        return { batteryLevel: level, isPluggedIn: charging };
                    }
                }
            }
        }
        catch {
            // Ignore battery check errors
        }
    }
    return {};
}
async function checkLocalRuntimeAvailability() {
    // Quick check if LM Studio or Ollama might be available
    // Actual probing happens in local-zero-tier stage
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 100);
        // Check LM Studio default port
        try {
            await fetch('http://localhost:1234/v1/models', { signal: controller.signal });
            return true;
        }
        catch {
            // LM Studio not available
        }
        // Check Ollama default port
        try {
            await fetch('http://localhost:11434/api/ps', { signal: controller.signal });
            return true;
        }
        catch {
            // Ollama not available
        }
        clearTimeout(timeout);
    }
    catch {
        // fetch not available or other error
    }
    return false;
}
//# sourceMappingURL=probe.js.map