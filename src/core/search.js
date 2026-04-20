/**
 * search.js — HMC-Memory 搜尋引擎
 * 提供跨層關鍵字搜尋與 JSON 索引管理
 * Created: 2026-04-20
 */

import fs from 'fs'
import path from 'path'
import { PATHS, listDailyFiles } from './storage.js'

/**
 * 掃描所有記憶檔案，建立 / 更新 index.json
 * 索引結構：{ updated_at, files: [{ path, layer, date, size, firstLine }] }
 */
export function buildIndex() {
  const layers = {
    daily:   { dir: PATHS.daily,   layer: 'daily' },
    chunks:  { dir: PATHS.chunks,  layer: 'chunk' },
    monthly: { dir: PATHS.monthly, layer: 'monthly' },
    yearly:  { dir: PATHS.yearly,  layer: 'yearly' },
  }

  const files = []

  for (const { dir, layer } of Object.values(layers)) {
    if (!fs.existsSync(dir)) continue
    const entries = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()

    for (const filename of entries) {
      const filePath = path.join(dir, filename)
      const stat = fs.statSync(filePath)
      const firstLine = readFirstMeaningfulLine(filePath)
      files.push({
        path: filePath,
        layer,
        date: filename.replace('.md', ''),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        firstLine,
      })
    }
  }

  const index = { updated_at: new Date().toISOString(), files }
  fs.writeFileSync(PATHS.index, JSON.stringify(index, null, 2), 'utf-8')
  return index
}

/**
 * 讀取第一行有意義的文字（跳過標題和空行）
 * @param {string} filePath
 * @returns {string}
 */
function readFirstMeaningfulLine(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('>') && trimmed !== '---') {
        return trimmed.slice(0, 100)
      }
    }
  } catch {
    // ignore
  }
  return ''
}

/**
 * 搜尋記憶
 * @param {string} query 關鍵字（支援空格分隔多關鍵字，AND 邏輯）
 * @param {object} options
 * @param {string} [options.layer]   過濾層：daily | chunk | monthly | yearly
 * @param {number} [options.limit=20] 最多回傳幾筆
 * @returns {SearchResult[]}
 */
export function search(query, { layer, limit = 20 } = {}) {
  if (!query || !query.trim()) return []

  const keywords = query.trim().toLowerCase().split(/\s+/)
  const results = []

  const layers = layer
    ? [{ dir: PATHS[layer === 'chunk' ? 'chunks' : layer], layerName: layer }]
    : [
        { dir: PATHS.daily,   layerName: 'daily' },
        { dir: PATHS.chunks,  layerName: 'chunk' },
        { dir: PATHS.monthly, layerName: 'monthly' },
        { dir: PATHS.yearly,  layerName: 'yearly' },
      ]

  for (const { dir, layerName } of layers) {
    if (!fs.existsSync(dir)) continue
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse()

    for (const filename of files) {
      const filePath = path.join(dir, filename)
      let content
      try {
        content = fs.readFileSync(filePath, 'utf-8')
      } catch {
        continue
      }

      const lowerContent = content.toLowerCase()
      const matched = keywords.every(kw => lowerContent.includes(kw))
      if (!matched) continue

      const excerpts = extractExcerpts(content, keywords)
      results.push({
        file: filePath,
        layer: layerName,
        date: filename.replace('.md', ''),
        excerpts,
        score: calculateScore(content, keywords),
      })

      if (results.length >= limit * 2) break  // 粗濾後再精排
    }
  }

  // 按分數降序排列，取 limit 筆
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * 從文字中提取包含關鍵字的段落（最多 3 段）
 * @param {string} content
 * @param {string[]} keywords
 * @returns {string[]}
 */
function extractExcerpts(content, keywords) {
  const paragraphs = content.split(/\n{2,}/)
  const excerpts = []

  for (const para of paragraphs) {
    const lowerPara = para.toLowerCase()
    if (keywords.some(kw => lowerPara.includes(kw))) {
      const trimmed = para.trim().replace(/\n/g, ' ').slice(0, 200)
      if (trimmed) excerpts.push(trimmed)
    }
    if (excerpts.length >= 3) break
  }

  return excerpts
}

/**
 * 計算相關性分數（關鍵字出現次數加權）
 * @param {string} content
 * @param {string[]} keywords
 * @returns {number}
 */
function calculateScore(content, keywords) {
  const lower = content.toLowerCase()
  return keywords.reduce((score, kw) => {
    const matches = lower.split(kw).length - 1
    return score + matches
  }, 0)
}

/**
 * 讀取 index（不存在則建立）
 * @returns {object}
 */
export function getIndex() {
  if (!fs.existsSync(PATHS.index)) return buildIndex()
  try {
    return JSON.parse(fs.readFileSync(PATHS.index, 'utf-8'))
  } catch {
    return buildIndex()
  }
}

/**
 * 取得各層統計資訊
 * @returns {object}
 */
export function getStats() {
  const dirs = {
    daily:   PATHS.daily,
    chunks:  PATHS.chunks,
    monthly: PATHS.monthly,
    yearly:  PATHS.yearly,
  }

  const stats = {}
  for (const [layer, dir] of Object.entries(dirs)) {
    if (!fs.existsSync(dir)) {
      stats[layer] = { count: 0, latest: null, size: 0 }
      continue
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()
    const totalSize = files.reduce((sum, f) => {
      try { return sum + fs.statSync(path.join(dir, f)).size } catch { return sum }
    }, 0)
    stats[layer] = {
      count: files.length,
      latest: files[files.length - 1]?.replace('.md', '') || null,
      size: totalSize,
    }
  }
  return stats
}
