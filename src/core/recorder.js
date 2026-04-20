/**
 * recorder.js — HMC-Memory 每日記錄器
 * 負責將對話內容寫入 daily/*.md
 * Created: 2026-04-20
 */

import fs from 'fs'
import { ensureDirectories, todayFilePath, dailyFilePath, dateStr } from './storage.js'

/**
 * 格式化時間 HH:mm
 * @param {Date} date
 * @returns {string}
 */
function timeStr(date = new Date()) {
  return date.toTimeString().slice(0, 5)
}

/**
 * 確保今日檔案存在，若不存在則建立含標頭的空檔
 * @returns {string} 檔案路徑
 */
function ensureTodayFile() {
  ensureDirectories()
  const filePath = todayFilePath()
  if (!fs.existsSync(filePath)) {
    const today = dateStr()
    const header = `# ${today}\n\n> 自動記錄 by HMC-Memory\n\n---\n\n`
    fs.writeFileSync(filePath, header, 'utf-8')
  }
  return filePath
}

/**
 * 將一筆對話記錄寫入今日 daily 檔案
 * @param {object} options
 * @param {string} options.text      對話內容
 * @param {string} [options.platform='unknown']  來源平台
 * @param {string} [options.role='assistant']    角色 user | assistant
 * @param {Date}   [options.timestamp]           時間戳記
 */
export function recordToday({ text, platform = 'unknown', role = 'assistant', timestamp } = {}) {
  if (!text || !text.trim()) return

  const filePath = ensureTodayFile()
  const now = timestamp instanceof Date ? timestamp : new Date()
  const time = timeStr(now)

  const roleLabel = role === 'user' ? '👤 User' : '🤖 Assistant'
  const platformTag = platform !== 'unknown' ? ` \`[${platform}]\`` : ''

  const entry = [
    `## ${time}${platformTag}`,
    `**${roleLabel}**`,
    '',
    text.trim(),
    '',
    '---',
    '',
  ].join('\n')

  fs.appendFileSync(filePath, entry, 'utf-8')
}

/**
 * 記錄一組對話（user + assistant pair）
 * @param {object} options
 * @param {string} options.userText
 * @param {string} options.assistantText
 * @param {string} [options.platform]
 */
export function recordPair({ userText, assistantText, platform = 'unknown' } = {}) {
  const now = new Date()
  if (userText) {
    recordToday({ text: userText, platform, role: 'user', timestamp: now })
  }
  if (assistantText) {
    recordToday({ text: assistantText, platform, role: 'assistant', timestamp: now })
  }
}

/**
 * 記錄一段 session 摘要（由 hook 呼叫）
 * @param {object} options
 * @param {string} options.summary   摘要文字
 * @param {string} [options.platform]
 */
export function recordSessionSummary({ summary, platform = 'claude-code' } = {}) {
  if (!summary || !summary.trim()) return

  ensureDirectories()
  const filePath = ensureTodayFile()
  const now = new Date()
  const time = timeStr(now)

  const entry = [
    `## ${time} 📋 Session Summary \`[${platform}]\``,
    '',
    summary.trim(),
    '',
    '---',
    '',
  ].join('\n')

  fs.appendFileSync(filePath, entry, 'utf-8')
}

/**
 * 讀取今日 daily 檔案內容
 * @returns {string|null}
 */
export function readToday() {
  const filePath = todayFilePath()
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, 'utf-8')
}

/**
 * 讀取指定日期的 daily 檔案內容
 * @param {string} date YYYY-MM-DD
 * @returns {string|null}
 */
export function readDaily(date) {
  const filePath = dailyFilePath(date)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, 'utf-8')
}

/**
 * 取得今日記錄統計
 * @returns {{ exists: boolean, size: number, entries: number }}
 */
export function todayStats() {
  const filePath = todayFilePath()
  if (!fs.existsSync(filePath)) {
    return { exists: false, size: 0, entries: 0 }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const entries = (content.match(/^## \d{2}:\d{2}/gm) || []).length
  return {
    exists: true,
    size: Buffer.byteLength(content, 'utf-8'),
    entries,
  }
}
