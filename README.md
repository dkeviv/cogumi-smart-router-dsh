# cogumi-smart-router-dsh

> Smart router plugin for **DeepSeek Harness (DSH)** — uses a local LLM (Qwen3) to intelligently route requests to the optimal model.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)
[![DSH Plugin](https://img.shields.io/badge/DSH-plugin-purple.svg)](https://github.com/deepseek-ai/dsh)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🤖 LLM-Powered Routing** | Local Qwen3 model analyzes your request and picks the best model from your fleet |
| **🏠 Fully Local Router** | Runs via `@huggingface/transformers` (WASM) — no external API calls, no Chrome extension |
| **🎯 Three-Tier Fleet** | Zero-tier (local), Economical-cloud (<$0.50/1M), Frontier-cloud ($2-5/1M) |
| **📌 Session Pinning** | Caches model selection per session for provider prompt-caching efficiency |
| **⚡ 6-Stage Pipeline** | Hardware probe → Loop escalation → Turn envelope → Context-fit → Session pin → **LLM Router (default)** |
| **💬 Simple On/Off** | One slash command: `/cogumi-smart-router on\|off\|status` |
| **📊 Telemetry** | SQLite-backed routing history with cost/latency tracking |
| **🔧 Router Model Switch** | Hot-swap between Qwen3 0.6B (fast) and Qwen3.5 0.8B (smart) |

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
# Use cogumi-smart-router as your model
/model cogumi-smart-router/auto
```

---

## 🚀 Usage

### One Command: `/cogumi-smart-router`

| Command | Purpose |
|---------|---------|
| `/cogumi-smart-router` | Show status (active model, tier, latency, cost) |
| `/cogumi-smart-router on` | Enable the LLM router |
| `/cogumi-smart-router off` | Disable router — use `/model <provider/model>` manually |
| `/cogumi-smart-router model` | Show current router model |
| `/cogumi-smart-router model <model-id>` | Switch router model |

---

### Examples

```bash
# Check status
/cogumi-smart-router

# Enable router (default)
/cogumi-smart-router on

# Disable router — manual selection
/cogumi-smart-router off

# Switch to smarter router model (Qwen3.5 0.8B)
/cogumi-smart-router model dkeviv/Qwen3.5-0.8B-Text-ONNX-WebGPU-QDQ-bucket

# Switch back to fastest (Qwen3 0.6B)
/cogumi-smart-router model dkeviv/Qwen3-0.6B-DQ-ONNX-bucket
```

---

### Status Output

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

---

### End-of-Response Indicator

Every response includes a footer showing which model was used:

```
---
*Routed via: anthropic/claude-3.5-sonnet (frontier-cloud) 📌 | Stage: llm-router | ~245ms*
```

---

## 🧠 How It Works

### Pipeline (6 Stages)

```
1. Hardware Probe     → Checks RAM/CPU/battery for local eligibility
2. Loop Escalation    → Detects repeated tool failures, escalates to frontier
3. Turn Envelope      → Classifies: tool_result | planning | subagent | main_loop
4. Context-Fit Gate   → Filters models by context window
5. Session Pin        → Returns pinned model if valid (cache efficiency)
6. LLM Router (DEFAULT) → 🤖 Local Qwen3 picks best model from fleet
```

### LLM Router (Stage 6)

The **default primary routing stage** — runs a local Qwen3 model that:

1. Receives your request + available fleet (provider, tier, cost, capabilities, context window)
2. Analyzes turn type, required capabilities, hardware constraints
3. Outputs JSON: `{ "model_id": "provider/model", "reason": "...", "confidence": 0.9 }`
4. **On failure**: Throws clear error with manual selection guidance

---

## ⚙️ Configuration

### Plugin Config (via DSH)

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

### Tier Cost Limits

| Tier | Max Cost/1M Tokens |
|------|-------------------|
| zero-tier | $0 (local) |
| economical-cloud | $0.50 |
| frontier-cloud | $5.00 |

---

## 🔧 Router Models

| Model ID | Size | Best For |
|----------|------|----------|
| `dkeviv/Qwen3-0.6B-DQ-ONNX-bucket` | 370 MB | Fastest routing, quick decisions |
| `dkeviv/Qwen3.5-0.8B-Text-ONNX-WebGPU-QDQ-bucket` | 490 MB | Higher quality routing, better reasoning |

Switch anytime:
```bash
/cogumi-smart-router model dkeviv/Qwen3.5-0.8B-Text-ONNX-WebGPU-QDQ-bucket
```

---

## ⚠️ Error Handling

If the LLM router fails, you get a clear error with guidance:

```
⚠️ LLM router failed to generate a routing decision. The router model may be unavailable or the request too complex. Use `/model <provider/model>` to manually select a model.
```

Then manually select:
```bash
/model anthropic/claude-3.5-sonnet
/model openai/gpt-4o
/model deepseek/deepseek-chat
```

---

## 📊 Telemetry

```bash
# Routing history and stats stored in ~/.dsh-smart-router/state.db
# View via DSH or query SQLite directly
```

---

## 🛠️ Development

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
│   ├── pipeline.ts               # 6-stage pipeline
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
└── utils/placement-plan.ts       # Hardware readiness checks
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Router model fails to load | Check internet (downloads from Hugging Face on first run) |
| Local models not detected | Ensure LM Studio (port 1234) or Ollama (port 11434) running |
| "No models available" | Check `/scoped-models` in DSH; enable desired models |
| High latency | Switch to Qwen3 0.6B: `/cogumi-smart-router model dkeviv/Qwen3-0.6B-DQ-ONNX-bucket` |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Credits

- **DSM (DeepSeek Harness)** — Plugin architecture
- **@huggingface/transformers** — Local LLM inference (WASM)
- **Qwen Team** — Qwen3 models on Hugging Face Hub
- **Cogumi** — Inspiration for agent routing patterns

---

**Repository:** https://github.com/dkeviv/smart-router-dsh  
**Issues:** https://github.com/dkeviv/smart-router-dsh/issues