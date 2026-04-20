# HMC-Memory

**Hierarchical Memory Compression for AI Agents**

> Automatically record every AI conversation, then compress daily logs into weekly summaries, monthly digests, and yearly retrospectives — all searchable, all local, zero dependencies beyond Node.js and your LLM.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-success)](package.json)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-blueviolet)](https://modelcontextprotocol.io)

[English](./README.md) | [繁體中文](./README-ZH.md)

---

## What Is This?

Most AI assistants forget everything the moment a session ends. HMC-Memory solves this by automatically recording every conversation to local Markdown files, then compressing them over time — like a journal that summarizes itself.

**How it works:**

```
Every session ends
       ↓
  Daily file written  (~/.hmc/daily/2026-04-20.md)
       ↓  every 3 days
  Chunk summary       (~/.hmc/chunks/2026-04-18_to_2026-04-20.md)
       ↓  every month
  Monthly digest      (~/.hmc/monthly/2026-04.md)
       ↓  every year
  Yearly retrospective (~/.hmc/yearly/2026.md)
```

All compression is done by your local LLM (LM Studio, Ollama, etc.) — no data ever leaves your machine.

---

## Key Features

- **Automatic recording** — hooks into Claude Code's session lifecycle; fires silently in the background
- **Hierarchical compression** — daily → 3-day chunk → monthly → yearly, each level summarized by AI
- **Cross-layer search** — keyword search across all levels at once
- **MCP server** — exposes 5 tools so any MCP-compatible AI platform can query and write memory
- **Generic webhook** — a simple HTTP server so non-MCP platforms can also send conversation data
- **Zero npm dependencies** — only Node.js 18+ built-ins; no `npm install` required
- **Local-first** — all data stored as plain Markdown files in `~/.hmc/`; works offline
- **Multi-platform LLM** — LM Studio (default), Ollama, Claude API, OpenAI API — one env var to switch

---

## Requirements

| Requirement | Notes |
|-------------|-------|
| **Node.js 18+** | Built into Claude Code; no separate install needed |
| **LM Studio** (or Ollama) | Provides the AI that compresses your memories |
| Anything else | **None** |

No `npm install`. No Python. No database. No Docker. Just Node.js and your LLM.

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/boboidvtw/hmc-memory.git
cd hmc-memory
```

### 2. Configure your LLM

Copy `.env.example` to `~/.hmc/.env` and set your backend:

```bash
# Minimum config for LM Studio (default)
HMC_LLM_BACKEND=lmstudio
HMC_LMSTUDIO_URL=http://127.0.0.1:1234/v1
```

Make sure LM Studio is running with a model loaded before compression is triggered.

### 3. Install (auto-detect your platform)

```bash
node bin/cli.js install
```

This will:
- Create the `~/.hmc/` directory structure
- Inject a `SessionEnd` hook into `~/.claude/settings.json` (Claude Code)
- Register the MCP server so Claude can call memory tools directly

### 4. Verify

```bash
node bin/cli.js status
```

```
📊 HMC-Memory 狀態

記憶目錄: ~/.hmc

今日記錄: 0 筆，0 KB

各層統計:
  daily    0 個檔案  最新: 無  總大小: 0 KB
  chunks   0 個檔案  最新: 無  總大小: 0 KB
  monthly  0 個檔案  最新: 無  總大小: 0 KB
  yearly   0 個檔案  最新: 無  總大小: 0 KB
```

From this point on, every Claude Code session end will automatically write to today's daily file and trigger compression if needed.

---

## Storage Layout

All memory lives in `~/.hmc/`:

```
~/.hmc/
├── .env                          ← your LLM config
├── config.json                   ← last compression timestamps
├── index.json                    ← search index (auto-maintained)
│
├── daily/
│   ├── 2026-04-18.md             ← one file per day
│   ├── 2026-04-19.md
│   └── 2026-04-20.md
│
├── chunks/
│   └── 2026-04-18_to_2026-04-20.md  ← every 3 days, AI-compressed
│
├── monthly/
│   └── 2026-04.md                ← generated on the 1st of each month
│
└── yearly/
    └── 2026.md                   ← generated on Jan 1st each year
```

Every file is plain Markdown — readable in any editor, searchable with any tool.

---

## Compression Schedule

Compression fires automatically at the end of each Claude Code session:

| Trigger | Input | Output |
|---------|-------|--------|
| Every 3 days (configurable) | 3 daily files | 1 chunk summary |
| 1st of each month | All daily files for prev month | 1 monthly digest |
| January 1st | All monthly files for prev year | 1 yearly retrospective |

Each level is ~20% the size of its inputs. After a year, thousands of daily logs become a single concise file.

**Original files are never deleted.** Compression only adds new summary files.

---

## CLI Reference

```bash
node bin/cli.js <command> [options]
# or, after npm link:
hmc-memory <command>
```

| Command | Description |
|---------|-------------|
| `install` | Set up directories, inject hooks and MCP config |
| `install --platform claude-code` | Force Claude Code adapter |
| `install --platform generic` | Force generic HTTP webhook adapter |
| `install --no-mcp` | Install without MCP server |
| `uninstall` | Remove hooks and MCP config (data is kept) |
| `search <keyword>` | Search across all memory layers |
| `search <keyword> --layer daily` | Search only daily files |
| `search <keyword> --limit 5` | Limit results |
| `compress chunk` | Manually trigger 3-day compression |
| `compress month` | Manually trigger monthly compression |
| `compress year` | Manually trigger yearly compression |
| `status` | Show file counts and sizes per layer |
| `today` | Print today's memory file |
| `reindex` | Rebuild the search index |

---

## MCP Tools

When installed, HMC-Memory registers an MCP server. Any MCP-compatible AI platform (Claude Code, and others) can call these tools directly:

| Tool | What it does |
|------|-------------|
| `memory_record` | Write a note or conversation turn into today's file |
| `memory_search` | Search all layers by keyword |
| `memory_today` | Read today's full memory file |
| `memory_compress` | Trigger compression on demand |
| `memory_status` | Get file counts and sizes per layer |

Example (Claude Code will call these automatically once the MCP server is registered):

> "What did we decide about the MAMGA architecture last week?"
> → Claude calls `memory_search` with query "MAMGA architecture"
> → Returns matching excerpts from daily and chunk files

---

## Generic Webhook (Non-MCP Platforms)

For platforms that don't support MCP, start the webhook server:

```bash
node src/adapters/generic/webhook.js
# Listening on http://localhost:4821
```

Then POST conversation data from any platform:

```bash
# Record a message
curl -X POST http://localhost:4821/record \
  -H 'Content-Type: application/json' \
  -d '{"text": "Today we finalized the API design.", "platform": "my-ai", "role": "assistant"}'

# Record a session summary
curl -X POST http://localhost:4821/session \
  -d '{"summary": "Completed API design review.", "platform": "my-ai"}'

# Search
curl "http://localhost:4821/search?q=API+design&limit=5"

# Status
curl http://localhost:4821/status

# Trigger compression
curl -X POST http://localhost:4821/compress \
  -d '{"level": "chunk"}'
```

---

## LLM Backend Configuration

Set `HMC_LLM_BACKEND` in `~/.hmc/.env`:

| Value | Platform | Notes |
|-------|----------|-------|
| `lmstudio` | LM Studio | **Default**. Runs locally on port 1234 |
| `ollama` | Ollama | Runs locally on port 11434 |
| `claude` | Claude API | Requires `ANTHROPIC_API_KEY` |
| `openai` | OpenAI API | Requires `OPENAI_API_KEY` |
| `custom` | Any OpenAI-compatible API | Set `HMC_CUSTOM_URL` and `HMC_CUSTOM_MODEL` |

The LLM is **only called during compression**. Recording and searching are pure file I/O — they work even when your LLM is offline.

### Example `.env` configurations

**LM Studio (recommended for local use):**
```env
HMC_LLM_BACKEND=lmstudio
HMC_LMSTUDIO_URL=http://127.0.0.1:1234/v1
HMC_LMSTUDIO_MODEL=your-model-name
```

**Ollama:**
```env
HMC_LLM_BACKEND=ollama
HMC_OLLAMA_URL=http://127.0.0.1:11434/v1
HMC_OLLAMA_MODEL=llama3
```

**Custom local endpoint:**
```env
HMC_LLM_BACKEND=custom
HMC_CUSTOM_URL=http://127.0.0.1:8080/v1
HMC_CUSTOM_MODEL=my-model
```

---

## How Each Layer Is Compressed

HMC-Memory uses different prompts for each compression level, tuned to extract the right level of detail:

**Chunk (3-day)** — Tactical: what was worked on, what decisions were made, specific filenames and commands. ~25% of original size.

**Monthly** — Strategic: which projects progressed, what architectural choices were locked in, what's still in progress. ~15% of original size.

**Yearly** — Historical: major achievements, technology shifts, long-arc project evolution. ~10% of monthly total.

All prompts are in the `templates/` directory and can be customized.

---

## Platform Support

| Platform | Recording | MCP Tools | Notes |
|----------|-----------|-----------|-------|
| **Claude Code** | ✅ Auto via SessionEnd hook | ✅ | Primary platform |
| **Any MCP platform** | Manual / webhook | ✅ | MCP server included |
| **Any HTTP platform** | ✅ via webhook POST | ❌ | Use generic adapter |
| **CLI / scripts** | ✅ `node bin/cli.js` | — | Direct use |

---

## File Format

Every daily file follows this structure:

```markdown
# 2026-04-20

> Auto-recorded by HMC-Memory

---

## 09:32 `[claude-code]`
**🤖 Assistant**

We decided to use the MCP-first architecture with platform adapters...

---

## 10:15 📋 Session Summary `[claude-code]`

Completed Phase 1-4 of HMC-Memory. Storage, recorder, compression engine,
search, MCP server, and CLI are all working.

---
```

Plain Markdown. Works in Obsidian, VS Code, GitHub, any text editor.

---

## Resuming Development

This project uses a `PLAN.md` task list. If you need to continue development after a context reset, tell your AI assistant:

```
Please read C:\claudecode\hmc-memory\PLAN.md and continue HMC-Memory development.
Find the first incomplete task ([ ]) and start there.
```

---

## Related Projects

### MAMGA-Local
**[https://github.com/boboidvtw/MAMGA-Local](https://github.com/boboidvtw/MAMGA-Local)**

Multi-Graph based Agentic Memory for Local AI — a four-graph memory architecture (Temporal, Semantic, Causal, Entity) designed for local LLMs.

HMC-Memory's roadmap includes MAMGA-Local integration (Phase 7), which will upgrade search from keyword matching to **vector semantic search** and **multi-hop graph reasoning**:

```
Current:  HMC-Memory → keyword search over Markdown files
Future:   HMC-Memory → MAMGA-Local → semantic search + graph reasoning
```

---

## Roadmap

- [x] Core recording (daily files)
- [x] Hierarchical compression (chunk / monthly / yearly)
- [x] Cross-layer keyword search
- [x] MCP server (5 tools)
- [x] Claude Code adapter (SessionEnd hook)
- [x] Generic HTTP webhook adapter
- [x] Zero npm dependencies
- [x] Multi-backend LLM support
- [ ] MAMGA-Local integration (semantic / graph search) — [MAMGA-Local](https://github.com/boboidvtw/MAMGA-Local)
- [ ] Web UI for browsing memory layers
- [ ] npm publish (`npx @boboidvtw/hmc-memory install`)

---

## License

MIT — free to use, modify, and distribute.
