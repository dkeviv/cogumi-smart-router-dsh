# Smart Router for DSH - Product Requirements Document (PRD)

## 1. Product Overview

### 1.1 Product Name
**smart-router-dsh** - A smart routing plugin for DeepSeek Harness (DSH) that intelligently routes user requests to the most appropriate LLM model based on hardware capabilities, session context, cost, latency, and request characteristics.

### 1.2 Problem Statement
DSH users currently need to manually select models for each request or rely on default settings. There's no intelligent routing that considers:
- Hardware capabilities (local inference vs cloud)
- Cost optimization
- Latency requirements
- Session context and model pinning
- Request complexity and type
- Fallback chains when primary models fail

### 1.3 Solution Summary
A DSH Cordis plugin that implements a 12-stage routing pipeline to automatically select the optimal model for each request, with fallback chains and session pinning for efficiency.

### 1.4 Target Audience
- DSH power users who want optimal model selection
- Development teams building DSH-based applications
- Users with mixed local/cloud infrastructure
- Cost-conscious users who want to balance performance vs cost

---

## 2. High-Level Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Route requests through a 12-stage pipeline with early exit | High |
| FR-002 | Session pinning - persist model per session for cache efficiency | High |
| FR-003 | Hardware probe - detect RAM/CPU/battery to gate local inference | High |
| FR-004 | Fleet management - model catalog with tiers (zero-tier, economical-cloud, frontier-cloud) | High |
| FR-005 | Fallback chains - automatic fallback on model failure | High |
| FR-006 | Turn classification - classify: tool_result, planning, subagent, main_loop | Medium |
| FR-007 | Context window guard - filter models fitting estimated input tokens | High |
| FR-008 | Deterministic triage - Aho-Corasick keyword scan + complexity analysis | Medium |
| FR-009 | Local zero-tier - probe LM Studio/Ollama for local models | High |
| FR-010 | Semantic matching - ONNX embeddings (HyDRA-style) for capability matching | Medium |
| FR-011 | Telemetry - record routing events, stages, costs, latency | Medium |
| FR-012 | Settings UI integration - enable/disable, configure tiers, fallbacks | High |

### 2.2 Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-001 | Plugin must load as a Cordis plugin without blocking DSH startup | High |
| NFR-002 | Pipeline must have sub-500ms decision time for first 6 stages | High |
| NFR-003 | Must support at least 3 tier categories: zero-tier, economical-cloud, frontier-cloud | High |
| NFR-004 | Telemetry storage must use SQLite with configurable retention | Medium |
| NFR-005 | Must be compatible with DSH's provider-neutral dsh-llm service | High |

### 2.3 Interface Requirements

| ID | Interface | Description |
|----|-----------|-------------|
| IR-001 | `SmartRouter.route(request)` | Main API - takes RoutingRequest, returns RoutingDecision |
| IR-002 | `FleetManager.loadFleet(config)` | Load model catalog from YAML + auto-discovery |
| IR-003 | `TelemetryStore.record(event)` | Record routing events to SQLite |
| IR-004 | Settings UI component | Configurable via DSH Settings → Models → Smart Router |

---

## 3. Feature Details - 12-Stage Pipeline

### Stage 1: Hardware Probe
- **Check**: systemInfoProvider for RAM/CPU/battery
- **Purpose**: Gate local inference eligibility
- **Output**: Hardware capabilities context

### Stage 2: Loop Escalation
- **Detect**: Repeated tool failures in session log
- **Escalate**: To frontier model on repeated failures
- **Output**: Escalation decision if threshold exceeded

### Stage 3: Turn Envelope
- **Classify**: turn type: tool_result, planning, subagent, main_loop
- **Purpose**: Structural routing based on request type
- **Output**: Turn type classification

### Stage 4: Context-Fit Gate
- **Filter**: Fleet to models fitting estimated input tokens
- **Purpose**: Context window guard - avoid overflow
- **Output**: Filtered model subset

### Stage 5: Low-Intensity Gate
- **Structural**: Tier hint + capability scoring
- **Purpose**: Quick structural routing
- **Output**: Tier recommendation + capability scores

