#!/usr/bin/env node
/**
 * UI Designer — export CLI (zero dependencies, ES module, no build step).
 *
 *   node ui-designer/scripts/export.mjs --design <design.json> \
 *     [--format html|react|tokens|all] [--frame <frameId|all>] \
 *     [--out <dir>] [--stdout]
 *
 * Writes standalone HTML / React+Tailwind TSX / tokens CSS and prints the
 * absolute file paths. With --stdout the generated code is printed instead of
 * being written to disk (files are separated by a `/* ===== path ===== *​/` line).
 *
 * Exit codes: 0 success, 1 invalid arguments / invalid design / export error.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import {
  exportHTML,
  exportReactTailwind,
  exportTokensCSS,
  exportBundle,
  componentName,
} from './export-core.mjs'
import { validateSpec } from './designer-core.mjs'

const FORMATS = new Set(['html', 'react', 'tokens', 'all'])

const USAGE = `UI Designer 导出器

用法:
  node export.mjs --design <design.json> [--format html|react|tokens|all]
                  [--frame <frameId|all>] [--out <dir>] [--stdout]

选项:
  --design <path>   设计稿 design.json（必填）
  --format <name>   html | react | tokens | all（默认 all）
  --frame <id>      画板 id，或 all（默认 all）
  --out <dir>       输出目录（默认 ./ui-designer-export）
  --stdout          不写文件，把生成的代码打印到 stdout
  --help            显示帮助

示例:
  node export.mjs --design designs/home/design.json --format all --out exports/home
  node export.mjs --design designs/home/design.json --format html --frame f-home --stdout
`

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) throw new Error(`无法识别的参数：${token}`)
    const key = token.slice(2)
    if (key === 'help' || key === 'stdout') {
      args[key] = true
      continue
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`参数 --${key} 缺少取值`)
    args[key] = value
    i += 1
  }
  return args
}

function fail(message) {
  console.error(`EXPORT_FAILED: ${message}`)
  process.exit(1)
}

function loadDesign(file) {
  const designPath = isAbsolute(file) ? file : resolve(process.cwd(), file)
  let raw
  try {
    raw = readFileSync(designPath, 'utf8')
  } catch (error) {
    fail(`无法读取设计稿：${designPath}（${error.code || error.message}）`)
  }
  let spec
  try {
    spec = JSON.parse(raw)
  } catch (error) {
    fail(`design.json 不是合法 JSON：${error.message}`)
  }
  const result = validateSpec(spec)
  if (!result.ok) {
    const detail = result.errors.slice(0, 8).map(e => `  - ${e.path}: ${e.message}`).join('\n')
    fail(`设计稿校验失败（共 ${result.errors.length} 处）：\n${detail}`)
  }
  return { spec, designPath }
}

/** Determine the output files for the requested format. */
function renderFiles(spec, format, frameId) {
  if (format === 'all') return exportBundle(spec, frameId).files
  if (format === 'html') return [{ path: 'index.html', format: 'html', code: exportHTML(spec, frameId) }]
  if (format === 'react') {
    const name = componentName(spec, frameId)
    return [{ path: `${name}.tsx`, format: 'react', code: exportReactTailwind(spec, frameId) }]
  }
  return [{ path: 'tokens.css', format: 'tokens', code: exportTokensCSS(spec) }]
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    fail(error.message)
  }
  if (args.help) {
    console.log(USAGE)
    return
  }
  if (!args.design) fail('缺少 --design <design.json>')

  const format = args.format || 'all'
  if (!FORMATS.has(format)) fail(`未知导出格式：${format}（支持 html/react/tokens/all）`)
  const frameId = args.frame || 'all'

  const { spec, designPath } = loadDesign(args.design)
  let files
  try {
    files = renderFiles(spec, format, frameId)
  } catch (error) {
    fail(error.message)
  }

  if (args.stdout) {
    if (files.length === 1) {
      console.log(files[0].code)
    } else {
      console.log(files.map(f => `/* ===== ${f.path} (${f.format}) ===== */\n${f.code}`).join('\n'))
    }
    return
  }

  const outDir = isAbsolute(args.out || '') ? args.out : resolve(process.cwd(), args.out || 'ui-designer-export')
  for (const file of files) {
    const target = join(outDir, file.path)
    try {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, file.code, 'utf8')
    } catch (error) {
      fail(`写入失败：${target}（${error.code || error.message}）`)
    }
    console.log(`WROTE ${target} (${file.code.length} chars)`)
  }
  console.log(`EXPORTED ${files.length} file(s) from ${designPath} · frame=${frameId} · format=${format}`)
}

try {
  main()
} catch (error) {
  fail(error && error.stack ? error.stack : String(error))
}
