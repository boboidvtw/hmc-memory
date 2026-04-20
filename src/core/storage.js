/**
 * storage.js — HMC-Memory 儲存層
 * 負責目錄結構建立、config 讀寫、路徑管理
 * Created: 2026-04-20
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

// 解析 ~/.hmc 路徑（支援 Windows / Unix）
function resolveHmcDir() {
  const envDir = process.env.HMC_DIR
  if (envDir) {
    return envDir.startsWith('~')
      ? path.join(os.homedir(), envDir.slice(1))
      : envDir
  }
  return path.join(os.homedir(), '.hmc')
}

export const HMC_DIR = resolveHmcDir()

export const PATHS = {
  root:    HMC_DIR,
  daily:   path.join(HMC_DIR, 'daily'),
  chunks:  path.join(HMC_DIR, 'chunks'),
  monthly: path.join(HMC_DIR, 'monthly'),
  yearly:  path.join(HMC_DIR, 'yearly'),
  index:   path.join(HMC_DIR, 'index.json'),
  config:  path.join(HMC_DIR, 'config.json'),
}

const DEFAULT_CONFIG = {
  version: '0.1.0',
  llm_backend: process.env.HMC_LLM_BACKEND || 'lmstudio',
  chunk_days: parseInt(process.env.HMC_CHUNK_DAYS || '3', 10),
  last_chunk_compression: null,
  last_month_compression: null,
  last_year_compression:  null,
  created_at: new Date().toISOString(),
}

/**
 * 確保所有必要目錄存在
 */
export function ensureDirectories() {
  for (const dirPath of [
    PATHS.root,
    PATHS.daily,
    PATHS.chunks,
    PATHS.monthly,
    PATHS.yearly,
  ]) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }
}

/**
 * 讀取 config，不存在時寫入預設值
 * @returns {object}
 */
export function getConfig() {
  ensureDirectories()
  if (!fs.existsSync(PATHS.config)) {
    saveConfig(DEFAULT_CONFIG)
    return { ...DEFAULT_CONFIG }
  }
  try {
    return JSON.parse(fs.readFileSync(PATHS.config, 'utf-8'))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * 寫入 config
 * @param {object} config
 */
export function saveConfig(config) {
  ensureDirectories()
  fs.writeFileSync(PATHS.config, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * 更新 config 的部分欄位
 * @param {object} partial
 */
export function updateConfig(partial) {
  const current = getConfig()
  saveConfig({ ...current, ...partial })
}

/**
 * 取得日期字串 YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
export function dateStr(date = new Date()) {
  return date.toISOString().split('T')[0]
}

/**
 * 取得今日 daily 檔案路徑
 * @returns {string}
 */
export function todayFilePath() {
  return path.join(PATHS.daily, `${dateStr()}.md`)
}

/**
 * 取得指定日期的 daily 檔案路徑
 * @param {string} date YYYY-MM-DD
 * @returns {string}
 */
export function dailyFilePath(date) {
  return path.join(PATHS.daily, `${date}.md`)
}

/**
 * 取得 chunk 檔案路徑
 * @param {string} startDate YYYY-MM-DD
 * @param {string} endDate YYYY-MM-DD
 * @returns {string}
 */
export function chunkFilePath(startDate, endDate) {
  return path.join(PATHS.chunks, `${startDate}_to_${endDate}.md`)
}

/**
 * 取得 monthly 檔案路徑
 * @param {number} year
 * @param {number} month 1-12
 * @returns {string}
 */
export function monthlyFilePath(year, month) {
  const mm = String(month).padStart(2, '0')
  return path.join(PATHS.monthly, `${year}-${mm}.md`)
}

/**
 * 取得 yearly 檔案路徑
 * @param {number} year
 * @returns {string}
 */
export function yearlyFilePath(year) {
  return path.join(PATHS.yearly, `${year}.md`)
}

/**
 * 列出 daily 目錄所有檔案，按日期排序
 * @returns {string[]} 檔案路徑陣列
 */
export function listDailyFiles() {
  if (!fs.existsSync(PATHS.daily)) return []
  return fs.readdirSync(PATHS.daily)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .map(f => path.join(PATHS.daily, f))
}

/**
 * 列出指定月份的 daily 檔案
 * @param {number} year
 * @param {number} month 1-12
 * @returns {string[]}
 */
export function listDailyFilesForMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return listDailyFiles().filter(f => path.basename(f).startsWith(prefix))
}

/**
 * 列出指定年份的 monthly 檔案
 * @param {number} year
 * @returns {string[]}
 */
export function listMonthlyFilesForYear(year) {
  if (!fs.existsSync(PATHS.monthly)) return []
  return fs.readdirSync(PATHS.monthly)
    .filter(f => f.startsWith(`${year}-`) && f.endsWith('.md'))
    .sort()
    .map(f => path.join(PATHS.monthly, f))
}
