# dsh-smart-router

Smart router plugin for DeepSeek Harness (DSH) that intelligently routes LLM requests to the optimal model based on hardware capabilities, session context, cost, latency, and request characteristics.

## Features

- **12-Stage Routing Pipeline**: Hardware probe → Loop escalation → Turn envelope → Context-fit gate → Low-intensity gate → Session pin → Deterministic triage → Local zero-tier → Triage cloud fallback → Embedding matcher (HyDRA-style) → Safe cloud default → Context overflow fallback
- **Three-Tier Architecture**: Zero-tier (local), Economical-cloud, Frontier-cloud
- **Session Pinning**: Cache-aware model pinning for provider-side prompt caching
- **Local Inference**: LM Studio / Ollama detection and routing
- **Telemetry**: SQLite-backed routing history, stats, and analytics
- **Conversational Interface**: All control via `/smart-router` slash commands in any DSH chat session

## Installation

```bash
# Install as DSH plugin
dsh plugin --profile desktop add github:dkeviv/dsh-smart-router

# Restart DSH or run /reload
```

## Quick Start

1. **Authenticate providers** (if not already done):
   ```
   /login anthropic
   /login openai
   /login deepseek
   ```

2. **Enable models in scoped list** (optional, for scoped mode):
   ```
   /scoped-models
   # Enable desired models
   ```

3. **Switch to smart router**:
   ```
   /model smart-router/auto
   ```

4. **Check status**:
   ```
   /smart-router status
   ```

## Slash Commands

All commands support tab completion (`/smart-router <TAB>`).

| Command | Description |
|---------|-------------|
| `/smart-router` or `/smart-router status` | Show fleet mode, fleet size, pricing freshness, last routing decision |
| `/smart-router history [N]` | Show recent routing history (default 20, max 100) |
| `/smart-router stats [N]` | Show session aggregates: cost, latency, planning delegate share, local vs cloud, role cost breakdown, vs-frontier savings |
| `/smart-router mode scoped` | Route only among DSH's enabled model patterns (default) |
| `/smart-router mode all` | Route among all authenticated models |
| `/smart-router pricing refresh` | Fetch latest LiteLLM pricing and rebuild fleet |
| `/smart-router export dataset [--limit N]` | Export opt-in routing dataset as JSONL (requires `SMART_ROUTER_DATASET=1`) |
| `/smart-router export telemetry-contrib [--limit N] [--embeddings]` | Export privacy-safe community telemetry for calibration |
| `/smart-router feedback good\|bad` | Label last auto-routed request outcome (requires `SMART_ROUTER_DATASET=1`) |
| `/smart-router unpin` | Clear current session pin, next request runs full routing |
| `/smart-router plan [--json]` | Read-only local placement report (encoder, local runtime, hardware, disk, throughput) |
| `/smart-router doctor` | Read-only readiness checklist with bottleneck guess |

### Example Outputs

**Status:**
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
Reason: Session pinned: pinned
Latency: 0ms
```

**History:**
```
2026-11-10T19:45:12Z | anthropic/claude-3.5-sonnet | session-pin | main_loop | 0ms
2026-11-10T19:44:38Z | openai/gpt-4o | embedding-matcher | planning | 87ms
2026-11-10T19:43:55Z | deepseek/deepseek-chat | low-intensity-gate | tool_result | 2ms
2026-11-10T19:43:12Z | lmstudio/local-gemma-4-7b | local-zero-tier | main_loop | 12ms
```

**Stats:**
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
Vs always-frontier savings: $0.0412 (actuals preferred, est. when missing)
```

**Doctor:**
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

## Configuration

Configuration is managed via slash commands and environment variables. No separate settings UI.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ROUTER_STATE_DB_PATH` | `~/.dsh-smart-router/state.db` | SQLite database location |
| `SMART_ROUTER_LOG_ROUTING` | (unset) | Set to `1` to log routing decisions to stderr |
| `SMART_ROUTER_DATASET` | (unset) | Set to `1` to enable dataset export and feedback |

### Fleet Modes

- **Scoped (default)**: Respects `/scoped-models` enable list
- **All**: Considers all authenticated models in registry

Switch anytime:
```
/smart-router mode all
/smart-router mode scoped
```

## Architecture

### 12-Stage Pipeline

1. **Hardware Probe** - Check RAM/CPU/battery for local eligibility
2. **Loop Escalation** - Detect repeated tool failures, escalate to frontier
3. **Turn Envelope** - Classify turn: tool_result, planning, subagent, main_loop
4. **Context-Fit Gate** - Filter models by context window
5. **Low-Intensity Gate** - Structural tier hint + capability scoring
6. **Session Pin** - Return pinned model if valid (cache efficiency)
7. **Deterministic Triage** - Aho-Corasick keyword scan + cyclomatic complexity
8. **Local Zero-Tier** - Probe LM Studio/Ollama for loaded models
9. **Triage Cloud Fallback** - Trivial prompts → first healthy economical model
10. **Embedding Matcher** - HyDRA-style ONNX embeddings for semantic matching
11. **Safe Cloud Default** - First healthy economical-cloud model
12. **Context Overflow Fallback** - Largest-fit model when tiers can't fit

### Tiers

| Tier | Description | Cost/1M | Latency |
|------|-------------|---------|---------|
| Zero-tier | Local (LM Studio/Ollama) | $0 | ~2s TTFT |
| Economical-cloud | Fast, cheap cloud models | <$0.50 | ~200ms |
| Frontier-cloud | Best capability models | $2-5 | ~500ms |

## Development

```bash
# Clone and install
git clone https://github.com/dkeviv/dsh-smart-router
cd dsh-smart-router
npm install

# Build
npm run build

# Development mode (watch)
npm run dev

# Run tests
npm test
```

## Project Structure

```
src/
├── index.ts                 # Plugin entry point
├── types/index.ts           # Core type definitions
├── router/
│   ├── index.ts             # Main SmartRouter class
│   └── pipeline.ts          # 12-stage pipeline implementations
├── fleet/
│   └── index.ts             # Fleet management (model catalog)
├── hardware/
│   ├── probe.ts             # Hardware capability detection
│   └── local-runtime.ts     # LM Studio / Ollama probing
├── embeddings/
│   ├── onnx.ts              # ONNX embeddings (HyDRA)
│   └── centroids.ts         # Cluster centroids
├── telemetry/
│   ├── sqlite.ts            # SQLite telemetry store
│   └── aggregator.ts        # Stats aggregation
├── commands/
│   ├── index.ts             # Slash command registration
│   └── formatters.ts        # Output formatters (embedded widgets)
└── utils/
    └── placement-plan.ts    # /plan and /doctor read-only checks
```

## License

MIT