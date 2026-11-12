// src/router/standalone-router-client.ts
// Standalone LLM Router using @huggingface/transformers in Node.js
// Runs configured Qwen3 model locally via WASM (no Chrome extension needed)

import { AutoTokenizer, env, Qwen2ForCausalLM, TextStreamer } from '@huggingface/transformers';
import { SmartRouterConfig, RoutingRequest, RoutingDecision, ModelProfile, Tier, PipelineContext } from '../types/index.js';

// Configure transformers.js for Node.js (WASM backend)
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = false;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
  env.backends.onnx.wasm.numThreads = 4;
}

// Simple model name mapping
const ROUTER_MODEL_MAP: Record<string, string> = {
  'dkeviv/Qwen3-0.6B-DQ-ONNX-bucket': 'qwen3-0.6b',
  'dkeviv/Qwen3.5-0.8B-Text-ONNX-WebGPU-QDQ-bucket': 'qwen3.5-0.8b',
};

/** Convert full HuggingFace model ID to simple name */
function toSimpleModelName(fullId: string): string {
  return ROUTER_MODEL_MAP[fullId] || fullId;
}

export class RouterError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'RouterError';
  }
}

export class StandaloneRouterClient {
  private model: any = null;
  private tokenizer: any = null;
  private currentModelId: string = '';
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(
    private config: SmartRouterConfig,
    private telemetryStore: any
  ) {}