### Stage 6: Session Pin
- **Check**: session.pinnedModel; break on compaction
- **Purpose**: Cache efficiency
- **Output**: Pinned model decision if valid

### Stage 7: Deterministic Triage
- **Aho-Corasick**: Keyword scan
- **Complexity**: Analysis of request complexity
- **Purpose**: Fast keyword routing
- **Output**: Initial model ranking

### Stage 8: Local Zero-Tier
- **Probe**: LM Studio/Ollama via localRuntime
- **Route**: To local if eligible (hardware fits, user prefers local)
- **Output**: Local model decision or pass-through

### Stage 9: Triage Cloud Fallback
- **Route**: Trivial prompts to first healthy economical model
- **Purpose**: Fast path for simple requests
- **Output**: Economical model for simple prompts

### Stage 10: Embedding Matcher
- **ONNX**: HyDRA-style embeddings for semantic matching
- **Purpose**: Semantic capability matching beyond keywords
- **Output**: Semantic similarity scores

### Stage 11: Safe Cloud Default
- **First**: Healthy economical-cloud model
- **Purpose**: Reliable fallback
- **Output**: Default economical model

### Stage 12: Context Overflow Fallback
- **Escalate**: To largest-fit model when tiers can't fit
- **Purpose**: Safety net for context window edge cases
- **Output**: Largest capable model

---

## 4. Data Models

### 4.1 RoutingRequest
```typescript
interface RoutingRequest {
  messages: Message[];           // Current conversation history
  tools?: Tool[];                // Available tools
  turnType: TurnType;            // tool_result, planning, subagent, main_loop
  estimatedInputTokens: number;  // Token count for context fitting
  requiredCapabilities: RequiredCapabilities;  // Required skills
  sessionId: string;             // For pinning and telemetry
}
```

### 4.2 RoutingDecision
```typescript
interface RoutingDecision {
  provider: string;              // e.g., "deepseek", "openai", "anthropic"
  model: string;                 // Specific model ID
  tier: Tier;                    // zero-tier | economical-cloud | frontier-cloud
  reasoning: string;            // Human-readable routing reason
  estimatedCost: number;         // Cost in USD for this request
  estimatedLatencyMs: number;    // Expected latency
  confidence: number;           // 0-1 confidence score
  fallbackChain: ModelProfile[]; // Fallback models if primary fails
  sessionPinned: boolean;       // Whether session pinning applied
  stage: PipelineStage;         // Stage at which decision was made
}
```

### 4.3 ModelProfile
```typescript
interface ModelProfile {
  id: string;
  tier: 'zero-tier' | 'economical-cloud' | 'frontier-cloud';
  provider: string;
  endpoint?: string;
  capabilities: ModelCapabilities;
  pricing: PricingInfo;
  health: ModelHealth;
  contextWindow: number;         // Input tokens
  maxOutputTokens: number;
  reasoningEfforts?: string[];   // Supported reasoning levels
}

interface ModelCapabilities {
  reasoning: number;     // 0-1
  codeGen: number;       // 0-1
  toolUse: number;       // 0-1
  vision: boolean;
  functionCalling: boolean;
  jsonMode: boolean;
}

interface ModelHealth {
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: number;     // Timestamp
  errorCount: number;
}
```

### 4.4 PipelineStage
```typescript
interface PipelineStage {
  name: string;
  execute(context: PipelineContext): Promise<RoutingDecision | null>;
}
```

### 4.5 PipelineContext
```typescript
interface PipelineContext {
  request: RoutingRequest;
  hardware: HardwareInfo;        // From Stage 1
  turnType: TurnType;           // From Stage 3
  filteredModels: ModelProfile[]; // Progressive filtering
  stageResults: StageResult[];    // Each stage's output
  currentStage: number;         // Current stage index
  decisionSoFar: RoutingDecision | null; // Accumulated decision
}
```

