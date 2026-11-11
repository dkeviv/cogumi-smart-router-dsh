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
A DSH Cordis plugin that implements a 12-stage routing pipeline to automatically select the optimal model for each request, with fallback chains and session pinning for efficiency. All interaction is through conversational slash commands in any DSH chat session — no separate web UI.

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
| FR-012 | Conversational slash commands - all configuration and inspection via chat | High |

### 2.2 Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-001 | Plugin must load as a Cordis plugin without blocking DSH startup | High |
| NFR-002 | Pipeline must have sub-500ms decision time for first 6 stages | High |
| NFR-003 | Must support at least 3 tier categories: zero-tier, economical-cloud, frontier-cloud | High |
| NFR-004 | Telemetry storage must use SQLite with configurable retention | Medium |
| NFR-005 | Must be compatible with DSH's provider-neutral dsh-llm service | High |
| NFR-006 | Slash commands must follow DSH's existing command patterns (tab completion, signal handling) | High |

### 2.3 Interface Requirements

| ID | Interface | Description |
|----|-----------|-------------|
| IR-001 | `SmartRouter.route(request)` | Main API - takes RoutingRequest, returns RoutingDecision |
| IR-002 | `FleetManager.loadFleet(config)` | Load model catalog from YAML + auto-discovery |
| IR-003 | `TelemetryStore.record(event)` | Record routing events to SQLite |
| IR-004 | `/smart-router` command family | Conversational interface for status, history, stats, config, pinning |

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

## 6. Conversational Slash Command Interface

All configuration, inspection, and control is done through slash commands in any DSH chat session. No separate web UI. Commands follow DSH's existing patterns (tab completion, AbortSignal handling, `ctx.ui.notify` for embedded widget snapshots).

### 6.1 Command Structure

```
/smart-router [status] | history [limit] | stats [limit] | mode scoped|all | pricing refresh | export dataset [--limit N] | export telemetry-contrib [--limit N] [--embeddings] | feedback good|bad | unpin | plan [--json] | doctor
```

### 6.2 Command Reference

| Command | Purpose | Output Format |
|---------|---------|---------------|
| `/smart-router` or `/smart-router status` | Show fleet mode, fleet size, pricing freshness, last routing decision | Embedded widget snapshot (multi-line text) |
| `/smart-router history [N]` | Show recent routing telemetry from SQLite (default limit, optional N) | Table: timestamp \| model \| stage \| turn_type \| latency_ms |
| `/smart-router stats [N]` | Privacy-safe session/window aggregates: count, mean cost/latency (with cost_basis labeling), planning_delegate vs direct share, local vs cloud share, role cost breakdown, vs-frontier savings | Embedded widget snapshot with labeled sections |
| `/smart-router mode scoped` | Route only among DSH's enabled model patterns (default) | Confirmation message |
| `/smart-router mode all` | Route among all authenticated models in the registry | Confirmation message |
| `/smart-router pricing refresh` | Manually fetch LiteLLM pricing, persist to SQLite, rebuild fleet | Confirmation with model count |
| `/smart-router export dataset [--limit N]` | Export opt-in routing dataset as JSONL (requires `SMART_ROUTER_DATASET=1`) | File path confirmation |
| `/smart-router export telemetry-contrib [--limit N] [--embeddings]` | Export privacy-safe community telemetry JSON for calibration contributions | File path confirmation |
| `/smart-router feedback good\|bad` | Label the last auto-routed request outcome (requires `SMART_ROUTER_DATASET=1`) | Confirmation with request ID |
| `/smart-router unpin` | Clear the current session pin (in-memory and SQLite) so next request runs full routing | Confirmation with cleared model ID |
| `/smart-router plan [--json]` | **Read-only** local placement report: encoder resident status, local model warm/cold, RAM/disk constraints, cold vs warm TPS, bottleneck guess | Human-readable report or JSON (`--json`) |
| `/smart-router doctor` | **Read-only** local readiness checklist (✓/✗) with bottleneck guess and recommendation | Checklist-style verdict |

### 6.3 Embedded Widget Snapshot Examples

**Status (`/smart-router status`):**
```
Fleet mode: scoped
Fleet size: 12
Fleet members:
  - anthropic/claude-3.5-sonnet
  - anthropic/claude-3.5-haiku
  - openai/gpt-4o
  - deepseek/deepseek-chat
  - lmstudio/local-gemma-4-7b
Pricing: fresh (last_updated 2026-11-10)
Model: anthropic/claude-3.5-sonnet
Stage: session-pin
Reason: pinned
Latency: 0ms
```

