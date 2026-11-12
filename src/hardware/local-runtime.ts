// src/hardware/local-runtime.ts
// LM Studio / Ollama local runtime probing

import { ModelProfile, Tier, LocalModelInfo } from '../types/index.js';

export async function probeLocalRuntimes(): Promise<LocalModelInfo[]> {
  const results: LocalModelInfo[] = [];

  // Probe LM Studio
  const lmStudioModels = await probeLMStudio();
  results.push(...lmStudioModels);

  // Probe Ollama
  const ollamaModels = await probeOllama();
  results.push(...ollamaModels);

  return results;
}

async function probeLMStudio(): Promise<LocalModelInfo[]> {
  const results: LocalModelInfo[] = [];
  const baseUrl = 'http://localhost:1234';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json() as { data?: Array<{ id: string }> };
      for (const model of data.data || []) {
        results.push({
          id: model.id,
          provider: 'lmstudio',
          endpoint: baseUrl,
          loaded: true, // If it's in /v1/models, it's loaded
          available: true,
        });
      }
    }
  } catch {
    // LM Studio not available or error
  }

  return results;
}

async function probeOllama(): Promise<LocalModelInfo[]> {
  const results: LocalModelInfo[] = [];
  const baseUrl = 'http://localhost:11434';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseUrl}/api/ps`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json() as { models?: Array<{ name: string }> };
      for (const model of data.models || []) {
        results.push({
          id: model.name,
          provider: 'ollama',
          endpoint: baseUrl,
          loaded: true, // If it's in /api/ps, it's loaded
          available: true,
        });
      }
    }
  } catch {
    // Ollama not available or error
  }

  return results;
}

export function createLocalModelProfiles(localModels: LocalModelInfo[]): ModelProfile[] {
  return localModels.map((localModel) => ({
    id: localModel.id,
    tier: 'zero-tier' as Tier,
    provider: localModel.provider,
    endpoint: localModel.endpoint,
    capabilities: inferCapabilities(localModel.id),
    pricing: {
      registryKey: `local/${localModel.provider}`,
      fallbackCostPer1M: 0,
    },
    health: {
      status: localModel.loaded ? 'healthy' : 'unknown',
      lastCheck: Date.now(),
      errorCount: 0,
    },
    contextWindow: inferContextWindow(localModel.id),
    maxOutputTokens: inferMaxOutputTokens(localModel.id),
  }));
}

function inferCapabilities(modelId: string): ModelProfile['capabilities'] {
  const id = modelId.toLowerCase();

  // Default capabilities for local models
  let reasoning = 0.3;
  let codeGen = 0.5;
  let toolUse = 0.2;

  // Adjust based on model name patterns
  if (id.includes('gemma') || id.includes('qwen')) {
    reasoning = 0.4;
    codeGen = 0.6;
    toolUse = 0.3;
  } else if (id.includes('llama') || id.includes('mistral')) {
    reasoning = 0.35;
    codeGen = 0.55;
    toolUse = 0.25;
  } else if (id.includes('phi') || id.includes('small')) {
    reasoning = 0.25;
    codeGen = 0.4;
    toolUse = 0.15;
  }

  return {
    reasoning,
    codeGen,
    toolUse,
    vision: false,
    functionCalling: false,
    jsonMode: true,
  };
}

function inferContextWindow(modelId: string): number {
  const id = modelId.toLowerCase();

  if (id.includes('32k') || id.includes('128k')) return 128000;
  if (id.includes('16k')) return 16384;
  if (id.includes('8k')) return 8192;
  if (id.includes('4k')) return 4096;

  // Default for most local models
  return 8192;
}

function inferMaxOutputTokens(modelId: string): number {
  const id = modelId.toLowerCase();

  if (id.includes('32k') || id.includes('128k')) return 8192;
  return 4096;
}