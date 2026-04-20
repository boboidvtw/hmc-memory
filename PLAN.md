# HMC-Memory — Hierarchical Memory Compression
# Task Plan / 任務計劃表
# 建立日期: 2026-04-20
# 作者: boboidvtw

---

## 專案概述

**名稱**: `@boboidvtw/hmc-memory`
**目標**: 跨平台 AI 對話記憶系統，自動記錄、階層式壓縮（日/3日/月/年），並可搜尋查詢。
**差異化**: 在 mem0（記憶後端）+ claude-mem（自動捕捉靈感）基礎上，加入獨特的時間階層壓縮引擎。

### 核心設計原則
- **站在巨人肩上**: mem0 處理跨平台記憶存儲與語意搜尋；claude-mem 提供 hook 設計靈感
- **MCP-first**: 所有功能透過 MCP server 暴露，各平台通用
- **Platform Adapter 模式**: 核心邏輯只寫一次，各平台各一薄層 adapter
- **本地優先**: LLM 壓縮預設用 LM Studio，支援 OpenAI / Claude API 切換

### 參考專案
- `mem0ai/mem0` ⭐53k — 跨平台記憶後端，MCP server，npm + Python 雙包
- `thedotmack/claude-mem` ⭐63k — Claude Code 自動捕捉 + 壓縮設計靈感
- `boboidvtw/MAMGA-local` — 本地 LLM 圖記憶（未來進階搜尋後端選配）
- `boboidvtw/local-llm-detector` — LLM 後端自動偵測（直接引用）

---

## 儲存結構設計

```
~/.hmc/
├── daily/
│   ├── 2026-04-20.md       ← 每天一檔
│   ├── 2026-04-21.md
│   └── ...
├── chunks/                  ← 每3天壓縮一次
│   ├── 2026-04-18_to_2026-04-20.md
│   └── ...
├── monthly/                 ← 每月1日壓縮
│   └── 2026-04.md
├── yearly/                  ← 每年1月1日壓縮
│   └── 2026.md
├── index.json               ← 搜尋關鍵字索引
└── config.json              ← 使用者設定
```

---

## 技術架構

```
平台層 (薄)           核心層 (厚)              存儲層
─────────────         ──────────────           ──────────
Claude Code hook  →   recorder.js         →   ~/.hmc/daily/
CODEX webhook     →   compress.js         →   ~/.hmc/chunks/
Generic HTTP      →   scheduler.js        →   ~/.hmc/monthly/
                      search.js           →   ~/.hmc/yearly/
                      llm-adapter.js      →   ~/.hmc/index.json
                      ↓
                      mcp/server.js       ← 所有平台通用
```

---

## MCP Tools 清單

| Tool | 說明 | 輸入 |
|------|------|------|
| `memory_record` | 手動寫入一筆記錄 | text, platform, role |
| `memory_search` | 關鍵字搜尋全部層 | query, limit |
| `memory_today` | 查今日記錄 | — |
| `memory_compress` | 手動觸發壓縮 | level (chunk/month/year) |
| `memory_status` | 查各層統計與最後更新 | — |

---

## CLI 指令清單

```bash
npx @boboidvtw/hmc-memory install              # 初始化 + 注入 hook
npx @boboidvtw/hmc-memory install --platform claude-code
npx @boboidvtw/hmc-memory install --platform vscode
npx @boboidvtw/hmc-memory install --platform generic
npx @boboidvtw/hmc-memory search "關鍵字"      # 搜尋
npx @boboidvtw/hmc-memory compress --force     # 手動壓縮
npx @boboidvtw/hmc-memory status               # 查統計
npx @boboidvtw/hmc-memory uninstall            # 移除 hooks，保留資料
```

---

## LLM 後端支援

| 後端 | 設定值 | 端點 |
|------|--------|------|
| LM Studio（預設） | `lmstudio` | `http://127.0.0.1:1234/v1` |
| Ollama | `ollama` | `http://127.0.0.1:11434/v1` |
| Claude API | `claude` | Anthropic API |
| OpenAI API | `openai` | OpenAI API |
| 自訂 | `custom` | `CUSTOM_LLM_URL` env var |

---

## 分期任務表

### Phase 1 — 核心記錄器（預估 2-3 小時）
**目標**: 讓每日記錄可以跑起來

- [ ] **P1-1** 建立專案結構
  - 初始化 `package.json`（name: `@boboidvtw/hmc-memory`）
  - 建立 `src/core/`, `src/mcp/`, `src/adapters/`, `src/cli/` 目錄
  - 設定 `.env.example`

