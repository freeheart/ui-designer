/**
 * UI Designer — OpenAI-compatible chat completions client.
 *
 * Pure `fetch` + `AbortController`: importable from Node >= 20 (server) and from
 * the browser without polyfills. The API key never leaves the server in normal
 * operation — the browser talks to `/api/chat` only.
 *
 * Contract (server imports these names):
 *   callLLM({ baseUrl, apiKey, model, messages, temperature, maxTokens, signal })
 *     -> { content, usage, model, finishReason, latencyMs }
 */

export const DEFAULT_TIMEOUT_MS = 120_000

export class LLMError extends Error {
  /**
   * @param {string} message human readable (Chinese) message for UI
   * @param {{status?: number, code?: string, url?: string, cause?: unknown}} [meta]
   */
  constructor(message, { status = 0, code = 'error', url = '', cause = null } = {}) {
    super(message)
    this.name = 'LLMError'
    this.status = status
    this.code = code
    this.url = url
    this.cause = cause
  }
}

/** Turn a configured base URL into a chat completions endpoint. */
export function chatCompletionsUrl(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!base) throw new LLMError('未配置模型服务地址（baseUrl），请在设置中填写 OpenAI 兼容地址')
  if (/\/chat\/completions$/i.test(base)) return base
  return `${base}/chat/completions`
}

function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return String(url || '').replace(/^https?:\/\//, '').split('/')[0] || '模型服务'
  }
}

function short(text, max = 280) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function httpDetail(data, rawText) {
  const candidates = [
    data && data.error && typeof data.error === 'object' ? data.error.message : '',
    data && typeof data.error === 'string' ? data.error : '',
    data && typeof data.message === 'string' ? data.message : '',
    rawText,
  ]
  for (const candidate of candidates) {
    const text = short(candidate, 240)
    if (text) return text
  }
  return ''
}

function httpErrorMessage(status, data, rawText, model) {
  const detail = httpDetail(data, rawText)
  const suffix = detail ? `：${detail}` : ''
  if (status === 401 || status === 403) {
    return `模型服务鉴权失败（HTTP ${status}），API Key 无效或无权限，请在设置中检查${suffix}`
  }
  if (status === 404) {
    return `模型接口不存在（HTTP 404），请检查 baseUrl 是否指向兼容 /v1 地址、模型名「${model}」是否正确${suffix}`
  }
  if (status === 400 || status === 422) {
    return `模型服务拒绝了请求（HTTP ${status}），请求参数或消息格式不兼容${suffix}`
  }
  if (status === 429) {
    return `模型服务限流或额度不足（HTTP 429），请稍后再试或检查账户余额${suffix}`
  }
  if (status >= 500) {
    return `模型服务内部错误（HTTP ${status}），请稍后重试或更换模型服务${suffix}`
  }
  return `模型调用失败（HTTP ${status}）${suffix}`
}

/** Extract the assistant text from several OpenAI-compatible response shapes. */
function extractContent(data) {
  if (!data || typeof data !== 'object') return ''
  const choice = Array.isArray(data.choices) ? data.choices[0] : null
  let content =
    (choice && choice.message && choice.message.content) ??
    (choice && typeof choice.text === 'string' ? choice.text : null) ??
    (typeof data.content === 'string' ? data.content : null) ??
    (Array.isArray(data.content) ? data.content : null)
  if (Array.isArray(content)) {
    content = content
      .map(part => (typeof part === 'string' ? part : part && typeof part.text === 'string' ? part.text : ''))
      .join('')
  } else if (content && typeof content === 'object') {
    content = typeof content.text === 'string' ? content.text : typeof content.content === 'string' ? content.content : ''
  }
  return typeof content === 'string' ? content.trim() : ''
}

function extractFinishReason(data) {
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null
  return (choice && (choice.finish_reason || choice.finishReason)) || ''
}

/**
 * Call an OpenAI-compatible `/chat/completions` endpoint.
 *
 * @param {object} options
 * @param {string} options.baseUrl  e.g. https://api.openai.com/v1 (or a full .../chat/completions URL)
 * @param {string} [options.apiKey]
 * @param {string} options.model
 * @param {Array<{role:string,content:string}>} options.messages
 * @param {number} [options.temperature=0.4]
 * @param {number} [options.maxTokens]   sent as `max_tokens` when > 0
 * @param {AbortSignal} [options.signal] external cancellation
 * @param {number} [options.timeoutMs=120000]
 * @returns {Promise<{content:string, usage:object|null, model:string, finishReason:string, latencyMs:number}>}
 */
export async function callLLM({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.4,
  maxTokens,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const url = chatCompletionsUrl(baseUrl)
  if (!model || typeof model !== 'string') throw new LLMError('未配置模型名称（model），请在设置中填写')
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new LLMError('消息列表为空，无法调用模型')
  }

  const controller = new AbortController()
  let timedOut = false
  const timeout = Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)
  if (typeof timer.unref === 'function') timer.unref()

  const forwardAbort = () => controller.abort()
  const externalSignal = signal && typeof signal.addEventListener === 'function' ? signal : null
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', forwardAbort, { once: true })
  }

  const body = { model, messages, temperature, stream: false }
  if (Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0) body.max_tokens = Math.floor(Number(maxTokens))

  const startedAt = Date.now()
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    if (timedOut) {
      throw new LLMError(
        `模型调用超时（${Math.round(timeout / 1000)} 秒），请检查网络，或更换响应更快的模型服务`,
        { code: 'timeout', url, cause: error },
      )
    }
    if (externalSignal && externalSignal.aborted) {
      throw new LLMError('模型调用已取消', { code: 'aborted', url, cause: error })
    }
    throw new LLMError(
      `无法连接模型服务 ${hostOf(url)}，请检查 baseUrl 是否正确、服务是否已启动、网络是否可用`,
      { code: 'network', url, cause: error },
    )
  } finally {
    clearTimeout(timer)
    if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort)
  }

  const latencyMs = Date.now() - startedAt
  const rawText = await response.text().catch(() => '')
  let data = null
  if (rawText) {
    try {
      data = JSON.parse(rawText)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    throw new LLMError(httpErrorMessage(response.status, data, rawText, model), {
      status: response.status,
      code: 'http',
      url,
    })
  }

  const content = extractContent(data)
  if (!content) {
    const finishReason = extractFinishReason(data)
    if (finishReason === 'length') {
      throw new LLMError('模型输出被截断（finish_reason=length），请提高 maxTokens 或简化提示词', {
        status: response.status,
        code: 'truncated',
        url,
      })
    }
    throw new LLMError(`模型返回为空（model=${model}），请检查模型服务是否正常`, {
      status: response.status,
      code: 'empty',
      url,
    })
  }

  return {
    content,
    usage: (data && data.usage) || null,
    model: (data && data.model) || model,
    finishReason: extractFinishReason(data),
    latencyMs,
  }
}
