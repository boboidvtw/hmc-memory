/**
 * webhook.js — Generic HTTP Webhook Adapter
 * 讓任何平台都可以透過 HTTP POST 把對話記錄傳進 HMC
 * 啟動: node src/adapters/generic/webhook.js
 * Created: 2026-04-20
 */

import http from 'http'
import { recordToday, recordSessionSummary } from '../../core/recorder.js'
import { forceCompress } from '../../core/scheduler.js'
import { search, getStats, buildIndex } from '../../core/search.js'

const PORT = parseInt(process.env.HMC_WEBHOOK_PORT || '4821', 10)

/**
 * 解析 request body
 * @param {http.IncomingMessage} req
 * @returns {Promise<object>}
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

/**
 * 送出 JSON 回應
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {object} data
 */
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  // --- POST /record — 記錄一筆對話 ---
  if (req.method === 'POST' && url.pathname === '/record') {
    const body = await parseBody(req)
    const { text, platform = 'generic', role = 'assistant' } = body
    if (!text) return json(res, 400, { error: 'text is required' })
    recordToday({ text, platform, role })
    return json(res, 200, { ok: true })
  }

  // --- POST /session — 記錄 session 摘要 ---
  if (req.method === 'POST' && url.pathname === '/session') {
    const body = await parseBody(req)
    const { summary, platform = 'generic' } = body
    if (!summary) return json(res, 400, { error: 'summary is required' })
    recordSessionSummary({ summary, platform })
    buildIndex()
    return json(res, 200, { ok: true })
  }

  // --- POST /compress — 手動觸發壓縮 ---
  if (req.method === 'POST' && url.pathname === '/compress') {
    const body = await parseBody(req)
    const { level = 'chunk' } = body
    try {
      const result = await forceCompress(level)
      return json(res, 200, { ok: true, file: result })
    } catch (err) {
      return json(res, 500, { error: err.message })
    }
  }

  // --- GET /search?q=keyword ---
  if (req.method === 'GET' && url.pathname === '/search') {
    const query = url.searchParams.get('q') || ''
    const layer = url.searchParams.get('layer') || undefined
    const limit = parseInt(url.searchParams.get('limit') || '10', 10)
    const results = search(query, { layer, limit })
    return json(res, 200, { results })
  }

  // --- GET /status ---
  if (req.method === 'GET' && url.pathname === '/status') {
    const stats = getStats()
    return json(res, 200, { ok: true, stats })
  }

  json(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  process.stderr.write(`[HMC Webhook] 監聽 http://localhost:${PORT}\n`)
  process.stderr.write(`  POST /record   — 記錄對話\n`)
  process.stderr.write(`  POST /session  — 記錄 session 摘要\n`)
  process.stderr.write(`  POST /compress — 觸發壓縮\n`)
  process.stderr.write(`  GET  /search   — 搜尋記憶\n`)
  process.stderr.write(`  GET  /status   — 查統計\n`)
})

export default server
