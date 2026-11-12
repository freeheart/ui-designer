#!/usr/bin/env node
/**
 * UI Designer — local design server.
 *
 * Serves the editor (assets/designer) and owns design.json writes:
 *   GET  /api/state      PUT /api/state
 *   POST /api/ops        POST /api/chat
 *   GET  /api/config     PUT /api/config
 *   POST /api/export     GET  /api/queue
 *   GET  /api/events     (SSE)
 *
 * Zero dependencies. Usage:
 *   node server.mjs --design designs/home/design.json [--port 4173] [--open]
 *
 * AI channels:
 *   api   — OpenAI-compatible endpoint configured in env / config files
 *   agent — writes a request for the coding agent into <designDir>/.ai/inbox
 */

import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { promises as fsp, watch } from 'node:fs'
import { createReadStream } from 'node:fs'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  applyOps,
  assertSpec,
  compactSpec,
  summarizeSpec,
  tokensForPrompt,
  validateSpec,
  OpsError,
} from './designer-core.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ASSET_ROOT = path.resolve(HERE, '..', 'assets', 'designer')

/* ------------------------------------------------------------------ */
/* args & config                                                       */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = { port: 4173, open: false, host: '127.0.0.1' }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = () => argv[++i]
    switch (token) {
      case '--design': args.design = next(); break
      case '--port': args.port = Number(next()) || 4173; break
      case '--host': args.host = next(); break
      case '--open': args.open = true; break
      case '--help':
      case '-h': args.help = true; break
      default:
        if (token.startsWith('--design=')) args.design = token.slice(9)
        else if (token.startsWith('--port=')) args.port = Number(token.slice(7)) || 4173
        else if (!token.startsWith('-') && !args.design) args.design = token
    }
  }
  return args
}

const ENV_KEYS = {
  baseUrl: ['UI_DESIGNER_BASE_URL', 'UI_DESIGNER_API_BASE'],
  apiKey: ['UI_DESIGNER_API_KEY', 'UI_DESIGNER_KEY'],
  model: ['UI_DESIGNER_MODEL'],
  mode: ['UI_DESIGNER_MODE'],
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

function dshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  return path.join(os.homedir(), '.dsh')
}

function userConfigPath() {
  return path.join(dshHome(), 'ui-designer.json')
}

function projectConfigPath() {
  return path.join(process.cwd(), '.dsh', 'ui-designer.json')
}

function designConfigPath(designDir) {
  return path.join(designDir, 'designer.config.json')
}

const CONFIG_KEYS = ['baseUrl', 'apiKey', 'model', 'mode', 'temperature', 'maxTokens', 'timeoutMs']
const AI_MODES = new Set(['auto', 'api', 'agent'])

function normalizeConfig(raw, source) {
  const out = { source }
  if (!raw || typeof raw !== 'object') return out
  for (const key of CONFIG_KEYS) {
    if (raw[key] === undefined || raw[key] === null) continue
    out[key] = raw[key]
  }
  if (out.mode && !AI_MODES.has(out.mode)) out.mode = 'auto'
  return out
}

async function resolveConfig(designDir) {
  const layers = []
  const user = normalizeConfig(await readJson(userConfigPath()), 'user')
  const project = normalizeConfig(await readJson(projectConfigPath()), 'project')
  const design = normalizeConfig(await readJson(designConfigPath(designDir)), 'design')
  layers.push({ source: 'defaults', mode: 'auto' })
  for (const layer of [user, project, design]) layers.push(layer)
  const merged = { mode: 'auto' }
  for (const layer of layers) {
    for (const key of CONFIG_KEYS) {
      if (layer[key] !== undefined) merged[key] = layer[key]
    }
  }
  // env overrides everything
  for (const [key, names] of Object.entries(ENV_KEYS)) {
    for (const name of names) {
      if (process.env[name] !== undefined && process.env[name] !== '') {
        merged[key] = process.env[name]
        break
      }
    }
  }
  if (!AI_MODES.has(merged.mode)) merged.mode = 'auto'
  merged.baseUrl = (merged.baseUrl || '').replace(/\/+$/, '')
  merged.model = merged.model || ''
  merged.temperature = merged.temperature === undefined ? 0.4 : Number(merged.temperature)
  merged.maxTokens = merged.maxTokens === undefined ? 4000 : Number(merged.maxTokens)
  merged.timeoutMs = merged.timeoutMs === undefined ? 120000 : Number(merged.timeoutMs)
  merged.configured = Boolean(merged.baseUrl && merged.model && merged.apiKey)
  return merged
}

