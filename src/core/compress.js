/**
 * compress.js — HMC-Memory 階層式壓縮引擎
 * 負責 daily→chunk、chunk→monthly、monthly→yearly 的壓縮
 * Created: 2026-04-20
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  PATHS,
  listDailyFiles,
  listDailyFilesForMonth,
  listMonthlyFilesForYear,
  chunkFilePath,
  monthlyFilePath,
  yearlyFilePath,
  dateStr,
} from './storage.js'
import { compress as llmCompress } from './llm-adapter.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = path.join(__dirname, '../../templates')

/**
 * 讀取 prompt 模板
 * @param {string} name 模板檔名（不含副檔名）
 * @returns {string}
 */
function loadTemplate(name) {
  const filePath = path.join(TEMPLATES_DIR, `${name}.md`)
  if (!fs.existsSync(filePath)) return ''
  return fs.readFileSync(filePath, 'utf-8')
}

/**
 * 讀取多個檔案並合併內容
 * @param {string[]} filePaths
 * @returns {string}
 */
function mergeFiles(filePaths) {
  return filePaths
    .filter(f => fs.existsSync(f))
    .map(f => fs.readFileSync(f, 'utf-8'))
    .join('\n\n---\n\n')
}

/**
 * 壓縮指定範圍的 daily files → chunk
 * @param {string[]} dailyFiles  完整路徑陣列
 * @returns {Promise<string|null>} 輸出的 chunk 檔案路徑
 */
export async function compressChunk(dailyFiles) {
  if (!dailyFiles || dailyFiles.length === 0) return null

  const existing = dailyFiles.filter(f => fs.existsSync(f))
  if (existing.length === 0) return null

  const basenames = existing.map(f => path.basename(f, '.md'))
  const startDate = basenames[0]
  const endDate = basenames[basenames.length - 1]
  const outputPath = chunkFilePath(startDate, endDate)

  if (fs.existsSync(outputPath)) return outputPath  // 已壓縮過

  const merged = mergeFiles(existing)
  if (!merged.trim()) return null

  const systemPrompt = loadTemplate('compress-chunk')
    .replace('{start_date}', startDate)
    .replace('{end_date}', endDate)

  try {
    const summary = await llmCompress(systemPrompt, merged)
    const header = `# Chunk 摘要：${startDate} ~ ${endDate}\n\n> 自動壓縮 by HMC-Memory | 原始檔：${existing.length} 個\n\n---\n\n`
    fs.writeFileSync(outputPath, header + summary, 'utf-8')
    return outputPath
  } catch (err) {
    process.stderr.write(`[HMC] chunk 壓縮失敗 (${startDate}~${endDate}): ${err.message}\n`)
    return null
  }
}

/**
 * 壓縮指定月份的所有 daily 檔案 → monthly
 * @param {number} year
 * @param {number} month 1-12
 * @returns {Promise<string|null>}
 */
export async function compressMonth(year, month) {
  const dailyFiles = listDailyFilesForMonth(year, month)
  if (dailyFiles.length === 0) return null

  const outputPath = monthlyFilePath(year, month)
  if (fs.existsSync(outputPath)) return outputPath

  const merged = mergeFiles(dailyFiles)
  if (!merged.trim()) return null

  const mm = String(month).padStart(2, '0')
  const systemPrompt = loadTemplate('compress-month')
    .replace('{year}', year)
    .replace('{month}', mm)

  try {
    const summary = await llmCompress(systemPrompt, merged)
    const header = `# ${year} 年 ${mm} 月 月度摘要\n\n> 自動壓縮 by HMC-Memory | 原始 daily 檔：${dailyFiles.length} 個\n\n---\n\n`
    fs.writeFileSync(outputPath, header + summary, 'utf-8')
    return outputPath
  } catch (err) {
    process.stderr.write(`[HMC] monthly 壓縮失敗 (${year}-${mm}): ${err.message}\n`)
    return null
  }
}

/**
 * 壓縮指定年份的所有 monthly 檔案 → yearly
 * @param {number} year
 * @returns {Promise<string|null>}
 */
export async function compressYear(year) {
  const monthlyFiles = listMonthlyFilesForYear(year)
  if (monthlyFiles.length === 0) return null

  const outputPath = yearlyFilePath(year)
  if (fs.existsSync(outputPath)) return outputPath

  const merged = mergeFiles(monthlyFiles)
  if (!merged.trim()) return null

  const systemPrompt = loadTemplate('compress-year').replace('{year}', year)

  try {
    const summary = await llmCompress(systemPrompt, merged)
    const header = `# ${year} 年 年度摘要\n\n> 自動壓縮 by HMC-Memory | 月度摘要：${monthlyFiles.length} 個\n\n---\n\n`
    fs.writeFileSync(outputPath, header + summary, 'utf-8')
    return outputPath
  } catch (err) {
    process.stderr.write(`[HMC] yearly 壓縮失敗 (${year}): ${err.message}\n`)
    return null
  }
}

/**
 * 取得最近 N 天的 daily files（不含今天）
 * @param {number} days
 * @returns {string[]}
 */
export function getRecentDailyFiles(days) {
  const today = dateStr()
  return listDailyFiles()
    .filter(f => path.basename(f, '.md') < today)
    .slice(-days)
}
