/**
 * scheduler.js — HMC-Memory 壓縮排程器
 * 在 SessionEnd 時呼叫，判斷是否需要觸發各層壓縮
 * Created: 2026-04-20
 */

import { getConfig, updateConfig, dateStr, listDailyFiles } from './storage.js'
import { compressChunk, compressMonth, compressYear, getRecentDailyFiles } from './compress.js'
import path from 'path'

/**
 * 計算兩個日期字串之間的天數差
 * @param {string} dateA YYYY-MM-DD
 * @param {string} dateB YYYY-MM-DD
 * @returns {number}
 */
function daysBetween(dateA, dateB) {
  const a = new Date(dateA)
  const b = new Date(dateB)
  return Math.floor(Math.abs(b - a) / 86400000)
}

/**
 * 主排程檢查：在 SessionEnd 時呼叫
 * 靜默執行，失敗不中斷 session
 */
export async function checkAndRun() {
  try {
    const config = getConfig()
    const today = dateStr()
    const todayDate = new Date(today)
    const chunkDays = config.chunk_days || 3

    const tasks = []

    // --- Chunk 壓縮：距上次 chunk 壓縮 >= chunkDays 天 ---
    const lastChunk = config.last_chunk_compression
    const daysSinceChunk = lastChunk ? daysBetween(lastChunk, today) : Infinity

    if (daysSinceChunk >= chunkDays) {
      const filesToCompress = getRecentDailyFiles(chunkDays)
      if (filesToCompress.length > 0) {
        tasks.push(async () => {
          const result = await compressChunk(filesToCompress)
          if (result) {
            updateConfig({ last_chunk_compression: today })
            process.stderr.write(`[HMC] chunk 壓縮完成: ${path.basename(result)}\n`)
          }
        })
      }
    }

    // --- Monthly 壓縮：今天是新月份第1天 ---
    const prevMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1)
    const prevYear = prevMonth.getFullYear()
    const prevMonthNum = prevMonth.getMonth() + 1  // 1-12
    const monthKey = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`
    const lastMonth = config.last_month_compression

    if (todayDate.getDate() === 1 && lastMonth !== monthKey) {
      tasks.push(async () => {
        const result = await compressMonth(prevYear, prevMonthNum)
        if (result) {
          updateConfig({ last_month_compression: monthKey })
          process.stderr.write(`[HMC] monthly 壓縮完成: ${path.basename(result)}\n`)
        }
      })
    }

    // --- Yearly 壓縮：今天是新年份第1天 ---
    const prevYearNum = todayDate.getFullYear() - 1
    const lastYear = config.last_year_compression

    if (
      todayDate.getMonth() === 0 &&
      todayDate.getDate() === 1 &&
      String(lastYear) !== String(prevYearNum)
    ) {
      tasks.push(async () => {
        const result = await compressYear(prevYearNum)
        if (result) {
          updateConfig({ last_year_compression: prevYearNum })
          process.stderr.write(`[HMC] yearly 壓縮完成: ${path.basename(result)}\n`)
        }
      })
    }

    // 依序執行（避免 LLM 並發過載）
    for (const task of tasks) {
      await task()
    }
  } catch (err) {
    // 靜默略過，不影響 session 結束
    process.stderr.write(`[HMC] scheduler 錯誤: ${err.message}\n`)
  }
}

/**
 * 手動強制觸發指定層級的壓縮
 * @param {'chunk'|'month'|'year'} level
 * @returns {Promise<string|null>} 輸出檔案路徑
 */
export async function forceCompress(level) {
  const today = new Date()
  const config = getConfig()

  if (level === 'chunk') {
    const chunkDays = config.chunk_days || 3
    const files = getRecentDailyFiles(chunkDays)
    if (files.length === 0) {
      throw new Error('沒有足夠的 daily 檔案可以壓縮')
    }
    const result = await compressChunk(files)
    if (result) updateConfig({ last_chunk_compression: dateStr() })
    return result
  }

  if (level === 'month') {
    const year = today.getFullYear()
    const month = today.getMonth() + 1
    const result = await compressMonth(year, month)
    if (result) {
      const key = `${year}-${String(month).padStart(2, '0')}`
      updateConfig({ last_month_compression: key })
    }
    return result
  }

  if (level === 'year') {
    const year = today.getFullYear()
    const result = await compressYear(year)
    if (result) updateConfig({ last_year_compression: year })
    return result
  }

  throw new Error(`不支援的壓縮層級: ${level}`)
}
