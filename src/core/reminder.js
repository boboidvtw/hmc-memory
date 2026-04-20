/**
 * reminder.js — HMC-Memory 排程任務建立器
 * 將提取到的提醒資料寫入 Claude Code scheduled-tasks 目錄
 * Created: 2026-04-20
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

const SCHEDULED_TASKS_DIR = path.join(os.homedir(), '.claude', 'scheduled-tasks')

/**
 * 建立 Claude Code 排程任務
 * @param {object} options
 * @param {string}      options.taskId       kebab-case ID
 * @param {string}      options.description  一句話描述
 * @param {string|null} options.fireAt       ISO 8601 時間，或 null
 * @param {string}      options.prompt       任務內容說明
 * @returns {{ success: boolean, path: string, alreadyExists: boolean }}
 */
export function createReminder({ taskId, description, fireAt, prompt }) {
  const taskDir = path.join(SCHEDULED_TASKS_DIR, taskId)

  // 若已存在相同 ID 的任務，加上時間戳避免衝突
  const finalId = fs.existsSync(taskDir)
    ? `${taskId}-${Date.now()}`
    : taskId

  const finalDir = path.join(SCHEDULED_TASKS_DIR, finalId)
  fs.mkdirSync(finalDir, { recursive: true })

  // 組裝 fireAt 行（若有）
  const fireAtLine = fireAt ? `fireAt: "${fireAt}"\n` : ''

  // 組裝自動提醒的完整 prompt
  const fullPrompt = [
    prompt,
    '',
    '---',
    `> 此任務由 HMC-Memory 自動偵測對話中的提醒意圖建立。`,
    fireAt ? `> 預定時間：${fireAt}` : '> （尚未設定具體時間，請在 Scheduled 面板手動調整）',
  ].join('\n')

  const skillContent = [
    '---',
    `name: ${finalId}`,
    `description: ${description}`,
    fireAtLine.trim(),
    '---',
    '',
    fullPrompt,
  ].filter(line => line !== undefined).join('\n')

  const skillPath = path.join(finalDir, 'SKILL.md')
  fs.writeFileSync(skillPath, skillContent, 'utf-8')

  return { success: true, path: skillPath, taskId: finalId }
}

/**
 * 列出所有 HMC 自動建立的提醒任務
 * @returns {Array<{taskId: string, description: string, fireAt: string|null}>}
 */
export function listAutoReminders() {
  if (!fs.existsSync(SCHEDULED_TASKS_DIR)) return []

  return fs.readdirSync(SCHEDULED_TASKS_DIR)
    .filter(name => {
      const skillPath = path.join(SCHEDULED_TASKS_DIR, name, 'SKILL.md')
      if (!fs.existsSync(skillPath)) return false
      const content = fs.readFileSync(skillPath, 'utf-8')
      return content.includes('HMC-Memory 自動偵測')
    })
    .map(name => {
      const skillPath = path.join(SCHEDULED_TASKS_DIR, name, 'SKILL.md')
      const content = fs.readFileSync(skillPath, 'utf-8')
      const descMatch = content.match(/^description:\s*(.+)$/m)
      const fireAtMatch = content.match(/^fireAt:\s*"?([^"\n]+)"?$/m)
      return {
        taskId:      name,
        description: descMatch?.[1] || name,
        fireAt:      fireAtMatch?.[1] || null,
      }
    })
}
