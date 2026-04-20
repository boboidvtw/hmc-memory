#!/usr/bin/env node
/**
 * server.js — HMC-Memory MCP Server
 * 透過 MCP 協議暴露記憶工具給 Claude Code 及其他支援 MCP 的平台
 * 啟動: node src/mcp/server.js
 * Created: 2026-04-20
 */

import { recordToday, recordSessionSummary, readToday, todayStats } from '../core/recorder.js'
import { forceCompress } from '../core/scheduler.js'
import { search, getStats, buildIndex } from '../core/search.js'
import { ensureDirectories } from '../core/storage.js'

// MCP stdio transport 實作（不依賴外部 SDK，保持零依賴）
function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result })
  process.stdout.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`)
}

function sendError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })
  process.stdout.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`)
}

function sendNotification(method, params) {
  const msg = JSON.stringify({ jsonrpc: '2.0', method, params })
  process.stdout.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`)
}

// MCP Tools 定義
const TOOLS = [
  {
    name: 'memory_record',
    description: '將一筆對話或筆記寫入今日記憶',
    inputSchema: {
      type: 'object',
      properties: {
        text:     { type: 'string', description: '要記錄的內容' },
        platform: { type: 'string', description: '來源平台，預設 claude-code', default: 'claude-code' },
        role:     { type: 'string', description: 'user | assistant', default: 'assistant' },
      },
      required: ['text'],
    },
  },
  {
    name: 'memory_search',
    description: '搜尋所有層級的記憶（daily / chunk / monthly / yearly）',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '關鍵字，空格分隔為 AND 邏輯' },
        layer: { type: 'string', description: '過濾層：daily | chunk | monthly | yearly' },
        limit: { type: 'number', description: '最多回傳筆數，預設 10', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_today',
    description: '查看今日的記憶記錄',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'memory_compress',
    description: '手動觸發記憶壓縮',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', description: 'chunk | month | year', default: 'chunk' },
      },
    },
  },
  {
    name: 'memory_status',
    description: '查看各層記憶的統計資訊',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
]

// Tool 執行器
async function executeTool(name, args) {
  switch (name) {
    case 'memory_record': {
      const { text, platform = 'claude-code', role = 'assistant' } = args
      if (!text) throw new Error('text 為必填')
      recordToday({ text, platform, role })
      buildIndex()
      return { content: [{ type: 'text', text: `記錄成功 (${platform}/${role})` }] }
    }

    case 'memory_search': {
      const { query, layer, limit = 10 } = args
      if (!query) throw new Error('query 為必填')
      const results = search(query, { layer, limit })
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `找不到包含「${query}」的記憶` }] }
      }
      const formatted = results.map((r, i) =>
        `**${i + 1}. [${r.layer}] ${r.date}**\n${r.excerpts.join('\n')}`
      ).join('\n\n---\n\n')
      return { content: [{ type: 'text', text: `找到 ${results.length} 筆記錄：\n\n${formatted}` }] }
    }

    case 'memory_today': {
      const stats = todayStats()
      if (!stats.exists) {
        return { content: [{ type: 'text', text: '今日尚無記憶記錄' }] }
      }
      const content = readToday()
      return {
        content: [{
          type: 'text',
          text: `今日記錄 (${stats.entries} 筆，${(stats.size / 1024).toFixed(1)} KB):\n\n${content?.slice(0, 3000) || ''}`,
        }],
      }
    }

    case 'memory_compress': {
      const { level = 'chunk' } = args
      try {
        const result = await forceCompress(level)
        return { content: [{ type: 'text', text: result ? `壓縮完成: ${result}` : '沒有可壓縮的內容' }] }
      } catch (err) {
        return { content: [{ type: 'text', text: `壓縮失敗: ${err.message}` }] }
      }
    }

    case 'memory_status': {
      const stats = getStats()
      const lines = Object.entries(stats).map(([layer, s]) =>
        `- **${layer}**: ${s.count} 個檔案，最新: ${s.latest || '無'}`
      )
      return { content: [{ type: 'text', text: `記憶層統計:\n${lines.join('\n')}` }] }
    }

    default:
      throw new Error(`未知的工具: ${name}`)
  }
}

// 讀取 MCP 訊息（Content-Length framing）
async function readMessage() {
  return new Promise((resolve, reject) => {
    let headers = ''
    let contentLength = 0
    let body = ''
    let readingBody = false

    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk) => {
      if (!readingBody) {
        headers += chunk
        const idx = headers.indexOf('\r\n\r\n')
        if (idx !== -1) {
          const headerPart = headers.slice(0, idx)
          const rest = headers.slice(idx + 4)
          const match = headerPart.match(/Content-Length: (\d+)/i)
          if (match) contentLength = parseInt(match[1], 10)
          body = rest
          readingBody = true
        }
      } else {
        body += chunk
      }

      if (readingBody && Buffer.byteLength(body) >= contentLength) {
        try {
          resolve(JSON.parse(body.slice(0, contentLength)))
        } catch (e) {
          reject(e)
        }
      }
    })
    process.stdin.on('error', reject)
  })
}

// MCP Server 主迴圈
async function main() {
  ensureDirectories()

  while (true) {
    let message
    try {
      message = await readMessage()
    } catch {
      break
    }

    const { id, method, params } = message

    try {
      if (method === 'initialize') {
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'hmc-memory', version: '0.1.0' },
        })
      } else if (method === 'tools/list') {
        sendResponse(id, { tools: TOOLS })
      } else if (method === 'tools/call') {
        const result = await executeTool(params.name, params.arguments || {})
        sendResponse(id, result)
      } else if (method === 'notifications/initialized') {
        // 不需要回應
      } else {
        sendError(id, -32601, `Method not found: ${method}`)
      }
    } catch (err) {
      sendError(id, -32603, err.message)
    }
  }
}

main().catch(err => {
  process.stderr.write(`[HMC MCP] 錯誤: ${err.message}\n`)
  process.exit(1)
})
