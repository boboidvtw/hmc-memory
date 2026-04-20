/**
 * env.js — 純 Node.js .env 載入器（零依賴）
 * 取代 dotenv，只用內建 fs / path / os
 * Created: 2026-04-20
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * 解析 .env 檔案內容為 key/value 物件
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseEnv(content) {
  const result = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let val = trimmed.slice(eqIndex + 1).trim()
    // 移除引號
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    result[key] = val
  }
  return result
}

/**
 * 載入 .env 檔案（不覆蓋已存在的環境變數）
 * 搜尋順序：當前目錄 → ~/.hmc/.env → 套件根目錄
 */
export function loadEnv() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(os.homedir(), '.hmc', '.env'),
    path.join(os.homedir(), '.hmc', '.env.local'),
  ]

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue
    try {
      const content = fs.readFileSync(envPath, 'utf-8')
      const parsed = parseEnv(content)
      for (const [key, val] of Object.entries(parsed)) {
        if (!(key in process.env)) {
          process.env[key] = val
        }
      }
    } catch {
      // 靜默略過
    }
  }
}
