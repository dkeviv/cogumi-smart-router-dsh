# Cogumi Smart Router for DSH - Product Requirements Document (PRD)

## 1. Product Overview

### 1.1 Product Name
**cogumi-smart-router-dsh** - A smart routing plugin for DeepSeek Harness (DSH) that uses a local LLM (Qwen3) to intelligently route user requests to the most appropriate LLM model based on hardware capabilities, session context, cost, latency, and request characteristics.

### 1.2 Problem Statement
DSH users currently need to manually select models for each request or rely on default settings. There's no intelligent routing that considers:
- Hardware capabilities (local inference vs cloud)
- Cost optimization
- Latency requirements
- Session context and model pinning
- Request complexity and type

### 1.3 Solution Summary
A DSH Cordis plugin that implements a **6-stage routing pipeline** with an **LLM-powered router as the default stage**. The router uses a local Qwen3 model (via @huggingface/transformers WASM) to analyze the request and select the optimal model from the available fleet. If the LLM router fails, it throws a clear error telling the user why and suggests manual model selection via `/model <provider/model>`. All interaction is through a simple on/off slash command in any DSH chat session — no separate web UI, no complex fallback chains.

### 1.4 Target Audience
- DSH power users who want optimal model selection without manual intervention
- Development teams building DSH-based applications
- Users with mixed local/cloud infrastructure
- Cost-conscious users who want to balance performance vs cost

---

## 2. High-Level Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Route requests through a 6-stage pipeline with LLM router as default stage | High |
| FR-002 | Session pinning - persist model per session for cache efficiency | High |
| FR-003 | Hardware probe - detect RAM/CPU/battery to gate local inference | High |
| FR-004 | Fleet management - model catalog with tiers (zero-tier, economical-cloud, frontier-cloud) | High |
| FR-005 | LLM Router - local Qwen3 model analyzes request and picks best model | High |
| FR-006 | Turn classification - classify: tool_result, planning, subagent, main_loop | Medium |
| FR-007 | Context window guard - filter models fitting estimated input tokens | High |
| FR-008 | Session pinning - cache model per session for provider prompt caching | High |
| FR-009 | Local inference gating - hardware probe gates local model eligibility | High |
| FR-010 | Telemetry - record routing events, stages, costs, latency | Medium |
| FR-011 | Simple on/off slash command - enable/disable router | High |
| FR-012 | Clear error messages on router failure with manual selection guidance | High |

### 2.2 Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-001 | Plugin must load as a Cordis plugin without blocking DSH startup | High |
| NFR-002 | Pipeline must have sub-500ms decision time for first 5 stages | High |
| NFR-003 | Must support 3 tier categories: zero-tier, economical-cloud, frontier-cloud | High |
| NFR-004 | Telemetry storage must use SQLite with configurable retention | Medium |
| NFR-005 | Must be compatible with DSH's provider-neutral dsh-llm service | High |
| NFR-006 | Slash command must follow DSH's existing command patterns | High |
| NFR-007 | LLM router errors must surface clear user-facing messages | High |

### 2.3 Interface Requirements

| ID | Interface | Description |
|----|-----------|-------------|
| IR-001 | `SmartRouter.route(request)` | Main API - takes RoutingRequest, returns RoutingDecision |
| IR-002 | `FleetManager.loadFleet(config)` | Load model catalog from YAML + auto-discovery |
| IR-003 | `TelemetryStore.record(event)` | Record routing events to SQLite |
| IR-004 | `/cogumi-smart-router` command | Simple on/off/status slash command |

---

## 3. Feature Details - 6-Stage Pipeline

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

### Stage 5: Session Pin
- **Check**: session.pinnedModel; break on compaction
- **Purpose**: Cache efficiency (provider prompt caching)
- **Output**: Pinned model decision if valid

### Stage 6: LLM Router (DEFAULT)
- **Local Qwen3 model**: Runs via @huggingface/transformers (WASM)
- **Analyzes**: Request + available fleet (provider, tier, cost, capabilities, context window)
- **Outputs**: JSON with selected model, reason, confidence
- **On failure**: Throws RouterError with clear message + manual selection guidance

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

---

## 5. Fleet Management (Model Catalog)

### 5.1 Fleet Sources
- **Static YAML config**: User-defined model list
- **Local discovery**: LM Studio, Ollama via dsh-home-paths
- **API models**: Auto-discovered from configured providers

### 5.2 Tier Configuration
```yaml
tiers:
  zero-tier:
    enabled: true
    maxLatencyMs: 5000
    maxCostPer1M: 0  # Local/free
  economical-cloud:
    enabled: true
    maxCostPer1M: 0.50
  frontier-cloud:
    enabled: true
    maxCostPer1M: 5.00
```

---

## 6. Slash Command Interface

### 6.1 Command Structure
```
/cogumi-smart-router [on|off|status|model [model-id]]
```

### 6.2 Command Reference

| Command | Purpose |
|---------|---------|
| `/cogumi-smart-router` or `/cogumi-smart-router status` | Show router status, active model, tier, stage, latency |
| `/cogumi-smart-router on` | Enable the LLM router |
| `/cogumi-smart-router off` | Disable the LLM router (use `/model <provider/model>` manually) |
| `/cogumi-smart-router model` | Show current router model |
| `/cogumi-smart-router model <model-id>` | Switch router model (e.g., `dkeviv/Qwen3-0.6B-DQ-ONNX-bucket`) |

### 6.2 Status Output Example
```
🧠 Cogumi Smart Router
━━━━━━━━━━━━━━━━━━
Status: Active
Router Model: Loaded
Active Model: anthropic/claude-3.5-sonnet 📌
Tier: frontier-cloud
Stage: llm-router
Reason: [LLM Router] Planning turn needs high reasoning/code; only frontier models meet thresholds
Latency: ~245ms | Est. Cost: $0.000523
```