**History (`/smart-router history 5`):**
```
2026-11-10T19:45:12Z | anthropic/claude-3.5-sonnet | session-pin | main_loop | 0ms
2026-11-10T19:44:38Z | openai/gpt-4o | embedding-matcher | planning | 87ms
2026-11-10T19:43:55Z | deepseek/deepseek-chat | low-intensity-gate | tool_result | 2ms
2026-11-10T19:43:12Z | lmstudio/local-gemma-4-7b | local-zero-tier | main_loop | 12ms
2026-11-10T19:42:30Z | anthropic/claude-3.5-haiku | triage-cloud-fallback | main_loop | 1ms
```

**Stats (`/smart-router stats 50`):**
```
Entries: 47
Cost (mixed (12/47 actual)): total $0.0234 | mean $0.0005
Latency: total 1847ms | mean 39.3ms
Planning delegate share: 12.8% (direct 87.2%)
Local vs cloud (when known): local 21.3% | cloud 78.7%
Role cost breakdown:
  primary (pin path): 32 | $0.0089
  planning_delegate: 6 | $0.0112
  other: 9 | $0.0033
Actual usage: 12/47 entries with host-reported tokens | 45820 actual tokens
Vs always-frontier savings: $0.0412 (actuals preferred, est. when missing)
```

**Doctor (`/smart-router doctor`):**
```
smart-router doctor (read-only)
✓ encoder resident (Xenova/all-MiniLM-L6-v2)
✓ hardware probe: full_local
✓ disk: 45.2 GiB free
✓ local runtime reachable (LM Studio / Ollama)
✓ local model warm
✓ throughput: warm, viable=true
Bottleneck guess: none — all checks pass
Recommendation: local-ready
Policy: quality-preserving — under resource pressure local is reported unavailable and routing escalates safely; encoder fidelity is never weakened.
```

### 6.4 Tab Completion
All commands support tab completion following DSH patterns:
- `/smart-router <TAB>` → shows all subcommands
- `/smart-router mode <TAB>` → `scoped`, `all`
- `/smart-router pricing <TAB>` → `refresh`
- `/smart-router export <TAB>` → `dataset`, `telemetry-contrib`
- `/smart-router feedback <TAB>` → `good`, `bad`

---

## 7. Configuration via Slash Commands (No Settings UI)

Configuration is managed conversationally. No separate Settings page.

### 7.1 Configurable Settings (persisted to plugin config / SQLite)

| Setting | Command | Persistence |
|---------|---------|-------------|
| Fleet mode | `/smart-router mode scoped\|all` | Session + SQLite |
| Pricing refresh | `/smart-router pricing refresh` | SQLite price catalog |
| Session pin | `/smart-router unpin` (clears) | SQLite session pin table |
| Telemetry retention | Config via `ROUTER_STATE_DB_PATH` env + SQLite PRAGMA | SQLite |
| Dataset export opt-in | `SMART_ROUTER_DATASET=1` env var | Process env |

### 7.2 Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ROUTER_STATE_DB_PATH` | `./.dsh-smart-router/state.db` | Override SQLite state store location |
| `SMART_ROUTER_LOG_ROUTING` | (unset) | Set to `1` to print each routing decision to stderr |
| `SMART_ROUTER_DATASET` | (unset) | Set to `1` to enable opt-in dataset/feedback collection |

---

## 8. Telemetry & Observability

### 8.1 Events Recorded (to SQLite)
- `routing_decision`: Full routing decision with all stage results
- `stage_completion`: Each pipeline stage result
- `fallback_trigger`: When fallback chain activated
- `session_pin`: Session pinning events
- `model_health`: Model health status changes
- `planning_delegate`: Planning delegate spawn/failover events

### 8.2 SQLite Schema
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
  reason_code TEXT,
  reasoning TEXT,
  cost REAL,
  latency_ms INTEGER,
  session_pinned BOOLEAN,
  fallback_chain TEXT,      -- JSON array
  input_tokens INTEGER,
  output_tokens INTEGER,
  planning_delegate_primary_model_id TEXT,
  planning_delegate_model_id TEXT,
  turn_type TEXT
);

