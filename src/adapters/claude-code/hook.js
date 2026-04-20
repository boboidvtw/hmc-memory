#!/usr/bin/env node
/**
 * hook.js — Claude Code SessionEnd Hook
 * 每次 Claude Code session 結束時自動呼叫，記錄摘要並觸發壓縮排程
 * 使用方式：由 settings.json 的 SessionEnd hook 執行
 * Created: 2026-04-20
 */

import { createRequire } from 'module'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 動態載入核心模組（支援 global install 和 local install）
async function loadCore() {
  try {
    const { recordSessionSummary } = await import('../../core/recorder.js')
    const { checkAndRun } = await import('../../core/scheduler.js')
    const { buildIndex } = await import('../../core/search.js')
    return { recordSessionSummary, checkAndRun, buildIndex }
  } catch {
    return null
  }
}

async function main() {
  // 讀取 Claude Code 傳入的 hook input（stdin JSON）
  let hookInput = ''
  try {
    hookInput = await new Promise((resolve) => {
      let data = ''
      process.stdin.setEncoding('utf-8')
      process.stdin.on('data', chunk => { data += chunk })
      process.stdin.on('end', () => resolve(data))
      // 若 stdin 沒有資料（非 pipe 呼叫）
      setTimeout(() => resolve(data), 500)
    })
  } catch {
    hookInput = ''
  }

  let sessionData = {}
  try {
    sessionData = hookInput ? JSON.parse(hookInput) : {}
  } catch {
    sessionData = {}
  }

  const core = await loadCore()
  if (!core) {
    process.stderr.write('[HMC] 無法載入核心模組，跳過記錄\n')
    process.exit(0)
  }

  const { recordSessionSummary, checkAndRun, buildIndex } = core

  // 嘗試寫入完整 transcript（逐字對話）
  const { recordPair } = await import('../../core/recorder.js')
  const saved = saveTranscript(sessionData, recordPair)

  // 若沒有 transcript，fallback 到摘要
  if (!saved) {
    const summary = extractSummary(sessionData)
    if (summary) {
      recordSessionSummary({ summary, platform: 'claude-code' })
    }
  }

  // 更新搜尋索引
  try {
    buildIndex()
  } catch {
    // 靜默略過
  }

  // 觸發壓縮排程檢查
  await checkAndRun()

  // 輸出原始 input（Claude Code hook 要求）
  if (hookInput) process.stdout.write(hookInput)
}

/**
 * 從 content 欄位取出純文字（string 或 array 都能處理）
 */
function extractText(content) {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .filter(c => c.type === 'text')
      .map(c => c.text || '')
      .join('\n')
      .trim()
  }
  return ''
}

/**
 * 將完整 transcript 寫入 daily 檔（每對話一筆）
 * @param {object} data   hook stdin JSON
 * @param {Function} recordPair
 * @returns {boolean} 是否成功寫入
 */
function saveTranscript(data, recordPair) {
  const transcript = data.transcript || data.messages || []
  if (transcript.length === 0) return false

  // 依序配對 user + assistant，逐對寫入
  let i = 0
  let written = 0
  while (i < transcript.length) {
    const msg = transcript[i]
    if (msg.role === 'user') {
      const userText = extractText(msg.content)
      const next = transcript[i + 1]
      const assistantText = next?.role === 'assistant' ? extractText(next.content) : ''
      if (userText || assistantText) {
        recordPair({ userText, assistantText, platform: 'claude-code' })
        written++
      }
      i += next?.role === 'assistant' ? 2 : 1
    } else {
      i++
    }
  }

  return written > 0
}

/**
 * 從 Claude Code hook input 提取有意義的摘要
 * @param {object} data
 * @returns {string}
 */
function extractSummary(data) {
  // Claude Code SessionEnd hook 可能包含 session_summary 或 transcript
  const parts = []

  if (data.session_id) parts.push(`Session: ${data.session_id}`)
  if (data.project_name || data.project_path) {
    parts.push(`專案: ${data.project_name || path.basename(data.project_path || '')}`)
  }
  if (data.num_turns) parts.push(`對話回合: ${data.num_turns}`)
  if (data.total_tokens) parts.push(`Token 用量: ${data.total_tokens}`)
  if (data.summary) parts.push(`\n${data.summary}`)

  return parts.length > 0 ? parts.join('\n') : ''
}

main().catch(err => {
  process.stderr.write(`[HMC] hook 執行錯誤: ${err.message}\n`)
  process.exit(0)  // 不讓 hook 失敗影響 Claude Code
})
