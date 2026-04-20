/**
 * llm-adapter.js — HMC-Memory LLM 後端適配器
 * 支援 LM Studio / Ollama / Claude / OpenAI / 自訂端點
 * Created: 2026-04-20
 */

import { getConfig } from './storage.js'

const BACKENDS = {
  lmstudio: {
    url: () => process.env.HMC_LMSTUDIO_URL || 'http://127.0.0.1:1234/v1',
    model: () => process.env.HMC_LMSTUDIO_MODEL || 'local-model',
    apiKey: () => 'lm-studio',
  },
  ollama: {
    url: () => process.env.HMC_OLLAMA_URL || 'http://127.0.0.1:11434/v1',
    model: () => process.env.HMC_OLLAMA_MODEL || 'llama3',
    apiKey: () => 'ollama',
  },
  openai: {
    url: () => 'https://api.openai.com/v1',
    model: () => process.env.HMC_OPENAI_MODEL || 'gpt-4o-mini',
    apiKey: () => process.env.OPENAI_API_KEY || '',
  },
  claude: {
    url: () => 'https://api.anthropic.com/v1',
    model: () => process.env.HMC_CLAUDE_MODEL || 'claude-haiku-4-5',
    apiKey: () => process.env.ANTHROPIC_API_KEY || '',
  },
  custom: {
    url: () => process.env.HMC_CUSTOM_URL || '',
    model: () => process.env.HMC_CUSTOM_MODEL || 'local-model',
    apiKey: () => process.env.HMC_CUSTOM_API_KEY || 'custom',
  },
}

/**
 * 取得目前設定的 backend
 * @returns {string}
 */
function getBackend() {
  return process.env.HMC_LLM_BACKEND || getConfig().llm_backend || 'lmstudio'
}

/**
 * 呼叫 OpenAI-compatible API 做文字摘要
 * @param {string} systemPrompt
 * @param {string} userContent
 * @param {string} [backendOverride]
 * @returns {Promise<string>}
 */
export async function compress(systemPrompt, userContent, backendOverride) {
  const backend = backendOverride || getBackend()

  if (backend === 'claude') {
    return compressClaude(systemPrompt, userContent)
  }

  const cfg = BACKENDS[backend] || BACKENDS.lmstudio
  const url = `${cfg.url()}/chat/completions`
  const model = cfg.model()
  const apiKey = cfg.apiKey()

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 2048,
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`LLM API error (${backend}): ${response.status} — ${err}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

/**
 * Claude API（非 OpenAI-compatible，需要單獨處理）
 * @param {string} systemPrompt
 * @param {string} userContent
 * @returns {Promise<string>}
 */
async function compressClaude(systemPrompt, userContent) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const model = process.env.HMC_CLAUDE_MODEL || 'claude-haiku-4-5'

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API error: ${response.status} — ${err}`)
  }

  const data = await response.json()
  return data.content?.[0]?.text?.trim() || ''
}

/**
 * 自動偵測可用的 LLM 後端（按優先順序試）
 * @returns {Promise<string>} 可用的 backend 名稱
 */
export async function detectAvailableBackend() {
  const order = ['lmstudio', 'ollama', 'openai', 'claude']

  for (const backend of order) {
    try {
      const cfg = BACKENDS[backend]
      if (!cfg) continue

      if (backend === 'openai' && !process.env.OPENAI_API_KEY) continue
      if (backend === 'claude' && !process.env.ANTHROPIC_API_KEY) continue

      // 對本地 backend 做 ping
      if (backend === 'lmstudio' || backend === 'ollama') {
        const url = `${cfg.url()}/models`
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
        if (res.ok) return backend
      } else {
        return backend
      }
    } catch {
      // 繼續嘗試下一個
    }
  }

  return 'lmstudio' // fallback
}
