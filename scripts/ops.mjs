#!/usr/bin/env node
/**
 * UI Designer — ops CLI. Apply a JSON op list to design.json atomically.
 *
 *   node ops.mjs --design designs/home/design.json --ops ops.json
 *   node ops.mjs --design designs/home/design.json --ops - --stdout
 *   node ops.mjs --design designs/home/design.json --validate
 *
 * Ops file: either [ {...}, ... ] or { "ops": [ {...} ] }.
 * Exit code 0 on success, 1 on validation/op failure (details on stderr/JSON).
 */

import { promises as fsp } from 'node:fs'
import path from 'node:path'

import { applyOps, assertSpec, summarizeSpec, validateSpec, compactSpec, OpsError } from './designer-core.mjs'

function parseArgs(argv) {
  const args = { dryRun: false, stdout: false, validate: false }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = () => argv[++i]
    switch (token) {
      case '--design': args.design = next(); break
      case '--ops': args.ops = next(); break
      case '--out': args.out = next(); break
      case '--dry-run': args.dryRun = true; break
      case '--stdout': args.stdout = true; break
      case '--validate': args.validate = true; break
      case '--compact': args.compact = true; break
      case '--summary': args.summary = true; break
      case '--help':
      case '-h': args.help = true; break
      default:
        if (token.startsWith('--design=')) args.design = token.slice(9)
        else if (token.startsWith('--ops=')) args.ops = token.slice(6)
    }
  }
  return args
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function printHelp() {
  console.log(`UI Designer ops CLI

用法:
  node ops.mjs --design <design.json> --ops <ops.json|-> [--dry-run] [--stdout]
  node ops.mjs --design <design.json> --validate
  node ops.mjs --design <design.json> --compact | --summary

选项:
  --design     design.json 路径（必填）
  --ops        ops 文件路径；"-" 表示从 stdin 读取
  --out        输出到指定文件（默认原地写回 design.json）
  --dry-run    只校验/打印结果，不写文件
  --stdout     把结果 design.json 打印到 stdout
  --validate   只校验设计稿
  --compact    打印给模型看的紧凑设计稿
  --summary    打印统计/启发式警告
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.design) {
    printHelp()
    process.exit(args.help ? 0 : 1)
  }
  const designPath = path.resolve(args.design)
  const raw = await fsp.readFile(designPath, 'utf8')
  let spec
  try {
    spec = JSON.parse(raw)
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: `design.json 不是合法 JSON：${error.message}` }))
    process.exit(1)
  }

  if (args.validate) {
    const result = validateSpec(spec)
    console.log(JSON.stringify({ ok: result.ok, errors: result.errors }, null, 2))
    process.exit(result.ok ? 0 : 1)
  }

  if (args.compact) {
    try {
      assertSpec(spec)
    } catch (error) {
      console.error(JSON.stringify({ ok: false, error: error.message }))
      process.exit(1)
    }
    console.log(compactSpec(spec))
    return
  }

  if (args.summary) {
    console.log(JSON.stringify({ ok: true, ...summarizeSpec(spec) }, null, 2))
    return
  }

  if (!args.ops) {
    console.error(JSON.stringify({ ok: false, error: '缺少 --ops（或使用 --validate/--compact/--summary）' }))
    process.exit(1)
  }

  try {
    assertSpec(spec)
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: `原设计稿无效：${error.message}` }))
    process.exit(1)
  }

  let opsText
  try {
    opsText = args.ops === '-' ? await readStdin() : await fsp.readFile(path.resolve(args.ops), 'utf8')
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: `读取 ops 失败：${error.message}` }))
    process.exit(1)
  }

  let ops
  try {
    const parsed = JSON.parse(opsText)
    ops = Array.isArray(parsed) ? parsed : parsed.ops
    if (!Array.isArray(ops)) throw new Error('必须是数组或 { "ops": [...] }')
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: `ops JSON 无效：${error.message}` }))
    process.exit(1)
  }

  let applied
  try {
    applied = applyOps(spec, ops)
  } catch (error) {
    const payload = { ok: false, error: error.message, code: error instanceof OpsError ? 'ops-failed' : 'error' }
    if (error instanceof OpsError) payload.index = error.index
    console.error(JSON.stringify(payload, null, 2))
    process.exit(1)
  }

  const text = `${JSON.stringify(applied.spec, null, 2)}\n`
  if (args.stdout) process.stdout.write(text)
  if (!args.dryRun) {
    const out = args.out ? path.resolve(args.out) : designPath
    const tmp = `${out}.${process.pid}.tmp`
    await fsp.writeFile(tmp, text, 'utf8')
    await fsp.rename(tmp, out)
  }
  console.log(JSON.stringify({
    ok: true,
    designPath,
    written: args.dryRun ? false : (args.out ? path.resolve(args.out) : designPath),
    opCount: ops.length,
    results: applied.results,
    nodeCount: Object.keys(applied.spec.nodes).length,
  }, null, 2))
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message }))
  process.exit(1)
})