### 4.6 StageResult
```typescript
interface StageResult {
  name: string;           // Stage name
  passed: boolean;        // Whether criteria met
  decision: RoutingDecision | null; // Decision if conclusive
  details: Record<string, any>; // Stage-specific details
}
```

---

## 5. Fleet Management (Model Catalog)

### 5.1 Fleet Sources
- **Static YAML config**: User-defined model list
- **Local discovery**: LM Studio, Ollama via dsh-home-paths
- **API models**: Auto-discovered from configured providers

### 5.2 Health Checking
- Periodic health checks for all fleet models
- Cache healthy status with TTL
- Mark unhealthy on failed requests

### 5.3 Tier Configuration
```yaml
tiers:
  zero-tier:
    enabled: true
    maxLatencyMs: 5000
    maxCostPer1M: 0  # Local/free
  economical-cloud:
    enabled: true
    maxCostPer1M: 0.50
    providers: ["deepseek", "openai", "anthropic"]
  frontier-cloud:
    enabled: true
    maxCostPer1M: 5.00
    providers: ["gpt-4o", "claude-3-5-sonnet"]
```

---

## 6. Settings UI

### 6.1 Configuration Options
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| enabled | toggle | true | Enable/Disable smart router |
| defaultMode | select | "scoped" | scoped: only enabled models, all: all authenticated models |
| sessionPinning | toggle | true | Pin model per session |
| hardwareProbe | toggle | true | Enable hardware capability detection |
| localRuntime | toggle | true | Enable LM Studio/Ollama detection |
| telemetry.enabled | toggle | true | Record routing telemetry |
| telemetry.retentionDays | number | 30 | Telemetry data retention |
| fallback.enabled | toggle | true | Enable fallback chain |
| fallback.maxRetries | number | 3 | Max fallback attempts |
| tier configurations | object | see defaults | Per-tier settings |

### 6.2 UI Components
- **SmartRouterSettings**: Main settings page
- **TierConfig**: Per-tier configuration (latency, cost limits)
- **FallbackConfig**: Fallback chain settings
- **TelemetryConfig**: Telemetry retention and viewing

---

## 7. Telemetry & Observability

### 7.1 Events Recorded
- `routing_decision`: Full routing decision with all stage results
- `stage_completion`: Each pipeline stage result
- `fallback_trigger`: When fallback chain activated
- `session_pin`: Session pinning events
- `model_health`: Model health status changes

### 7.2 SQLite Schema
```sql
CREATE TABLE routing_events (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tier TEXT NOT NULL,
  stage TEXT NOT NULL,
  reasoning TEXT,
  cost REAL,
  latency_ms INTEGER,
  session_pinned BOOLEAN,
  fallback_chain TEXT,      -- JSON array
  input_tokens INTEGER,
  output_tokens INTEGER
);

CREATE INDEX idx_routing_session ON routing_events(session_id);
CREATE INDEX idx_routing_timestamp ON routing_events(timestamp);
```

### 7.3 Statistics Generated
- Routing count by tier
- Average cost per routing
- Average latency by stage
- Local vs cloud usage share
- Model popularity/distribution
- Fallback activation rate

---

## 8. Integration with DSH Agent Loop

### 8.1 Request-Error Waterfall Hook
```typescript
ctx.waterfall('agent/request-error', async (ctx, next, error) => {
  if (error instanceof LlmError && error.code === 'CONTEXT_WINDOW_EXCEEDED') {
    const fallback = await router.getContextOverflowFallback(ctx.sessionId);
    if (fallback) {
      return { kind: 'retry', model: fallback };
    }
  }
  return next();
});
```

### 8.2 Model Selection Hook
```typescript
ctx.llm.on('before-stream', async (options) => {
  if (!options.provider || !options.model) {
    const request = buildRoutingRequest(ctx, options);
    const decision = await smartRouter.route(request);
    return { ...options, provider: decision.provider, model: decision.model };
  }
  return options;
});
```

---

## 9. Installation & Usage

