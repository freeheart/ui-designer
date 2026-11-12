#!/usr/bin/env node
/**
 * UI Designer — Agent file-queue bridge (AI channel B).
 *
 * The local server writes chat requests to `<designDir>/.ai/inbox/<id>.json`
 * when no model key is configured (or channel=agent). The coding agent uses
 * this CLI to answer them:
 *
 *   node scripts/agent-bridge.mjs pending --design <design.json> [--json]
 *   node scripts/agent-bridge.mjs reply   --design <design.json> --id <id> \
 *        --message "..." [--ops ops.json] [--findings findings.json] [--dry-run]
 *   node scripts/agent-bridge.mjs watch   --design <design.json> [--interval 1000] [--once]
 *
 * Every command prints machine-readable JSON on stdout (one JSON document, or
 * JSON lines for `watch`). Progress/errors also go to stderr so agent tooling
 * can `JSON.parse(stdout)` safely.
 *
 * `reply` applies ops through scripts/designer-core.mjs#applyOps and atomically
 * rewrites design.json before writing the outbox reply. The server watches
 * `.ai/outbox/` and streams the reply to the browser.
 */

import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { applyOps, OpsError } from './designer-core.mjs'

/* ------------------------------------------------------------------ */
/* args                                                                */
/* ------------------------------------------------------------------ */

const USAGE = `UI Designer Agent Bridge

用法:
  node agent-bridge.mjs pending --design <design.json>
      列出待处理请求（JSON 数组，已回复的不会出现）

  node agent-bridge.mjs reply --design <design.json> --id <requestId> --message "..."
      写出回复；可选:
        --ops <ops.json>            应用 ops（数组或 {"ops":[...]}），并原子写回 design.json
        --findings <findings.json>  附带品评结果（数组或 {"findings":[...]}）
        --dry-run                   只预演，不写 design.json / outbox

  node agent-bridge.mjs watch --design <design.json> [--interval 1000] [--once]
      持续监听 inbox，把新请求以 JSON Lines 打印到 stdout

通用选项: --design <path>（必填）, --help
`

function parseArgs(argv) {
  const options = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--') {
      options._.push(...argv.slice(i + 1))
      break
    }
    if (token.startsWith('--')) {
      const key = token.slice(2)
      if (key === 'dry-run' || key === 'json' || key === 'once' || key === 'help') {
        options[key] = true
        continue
      }
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        options[key] = true
      } else {
        options[key] = next
        i += 1
      }
      continue
    }
    options._.push(token)
  }
  return options
}

const options = parseArgs(process.argv.slice(2))
const command = options._[0]