- [ ] **P1-2** 實作 `src/core/storage.js`
  - 建立 `~/.hmc/` 目錄結構
  - `ensureDirectories()` — 確保所有子目錄存在
  - `getConfig()` / `saveConfig()` — 讀寫 `config.json`

- [ ] **P1-3** 實作 `src/core/recorder.js`
  - `recordToday(text, platform, role)` — 寫入 `daily/YYYY-MM-DD.md`
  - 每筆記錄格式：`## HH:mm\n**[platform/role]**\n{text}\n`
  - `getTodayFile()` — 回傳今日檔案路徑

- [ ] **P1-4** 實作 `src/adapters/claude-code/hook.js`
  - SessionEnd hook 腳本
  - 讀取 session 摘要並呼叫 `recorder.recordToday()`

- [ ] **P1-5** 實作 `src/cli/install.js`（claude-code adapter）
  - 偵測 `~/.claude/settings.json`
  - 注入 SessionEnd hook
  - 建立 `~/.hmc/` 目錄

- [ ] **P1-6** 測試 Phase 1
  - 手動跑 hook，確認 daily file 正確生成
  - 檢查格式是否符合預期

---

### Phase 2 — 壓縮引擎（預估 3-4 小時）
**目標**: 實作階層式時間壓縮

- [ ] **P2-1** 實作 `src/core/llm-adapter.js`
  - 支援 LM Studio / Ollama / Claude / OpenAI
  - `compress(texts[], style)` — 呼叫 LLM 做摘要
  - 自動從 `local-llm-detector` 偵測可用後端
  - Fallback 順序：LM Studio → Ollama → Claude API → OpenAI

- [ ] **P2-2** 實作 `src/core/compress.js`
  - `compressChunk(date)` — 壓縮指定日期前3天的 daily files → `chunks/`
  - `compressMonth(year, month)` — 壓縮指定月份所有檔案 → `monthly/`
  - `compressYear(year)` — 壓縮指定年份所有月份 → `yearly/`
  - 壓縮後保留原始檔（不刪除）

- [ ] **P2-3** 實作壓縮 Prompt 模板
  - `templates/compress-chunk.md` — 3日摘要 prompt
  - `templates/compress-month.md` — 月摘要 prompt（保留重點決策/事件）
  - `templates/compress-year.md` — 年摘要 prompt（高層次回顧）

- [ ] **P2-4** 實作 `src/core/scheduler.js`
  - `checkAndRun()` — 在 SessionEnd 時呼叫，判斷是否需要觸發壓縮
  - 邏輯：
    - 距上次 chunk 壓縮 ≥ 3 天 → `compressChunk()`
    - 今天是新月份第1天 → `compressMonth()`
    - 今天是新年份第1天 → `compressYear()`
  - 寫入 `config.json` 記錄最後壓縮時間

- [ ] **P2-5** 測試 Phase 2
  - Mock 3天 daily files，觸發 chunk 壓縮，確認輸出正確
  - 測試 LLM adapter 切換邏輯

---

### Phase 3 — 搜尋功能（預估 2 小時）
**目標**: 可以跨層搜尋所有記憶

- [ ] **P3-1** 實作 `src/core/search.js`
  - `buildIndex()` — 掃描所有 `.md` 檔，建立 `index.json`
  - `search(query, options)` — grep + index 雙模式搜尋
  - 回傳格式：`[{ file, date, layer, excerpt, score }]`

- [ ] **P3-2** 更新 `src/core/recorder.js`
  - 每次寫入後呼叫 `buildIndex()` 更新索引

- [ ] **P3-3** CLI search 指令
  - `npx hmc-memory search "keyword"` → 印出結果，按相關度排序
  - 支援 `--layer daily|chunk|monthly|yearly` 過濾

- [ ] **P3-4** 測試 Phase 3
  - 建立多層測試資料，確認搜尋結果正確

---

### Phase 4 — MCP Server（預估 2-3 小時）
**目標**: 讓 Claude Code 和其他支援 MCP 的平台可以直接呼叫

- [ ] **P4-1** 實作 `src/mcp/server.js`
  - 5 個 MCP tools：`memory_record`, `memory_search`, `memory_today`, `memory_compress`, `memory_status`
  - stdio transport（標準 MCP 協議）