CREATE INDEX idx_routing_session ON routing_events(session_id);
CREATE INDEX idx_routing_timestamp ON routing_events(timestamp);
```

### 8.3 Statistics Generated (via `/smart-router stats`)
- Routing count by tier
- Average cost per routing (with cost_basis: actual | mixed | estimated)
- Average latency by stage
- Local vs cloud usage share
- Model popularity/distribution
- Fallback activation rate
- Planning delegate share
- Role cost breakdown (primary, planning_delegate, other)
- Vs-frontier savings (when frontier prices available)

---

## 9. Integration with DSH Agent Loop

### 9.1 Request-Error Waterfall Hook
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

### 9.2 Model Selection Hook
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

### 9.3 Planning Delegate (Cache-Preserving)
On planning turns, spawn ephemeral frontier sub-call with compressed context, inject observation, bounded timeouts. Falls back to direct frontier with documented `fallback_reason`.

### 9.4 Stream Failover Loop
Live provider-error failover across candidate models with user-facing notices. Atomic state machine retries stream delegation across alternates, emits failover notices, ends in safe default.

### 9.5 Output Headroom Escalation
Exclude failover candidates whose context window cannot fit input plus required output floor. Per-attempt `computeOutputHeadroom` checks; `headroomExcludedModelIds` accumulate across failover loop.

### 9.6 Cursor Quota Handling
Subscription-quota exhaustion detection and failover to `cursor/auto` or economical API models with `cursor_quota_exhausted` telemetry.

---

## 10. Installation & Usage

### 10.1 Plugin Installation
```bash
# 1. Install as DSH plugin (recommended)
dsh plugin --profile desktop add github:dkeviv/dsh-smart-router

# 2. Select model in any chat session:
/model smart-router/auto

# 3. Use slash commands immediately:
/smart-router status
/smart-router history
/smart-router stats
```

### 10.2 First Run
1. Install plugin via DSH CLI
2. Authenticate providers (`/login`) and enable models in scoped list if using one (`/scoped-models`)
3. `/model smart-router/auto` — every turn runs through the routing pipeline
4. `/smart-router status`, `/smart-router history`, `/smart-router stats` — inspect routing decisions

**First run note:** Plugin runs `npm install` for dependencies (`better-sqlite3` compiles natively). First routed request downloads HyDRA ONNX weights to `.dsh-smart-router/models/` under state directory.

### 10.3 Default Model Selection
- Users select `smart-router/auto` as their model via `/model smart-router/auto`
- The router automatically selects based on current context
- Can override with specific model selection when needed (`/model anthropic/claude-3.5-sonnet`)

### 10.4 Scoped vs All Mode
- **Scoped (default):** Routes only among DSH's enabled model patterns (respects `/scoped-models`)
- **All:** Routes among all authenticated models in the registry
- Switch anytime: `/smart-router mode all` or `/smart-router mode scoped`

---

## 11. Roadmap

### Phase 1: Core Router + Fleet Management (2-3 weeks)
- Core router class with pipeline orchestration
- Fleet management (YAML loading + auto-discovery from DSH model registry)
- Basic pipeline stages 1-6 (hardware probe through session pinning)
- Model profile data structures
- Basic telemetry recording to SQLite
- Slash command registration with tab completion

### Phase 2: Advanced Pipeline + Local Zero-Tier (2-3 weeks)
- Stages 7-9 (deterministic triage through cloud fallback)
- Local zero-tier: LM Studio/Ollama probing and routing via dsh-home-paths
- Embedding matcher (HyDRA-style ONNX embeddings)
- Enhanced telemetry with stage tracking
- Planning delegate spawn (cache-preserving)
- Stream failover loop with headroom checks

### Phase 3: Slash Commands + Polish (1-2 weeks)
- Full slash command family implementation
- Status, history, stats formatters (embedded widget snapshots)
- Plan/doctor read-only placement commands
- Pricing refresh, export, feedback commands
- Configuration validation

### Phase 4: Integration Tests + Documentation (1 week)
- End-to-end integration tests with real DSH sessions
- CI/CD pipeline
- Comprehensive README and documentation
- Installation script and setup wizards

---

## 12. Success Metrics

### 12.1 Technical Goals
- Pipeline decision time: < 500ms for first 6 stages
- Model selection accuracy: > 80% match to user intent
- Fallback chain success rate: > 95% (at least one model in chain succeeds)
- Session pinning effectiveness: > 70% cache hit rate on repeated sessions

### 12.2 User Goals
- Users report easier model selection (< 30 seconds to effective model choice)
- Cost savings: Average 20% reduction in API costs through optimal routing
- Latency improvement: 15% reduction through local zero-tier when eligible
- User satisfaction: > 4/5 rating on routing usefulness

### 12.3 Adoption Goals
- 50+ plugin installations in first month
- 80% of power users enable smart router within first week
- Telemetry data from 100+ unique sessions within first month

---

## 13. Risk Assessment

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

## 14. Future Considerations (Post-MVP)

- **Multi-modal routing**: Vision-capable model selection based on image content
- **Budget-aware routing**: User-set budget limits, automatic tier downgrade
- **Time-aware routing**: Preferred models based on time of day / latency patterns
- **A/B testing**: Route percentage of users to different routing strategies
- **Predictive pre-warming**: Pre-load selected models before they're needed
- **Custom routing rules**: User-defined priority rules for specific patterns