function printJson(value, pretty = true) {
  process.stdout.write(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`)
}

function fail(message, extra = {}) {
  printJson({ ok: false, error: message, ...extra })
  process.exitCode = 1
}

function log(message) {
  process.stderr.write(`[ui-designer-bridge] ${message}\n`)
}

/* ------------------------------------------------------------------ */
/* paths & io                                                          */
/* ------------------------------------------------------------------ */

function resolveDesign() {
  if (!options.design || typeof options.design !== 'string') {
    throw new Error('缺少 --design <design.json>')
  }
  const designPath = path.resolve(options.design)
  const designDir = path.dirname(designPath)
  return {
    designPath,
    designDir,
    inboxDir: path.join(designDir, '.ai', 'inbox'),
    outboxDir: path.join(designDir, '.ai', 'outbox'),
  }
}

async function readJsonFile(file) {
  // Windows editors/tools often add a UTF-8 BOM; strip it before parsing.
  const text = (await fsp.readFile(file, 'utf8')).replace(/^\uFEFF/, '')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`文件不是合法 JSON：${file}（${error.message}）`)
  }
}

async function writeJsonAtomic(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fsp.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fsp.rename(tmp, file)
}

async function pathExists(file) {
  try {
    await fsp.stat(file)
    return true
  } catch {
    return false
  }
}

async function listInboxFiles(inboxDir) {
  const entries = await fsp.readdir(inboxDir).catch(() => [])
  return entries.filter(name => name.endsWith('.json')).map(name => path.join(inboxDir, name))
}

async function listPending(paths) {
  const outbox = await fsp.readdir(paths.outboxDir).catch(() => [])
  const replied = new Set(outbox.filter(name => name.endsWith('.json')).map(name => name.replace(/\.json$/, '')))
  const files = await listInboxFiles(paths.inboxDir)
  const pending = []
  for (const file of files) {
    const id = path.basename(file, '.json')
    if (replied.has(id)) continue
    try {
      const request = await readJsonFile(file)
      if (request && typeof request === 'object') pending.push({ ...request, id: request.id || id })
    } catch (error) {
      log(`跳过无法解析的请求文件 ${path.basename(file)}：${error.message}`)
    }
  }
  pending.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  return pending
}

/* ------------------------------------------------------------------ */
/* commands                                                            */
/* ------------------------------------------------------------------ */

async function commandPending(paths) {
  const pending = await listPending(paths)
  printJson(pending)
}

async function commandReply(paths) {
  if (!options.id || typeof options.id !== 'string') throw new Error('reply 需要 --id <requestId>')
  if (!options.message || typeof options.message !== 'string' || !options.message.trim()) {
    throw new Error('reply 需要 --message "..."（给用户看的回复文本）')
  }

  const inboxFile = path.join(paths.inboxDir, `${options.id}.json`)
  const outboxFile = path.join(paths.outboxDir, `${options.id}.json`)
  const inboxExists = await pathExists(inboxFile)
  let request = null
  if (inboxExists) {
    request = await readJsonFile(inboxFile)
  } else {
    log(`inbox 中未找到请求 ${options.id}（可能已被处理）；继续写回复`)
  }
  if (request && request.designPath && path.resolve(String(request.designPath)) !== paths.designPath) {
    log(`注意：请求指向的 designPath 与 --design 不同（${request.designPath}），仍按 --design 处理`)
  }

  let ops = []
  if (options.ops) {
    const raw = await readJsonFile(path.resolve(String(options.ops)))
    ops = Array.isArray(raw) ? raw : raw && Array.isArray(raw.ops) ? raw.ops : null
    if (!ops) throw new Error('--ops 文件必须是 ops 数组或 {"ops":[...]}')
  }

  let findings = null
  if (options.findings) {
    const raw = await readJsonFile(path.resolve(String(options.findings)))
    findings = Array.isArray(raw) ? raw : raw && Array.isArray(raw.findings) ? raw.findings : null
    if (!findings) throw new Error('--findings 文件必须是 findings 数组或 {"findings":[...]}')
  }

  let designChanged = false
  let results = []
  if (ops.length) {
    const spec = await readJsonFile(paths.designPath)
    const before = JSON.stringify(spec)
    let applied
    try {
      applied = applyOps(spec, ops)
    } catch (error) {
      const detail = error instanceof OpsError ? error.message : String(error && error.message)
      fail(`应用 ops 失败：${detail}`, { id: options.id, opsApplied: 0, designChanged: false })
      return
    }
    results = applied.results || []
    designChanged = JSON.stringify(applied.spec) !== before
    if (!options['dry-run'] && designChanged) {
      await writeJsonAtomic(paths.designPath, applied.spec)
      log(`已写回 design.json（${results.length} 个 op）`)
    }
  }

  const outboxPayload = {
    id: options.id,
    repliedAt: new Date().toISOString(),
    reply: options.message.trim(),
    ...(findings ? { findings } : {}),
  }

  if (options['dry-run']) {
    printJson({
      ok: true,
      dryRun: true,
      id: options.id,
      designPath: paths.designPath,
      inboxFile,
      outboxFile,
      opsApplied: results.length,
      designChanged,
      findings: findings ? findings.length : 0,
      results,
      outbox: outboxPayload,
    })
    return
  }

  if (designChanged) {
    // The outbox write happens after design.json so the server reloads the new
    // design and then surfaces the reply referencing it.
    await writeJsonAtomic(outboxFile, outboxPayload)
  } else {
    await writeJsonAtomic(outboxFile, outboxPayload)
  }
  log(`已写回复 ${path.basename(outboxFile)}`)

  printJson({
    ok: true,
    id: options.id,
    designPath: paths.designPath,
    inboxFile,
    outboxFile,
    opsApplied: results.length,
    designChanged,
    findings: findings ? findings.length : 0,
    results,
  })
}

async function commandWatch(paths) {
  const interval = Math.max(200, Number(options.interval) || 1000)
  const emit = event => process.stdout.write(`${JSON.stringify(event)}\n`)

  if (options.once) {
    printJson({ ok: true, designPath: paths.designPath, pending: await listPending(paths) })
    return
  }

  const seen = new Set()
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    process.stdout.write(`${JSON.stringify({ type: 'stopped', designPath: paths.designPath })}\n`)
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  emit({ type: 'ready', designPath: paths.designPath, inbox: paths.inboxDir, interval })
  while (!stopped) {
    try {
      const pending = await listPending(paths)
      for (const request of pending) {
        if (seen.has(request.id)) continue
        seen.add(request.id)
        emit({ type: 'request', designPath: paths.designPath, request })
      }
    } catch (error) {
      log(`监听失败：${error.message}`)
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  if (options.help || !command) {
    process.stderr.write(USAGE)
    if (!command && !options.help) process.exitCode = 1
    return
  }
  const paths = resolveDesign()
  if (command === 'pending') return commandPending(paths)
  if (command === 'reply') return commandReply(paths)
  if (command === 'watch') return commandWatch(paths)
  fail(`未知命令：${command}（支持 pending / reply / watch）`)
}

main().catch(error => {
  fail(error && error.message ? error.message : String(error))
})
