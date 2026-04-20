#!/usr/bin/env node
/**
 * turn-recorder.js — Claude Code Stop Hook
 * 每回合 assistant 回應後觸發，儲存最新一組 user/assistant 對話
 * Created: 2026-04-20
 */

import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function loadCore() {
  try {
    const { recordPair } = await import('../../core/recorder.js')
    const { buildIndex } = await import('../../core/search.js')
    return { recordPair, buildIndex }
  } catch {
    return null
  }
}

/**
 * 從 content 欄位取出純文字
 * Claude 的 content 可以是 string 或 array（含 tool_use 等）
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

async function main() {
  let raw = ''
  try {
    raw = await new Promise((resolve) => {
      let data = ''
      process.stdin.setEncoding('utf-8')
      process.stdin.on('data', chunk => { data += chunk })
      process.stdin.on('end', () => resolve(data))
      setTimeout(() => resolve(data), 500)
    })
  } catch {
    raw = ''
  }

  // 一定要把原始 input 輸出，否則 Claude Code 會認為 hook 失敗
  if (raw) process.stdout.write(raw)

  let data = {}
  try { data = raw ? JSON.parse(raw) : {} } catch { data = {} }

  const transcript = data.transcript || data.messages || []
  if (transcript.length === 0) process.exit(0)

  const core = await loadCore()
  if (!core) process.exit(0)

  const { recordPair, buildIndex } = core

  // 只取最後一組 user + assistant（避免重複寫入整段歷史）
  // 從後往前找最後一條 assistant，再往前找配對的 user
  let assistantMsg = null
  let userMsg = null

  for (let i = transcript.length - 1; i >= 0; i--) {
    const msg = transcript[i]
    if (!assistantMsg && msg.role === 'assistant') {
      assistantMsg = extractText(msg.content)
    } else if (assistantMsg && !userMsg && msg.role === 'user') {
      userMsg = extractText(msg.content)
      break
    }
  }

  if (!assistantMsg && !userMsg) process.exit(0)

  const userText      = userMsg      || ''
  const assistantText = assistantMsg || ''

  recordPair({ userText, assistantText, platform: 'claude-code' })

  try { buildIndex() } catch { /* 靜默 */ }

  // ── 提醒意圖自動偵測 ──────────────────────────────────────────────────────
  try {
    const { quickScan, extractReminder } = await import('../../core/reminder-detector.js')
    const { createReminder }             = await import('../../core/reminder.js')

    const combined = `${userText} ${assistantText}`
    if (quickScan(combined)) {
      const reminder = await extractReminder({ userText, assistantText })
      if (reminder) {
        const result = createReminder(reminder)
        process.stderr.write(
          `[HMC] 自動建立提醒: ${reminder.description} → ${result.taskId}\n`
        )
      }
    }
  } catch { /* 提醒偵測失敗不影響主流程 */ }
}

main().catch(() => process.exit(0))