### 9.1 Plugin Installation
```bash
# 1. Install as DSH plugin (recommended)
dsh plugin --profile desktop add github:dkeviv/dsh-smart-router

# 2. Enable in Settings → Models → Smart Router
# 3. Select model: smart-router/auto

# Or use CLI
dsh plugin --profile desktop add github:dkeviv/dsh-smart-router
dsh web --model smart-router/auto
```

### 9.2 Initial Setup
1. Install plugin via DSH CLI
2. Configure model tiers in Settings → Models → Smart Router
3. Optionally configure local LM Studio/Ollama connections
4. Enable/disable features via the settings UI
5. View routing history and telemetry in the status panel

### 9.3 Default Model Selection
- Users can select `smart-router/auto` as their model
- The router will automatically select based on current context
- Can override with specific model selection when needed

---

## 10. Roadmap

### Phase 1: Core Router + Fleet Management (2-3 weeks)
- ✅ Core router class with pipeline orchestration
- ✅ Fleet management (YAML loading + auto-discovery)
- ✅ Basic pipeline stages 1-6 (hardware probe through session pinning)
- ✅ Model profile data structures
- ✅ Basic telemetry recording

### Phase 2: Advanced Pipeline + Local Zero-Tier (2-3 weeks)
- ✅ Stages 7-9 (deterministic triage through cloud fallback)
- ✅ Local zero-tier: LM Studio/Ollama probing and routing
- ✅ Embedding matcher (HyDRA-style ONNX embeddings)
- ✅ Enhanced telemetry with stage tracking

### Phase 3: Settings UI + Polish (1-2 weeks)
- ✅ Full Settings UI integration
- ✅ Telemetry dashboard/ history view
- ✅ Session pinning visualization
- ✅ Configuration validation

### Phase 4: Integration Tests + Documentation (1 week)
- ✅ End-to-end integration tests with real DSH sessions
- ✅ CI/CD pipeline
- ✅ Comprehensive README and documentation
- ✅ Installation script and setup wizards

---

## 11. Success Metrics

### 11.1 Technical Goals
- Pipeline decision time: < 500ms for first 6 stages
- Model selection accuracy: > 80% match to user intent
- Fallback chain success rate: > 95% (at least one model in chain succeeds)
- Session pinning effectiveness: > 70% cache hit rate on repeated sessions

### 11.2 User Goals
- Users report easier model selection (< 30 seconds to effective model choice)
- Cost savings: Average 20% reduction in API costs through optimal routing
- Latency improvement: 15% reduction through local zero-tier when eligible
- User satisfaction: > 4/5 rating on routing usefulness

### 11.3 Adoption Goals
- 50+ plugin installations in first month
- 80% of power users enable smart router within first week
- Telemetry data from 100+ unique sessions within first month

---

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| R-001: Hardware probe fails on some systems | Medium | Low | Graceful degradation - skip local routing if probe unavailable |
| R-002: Embedding matcher model download fails | Medium | Medium | Provide fallback to keyword-only triage, optional feature flag |
| R-003: Fleet model discovery overwhelms on large installs | Low | Medium | Configurable discovery limits, batch health checks |
| R-004: Telemetry DB corruption | Low | High | WAL mode, regular backup, graceful degradation without telemetry |
| R-005: Fallback chain loops infinitely | Medium | High | Max retry limits, exponential backoff, distinct model selection |
| R-006: Session pinning causes stale model selection | Medium | Medium | Configurable pin TTL, automatic unpin on compaction |
| R-007: Context window guard miscalculates tokens | Medium | High | Use tiktoken or equivalent, configurable token estimator |
| R-008: Compatibility with DSH core updates | Medium | Medium | Semantic versioning, integration tests with each DSH release |

---

## 13. Future Considerations (Post-MVP)

- **Multi-modal routing**: Vision-capable model selection based on image content
- **Budget-aware routing**: User-set budget limits, automatic tier downgrade
- **Time-aware routing**: Preferred models based on time of day / latency patterns
- **A/B testing**: Route percentage of users to different routing strategies
- **Predictive pre-warming**: Pre-load selected models before they're needed
- **Custom routing rules**: User-defined priority rules for specific patterns