function publicConfig(config) {
  return {
    mode: config.mode,
    configured: config.configured,
    model: config.model || '',
    baseUrl: config.baseUrl || '',
    hasKey: Boolean(config.apiKey),
    channel: resolvedChannel(config),
  }
}

function resolvedChannel(config) {
  if (config.mode === 'agent') return 'agent'
  if (config.mode === 'api') return 'api'
  return config.configured ? 'api' : 'agent'
}

/* ------------------------------------------------------------------ */
/* server state                                                        */
/* ------------------------------------------------------------------ */

const options = parseArgs(process.argv.slice(2))
if (options.help || !options.design) {
  console.log(`UI Designer server

用法:
  node server.mjs --design <design.json> [--port 4173] [--open]

选项:
  --design <path>   design.json 路径（必填）
  --port <n>        端口，默认 4173
  --host <host>     默认 127.0.0.1
  --open            启动后用默认浏览器打开
`)
  process.exit(options.help ? 0 : 1)
}

const designPath = path.resolve(options.design)
const designFileName = path.basename(designPath)
const designDir = path.dirname(designPath)
const aiDir = path.join(designDir, '.ai')
const inboxDir = path.join(aiDir, 'inbox')
const outboxDir = path.join(aiDir, 'outbox')
const exportDir = path.join(designDir, 'export')

