// src/fleet/index.ts
// Fleet management - model catalog with tiers

import {
  ModelProfile,
  Tier,
  HardwareInfo,
  SmartRouterConfig,
} from '../types';
import { probeLocalRuntimes, createLocalModelProfiles } from '../hardware/local-runtime';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface FleetConfig {
  modelsPath?: string;
  hardwareInfo: HardwareInfo;
  config: SmartRouterConfig;
  enabledModels?: string[]; // From DSH scoped models
  allModels?: ModelProfile[]; // From DSH model registry
}

export interface FleetManager {
  fleet: ModelProfile[];
  loadFleet(config: FleetConfig): Promise<void>;
  getAvailableModels(tier?: Tier): ModelProfile[];
  getModelById(id: string): ModelProfile | undefined;
  startHealthChecks(): void;
  stopHealthChecks(): void;
}

function createFleetManager(): FleetManager {
  let fleet: ModelProfile[] = [];
  let healthCheckInterval: NodeJS.Timeout | null = null;

  return {
    get fleet() {
      return fleet;
    },

    async loadFleet(config: FleetConfig) {
      const { hardwareInfo, config: routerConfig, enabledModels, allModels } = config;

      const models: ModelProfile[] = [];

      // 1. Load from static YAML if provided
      if (config.modelsPath) {
        const staticModels = loadStaticModels(config.modelsPath);
        models.push(...staticModels);
      }

      // 2. Auto-discover local models (zero-tier)
      if (routerConfig.localRuntime && hardwareInfo.localRuntimeAvailable) {
        const localModels = await probeLocalRuntimes();
        const localProfiles = createLocalModelProfiles(localModels);
        models.push(...localProfiles);
      }

      // 3. Add API models from DSH registry
      if (allModels && allModels.length > 0) {
        const apiModels = mapRegistryModels(allModels, enabledModels, routerConfig);
        models.push(...apiModels);
      }

      // Deduplicate by ID (prefer local over cloud for same ID)
      fleet = deduplicateModels(models);

      // Start health checks
      this.startHealthChecks();
    },

    getAvailableModels(tier?: Tier): ModelProfile[] {
      return fleet
        .filter((m) => !tier || m.tier === tier)
        .filter((m) => m.health.status === 'healthy');
    },

    getModelById(id: string): ModelProfile | undefined {
      return fleet.find((m) => m.id === id);
    },

    startHealthChecks(): void {
      if (healthCheckInterval) return;

      healthCheckInterval = setInterval(async () => {
        for (const model of fleet) {
          await checkModelHealth(model);
        }
      }, 60000); // Check every minute
    },

    stopHealthChecks(): void {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
      }
    },
  };
}

function loadStaticModels(modelsPath: string): ModelProfile[] {
  try {
    const content = readFileSync(modelsPath, 'utf8');
    const data = yaml.parse(content);

    if (!data.models || !Array.isArray(data.models)) {
      return [];
    }

    return data.models.map((m: any) => ({
      id: m.id,
      tier: m.tier,
      provider: m.provider,
      endpoint: m.endpoint,
      capabilities: m.capabilities || defaultCapabilities(),
      pricing: m.pricing || { registryKey: `${m.provider}/${m.id}`, fallbackCostPer1M: 0 },
      health: { status: 'unknown' as const, lastCheck: Date.now(), errorCount: 0 },
      contextWindow: m.contextWindow || 8192,
      maxOutputTokens: m.maxOutputTokens || 4096,
      reasoningEfforts: m.reasoningEfforts,
    }));
  } catch {
    return [];
  }
}

function defaultCapabilities(): ModelProfile['capabilities'] {
  return {
    reasoning: 0.5,
    codeGen: 0.5,
    toolUse: 0.5,
    vision: false,
    functionCalling: true,
    jsonMode: true,
  };
}

function mapRegistryModels(
  registryModels: ModelProfile[],
  enabledModels?: string[],
  routerConfig?: SmartRouterConfig
): ModelProfile[] {
  let models = [...registryModels];

  // Filter by enabled tiers
  if (routerConfig?.tiers) {
    models = models.filter((m) => routerConfig.tiers[m.tier]?.enabled !== false);
  }

  return models;
}

function matchModelPattern(modelId: string, pattern: string): boolean {
  // Simple glob-like matching
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) {
    return modelId.startsWith(pattern.slice(0, -1));
  }
  return modelId === pattern;
}

function deduplicateModels(models: ModelProfile[]): ModelProfile[] {
  const seen = new Map<string, ModelProfile>();

  for (const model of models) {
    const existing = seen.get(model.id);
    if (!existing) {
      seen.set(model.id, model);
    } else {
      // Prefer local models (zero-tier) over cloud for same ID
      if (model.tier === 'zero-tier' && existing.tier !== 'zero-tier') {
        seen.set(model.id, model);
      }
    }
  }

  return Array.from(seen.values());
}

async function checkModelHealth(model: ModelProfile): Promise<void> {
  // For local models, check if runtime is still available
  if (model.tier === 'zero-tier' && model.endpoint) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      if (model.provider === 'lmstudio') {
        await fetch(`${model.endpoint}/v1/models`, { signal: controller.signal });
      } else if (model.provider === 'ollama') {
        await fetch(`${model.endpoint}/api/ps`, { signal: controller.signal });
      }

      clearTimeout(timeout);
      model.health.status = 'healthy';
      model.health.lastCheck = Date.now();
      model.health.errorCount = 0;
    } catch {
      model.health.status = 'unhealthy';
      model.health.errorCount += 1;
    }
  }
  // For cloud models, health is checked during actual requests
}

export const fleetManager = createFleetManager();
export default fleetManager;