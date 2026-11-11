// src/types/index.ts
// Core type definitions for dsh-smart-router

export type Tier = 'zero-tier' | 'economical-cloud' | 'frontier-cloud';
export type TurnType = 'tool_result' | 'planning' | 'subagent' | 'main_loop';
export type PipelineStage =
  | 'hardware-probe'
  | 'loop-escalation'
  | 'turn-envelope'
  | 'context-fit-gate'
  | 'low-intensity-gate'
  | 'session-pin'
  | 'llm-router'
  | 'deterministic-triage'
  | 'local-zero-tier'
  | 'triage-cloud-fallback'
  | 'embedding-matcher'
  | 'safe-cloud-default'
  | 'context-overflow-fallback';

export interface ModelCapabilities {
  reasoning: number;      // 0-1
  codeGen: number;        // 0-1
  toolUse: number;        // 0-1
  vision: boolean;
  functionCalling: boolean;
  jsonMode: boolean;
}

export interface ModelHealth {
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: number;
  errorCount: number;
}

export interface PricingInfo {
  registryKey: string;
  fallbackCostPer1M: number;
  userOverrideCost?: number;
}

export interface ModelProfile {
  id: string;
  tier: Tier;
  provider: string;
  endpoint?: string;
  capabilities: ModelCapabilities;
  pricing: PricingInfo;
  health: ModelHealth;
  contextWindow: number;
  maxOutputTokens: number;
  reasoningEfforts?: string[];
}

export interface HardwareInfo {
  platform: string;
  arch: string;
  totalMemoryGb: number;
  freeMemoryGb: number;
  batteryLevel?: number;
  isPluggedIn?: boolean;
  probe: 'full_local' | 'classification_only' | 'disabled';
  localRuntimeAvailable: boolean;
}

export interface RequiredCapabilities {
  reasoning: number;
  codeGen: number;
  toolUse: number;
  vision?: boolean;
  functionCalling?: boolean;
}

// Generic message and tool types (compatible with DSH)
export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | any[];
  tool_call_id?: string;
  name?: string;
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface RoutingRequest {
  messages: Message[];
  tools?: Tool[];
  turnType: TurnType;
  estimatedInputTokens: number;
  requiredCapabilities: RequiredCapabilities;
  sessionId: string;
  turnId?: string;
}

export interface RoutingDecision {
  provider: string;
  model: string;
  tier: Tier;
  reasoning: string;
  estimatedCost: number;
  estimatedLatencyMs: number;
  confidence: number;
  fallbackChain: ModelProfile[];
  sessionPinned: boolean;
  stage: PipelineStage;
  features?: {
    planning_delegate?: {
      primary_model_id: string;
      delegate_model_id: string;
      compressed_token_limit: number;
      timeout_ms: number;
    };
  };
}

export interface PipelineContext {
  request: RoutingRequest;
  hardware: HardwareInfo;
  turnType: TurnType;
  filteredModels: ModelProfile[];
  stageResults: StageResult[];
  currentStage: number;
  decisionSoFar: RoutingDecision | null;
}

export interface StageResult {
  name: string;
  passed: boolean;
  decision: RoutingDecision | null;
  details: Record<string, unknown>;
}

export interface PipelineStageHandler {
  name: PipelineStage;
  execute(context: PipelineContext): Promise<RoutingDecision | null>;
}

export interface SmartRouterConfig {
  enabled: boolean;
  defaultMode: 'scoped' | 'all';
  sessionPinning: boolean;
  hardwareProbe: boolean;
  localRuntime: boolean;
  telemetry: {
    enabled: boolean;
    retentionDays: number;
  };
  fallback: {
    enabled: boolean;
    maxRetries: number;
  };
  tiers: {
    [key in Tier]: {
      enabled: boolean;
      maxLatencyMs?: number;
      maxCostPer1M?: number;
    };
  };
}

export interface SmartRouterDeps {
  ctx: any; // Context
  llm: any; // LlmRuntime
  session: any; // Session
  systemInfo: any; // SystemInfoProvider
  config: SmartRouterConfig;
  telemetryStore: any; // TelemetryStore
}

export interface TelemetryEvent {
  id: string;
  timestamp: number;
  sessionId: string;
  turnId: string;
  provider: string;
  model: string;
  tier: Tier;
  stage: PipelineStage;
  reasonCode: string;
  reasoning: string;
  cost: number;
  latencyMs: number;
  sessionPinned: boolean;
  fallbackChain: string[];
  inputTokens: number;
  outputTokens: number;
  planningDelegatePrimaryModelId?: string;
  planningDelegateModelId?: string;
  turnType: TurnType;
}

export interface SessionStatsSnapshot {
  entry_count: number;
  total_cost_usd: number;
  mean_cost_usd: number | null;
  total_latency_ms: number;
  mean_latency_ms: number | null;
  planning_delegate_share: number | null;
  direct_share: number | null;
  local_share: number | null;
  cloud_share: number | null;
  role_cost: {
    primary: { count: number; total_cost_usd: number };
    planning_delegate: { count: number; total_cost_usd: number };
    other: { count: number; total_cost_usd: number };
  };
  cost_basis: 'actual' | 'mixed' | 'estimated';
  actual_usage_count: number;
  actual_total_tokens: number | null;
  frontier_savings_usd?: number;
}

// PriceCatalog for telemetry aggregation
export interface PriceCatalog extends Map<string, { provider: string; input: number; output: number; lastUpdated: number }> {}

export interface PlacementPlanReport {
  schemaVersion: number;
  generatedAt: string;
  recommendation: 'local-ready' | 'local-warmup-needed' | 'local-unavailable';
  bottleneck: {
    guess: string;
    rationale: string;
  };
  encoder: {
    resident: boolean;
    model: string;
    cachePath: string;
  };
  localModel: {
    warm: boolean;
    coldStartExpected: boolean;
    lmStudio: { available: boolean; hasLoadedModel: boolean };
    ollama: { available: boolean; hasLoadedModel: boolean };
  };
  hardware: {
    platform: string;
    arch: string;
    totalMemoryGb: number | null;
    freeMemoryGb: number | null;
    probe: string;
  };
  disk: {
    path: string;
    freeGb: number | null;
    constrained: boolean;
  };
  throughput: {
    classification: 'warm' | 'cold-only' | 'none';
    warmMedianTps: number | null;
    warmSamples: number;
    coldMedianTps: number | null;
    coldSamples: number;
    thresholdTps: number;
    viable: boolean;
  };
  policy: {
    onResourcePressure: string;
  };
}

export interface FleetMode {
  mode: 'scoped' | 'all';
  updatedAt: number;
}

export interface SessionPin {
  sessionId: string;
  pinnedModelId: string;
  pinnedProvider: string;
  pinReason: string;
  pinnedAt: number;
  hasEverSwitched: boolean;
  consecutiveUpstreamErrors: number;
}

export interface LocalModelInfo {
  id: string;
  provider: 'lmstudio' | 'ollama';
  endpoint: string;
  loaded: boolean;
  available: boolean;
}