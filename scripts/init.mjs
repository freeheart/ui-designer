#!/usr/bin/env node
/**
 * UI Designer — scaffold a design document.
 *
 *   node init.mjs --dir designs/home --name "我的应用" [--width 390 --height 844]
 *   node init.mjs --dir designs/home --from references/example-design.json
 *   node init.mjs --dir designs/home --force
 *
 * Creates <dir>/design.json (valid per designer-core) plus .ai/ and a
 * .gitignore for the agent queue. Prints the server command to run next.
 */

import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { emptySpec, assertSpec } from './designer-core.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const args = { width: 390, height: 844, name: '未命名设计', frameName: '首页', force: false }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = () => argv[++i]
    switch (token) {
      case '--dir': args.dir = next(); break
      case '--name': args.name = next(); break
      case '--frame-name': args.frameName = next(); break
      case '--width': args.width = Number(next()) || 390; break
      case '--height': args.height = Number(next()) || 844; break
      case '--from': args.from = next(); break
      case '--force': args.force = true; break
      case '--help':
      case '-h': args.help = true; break
      default:
        if (token.startsWith('--dir=')) args.dir = token.slice(6)
        else if (!token.startsWith('-') && !args.dir) args.dir = token
    }
  }
  return args
}

function help() {
  console.log(`UI Designer 设计稿初始化

用法:
  node init.mjs --dir <designs/name> [--name "设计名"] [--frame-name "首页"]
                [--width 390] [--height 844] [--from <example.json>] [--force]

之后启动设计器:
  node ${path.join(HERE, 'server.mjs')} --design <designs/name>/design.json --port 4173 --open
`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.dir) {
    help()
    process.exit(args.help ? 0 : 1)
  }
  const dir = path.resolve(args.dir)
  const designPath = path.join(dir, 'design.json')
  await fsp.mkdir(dir, { recursive: true })

  const exists = await fsp.stat(designPath).catch(() => null)
  if (exists && !args.force) {
    console.error(`设计稿已存在：${designPath}（使用 --force 覆盖）`)
    process.exit(1)
  }

  let spec
  if (args.from) {
    spec = JSON.parse(await fsp.readFile(path.resolve(args.from), 'utf8'))
  } else {
    spec = emptySpec({
      name: args.name,
      frameName: args.frameName,
      width: args.width,
      height: args.height,
    })
  }
  assertSpec(spec)
  await fsp.writeFile(designPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8')

  const aiDir = path.join(dir, '.ai')
  await fsp.mkdir(path.join(aiDir, 'inbox'), { recursive: true })
  await fsp.mkdir(path.join(aiDir, 'outbox'), { recursive: true })
  const gitignore = path.join(aiDir, '.gitignore')
  if (!(await fsp.stat(gitignore).catch(() => null))) {
    await fsp.writeFile(gitignore, 'inbox/\noutbox/\n', 'utf8')
  }

  console.log(`已创建设计稿：${designPath}`)
  console.log(`节点数：${Object.keys(spec.nodes).length}，frame：${spec.frames.map(f => `${f.id}(${f.width}x${f.height})`).join(', ')}`)
  console.log('')
  console.log('下一步启动设计器：')
  console.log(`  node "${path.join(HERE, 'server.mjs')}" --design "${designPath}" --port 4173 --open`)
}

main().catch(error => {
  console.error(`初始化失败：${error.message}`)
  process.exit(1)
})
