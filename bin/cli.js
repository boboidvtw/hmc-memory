#!/usr/bin/env node
/**
 * cli.js — HMC-Memory CLI 入口
 * npx @boboidvtw/hmc-memory <command>
 * Created: 2026-04-20
 */

import { install, uninstall, detectPlatform } from '../src/cli/install.js'
import { search, getStats, buildIndex } from '../src/core/search.js'
import { forceCompress } from '../src/core/scheduler.js'
import { todayStats, readToday } from '../src/core/recorder.js'
import { PATHS } from '../src/core/storage.js'

const [,, command, ...args] = process.argv

function parseFlags(args) {
  const flags = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true
      flags[key] = val
    }
  }
  return flags
}

async function main() {
  switch (command) {
    // ─── install ─────────────────────────────────────────
    case 'install': {
      const flags = parseFlags(args)
      await install({
        platform: flags.platform,
        mcp: flags['no-mcp'] !== true,
      })
      break
    }

    // ─── uninstall ────────────────────────────────────────
    case 'uninstall': {
      uninstall()
      break
    }

    // ─── search ──────────────────────────────────────────
    case 'search': {
      const flags = parseFlags(args)
      const query = args.filter(a => !a.startsWith('--')).join(' ')
      if (!query) {
        console.error('用法: hmc-memory search "關鍵字" [--layer daily|chunk|monthly|yearly] [--limit 20]')
        process.exit(1)
      }
      const results = search(query, {
        layer: flags.layer,
        limit: parseInt(flags.limit || '20', 10),
      })
      if (results.length === 0) {
        console.log(`找不到包含「${query}」的記憶`)
        break
      }
      console.log(`\n找到 ${results.length} 筆記憶：\n`)
      for (const r of results) {
        console.log(`📅 [${r.layer}] ${r.date}`)
        for (const ex of r.excerpts) {
          console.log(`   ${ex}`)
        }
        console.log()
      }
      break
    }

    // ─── compress ────────────────────────────────────────
    case 'compress': {
      const flags = parseFlags(args)
      const level = flags.level || args.find(a => !a.startsWith('--')) || 'chunk'
      console.log(`[HMC] 觸發 ${level} 壓縮...`)
      try {
        const result = await forceCompress(level)
        if (result) console.log(`✅ 壓縮完成: ${result}`)
        else console.log('ℹ 沒有可壓縮的內容')
      } catch (err) {
        console.error(`❌ 壓縮失敗: ${err.message}`)
        process.exit(1)
      }
      break
    }

    // ─── status ──────────────────────────────────────────
    case 'status': {
      const stats = getStats()
      const today = todayStats()
      console.log('\n📊 HMC-Memory 狀態\n')
      console.log(`記憶目錄: ${PATHS.root}`)
      console.log(`\n今日記錄: ${today.exists ? `${today.entries} 筆，${(today.size / 1024).toFixed(1)} KB` : '尚無記錄'}`)
      console.log('\n各層統計:')
      for (const [layer, s] of Object.entries(stats)) {
        const sizeKb = (s.size / 1024).toFixed(1)
        console.log(`  ${layer.padEnd(8)} ${s.count} 個檔案  最新: ${s.latest || '無'}  總大小: ${sizeKb} KB`)
      }
      break
    }

    // ─── today ───────────────────────────────────────────
    case 'today': {
      const content = readToday()
      if (!content) {
        console.log('今日尚無記憶記錄')
      } else {
        console.log(content)
      }
      break
    }

    // ─── reindex ─────────────────────────────────────────
    case 'reindex': {
      console.log('[HMC] 重建索引...')
      buildIndex()
      console.log('✅ 索引重建完成')
      break
    }

    // ─── help / default ──────────────────────────────────
    default: {
      console.log(`
HMC-Memory — Hierarchical Memory Compression v0.1.0

用法:
  npx @boboidvtw/hmc-memory <command> [options]

指令:
  install            安裝（自動偵測平台）
  install --platform claude-code|generic
  install --no-mcp   安裝但不設定 MCP server

  uninstall          移除 hooks（保留記憶資料）

  search <keyword>   搜尋記憶
    --layer          過濾層：daily|chunk|monthly|yearly
    --limit          最多回傳筆數（預設 20）

  compress [level]   手動觸發壓縮
    level: chunk | month | year（預設 chunk）

  status             查看各層統計
  today              查看今日記錄
  reindex            重建搜尋索引

範例:
  npx @boboidvtw/hmc-memory install
  npx @boboidvtw/hmc-memory search "MAMGA 架構"
  npx @boboidvtw/hmc-memory compress chunk
  npx @boboidvtw/hmc-memory status
      `)
    }
  }
}

main().catch(err => {
  console.error(`錯誤: ${err.message}`)
  process.exit(1)
})
