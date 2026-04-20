/**
 * install.js — HMC-Memory 安裝器
 * 負責建立目錄結構、注入 hooks 到 settings.json、設定 MCP server
 * Created: 2026-04-20
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { ensureDirectories, PATHS } from '../core/storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const HOOK_SCRIPT = path.join(__dirname, '../adapters/claude-code/hook.js')
const MCP_SERVER  = path.join(__dirname, '../mcp/server.js')

/**
 * 偵測平台
 * @returns {'claude-code'|'generic'}
 */
export function detectPlatform() {
  const claudeConfig = path.join(os.homedir(), '.claude', 'settings.json')
  if (fs.existsSync(claudeConfig)) return 'claude-code'
  return 'generic'
}

/**
 * 安裝主流程
 * @param {object} options
 * @param {string} [options.platform]  強制指定平台
 * @param {boolean} [options.mcp]      是否安裝 MCP server
 */
export async function install({ platform, mcp = true } = {}) {
  const detectedPlatform = platform || detectPlatform()
  console.log(`[HMC] 安裝平台: ${detectedPlatform}`)

  // 1. 建立 ~/.hmc 目錄結構
  ensureDirectories()
  console.log(`[HMC] ✓ 建立目錄: ${PATHS.root}`)

  // 2. 複製 .env.example
  const envExample = path.join(__dirname, '../../.env.example')
  const envTarget = path.join(PATHS.root, '.env.example')
  if (fs.existsSync(envExample) && !fs.existsSync(envTarget)) {
    fs.copyFileSync(envExample, envTarget)
    console.log(`[HMC] ✓ 建立設定範本: ${envTarget}`)
  }

  // 3. 平台特定安裝
  if (detectedPlatform === 'claude-code') {
    installClaudeCode(mcp)
  } else {
    installGeneric()
  }

  console.log('\n[HMC] ✅ 安裝完成！')
  console.log(`\n記憶目錄: ${PATHS.root}`)
  if (detectedPlatform === 'claude-code') {
    console.log('Session 結束時會自動記錄對話並觸發壓縮。')
  } else {
    console.log(`Webhook server 啟動: node ${path.join(__dirname, '../adapters/generic/webhook.js')}`)
  }
}

/**
 * 安裝 Claude Code adapter
 * @param {boolean} installMcp
 */
function installClaudeCode(installMcp) {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  let settings = {}

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      settings = {}
    }
  }

  // 確保 hooks 結構存在
  if (!settings.hooks) settings.hooks = {}
  if (!settings.hooks.SessionEnd) settings.hooks.SessionEnd = []

  // 注入 SessionEnd hook（避免重複）
  const hookCmd = `node "${HOOK_SCRIPT}"`
  const alreadyInstalled = settings.hooks.SessionEnd.some(h =>
    h.hooks?.some(hh => hh.command?.includes('hmc-memory'))
  )

  if (!alreadyInstalled) {
    settings.hooks.SessionEnd.push({
      matcher: '*',
      hooks: [{
        type: 'command',
        command: hookCmd,
      }],
      description: 'HMC-Memory: 記錄對話並觸發壓縮排程',
    })
    console.log('[HMC] ✓ 注入 SessionEnd hook')
  } else {
    console.log('[HMC] ℹ SessionEnd hook 已存在，跳過')
  }

  // 注入 MCP server
  if (installMcp) {
    if (!settings.mcpServers) settings.mcpServers = {}
    if (!settings.mcpServers['hmc-memory']) {
      settings.mcpServers['hmc-memory'] = {
        command: 'node',
        args: [MCP_SERVER],
        env: {},
      }
      console.log('[HMC] ✓ 注入 MCP server 設定')
    } else {
      console.log('[HMC] ℹ MCP server 已設定，跳過')
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  console.log(`[HMC] ✓ 更新 ${settingsPath}`)
}

/**
 * 安裝 Generic adapter（產生說明文件）
 */
function installGeneric() {
  const webhookScript = path.join(__dirname, '../adapters/generic/webhook.js')
  console.log('[HMC] Generic adapter 安裝完成')
  console.log(`\n啟動 webhook server：`)
  console.log(`  node "${webhookScript}"`)
  console.log('\n其他平台可用 curl 傳送對話：')
  console.log(`  curl -X POST http://localhost:4821/record \\`)
  console.log(`       -H 'Content-Type: application/json' \\`)
  console.log(`       -d '{"text":"對話內容","platform":"my-ai","role":"assistant"}'`)
}

/**
 * 解除安裝（移除 hooks，保留資料）
 */
export function uninstall() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  if (!fs.existsSync(settingsPath)) {
    console.log('[HMC] 找不到 settings.json，跳過')
    return
  }

  let settings = {}
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    return
  }

  // 移除 SessionEnd hook
  if (settings.hooks?.SessionEnd) {
    settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(h =>
      !h.hooks?.some(hh => hh.command?.includes('hmc-memory'))
    )
    if (settings.hooks.SessionEnd.length === 0) delete settings.hooks.SessionEnd
  }

  // 移除 MCP server
  if (settings.mcpServers?.['hmc-memory']) {
    delete settings.mcpServers['hmc-memory']
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  console.log('[HMC] ✅ 已移除 hooks 和 MCP 設定（記憶資料保留）')
  console.log(`[HMC] 記憶資料位於: ${PATHS.root}`)
}