- [ ] **P4-2** 更新 `src/cli/install.js`
  - 安裝時自動把 MCP server 加入 `~/.claude/settings.json` 的 `mcpServers`

- [ ] **P4-3** 測試 Phase 4
  - 用 Claude Code 呼叫 `memory_search`，確認回傳正確

---

### Phase 5 — 跨平台 Adapter（預估 3-4 小時）
**目標**: 支援非 Claude Code 的平台

- [ ] **P5-1** 實作 `src/adapters/generic/webhook.js`
  - 輕量 HTTP server（port 4821）
  - `POST /record` — 接收任何平台的對話記錄
  - `POST /compress` — 手動觸發壓縮

- [ ] **P5-2** 實作 `src/adapters/generic/cli-trigger.js`
  - 提供 shell 腳本範例，讓其他平台可以 pipe 對話到 HMC

- [ ] **P5-3** 更新 CLI install 偵測邏輯
  - `--platform auto` — 掃描環境，自動選擇 adapter
  - 支援同時安裝多個 adapter

- [ ] **P5-4** 測試 Phase 5
  - 用 curl 打 webhook，確認記錄寫入正確

---

### Phase 6 — 打包發布（預估 1-2 小時）
**目標**: 發布為 npm 包

- [ ] **P6-1** 設定 `package.json` 發布設定
  - `bin` 欄位指向 `bin/cli.js`
  - `exports` 欄位暴露 core API
  - `files` 欄位確認只包含必要檔案

- [ ] **P6-2** 撰寫 README.md（英文）
  - 安裝說明、各平台設定、CLI 指令、MCP tools

- [ ] **P6-3** 建立 GitHub repo `boboidvtw/hmc-memory`
  - Push 程式碼
  - 設定 GitHub Actions 自動發布到 npm

- [ ] **P6-4** 發布 npm
  - `npm publish --access public`

---

### Phase 7 — MAMGA 整合（選配，預估 4-6 小時）
**目標**: 將 MAMGA-local 作為進階語意搜尋後端

- [ ] **P7-1** 在 HMC 加入 MAMGA adapter
  - 每次 daily 寫入後，同步餵給 MAMGA
  - `search.js` 加入 MAMGA 語意搜尋模式

- [ ] **P7-2** 設定切換
  - `config.json` 加入 `search_backend: "grep" | "mamga"`
  - install 時詢問是否啟用 MAMGA

---

## 目前進度

```
Phase 1 [✅] 完成 — storage / recorder / adapters / cli/install
Phase 2 [✅] 完成 — llm-adapter / compress / scheduler / templates
Phase 3 [✅] 完成 — search / buildIndex / getStats
Phase 4 [✅] 完成 — mcp/server.js (5 tools, zero-dependency stdio)
Phase 5 [✅] 完成 — generic/webhook.js (HTTP POST /record /session /compress)
Phase 6 [✅] 完成 — bin/cli.js / git commit / GitHub repo 建立並推送
              GitHub: https://github.com/boboidvtw/hmc-memory
              待辦: npm publish (需要 npm 帳號 token)
Phase 7 [ ] 未開始（選配）— MAMGA 整合
```

## 驗收測試結果（2026-04-20）

- storage.js ✅ 路徑正確，Windows ~/.hmc 目錄正常建立
- recorder.js ✅ daily 檔案寫入、Session Summary 格式正確
- search.js ✅ buildIndex + 關鍵字搜尋正常回傳結果
- CLI ✅ status / search / today / help 全部正常輸出
- git ✅ 初始 commit 完成，推上 GitHub

---

## 環境資訊

| 項目 | 值 |
|------|----|
| OS | Windows 11 |
| Shell | Bash (Claude Code) |
| Node | pnpm / bun |
| Python | 3.9+（MAMGA 環境） |
| LM Studio | http://127.0.0.1:1234/v1 |
| 專案路徑 | `C:\claudecode\hmc-memory\` |
| Claude config | `C:\Users\boboi\.claude\` |

---

## 接續工作指令

下次開始工作前，讓 Claude 讀這份文件：

```
請讀 C:\claudecode\hmc-memory\PLAN.md，然後繼續 HMC-Memory 專案的開發。
找到第一個未完成的 Task（[ ]），從那裡開始。
```

---

## 備註

- 壓縮時**保留原始檔**，不刪除，確保資料安全
- 所有壓縮操作失敗時靜默略過，不中斷 session
- `index.json` 採增量更新，不全量重建
- AGPL 授權（參考 claude-mem）或 MIT，待決定