### 6.3 End-of-Response Indicator
Every response includes a footer:
```
---
*Routed via: anthropic/claude-3.5-sonnet (frontier-cloud) 📌 | Stage: llm-router | ~245ms*
```

---

## 7. Configuration

### 7.1 Plugin Config
| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable/disable smart router |
| `routerModel` | `dkeviv/Qwen3-0.6B-DQ-ONNX-bucket` | HuggingFace model ID for router |
| `sessionPinning` | `true` | Pin model per session for cache efficiency |
| `hardwareProbe` | `true` | Detect hardware for local inference gating |
| `localRuntime` | `true` | Probe LM Studio/Ollama |
| `telemetry.enabled` | `true` | Record routing history to SQLite |
| `telemetry.retentionDays` | `30` | Data retention |
| `fallback.enabled` | `true` | Enable fallback on router failure |
| `fallback.maxRetries` | `3` | Max fallback attempts |

### 7.2 Router Models (Hugging Face Hub)
| Model ID | Size | Description |
|----------|------|-------------|
| `dkeviv/Qwen3-0.6B-DQ-ONNX-bucket` | 370 MB | Fastest router, best for quick decisions |
| `dkeviv/Qwen3.5-0.8B-Text-ONNX-WebGPU-QDQ-bucket` | 490 MB | Higher quality routing, better reasoning |

### 7.3 Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `ROUTER_STATE_DB_PATH` | `~/.dsh-smart-router/state.db` | SQLite state store location |
| `SMART_ROUTER_LOG_ROUTING` | (unset) | Set to `1` to log routing decisions to stderr |

---

## 8. Error Handling

### 8.1 LLM Router Failure
If the LLM router fails (model unavailable, generation error, invalid response), the plugin throws a **RouterError** with a clear message:

```
⚠️ LLM router failed to generate a routing decision. The router model may be unavailable or the request too complex. Use `/model <provider/model>` to manually select a model.
```

The user can then manually select a model:
```
/model anthropic/claude-3.5-sonnet
/model openai/gpt-4o
/model deepseek/deepseek-chat
```

### 8.2 Session Pinning Errors
If session pinning is active but the pinned model is unavailable, the pin is automatically broken and the LLM router runs.

---

## 9. Telemetry & Observability

### 9.1 Events Recorded (SQLite)
- `routing_decision`: Full routing decision with stage
- `session_pin`: Session pinning events
- `model_health`: Model health status changes

### 9.2 SQLite Schema
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
  fallback_chain TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  turn_type TEXT
);
```

---

## 10. Installation & Usage

### 10.1 Plugin Installation
```bash
# 1. Install plugin
dsh plugin --profile desktop add github:dkeviv/smart-router-dsh

# 2. Reload DSH
/reload

# 3. Select router
/model cogumi-smart-router/auto
```

### 10.2 Usage
```bash
# Check status
/cogumi-smart-router

# Enable router
/cogumi-smart-router on

# Disable router (manual selection)
/cogumi-smart-router off

# Switch router model
/cogumi-smart-router model dkeviv/Qwen3.5-0.8B-Text-ONNX-WebGPU-QDQ-bucket
```

### 10.3 Manual Model Selection (when router is off or failed)
```
/model anthropic/claude-3.5-sonnet
/model openai/gpt-4o
/model deepseek/deepseek-chat
```

---

## 11. Architecture

### 11.1 Pipeline Flow
```
User Request
    │
    ▼
1. Hardware Probe  ──→ hardware context
    │
    ▼
2. Loop Escalation ──→ escalation check
    │
    ▼
3. Turn Envelope  ──→ turn type classification
    │
    ▼
4. Context-Fit Gate ──→ filter by context window
    │
    ▼
5. Session Pin  ──→ return pinned model if valid
    │
    ▼
6. LLM Router (DEFAULT) ──→ Qwen3 picks best model
    │
    ├── Success → Route to selected model
    │
    └── Failure → RouterError → User manually selects via `/model`
```

### 11.2 Key Components
| Component | Purpose |
|-----------|---------|
| `StandaloneRouterClient` | Local Qwen3 inference via @huggingface/transformers (WASM) |
| `LLMRouterStage` | Pipeline stage that runs the LLM router |
| `RouterPipeline` | Orchestrates 6 stages with early exit |
| `TelemetryStore` | SQLite (sql.js WASM) for routing history |
| `FleetManager` | Model catalog with tiers and health |

---

## 12. Success Metrics

| Metric | Target |
|--------|--------|
| Pipeline decision time | < 500ms for first 5 stages |
| LLM router success rate | > 95% |
| Model selection accuracy | > 80% match to user intent |
| Session pinning effectiveness | > 70% cache hit rate |
| User satisfaction | > 4/5 rating |

---

## 13. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| R-001: LLM router model fails to load | Low | High | Clear error message + manual selection fallback |
| R-002: Hardware probe fails | Medium | Low | Graceful degradation - skip local routing |
| R-003: Telemetry DB corruption | Low | High | WAL mode, graceful degradation |
| R-004: Session pinning stale model | Medium | Medium | Auto-unpin on compaction/context overflow |
| R-005: Context window miscalculation | Medium | High | Use tiktoken, configurable estimator |

---

## 14. Future Considerations

- **Router model switching**: Hot-swap between Qwen3 0.6B/0.8B via slash command
- **Budget-aware routing**: User-set budget limits, automatic tier downgrade
- **Time-aware routing**: Preferred models based on time of day / latency patterns
- **Custom routing rules**: User-defined priority rules for specific patterns
- **Multi-modal routing**: Vision-capable model selection based on image content