const runtime = {
  spec: null,
  revision: 0,
  lastWrittenJson: '',
  config: null,
  sseClients: new Set(),
  watcher: null,
  debounceTimer: 0,
  outboxSeen: new Map(),
  lastErrors: [],
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

function json(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function fail(res, status, message, extra = {}) {
  json(res, status, { ok: false, error: message, ...extra })
}

async function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve(null)
      const text = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of runtime.sseClients) {
    try {
      client.write(payload)
    } catch {
      runtime.sseClients.delete(client)
    }
  }
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

async function writeSpecFile(spec) {
  assertSpec(spec)
  const text = `${JSON.stringify(spec, null, 2)}\n`
  const tmp = `${designPath}.${process.pid}.${Date.now()}.tmp`
  await fsp.writeFile(tmp, text, 'utf8')
  await fsp.rename(tmp, designPath)
  runtime.spec = spec
  runtime.lastWrittenJson = text
  runtime.revision += 1
  return spec
}

async function loadSpec() {
  const raw = await fsp.readFile(designPath, 'utf8')
  const spec = JSON.parse(raw)
  assertSpec(spec)
  runtime.spec = spec
  runtime.lastWrittenJson = JSON.stringify(spec, null, 2) + '\n'
  return spec
}

function aiRequestDirInfo() {
  return { aiDir, inboxDir, outboxDir }
}

async function listPending() {
  const entries = await fsp.readdir(inboxDir).catch(() => [])
  const outbox = await fsp.readdir(outboxDir).catch(() => [])
  const replied = new Set(outbox.map(name => name.replace(/\.json$/, '')))
  const pending = []
  for (const name of entries) {
    if (!name.endsWith('.json')) continue
    const id = name.replace(/\.json$/, '')
    if (replied.has(id)) continue
    const data = await readJson(path.join(inboxDir, name))
    if (data) pending.push(data)
  }
  return pending.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

/* ------------------------------------------------------------------ */
/* AI chat                                                             */
/* ------------------------------------------------------------------ */

async function importLlm() {
  const llm = await import('../assets/designer/js/llm.mjs')
  const prompts = await import('../assets/designer/js/prompts.mjs')
  return { ...llm, ...prompts }
}

function normalizeMode(mode) {
  return ['apply', 'critique', 'polish'].includes(mode) ? mode : 'apply'
}

async function runChat({ mode, message, selection, history, channel }) {
  const config = runtime.config
  const resolved = channel === 'auto' || !channel ? resolvedChannel(config) : channel
  const requestMode = normalizeMode(mode)

  if (resolved === 'agent') {
    const requestId = `req-${randomBytes(4).toString('hex')}`
    const request = {
      id: requestId,
      createdAt: new Date().toISOString(),
      designPath,
      mode: requestMode,
      message,
      selection: Array.isArray(selection) ? selection : [],
      revision: runtime.revision,
      channel: 'agent',
      replyTo: path.join(outboxDir, `${requestId}.json`),
    }
    await fsp.mkdir(inboxDir, { recursive: true })
    await fsp.writeFile(path.join(inboxDir, `${requestId}.json`), `${JSON.stringify(request, null, 2)}\n`, 'utf8')
    const pending = await listPending()
    broadcast('queue', { pending: pending.map(p => ({ id: p.id, createdAt: p.createdAt, message: p.message })) })
    return { ok: true, queued: true, requestId, channel: 'agent' }
  }

  if (!config.configured) {
    return {
      ok: false,
      error: '尚未配置 AI：设置 baseUrl / apiKey / model 后重试，或改用 Agent 队列处理。',
      code: 'not-configured',
    }
  }

  const llm = await importLlm()
  const spec = runtime.spec
  const summary = summarizeSpec(spec)
  const compact = compactSpec(spec, { maxChars: 12000 })
  const messages = llm.buildMessages({
    mode: requestMode,
    spec,
    selection: Array.isArray(selection) ? selection : [],
    message,
    history: Array.isArray(history) ? history.slice(-8) : [],
    compactSpec: compact,
    theme: spec.theme,
    summary,
    tokens: tokensForPrompt(spec.theme),
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  let lastError = null
  let attempt = 0
  const maxAttempts = 2
  while (attempt < maxAttempts) {
    attempt += 1
    let content
    try {
      const result = await llm.callLLM({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages,
        temperature: requestMode === 'critique' ? 0.3 : 0.4,
        maxTokens: config.maxTokens,
        signal: controller.signal,
      })
      content = result.content
    } catch (error) {
      lastError = error
      if ((error && error.name === 'AbortError') || (error && error.code === 'timeout')) {
        return { ok: false, error: `模型调用超时（${Math.round(config.timeoutMs / 1000)}s）`, code: 'timeout' }
      }
      break
    }

    let parsed
    try {
      parsed = llm.parseAIResponse(content)
    } catch (error) {
      lastError = error
      messages.push({ role: 'assistant', content })
      messages.push({
        role: 'user',
        content: `你的上一条回复无法解析：${error.message}。请只输出严格 JSON，结构为 {"reply": "...", "ops": [...], "findings": [...]}，不要 markdown 围栏。`,
      })
      continue
    }

    const ops = Array.isArray(parsed.ops) ? parsed.ops : []
    if (requestMode === 'critique') {
      const findings = Array.isArray(parsed.findings) ? parsed.findings : []
      return { ok: true, channel: 'api', mode: requestMode, reply: parsed.reply || '', findings, ops: [] }
    }
    if (!ops.length) {
      return { ok: true, channel: 'api', mode: requestMode, reply: parsed.reply || '', ops: [], spec }
    }
    try {
      const applied = applyOps(spec, ops)
      await writeSpecFile(applied.spec)
      broadcast('state', { spec: applied.spec, revision: runtime.revision, source: 'ai' })
      return {
        ok: true,
        channel: 'api',
        mode: requestMode,
        reply: parsed.reply || '',
        ops,
        results: applied.results,
        spec: applied.spec,
        revision: runtime.revision,
      }
    } catch (error) {
      lastError = error
      const detail = error instanceof OpsError ? error.message : String(error && error.message)
      messages.push({ role: 'assistant', content })
      messages.push({
        role: 'user',
        content: `你的 ops 无法应用：${detail}。请基于当前设计稿重新给出严格 JSON（只包含必要 ops），不要解释。`,
      })
    }
  }

  const detail = lastError && lastError.message ? lastError.message : '未知错误'
  return {
    ok: false,
    error: `AI 调用失败：${detail}`,
    hint: '可以检查 baseUrl/apiKey/model，或改用 Agent 队列（channel=agent）处理请求。',
    code: 'ai-failed',
  }
}

/* ------------------------------------------------------------------ */
/* file watching                                                       */
/* ------------------------------------------------------------------ */

let suppressExternalUntil = 0

async function handleExternalDesignChange() {
  if (Date.now() < suppressExternalUntil) return
  try {
    const raw = await fsp.readFile(designPath, 'utf8')
    if (raw === runtime.lastWrittenJson) return
    const spec = JSON.parse(raw)
    const result = validateSpec(spec)
    if (!result.ok) {
      console.warn('[ui-designer] 外部修改的 design.json 校验失败，保持当前版本：', result.errors.slice(0, 3))
      broadcast('status', { kind: 'warning', text: '外部修改的 design.json 无效，已忽略' })
      return
    }
    runtime.spec = spec
    runtime.lastWrittenJson = raw
    runtime.revision += 1
    broadcast('state', { spec, revision: runtime.revision, source: 'external' })
    console.log(`[ui-designer] 已载入外部修改 (rev ${runtime.revision})`)
  } catch (error) {
    console.warn('[ui-designer] 读取外部 design.json 失败：', error.message)
  }
}

async function handleOutboxFile(file) {
  const name = path.basename(file)
  if (!name.endsWith('.json')) return
  let stat
  try {
    stat = await fsp.stat(file)
  } catch {
    return
  }
  const seen = runtime.outboxSeen.get(name)
  if (seen !== undefined && seen >= stat.mtimeMs) return
  runtime.outboxSeen.set(name, stat.mtimeMs)
  const data = await readJson(file)
  if (!data) return
  broadcast('chat', {
    requestId: data.id || name.replace(/\.json$/, ''),
    reply: data.reply || '',
    findings: Array.isArray(data.findings) ? data.findings : [],
    channel: 'agent',
  })
  console.log(`[ui-designer] Agent 回复已送达：${data.id || name}`)
}

function startWatching() {
  try {
    runtime.watcher = watch(designDir, { recursive: true }, (eventType, filename) => {
      const name = String(filename || '')
      if (!name) return
      const normalized = name.replace(/\\/g, '/')
      if (normalized === designFileName) {
        clearTimeout(runtime.debounceTimer)
        runtime.debounceTimer = setTimeout(() => { handleExternalDesignChange() }, 120)
        return
      }
      if (normalized.startsWith('.ai/outbox/') && normalized.endsWith('.json')) {
        handleOutboxFile(path.join(designDir, name))
      }
      if (normalized.startsWith('.ai/inbox/') && normalized.endsWith('.json')) {
        listPending().then(pending => broadcast('queue', { pending: pending.map(p => ({ id: p.id, createdAt: p.createdAt, message: p.message })) })).catch(() => {})
      }
    })
    runtime.watcher.on('error', error => console.warn('[ui-designer] 文件监听异常：', error.message))
  } catch (error) {
    console.warn('[ui-designer] 无法监听设计目录：', error.message)
  }
}

/* ------------------------------------------------------------------ */
/* static files                                                        */
/* ------------------------------------------------------------------ */

async function serveStatic(req, res, urlPath) {
  let relative = urlPath === '/' ? '/index.html' : urlPath
  relative = decodeURIComponent(relative)
  const resolved = path.resolve(ASSET_ROOT, `.${relative}`)
  if (!resolved.startsWith(ASSET_ROOT + path.sep) && resolved !== ASSET_ROOT) {
    return fail(res, 403, '禁止访问该路径')
  }
  let stat
  try {
    stat = await fsp.stat(resolved)
  } catch {
    return fail(res, 404, `未找到：${urlPath}`)
  }
  if (!stat.isFile()) return fail(res, 404, `未找到：${urlPath}`)
  const ext = path.extname(resolved).toLowerCase()
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
    'content-length': stat.size,
  })
  createReadStream(resolved).pipe(res)
}

/* ------------------------------------------------------------------ */
/* API handlers                                                        */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  const method = req.method || 'GET'
  const pathname = url.pathname

  if (pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.write('retry: 1500\n\n')
    sendEvent(res, 'state', { spec: runtime.spec, revision: runtime.revision, source: 'init' })
    sendEvent(res, 'queue', { pending: (await listPending()).map(p => ({ id: p.id, createdAt: p.createdAt, message: p.message })) })
    runtime.sseClients.add(res)
    req.on('close', () => runtime.sseClients.delete(res))
    return
  }

  if (pathname === '/api/state' && method === 'GET') {
    return json(res, 200, {
      ok: true,
      designPath,
      designDir,
      spec: runtime.spec,
      revision: runtime.revision,
      config: { ai: publicConfig(runtime.config) },
      skillVersion: '1.0.0',
      queue: (await listPending()).length,
    })
  }

  if (pathname === '/api/state' && method === 'PUT') {
    const body = await readBody(req)
    if (!body || !body.spec) return fail(res, 400, '请求体需要 { spec }')
    try {
      assertSpec(body.spec)
    } catch (error) {
      return fail(res, 400, error.message, { errors: error.errors || [] })
    }
    suppressExternalUntil = Date.now() + 800
    await writeSpecFile(body.spec)
    broadcast('state', { spec: body.spec, revision: runtime.revision, source: 'browser' })
    return json(res, 200, { ok: true, spec: body.spec, revision: runtime.revision })
  }

  if (pathname === '/api/ops' && method === 'POST') {
    const body = await readBody(req)
    const ops = body && (Array.isArray(body.ops) ? body.ops : body.op ? [body.op] : null)
    if (!ops) return fail(res, 400, '请求体需要 { ops: [...] }')
    try {
      const applied = applyOps(runtime.spec, ops)
      suppressExternalUntil = Date.now() + 800
      await writeSpecFile(applied.spec)
      broadcast('state', { spec: applied.spec, revision: runtime.revision, source: 'ops' })
      return json(res, 200, { ok: true, spec: applied.spec, results: applied.results, revision: runtime.revision })
    } catch (error) {
      return fail(res, 400, error.message, { index: error.index })
    }
  }

  if (pathname === '/api/chat' && method === 'POST') {
    const body = await readBody(req)
    if (!body || typeof body.message !== 'string' || !body.message.trim()) {
      return fail(res, 400, '请求体需要 { message }')
    }
    try {
      const result = await runChat({
        mode: body.mode,
        message: body.message.trim(),
        selection: body.selection,
        history: body.history,
        channel: body.channel || 'auto',
      })
      return json(res, result.ok ? 200 : 502, result)
    } catch (error) {
      console.error('[ui-designer] /api/chat error', error)
      return fail(res, 500, `AI 处理异常：${error.message}`)
    }
  }

  if (pathname === '/api/config' && method === 'GET') {
    return json(res, 200, { ok: true, config: publicConfig(runtime.config), paths: { user: userConfigPath(), project: projectConfigPath() } })
  }

  if (pathname === '/api/config' && method === 'PUT') {
    const body = await readBody(req)
    if (!body || typeof body !== 'object') return fail(res, 400, '请求体需要 { baseUrl, model, apiKey, mode }')
    const current = (await readJson(userConfigPath())) || {}
    const next = { ...current }
    for (const key of ['baseUrl', 'model', 'apiKey', 'mode']) {
      if (body[key] === undefined) continue
      if (body[key] === '') delete next[key]
      else next[key] = body[key]
    }
    if (next.mode && !AI_MODES.has(next.mode)) return fail(res, 400, `mode 必须是 auto/api/agent`)
    await fsp.mkdir(path.dirname(userConfigPath()), { recursive: true })
    await fsp.writeFile(userConfigPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    runtime.config = await resolveConfig(designDir)
    return json(res, 200, { ok: true, config: publicConfig(runtime.config), path: userConfigPath() })
  }

  if (pathname === '/api/queue' && method === 'GET') {
    return json(res, 200, { ok: true, pending: await listPending() })
  }

  if (pathname === '/api/export' && method === 'POST') {
    const body = await readBody(req)
    const format = body && body.format ? body.format : 'html'
    let core
    try {
      core = await import('./export-core.mjs')
    } catch (error) {
      return fail(res, 501, `导出模块尚未就绪：${error.message}`)
    }
    try {
      const spec = runtime.spec
      const frameId = body.frameId || (spec.frames[0] && spec.frames[0].id)
      const bundle = core.exportBundle(spec, frameId)
      const allFiles = Array.isArray(bundle && bundle.files) ? bundle.files : []
      let files = format === 'all' ? allFiles : allFiles.filter(file => file.format === format)
      if (!files.length) return fail(res, 400, `导出格式 ${format} 暂无产物（frameId=${frameId}）`)
      if (body.write) {
        const root = path.join(exportDir, frameId || 'frames')
        for (const file of files) {
          const out = path.join(root, file.path)
          if (!out.startsWith(exportDir + path.sep)) continue
          await fsp.mkdir(path.dirname(out), { recursive: true })
          await fsp.writeFile(out, file.code, 'utf8')
        }
      }
      const primary = files[0] || (bundle.files && bundle.files[0]) || { path: '', code: '' }
      return json(res, 200, {
        ok: true,
        format,
        code: primary.code,
        path: primary.path,
        files: files.map(f => ({ path: f.path, code: f.code })),
        writtenTo: body.write ? path.join(exportDir, frameId || 'frames') : null,
      })
    } catch (error) {
      return fail(res, 500, `导出失败：${error.message}`)
    }
  }

  return fail(res, 404, `未知 API：${method} ${pathname}`)
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  await fsp.mkdir(designDir, { recursive: true })
  await fsp.mkdir(inboxDir, { recursive: true })
  await fsp.mkdir(outboxDir, { recursive: true })

  if (!(await fsp.stat(designPath).catch(() => null))) {
    const { emptySpec } = await import('./designer-core.mjs')
    await fsp.writeFile(designPath, `${JSON.stringify(emptySpec(), null, 2)}\n`, 'utf8')
    console.log(`[ui-designer] 未找到设计稿，已创建空设计：${designPath}`)
  }

  await loadSpec()
  runtime.config = await resolveConfig(designDir)
  startWatching()

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(req, res, url)
      }
      return await serveStatic(req, res, url.pathname)
    } catch (error) {
      console.error('[ui-designer] 请求处理失败：', error)
      if (!res.headersSent) fail(res, 500, `服务器错误：${error.message}`)
      else res.end()
    }
  })

  server.listen(options.port, options.host, () => {
    const url = `http://${options.host}:${options.port}/`
    const channel = resolvedChannel(runtime.config)
    console.log(`[ui-designer] 设计稿: ${designPath}`)
    console.log(`[ui-designer] 服务地址: ${url}`)
    console.log(`[ui-designer] AI 通道: ${channel}${channel === 'agent' ? '（请求写入 .ai/inbox，由编码 Agent 处理）' : `（${runtime.config.model} @ ${runtime.config.baseUrl}）`}`)
    if (options.open) openBrowser(url)
  })

  const shutdown = () => {
    console.log('\n[ui-designer] 正在关闭…')
    try { runtime.watcher && runtime.watcher.close() } catch {}
    for (const client of runtime.sseClients) {
      try { client.end() } catch {}
    }
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 500)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
    }
  } catch (error) {
    console.warn('[ui-designer] 无法自动打开浏览器：', error.message)
  }
}

main().catch(error => {
  console.error('[ui-designer] 启动失败：', error)
  process.exit(1)
})
