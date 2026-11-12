#!/usr/bin/env node
/**
 * UI Designer — zero-setup demo.
 *
 * Creates `./ui-designer-demo/design.json` from the bundled example design
 * (only when missing) and starts the local design server, opening the browser.
 *
 *   node scripts/demo.mjs                 # port 4173, opens the browser
 *   node scripts/demo.mjs --port 4300     # custom port
 *   node scripts/demo.mjs --no-open       # print the URL only
 *   node scripts/demo.mjs --force         # overwrite the demo design
 *
 * Nothing is installed and nothing leaves your machine: the server listens on
 * 127.0.0.1 and the demo design lives in a normal folder you can keep, edit or
 * delete. Works without DSH — only Node.js >= 20 and a browser are required.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = path.resolve(HERE, '..')

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback
}

const port = Number(argValue('port', '4173')) || 4173
const noOpen = process.argv.includes('--no-open')
const force = process.argv.includes('--force')
const demoDir = path.resolve(argValue('dir', 'ui-designer-demo'))
const designPath = path.join(demoDir, 'design.json')
const examplePath = path.join(SKILL_ROOT, 'references', 'example-design.json')

if (!existsSync(examplePath)) {
  console.error(`\n[ui-designer] 找不到示例设计稿：${examplePath}`)
  console.error('请从完整技能目录运行本脚本（scripts/ 与 references/ 需在同一仓库里）。\n')
  process.exit(1)
}

if (!existsSync(designPath) || force) {
  mkdirSync(demoDir, { recursive: true })
  copyFileSync(examplePath, designPath)
  console.log(`[ui-designer] 已创建示例设计稿：${designPath}`)
} else {
  console.log(`[ui-designer] 复用已有示例设计稿：${designPath}`)
}

try {
  const spec = JSON.parse(readFileSync(designPath, 'utf8'))
  const nodeCount = spec && spec.nodes ? Object.keys(spec.nodes).length : 0
  console.log(`[ui-designer] 设计稿「${spec.name || '未命名'}」 · ${nodeCount} 个节点 · ${(spec.frames || []).length} 个画板`)
} catch {
  console.error('[ui-designer] 示例设计稿不是合法 JSON，用 --force 重新生成。')
  process.exit(1)
}

if (!noOpen) console.log('[ui-designer] 启动后会用默认浏览器打开；关闭窗口不会停止服务，Ctrl+C 停止。')

// Run the server in this process so `Ctrl+C` stops everything at once.
process.argv = [process.argv[0], path.join(HERE, 'server.mjs'), '--design', designPath, '--port', String(port)]
if (!noOpen) process.argv.push('--open')
await import(new URL('./server.mjs', import.meta.url))
