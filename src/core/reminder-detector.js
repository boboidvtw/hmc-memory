/**
 * reminder-detector.js — HMC-Memory 提醒意圖偵測器
 * 快速掃描對話是否有「提醒/待辦/時間」意圖，再呼叫 LLM 提取結構化資料
 * Created: 2026-04-20
 */

import { compress } from './llm-adapter.js'

// ─── 快速關鍵字掃描（不呼叫 LLM，毫秒級）────────────────────────────────────

const REMINDER_PATTERNS = [
  // 中文時間表達
  /\d+\s*天後/, /\d+\s*小時後/, /\d+\s*週後/, /\d+\s*个月後/, /\d+\s*個月後/,
  /明天/, /後天/, /下週/, /下周/, /下個月/, /下个月/,
  /今晚/, /今天下午/, /今天傍晚/,
  // 中文提醒意圖
  /提醒(我|一下)?/, /記得/, /別忘了/, /不要忘/, /待辦/, /排程/, /預定/, /到時候/,
  // 英文時間表達
  /tomorrow/, /next week/, /next month/, /in \d+ days?/, /in \d+ hours?/,
  // 英文提醒意圖
  /remind (me)?/, /don't forget/, /remember to/, /schedule/, /todo/,
  // 具體日期
  /\d{4}-\d{2}-\d{2}/, /\d{1,2}\/\d{1,2}/, /\d+月\d+日/,
]

/**
 * 快速掃描：文字是否可能包含提醒意圖
 * @param {string} text
 * @returns {boolean}
 */
export function quickScan(text) {
  if (!text) return false
  const lower = text.toLowerCase()
  return REMINDER_PATTERNS.some(p =>
    p instanceof RegExp ? p.test(lower) : lower.includes(p)
  )
}

// ─── LLM 提取（只在 quickScan 為 true 時呼叫）───────────────────────────────

/**
 * 呼叫 LLM 從對話中提取提醒結構化資料
 * @param {object} options
 * @param {string} options.userText
 * @param {string} options.assistantText
 * @param {string} [options.today]  YYYY-MM-DD，預設今天
 * @returns {Promise<ReminderData|null>}
 *
 * @typedef {object} ReminderData
 * @property {string}      taskId       kebab-case 任務 ID
 * @property {string}      description  一句話描述
 * @property {string|null} fireAt       ISO 8601 時間字串，或 null
 * @property {string}      prompt       給排程任務的完整說明
 */
export async function extractReminder({ userText, assistantText, today } = {}) {
  const todayStr = today || new Date().toISOString().split('T')[0]

  const systemPrompt = `你是一個提醒意圖解析器。
今天日期：${todayStr}（台北時間 UTC+8）。

從使用者與 AI 的對話中，判斷是否有**明確的提醒或待辦事項意圖**，並提取以下資訊。

規則：
- 只有對話中有**明確的時間 + 任務**才視為有提醒意圖（hasReminder: true）
- 模糊的「以後再說」「有空再看」不算
- fireAt 必須是未來時間，格式：YYYY-MM-DDTHH:mm:ss+08:00
- 如果只有相對時間（如「3天後」），請換算成絕對時間
- 如果沒有具體時間，fireAt 設為 null
- taskId 使用 kebab-case 英文，最多 5 個詞

只回傳一個 JSON 物件，不要任何其他文字：
{
  "hasReminder": true | false,
  "taskId": "short-task-id",
  "description": "一句話描述這個提醒",
  "fireAt": "2026-04-25T10:00:00+08:00" | null,
  "prompt": "給排程任務的詳細說明（100字以內）"
}`

  const userContent = `User: ${userText || '（無）'}\nAssistant: ${assistantText || '（無）'}`

  try {
    const raw = await compress(systemPrompt, userContent)
    // 嘗試從回應中解析 JSON（有時 LLM 會多包 markdown code block）
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const data = JSON.parse(jsonMatch[0])
    if (!data.hasReminder) return null

    return {
      taskId:      sanitizeTaskId(data.taskId || 'auto-reminder'),
      description: data.description || '自動偵測的提醒事項',
      fireAt:      data.fireAt || null,
      prompt:      data.prompt || data.description || '',
    }
  } catch {
    return null
  }
}

/**
 * 確保 taskId 符合 kebab-case 規範
 */
function sanitizeTaskId(id) {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'auto-reminder'
}