  async initialize(modelId?: string): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._initialize(modelId);
    return this.initPromise;
  }

  private async _initialize(modelId?: string): Promise<void> {
    const targetModelId = modelId || this.config.routerModel;
    
    if (this.isInitialized && this.currentModelId === targetModelId) {
      return;
    }

    // Dispose previous model if switching
    if (this.model) {
      try { await this.model.dispose?.(); } catch {}
      this.model = null;
      this.tokenizer = null;
    }

    console.log(`[cogumi-smart-router] Loading router model: ${targetModelId}`);
    
    this.tokenizer = await AutoTokenizer.from_pretrained(targetModelId);
    
    // Use Qwen2ForCausalLM for Qwen3 models (compatible architecture)
    this.model = await Qwen2ForCausalLM.from_pretrained(targetModelId, {
      dtype: 'q4f16',
      device: 'wasm',
      use_external_data_format: true,
    } as any);

    // Warmup
    try {
      const warmupInputs = await this.tokenizer('Route this request.');
      await this.model.generate({ ...warmupInputs, max_new_tokens: 1, do_sample: false });
    } catch (e) {
      console.warn('[cogumi-smart-router] Router model warmup failed:', e);
    }

    this.currentModelId = targetModelId;
    this.isInitialized = true;
    console.log(`[cogumi-smart-router] Router model ready: ${targetModelId}`);
  }

  async route(request: RoutingRequest, context: PipelineContext): Promise<RoutingDecision> {
    await this.initialize();

    // Get filtered fleet models for the prompt
    const fleetModels = context.filteredModels;
    if (fleetModels.length === 0) {
      throw new RouterError('No models available in fleet after filtering');
    }

    // Build prompt with available models
    const modelsJson = JSON.stringify(fleetModels.map(m => ({
      id: m.id,
      provider: m.provider,
      tier: m.tier,
      contextWindow: m.contextWindow,
      costPer1M: m.pricing.fallbackCostPer1M,
      capabilities: m.capabilities,
    })), null, 2);

    const prompt = ROUTER_SYSTEM_PROMPT
      .replace('{{MODELS_JSON}}', modelsJson)
      .replace('{{TURN_TYPE}}', request.turnType)
      .replace('{{ESTIMATED_TOKENS}}', request.estimatedInputTokens.toString())
      .replace('{{REQ_REASONING}}', request.requiredCapabilities.reasoning.toFixed(2))
      .replace('{{REQ_CODEGEN}}', request.requiredCapabilities.codeGen.toFixed(2))
      .replace('{{REQ_TOOLUSE}}', request.requiredCapabilities.toolUse.toFixed(2))
      .replace('{{HARDWARE_PROBE}}', context.hardware.probe)
      .replace('{{TOTAL_RAM}}', context.hardware.totalMemoryGb.toFixed(1))
      .replace('{{SESSION_PINNED}}', context.decisionSoFar?.sessionPinned ? 'yes' : 'no');

    try {
      const inputs = await this.tokenizer(prompt);
      const output = await this.model.generate({
        ...inputs,
        max_new_tokens: 256,
        do_sample: true,
        temperature: 0.1,
        top_p: 0.9,
        repetition_penalty: 1.05,
      });

      const promptLength = inputs.input_ids.dims[1];
      const generated = output.slice(null, [0, [promptLength, output.dims[1] - promptLength]]);
      const decoded = this.tokenizer.batch_decode(generated, { skip_special_tokens: true })[0] || '';

      return this.parseDecision(decoded, fleetModels, request, context);
    } catch (error) {
      console.error('[cogumi-smart-router] LLM routing failed:', error);
      throw new RouterError(
        'LLM router failed to generate a routing decision. ' +
        'The router model may be unavailable or the request too complex. ' +
        'Use `/model <provider/model>` to manually select a model.',
        error instanceof Error ? error : undefined
      );
    }
  }

  private parseDecision(
    response: string,
    fleetModels: ModelProfile[],
    request: RoutingRequest,
    context: PipelineContext
  ): RoutingDecision {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in router response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const selectedModelId = parsed.model_id;
      const reason = parsed.reason || 'LLM router selection';
      const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.7));
      const estimatedCost = parsed.estimated_cost_usd || 0;

      // Find matching model in fleet
      const [provider, ...modelParts] = selectedModelId.split('/');
      const modelName = modelParts.join('/');
      const matchedModel = fleetModels.find(m => 
        m.provider === provider && m.id === modelName
      );

      if (!matchedModel) {
        throw new Error(`Router selected unknown model: ${selectedModelId}`);
      }

      return {
        provider: matchedModel.provider,
        model: matchedModel.id,
        tier: matchedModel.tier,
        reasoning: `[LLM Router] ${reason}`,
        estimatedCost: estimatedCost || matchedModel.pricing.fallbackCostPer1M * (request.estimatedInputTokens / 1_000_000),
        estimatedLatencyMs: this.estimateLatency(matchedModel),
        confidence,
        fallbackChain: this.buildFallbackChain(matchedModel, fleetModels),
        sessionPinned: false,
        stage: 'llm-router',
      };
    } catch (error) {
      console.error('[cogumi-smart-router] Failed to parse router decision:', error);
      throw new RouterError(
        'LLM router returned an invalid response. ' +
        'Use `/model <provider/model>` to manually select a model.',
        error instanceof Error ? error : undefined
      );
    }
  }

  private estimateLatency(model: ModelProfile): number {
    const baseLatency: Record<Tier, number> = {
      'zero-tier': 2000,
      'economical-cloud': 300,
      'frontier-cloud': 600,
    };
    return baseLatency[model.tier] || 500;
  }

  private buildFallbackChain(selected: ModelProfile, fleet: ModelProfile[]): ModelProfile[] {
    const sameTier = fleet.filter(m => m.tier === selected.tier && m.id !== selected.id);
    const lowerTier: Record<Tier, Tier[]> = {
      'frontier-cloud': ['economical-cloud', 'zero-tier'],
      'economical-cloud': ['zero-tier'],
      'zero-tier': [],
    };
    const chain = [...sameTier.slice(0, 2)];
    for (const tier of lowerTier[selected.tier]) {
      const models = fleet.filter(m => m.tier === tier);
      chain.push(...models.slice(0, 1));
    }
    return chain.slice(0, 3);
  }

  async switchModel(modelId: string): Promise<void> {
    await this.initialize(modelId);
  }

  getCurrentModel(): string {
    return this.currentModelId;
  }

  /** Get simple model name (e.g., "qwen3-0.6b" instead of full HuggingFace ID) */
  getCurrentSimpleModelName(): string {
    return toSimpleModelName(this.currentModelId);
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async dispose(): Promise<void> {
    if (this.model) {
      try { await this.model.dispose?.(); } catch {}
      this.model = null;
      this.tokenizer = null;
      this.isInitialized = false;
      this.initPromise = null;
      console.log('[cogumi-smart-router] Router model disposed');
    }
  }
}

const ROUTER_SYSTEM_PROMPT = `You are a model router. Select the BEST model for the request.

Available models (JSON):
{{MODELS_JSON}}

Request:
- Turn type: {{TURN_TYPE}}
- Estimated input tokens: {{ESTIMATED_TOKENS}}
- Required capabilities: reasoning={{REQ_REASONING}}, codeGen={{REQ_CODEGEN}}, toolUse={{REQ_TOOLUSE}}
- Hardware: {{HARDWARE_PROBE}} ({{TOTAL_RAM}}GB RAM)
- Session pinned: {{SESSION_PINNED}}

Output ONLY valid JSON:
{
  "model_id": "provider/model-id",
  "reason": "1-2 sentence explanation",
  "confidence": 0.0-1.0,
  "estimated_cost_usd": 0.0001
}`;