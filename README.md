# dsh-smart-router

> Smart router plugin for **DeepSeek Harness (DSH)** — intelligently routes LLM requests to the optimal model using a local LLM router.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)
[![DSH Plugin](https://img.shields.io/badge/DSH-plugin-purple.svg)](https://github.com/deepseek-ai/dsh)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🤖 LLM-Powered Routing** | Uses a local Qwen3 model (0.6B/0.8B) to analyze your request and pick the best model from your fleet |
| **🏠 Fully Local** | Router model runs via `@huggingface/transformers` (WASM) — no external API calls, no Chrome extension needed |
| **🎯 Three-Tier Fleet** | Zero-tier (local), Economical-cloud (<$0.50/1M), Frontier-cloud ($2-5/1M) |
| **📌 Session Pinning** | Caches model selection per session for provider prompt-caching efficiency |
| **⚡ 13-Stage Pipeline** | Hardware probe → Session pin → **LLM Router (default)** → Deterministic fallbacks |
| **💬 Conversational UI** | Two slash commands: `/smart-router auto` and `/smart-router custom` |
| **📊 Telemetry** | SQLite-backed routing history, stats, and cost tracking |

---

## 📦 Installation

### Prerequisites
- **DSH** (DeepSeek Harness) installed
- **Node.js ≥ 22**

### Quick Install

```bash
# Install the plugin
dsh plugin --profile desktop add github:dkeviv/smart-router-dsh

# Restart DSH or reload
/reload
```

### Select the Router

```bash
# Use smart-router as your model
/model smart-router/auto
```

---

## 🚀 Usage

### Two Commands Only

| Command | Purpose |
|---------|---------|
| `/smart-router auto [model-id]` | Select the local LLM router model |
| `/smart-router custom [provider] [model-id]` | Pick a specific model by provider (bypasses router) |

---

### `/smart-router auto` — Choose Router Model

```bash
# Show current router model + available options
/smart-router auto

# Switch to Qwen3 0.6B (fastest, 370 MB)
/smart-router auto dkeviv/Qwen3-0.6B-DQ-ONNX-bucket

# Switch to Qwen3.5 0.8B (better reasoning, 490 MB)
/smart-router auto dkeviv/Qwen3.5-0.8B-Text-ONNX-WebGPU-QDQ-bucket
```

**Output:**
```
🤖 Select Router Model
━━━━━━━━━━━━━━━━━━
Current: dkeviv/Qwen3-0.6B-DQ-ONNX-bucket

Available models:
  Qwen3 0.6B →
    Fastest router · 370 MB · Best for quick decisions
    Size: 370 MB | Quant: q4f16

  Qwen3.5 0.8B
    Higher quality routing · 490 MB · Better reasoning
    Size: 490 MB | Quant: q4f16

Usage: /smart-router auto <model-id>
Example: /smart-router auto dkeviv/Qwen3-0.6B-DQ-ONNX-bucket
```

---

### `/smart-router custom` — Pick Model by Provider

```bash
# Show all models grouped by provider
/smart-router custom

# Pick a specific model (bypasses router)
/smart-router custom anthropic claude-3.5-sonnet
/smart-router custom openai gpt-4o
/smart-router custom deepseek deepseek-chat
```

**Output:**
```
🎯 Select Model (Custom)
━━━━━━━━━━━━━━━━━━
Choose from available models by provider:

📦 ANTHROPIC
  🚀 frontier-cloud
    claude-3.5-sonnet | $3.00/1M | 200,000ctx | cap: R95 C95 T95
    claude-3.5-haiku | $0.25/1M | 200,000ctx | cap: R75 C85 T80

  ☁️ economical-cloud
    ...

📦 OPENAI
  🚀 frontier-cloud
    gpt-4o | $5.00/1M | 128,000ctx | cap: R95 C95 T95
    ...

📦 LMSTUDIO
  🏠 zero-tier
    qwen3-0.6b | Free | 32,768ctx | cap: R40 C60 T30
    ...

Usage: /smart-router custom <provider> <model-id>
Example: /smart-router custom anthropic claude-3.5-sonnet
```

---

## 🧠 How It Works

### Pipeline (13 Stages)

```
1. Hardware Probe        → Checks RAM/CPU/battery for local eligibility
2. Loop Escalation       → Detects repeated tool failures, escalates to frontier
3. Turn Envelope         → Classifies: tool_result | planning | subagent | main_loop
4. Context-Fit Gate      → Filters models by context window
5. Low-Intensity Gate    → Structural tier hint + capability scoring
6. Session Pin           → Returns pinned model if valid (cache efficiency)
7. LLM Router (DEFAULT)  → 🤖 Local Qwen3 picks best model from fleet
8. Deterministic Triage  → Keyword + complexity fallback
9. Local Zero-Tier       → Probes LM Studio/Ollama for loaded models
10. Triage Cloud Fallback → First healthy economical model
11. Embedding Matcher    → HyDRA-style semantic matching (placeholder)
12. Safe Cloud Default   → First healthy economical-cloud model
13. Context Overflow     → Largest context-window model that fits
```

### LLM Router (Stage 7)

The **default primary routing stage** — runs a local Qwen3 model that:

1. Receives your request + available fleet (provider, tier, cost, capabilities, context window)
2. Analyzes turn type, required capabilities, hardware constraints
3. Outputs JSON: `{ "model_id": "provider/model", "reason": "...", "confidence": 0.9 }`
4. Falls through to deterministic pipeline if it fails

---

## ⚙️ Configuration

### Plugin Config (via DSH)

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable/disable smart router |
| `defaultMode` | `scoped` | `scoped` = enabled models only, `all` = all authenticated |
| `sessionPinning` | `true` | Pin model per session for cache efficiency |
| `hardwareProbe` | `true` | Detect hardware for local inference gating |
| `localRuntime` | `true` | Probe LM Studio/Ollama |
| `telemetry.enabled` | `true` | Record routing history to SQLite |
| `telemetry.retentionDays` | `30` | Data retention |
| `fallback.maxRetries` | `3` | Max fallback attempts |

### Tier Cost Limits

| Tier | Max Cost/1M Tokens |
|------|-------------------|
| zero-tier | $0 (local) |
| economical-cloud | $0.50 |
| frontier-cloud | $5.00 |

---

## 📊 Telemetry & Stats

```bash
# Routing history (last 20)
/smart-router history

# Stats with cost/latency breakdown
/smart-router stats

# Local placement readiness
/smart-router doctor
/smart-router plan
```

**Stats Output:**
```
📊 Smart Router Stats
━━━━━━━━━━━━━━━━━━
Entries: 47
Cost (mixed): total $0.0234 | avg $0.0005
Latency: total 1847ms | avg 39.3ms
Planning delegate: 12.8% (direct 87.2%)
Local vs Cloud: local 21.3% | cloud 78.7%
Role costs:
  primary (pinned): 32 | $0.0089
  planning_delegate: 6 | $0.0112
  other: 9 | $0.0033
Vs frontier savings: $0.0412
```

---

## 🔧 Development

```bash
# Clone
git clone https://github.com/dkeviv/smart-router-dsh.git
cd smart-router-dsh

# Install deps
npm install

# Build
npm run build

# Dev (watch mode)
npm run dev

# Lint
npm run lint

# Test
npm test
```

### Project Structure

```
src/
├── index.ts                      # Plugin entry point
├── types/index.ts                # Core type definitions
├── router/
│   ├── index.ts                  # SmartRouter class
│   ├── pipeline.ts               # 13-stage pipeline
│   ├── llm-router-stage.ts       # LLM Router Stage (DEFAULT)
│   └── standalone-router-client.ts  # Local Qwen3 via transformers.js
├── fleet/index.ts                # Fleet management
├── hardware/
│   ├── probe.ts                  # Hardware detection
│   └── local-runtime.ts          # LM Studio/Ollama probe
├── telemetry/
│   ├── sqlite.ts                 # SQLite store (sql.js WASM)
│   └── aggregator.ts             # Stats aggregation
├── commands/
│   ├── index.ts                  # Slash command registration
│   └── formatters.ts             # Output formatting
└── utils/placement-plan.ts       # /doctor & /plan
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Router model fails to load | Check internet (downloads from Hugging Face on first run) |
| Local models not detected | Ensure LM Studio (port 1234) or Ollama (port 11434) running |
| "No models available" | Run `/smart-router custom` to verify fleet; check `/scoped-models` |
| High latency | Switch to Qwen3 0.6B (`/smart-router auto dkeviv/Qwen3-0.6B-DQ-ONNX-bucket`) |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `npm run build && npm run lint && npm test`
5. Submit a PR

---

## 🙏 Credits

- **DSM (DeepSeek Harness)** — Plugin architecture
- **@huggingface/transformers** — Local LLM inference (WASM)
- **pi-smart-router** — Pipeline design inspiration
- **Qwen Team** — Qwen3 models on Hugging Face Hub

---

**Repository:** https://github.com/dkeviv/smart-router-dsh  
**Issues:** https://github.com/dkeviv/smart-router-dsh/issues