/**
 * UI Designer — design document model: validation, ops protocol, prompt
 * compacting and review heuristics.
 *
 * Pure Node/browser-safe ESM. Imported by scripts/server.mjs, scripts/ops.mjs,
 * scripts/agent-bridge.mjs, the exporter and the tests.
 */

import {
  DEFAULT_THEME,
  NODE_TYPES,
  TYPE_DEFAULTS,
  effectiveStyle,
  resolveColor,
} from '../assets/designer/js/shared/style.mjs'

export const SPEC_VERSION = 1
export { DEFAULT_THEME, NODE_TYPES, TYPE_DEFAULTS }

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** Theme token keys may be camelCase or kebab-case (e.g. `onPrimary`, `2xl`). */
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/
const LAYOUT_MODES = new Set(['absolute', 'row', 'column'])
const ALIGN = new Set(['start', 'center', 'end', 'stretch'])
const JUSTIFY = new Set(['start', 'center', 'end', 'between'])
const SET_TOP = new Set(['name', 'x', 'y', 'w', 'h', 'opacity', 'hidden', 'locked', 'style', 'layout', 'props'])
const FRAME_SET = new Set(['name', 'x', 'y', 'width', 'height', 'background'])
const THEME_GROUPS = new Set(['colors', 'radius', 'space', 'fontSize', 'shadow'])

const TYPE_SIZES = {
  box: [200, 100],
  text: [160, 24],
  button: [120, 40],
  input: [240, 40],
  image: [240, 160],
  icon: [24, 24],
  divider: [240, 1],
  badge: [64, 22],
  avatar: [40, 40],
  toggle: [44, 24],
  checkbox: [140, 20],
  select: [240, 40],
  tabs: [300, 36],
  table: [320, 180],
  chart: [320, 160],
  card: [320, 160],
}

const TYPE_NAMES = {
  box: '容器', text: '文本', button: '按钮', input: '输入框', image: '图片', icon: '图标',
  divider: '分割线', badge: '标签', avatar: '头像', toggle: '开关', checkbox: '复选框',
  select: '下拉框', tabs: '标签页', table: '表格', chart: '图表', card: '卡片',
}

export class OpsError extends Error {
  constructor(message, { index = -1, op = null, path = '' } = {}) {
    super(message)
    this.name = 'OpsError'
    this.index = index
    this.op = op
    this.path = path
  }
}

/* ------------------------------------------------------------------ */
/* spec factory                                                        */
/* ------------------------------------------------------------------ */

export const cloneSpec = spec =>
  typeof structuredClone === 'function' ? structuredClone(spec) : JSON.parse(JSON.stringify(spec))

export function defaultTheme() {
  return cloneSpec(DEFAULT_THEME)
}

function frameRootId(frameId) {
  return `${frameId}-root`
}

/** A valid one-frame empty design. */
export function emptySpec({ name = '未命名设计', frameName = '首页', width = 390, height = 844, background = 'bg' } = {}) {
  const frameId = 'f-main'
  const rootId = frameRootId(frameId)
  return {
    version: SPEC_VERSION,
    name,
    theme: defaultTheme(),
    frames: [{ id: frameId, name: frameName, x: 0, y: 0, width, height, background }],
    rootIds: { [frameId]: rootId },
    nodes: {
      [rootId]: {
        id: rootId,
        type: 'box',
        name: frameName,
        parent: null,
        children: [],
        x: 0,
        y: 0,
        w: width,
        h: height,
        opacity: 1,
        hidden: false,
        locked: false,
        layout: { mode: 'column', gap: 0, padding: 0, align: 'start', justify: 'start' },
        style: { fill: background },
        props: {},
      },
    },
  }
}

/* ------------------------------------------------------------------ */
/* validation                                                          */
/* ------------------------------------------------------------------ */

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNum = v => typeof v === 'number' && Number.isFinite(v)
const isStr = v => typeof v === 'string'

export function validateSpec(spec) {
  const errors = []
  const err = (path, message) => errors.push({ path, message })

  if (!isObj(spec)) {
    return { ok: false, errors: [{ path: '', message: '设计稿必须是 JSON 对象' }] }
  }
  if (spec.version !== SPEC_VERSION) err('version', `version 必须是 ${SPEC_VERSION}`)
  if (!isStr(spec.name) || !spec.name.trim()) err('name', 'name 必须是非空字符串')

  // theme
  if (!isObj(spec.theme)) err('theme', 'theme 必须是对象')
  else {
    const t = spec.theme
    if (t.font !== undefined && !isStr(t.font)) err('theme.font', '主题字体必须是字符串')
    for (const group of ['colors', 'radius', 'space', 'fontSize', 'shadow']) {
      if (!isObj(t[group])) {
        err(`theme.${group}`, `theme.${group} 必须是对象`)
        continue
      }
      for (const [key, value] of Object.entries(t[group])) {
        if (!TOKEN_RE.test(key)) err(`theme.${group}.${key}`, `token 名非法：${key}`)
        if (group === 'colors' && isStr(value) && value.trim()) continue
        if (group === 'shadow' && isStr(value) && value.trim()) continue
        if ((group === 'radius' || group === 'space' || group === 'fontSize') && isNum(value)) continue
        err(`theme.${group}.${key}`, `token 值非法：${JSON.stringify(value)}`)
      }
    }
  }

  if (!Array.isArray(spec.frames)) err('frames', 'frames 必须是数组')
  if (!isObj(spec.rootIds)) err('rootIds', 'rootIds 必须是对象')
  if (!isObj(spec.nodes)) err('nodes', 'nodes 必须是对象')

  if (Array.isArray(spec.frames) && isObj(spec.rootIds) && isObj(spec.nodes)) {
    const frameIds = new Set()
    for (const [i, frame] of spec.frames.entries()) {
      const p = `frames[${i}]`
      if (!isObj(frame)) { err(p, 'frame 必须是对象'); continue }
      if (!isStr(frame.id) || !ID_RE.test(frame.id)) err(`${p}.id`, 'id 必须是 kebab-case')
      else if (frameIds.has(frame.id)) err(`${p}.id`, `重复的 frame id：${frame.id}`)
      else frameIds.add(frame.id)
      if (!isStr(frame.name) || !frame.name.trim()) err(`${p}.name`, 'name 必须是非空字符串')
      for (const key of ['x', 'y', 'width', 'height']) {
        if (!isNum(frame[key])) err(`${p}.${key}`, `${key} 必须是有限数字`)
      }
      if (isNum(frame.width) && frame.width <= 0) err(`${p}.width`, 'width 必须大于 0')
      if (isNum(frame.height) && frame.height <= 0) err(`${p}.height`, 'height 必须大于 0')
      if (frame.background !== undefined && frame.background !== null && !isStr(frame.background)) {
        err(`${p}.background`, 'background 必须是 token/颜色字符串')
      }
      const rootId = spec.rootIds[frame.id]
      if (!isStr(rootId)) err(`rootIds.${frame.id}`, '缺少该 frame 的根节点 id')
      else if (!spec.nodes[rootId]) err(`rootIds.${frame.id}`, `根节点不存在：${rootId}`)
      else if (spec.nodes[rootId].parent !== null) err(`nodes.${rootId}.parent`, 'frame 根节点的 parent 必须为 null')
    }

    // nodes
    const nodeIds = new Set(Object.keys(spec.nodes))
    const reachable = new Set()
    for (const [id, node] of Object.entries(spec.nodes)) {
      const p = `nodes.${id}`
      if (!ID_RE.test(id)) err(p, '节点 id 必须是 kebab-case')
      if (!isObj(node)) { err(p, '节点必须是对象'); continue }
      if (node.id !== id) err(`${p}.id`, `节点 id 与键不一致：${node.id}`)
      if (!NODE_TYPES.includes(node.type)) err(`${p}.type`, `未知节点类型：${node.type}`)
      if (!isStr(node.name) || !node.name.trim()) err(`${p}.name`, 'name 必须是非空字符串')
      for (const key of ['x', 'y', 'w', 'h']) {
        if (!isNum(node[key])) err(`${p}.${key}`, `${key} 必须是有限数字`)
      }
      if (isNum(node.w) && node.w < 0) err(`${p}.w`, 'w 不能为负数')
      if (isNum(node.h) && node.h < 0) err(`${p}.h`, 'h 不能为负数')
      if (node.opacity !== undefined && (!isNum(node.opacity) || node.opacity < 0 || node.opacity > 1)) {
        err(`${p}.opacity`, 'opacity 必须在 0-1 之间')
      }
      for (const flag of ['hidden', 'locked']) {
        if (node[flag] !== undefined && typeof node[flag] !== 'boolean') err(`${p}.${flag}`, `${flag} 必须是布尔值`)
      }
      if (node.parent !== null && !isStr(node.parent)) err(`${p}.parent`, 'parent 必须是字符串或 null')
      else if (isStr(node.parent) && !spec.nodes[node.parent]) err(`${p}.parent`, `父节点不存在：${node.parent}`)
      if (!Array.isArray(node.children)) err(`${p}.children`, 'children 必须是数组')
      else {
        const seen = new Set()
        for (const [ci, childId] of node.children.entries()) {
          if (!isStr(childId) || !spec.nodes[childId]) err(`${p}.children[${ci}]`, `子节点不存在：${childId}`)
          else if (seen.has(childId)) err(`${p}.children[${ci}]`, `重复的子节点：${childId}`)
          seen.add(childId)
        }
      }
      if (node.layout !== undefined) {
        if (!isObj(node.layout)) err(`${p}.layout`, 'layout 必须是对象')
        else {
          const layout = node.layout
          if (!LAYOUT_MODES.has(layout.mode)) err(`${p}.layout.mode`, 'mode 必须是 absolute/row/column')
          if (layout.gap !== undefined && (!isNum(layout.gap) || layout.gap < 0)) err(`${p}.layout.gap`, 'gap 必须是非负数字')
          if (layout.align !== undefined && !ALIGN.has(layout.align)) err(`${p}.layout.align`, 'align 取值非法')
          if (layout.justify !== undefined && !JUSTIFY.has(layout.justify)) err(`${p}.layout.justify`, 'justify 取值非法')
          if (layout.padding !== undefined && layout.padding !== null && !isNum(layout.padding) && !Array.isArray(layout.padding) && !isObj(layout.padding)) {
            err(`${p}.layout.padding`, 'padding 必须是数字/数组/对象')
          }
        }
      }
      if (node.style !== undefined) {
        if (!isObj(node.style)) err(`${p}.style`, 'style 必须是对象')
        else {
          const s = node.style
          if (s.fill !== undefined && s.fill !== null && !isStr(s.fill)) err(`${p}.style.fill`, 'fill 必须是 token/颜色或 null')
          if (s.stroke !== undefined && s.stroke !== null) {
            if (!isObj(s.stroke)) err(`${p}.style.stroke`, 'stroke 必须是对象或 null')
            else {
              if (s.stroke.color !== undefined && !isStr(s.stroke.color)) err(`${p}.style.stroke.color`, 'stroke.color 必须是字符串')
              if (s.stroke.width !== undefined && (!isNum(s.stroke.width) || s.stroke.width < 0)) err(`${p}.style.stroke.width`, 'stroke.width 必须是非负数字')
            }
          }
          if (s.font !== undefined && !isObj(s.font)) err(`${p}.style.font`, 'font 必须是对象')
          if (s.padding !== undefined && s.padding !== null && !isNum(s.padding) && !Array.isArray(s.padding) && !isObj(s.padding)) {
            err(`${p}.style.padding`, 'padding 必须是数字/数组/对象')
          }
          for (const key of ['radius', 'shadow']) {
            if (s[key] !== undefined && s[key] !== null && !isStr(s[key]) && !isNum(s[key])) err(`${p}.style.${key}`, `${key} 必须是字符串或数字`)
          }
        }
      }
      if (node.props !== undefined && !isObj(node.props)) err(`${p}.props`, 'props 必须是对象')
      if (node.type === 'text' && node.props !== undefined && node.props.text !== undefined && !isStr(node.props.text)) {
        err(`${p}.props.text`, 'text 必须是字符串')
      }
    }

    // parent/child consistency + cycles + reachability
    const visit = (id, seen) => {
      if (seen.has(id)) { err(`nodes.${id}`, '检测到循环引用'); return }
      seen.add(id)
      const node = spec.nodes[id]
      if (!node) return
      for (const childId of node.children || []) {
        const child = spec.nodes[childId]
        if (!child) continue
        if (child.parent !== id) err(`nodes.${childId}.parent`, `parent 应为 ${id}`)
        visit(childId, seen)
      }
    }
    for (const frame of spec.frames) {
      const rootId = spec.rootIds[frame.id]
      if (!rootId || !spec.nodes[rootId]) continue
      const root = spec.nodes[rootId]
      if (isNum(root.w) && isNum(frame.width) && root.w !== frame.width) err(`nodes.${rootId}.w`, '根节点 w 必须等于 frame.width')
      if (isNum(root.h) && isNum(frame.height) && root.h !== frame.height) err(`nodes.${rootId}.h`, '根节点 h 必须等于 frame.height')
      const seen = new Set()
      visit(rootId, seen)
      for (const id of seen) {
        reachable.add(id)
        if (id !== rootId && spec.nodes[id] && spec.nodes[id].parent === null) {
          err(`nodes.${id}.parent`, '非根节点必须有 parent')
        }
      }
    }
    for (const id of nodeIds) {
      if (!reachable.has(id)) err(`nodes.${id}`, '节点不可从任何 frame 到达（孤立节点）')
    }
  }

  return { ok: errors.length === 0, errors }
}

export function assertSpec(spec) {
  const result = validateSpec(spec)
  if (!result.ok) {
    const detail = result.errors.slice(0, 12).map(e => `${e.path}: ${e.message}`).join('\n')
    const error = new Error(`设计稿校验失败：\n${detail}${result.errors.length > 12 ? `\n…共 ${result.errors.length} 处` : ''}`)
    error.errors = result.errors
    throw error
  }
  return spec
}

/* ------------------------------------------------------------------ */
/* op helpers                                                          */
/* ------------------------------------------------------------------ */

function fail(index, op, message, path = '') {
  throw new OpsError(message, { index, op: op && op.op, path })
}

function asNumber(index, op, value, path) {
  if (!isNum(value)) fail(index, op, `${path} 必须是数字，收到 ${JSON.stringify(value)}`, path)
  return value
}

function resolveParent(draft, parentId) {
  if (isStr(parentId) && draft.nodes[parentId]) return parentId
  if (isStr(parentId) && draft.frames.some(f => f.id === parentId)) {
    const rootId = draft.rootIds[parentId]
    if (rootId) return rootId
  }
  return null
}

function assertIdFree(draft, id) {
  if (draft.nodes[id]) return false
  return !draft.frames.some(f => f.id === id)
}

function nextId(draft, prefix = 'n') {
  const base = (prefix || 'n').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'n'
  for (let i = 1; i < 10000; i += 1) {
    const id = i === 1 ? base : `${base}-${i}`
    if (assertIdFree(draft, id)) return id
  }
  return `${base}-${Date.now().toString(36)}`
}

function uniqueId(draft, wanted, prefix = 'n') {
  if (!wanted) return nextId(draft, prefix)
  if (!ID_RE.test(wanted)) throw new OpsError(`id 必须是 kebab-case：${wanted}`)
  if (!assertIdFree(draft, wanted)) throw new OpsError(`id 已存在：${wanted}`)
  return wanted
}

function jsonSafe(index, op, value, path) {
  try {
    const json = JSON.stringify(value)
    if (json === undefined) fail(index, op, `${path} 不能是 undefined`, path)
    return JSON.parse(json)
  } catch {
    fail(index, op, `${path} 必须是 JSON 可序列化的值`, path)
  }
}

function createNodeTree(draft, data, index, op, parentId) {
  const type = data.type
  if (!NODE_TYPES.includes(type)) fail(index, op, `未知节点类型：${JSON.stringify(type)}`, 'node.type')
  const [dw, dh] = TYPE_SIZES[type] || [200, 100]
  const id = uniqueId(draft, data.id, type)
  const node = {
    id,
    type,
    name: isStr(data.name) && data.name.trim() ? data.name.trim() : TYPE_NAMES[type] || type,
    parent: parentId,
    children: [],
    x: data.x === undefined ? 0 : asNumber(index, op, data.x, 'node.x'),
    y: data.y === undefined ? 0 : asNumber(index, op, data.y, 'node.y'),
    w: data.w === undefined ? dw : asNumber(index, op, data.w, 'node.w'),
    h: data.h === undefined ? dh : asNumber(index, op, data.h, 'node.h'),
    opacity: data.opacity === undefined ? 1 : Math.min(1, Math.max(0, asNumber(index, op, data.opacity, 'node.opacity'))),
    hidden: data.hidden === true,
    locked: data.locked === true,
    layout: isObj(data.layout)
      ? { mode: 'absolute', gap: 0, padding: 0, align: 'start', justify: 'start', ...jsonSafe(index, op, data.layout, 'node.layout') }
      : { mode: 'absolute', gap: 0, padding: 0, align: 'start', justify: 'start' },
    style: isObj(data.style) ? jsonSafe(index, op, data.style, 'node.style') : {},
    props: isObj(data.props) ? jsonSafe(index, op, data.props, 'node.props') : {},
  }
  if (node.w < 0 || node.h < 0) fail(index, op, 'w/h 不能为负数', 'node')
  draft.nodes[id] = node
  const rawChildren = Array.isArray(data.children) ? data.children : []
  for (const childData of rawChildren) {
    if (!isObj(childData)) fail(index, op, 'children 项必须是对象', 'node.children')
    const childId = createNodeTree(draft, childData, index, op, id)
    node.children.push(childId)
  }
  return id
}

function removeSubtree(draft, id) {
  const node = draft.nodes[id]
  if (!node) return
  for (const childId of [...(node.children || [])]) removeSubtree(draft, childId)
  delete draft.nodes[id]
}

function isFrameRoot(draft, id) {
  return Object.values(draft.rootIds).includes(id)
}

function applyOne(draft, op, index) {
  if (!isObj(op)) fail(index, op, 'op 必须是对象')
  const kind = op.op
  switch (kind) {
    case 'add': {
      const parentId = resolveParent(draft, op.parent)
      if (!parentId) fail(index, op, `父节点不存在：${JSON.stringify(op.parent)}（可以是节点 id 或 frame id）`, 'parent')
      const parent = draft.nodes[parentId]
      const nodeData = isObj(op.node) ? op.node : null
      if (!nodeData) fail(index, op, 'add 需要 node 对象', 'node')
      const newId = createNodeTree(draft, nodeData, index, op, parentId)
      const idx = op.index === undefined ? parent.children.length : Math.min(parent.children.length, Math.max(0, Math.trunc(asNumber(index, op, op.index, 'index'))))
      parent.children.splice(idx, 0, newId)
      return { op: kind, id: newId }
    }
    case 'remove': {
      const id = op.id
      if (!draft.nodes[id]) fail(index, op, `节点不存在：${id}`, 'id')
      if (isFrameRoot(draft, id)) fail(index, op, '不能删除 frame 根节点，请用 remove-frame', 'id')
      const parent = draft.nodes[draft.nodes[id].parent]
      if (parent) parent.children = parent.children.filter(cid => cid !== id)
      removeSubtree(draft, id)
      return { op: kind, id }
    }
    case 'set': {
      const node = draft.nodes[op.id]
      if (!node) fail(index, op, `节点不存在：${op.id}`, 'id')
      if (!isStr(op.path) || !op.path.trim()) fail(index, op, 'set 需要 path', 'path')
      const segs = op.path.split('.')
      if (!SET_TOP.has(segs[0])) {
        fail(index, op, `不支持修改 "${op.path}"（可改 name/x/y/w/h/opacity/hidden/locked/style.*/layout.*/props.*）`, 'path')
      }
      if (isFrameRoot(draft, node.id) && (segs[0] === 'w' || segs[0] === 'h')) {
        fail(index, op, 'frame 根节点的尺寸请用 set-frame 修改', 'path')
      }
      if (segs[0] === 'x' || segs[0] === 'y' || segs[0] === 'w' || segs[0] === 'h') {
        assertNumberValue(index, op, op.value, segs[0])
        if ((segs[0] === 'w' || segs[0] === 'h') && op.value < 0) fail(index, op, 'w/h 不能为负数', 'value')
        node[segs[0]] = op.value
        return { op: kind, id: node.id, path: op.path }
      }
      if (segs[0] === 'opacity') {
        assertNumberValue(index, op, op.value, 'opacity')
        node.opacity = Math.min(1, Math.max(0, op.value))
        return { op: kind, id: node.id, path: op.path }
      }
      if (segs[0] === 'hidden' || segs[0] === 'locked') {
        if (typeof op.value !== 'boolean') fail(index, op, `${segs[0]} 必须是布尔值`, 'value')
        node[segs[0]] = op.value
        return { op: kind, id: node.id, path: op.path }
      }
      if (segs[0] === 'name') {
        if (!isStr(op.value) || !op.value.trim()) fail(index, op, 'name 必须是非空字符串', 'value')
        node.name = op.value.trim()
        return { op: kind, id: node.id, path: op.path }
      }
      if (segs.length < 2) fail(index, op, `${segs[0]} 需要具体属性，如 ${segs[0]}.fill`, 'path')
      deepSet(node, segs, jsonSafe(index, op, op.value, 'value'))
      return { op: kind, id: node.id, path: op.path }
    }
    case 'move': {
      const node = draft.nodes[op.id]
      if (!node) fail(index, op, `节点不存在：${op.id}`, 'id')
      if (isFrameRoot(draft, node.id)) fail(index, op, '不能移动 frame 根节点', 'id')
      const parentId = resolveParent(draft, op.parent)
      if (!parentId) fail(index, op, `目标父节点不存在：${JSON.stringify(op.parent)}`, 'parent')
      // prevent moving into own subtree
      let cursor = parentId
      while (cursor) {
        if (cursor === node.id) fail(index, op, '不能把节点移动到自己的子孙里', 'parent')
        cursor = draft.nodes[cursor] ? draft.nodes[cursor].parent : null
      }
      const oldParent = draft.nodes[node.parent]
      if (oldParent) oldParent.children = oldParent.children.filter(cid => cid !== node.id)
      const newParent = draft.nodes[parentId]
      const idx = op.index === undefined ? newParent.children.length : Math.min(newParent.children.length, Math.max(0, Math.trunc(asNumber(index, op, op.index, 'index'))))
      newParent.children.splice(idx, 0, node.id)
      node.parent = parentId
      return { op: kind, id: node.id, parent: parentId }
    }
    case 'reorder': {
      const node = draft.nodes[op.id]
      if (!node || !node.parent) fail(index, op, `节点不存在或没有父节点：${op.id}`, 'id')
      const parent = draft.nodes[node.parent]
      const idx = Math.min(parent.children.length - 1, Math.max(0, Math.trunc(asNumber(index, op, op.index, 'index'))))
      parent.children = parent.children.filter(cid => cid !== node.id)
      parent.children.splice(idx, 0, node.id)
      return { op: kind, id: node.id, index: idx }
    }
    case 'duplicate': {
      const source = draft.nodes[op.id]
      if (!source) fail(index, op, `节点不存在：${op.id}`, 'id')
      if (isFrameRoot(draft, source.id)) fail(index, op, '不能复制 frame 根节点', 'id')
      const parent = draft.nodes[source.parent]
      if (!parent) fail(index, op, '源节点没有父节点', 'id')
      const copy = duplicateSubtree(draft, source, op.newId, index, op)
      const idx = parent.children.indexOf(source.id)
      parent.children.splice(idx + 1, 0, copy)
      return { op: kind, id: copy }
    }
    case 'add-frame': {
      const data = isObj(op.frame) ? op.frame : null
      if (!data) fail(index, op, 'add-frame 需要 frame 对象', 'frame')
      const id = uniqueId(draft, data.id, 'f')
      const width = data.width === undefined ? 390 : asNumber(index, op, data.width, 'frame.width')
      const height = data.height === undefined ? 844 : asNumber(index, op, data.height, 'frame.height')
      if (width <= 0 || height <= 0) fail(index, op, 'frame 尺寸必须大于 0', 'frame')
      const background = isStr(data.background) ? data.background : 'bg'
      const rootId = frameRootId(id)
      if (draft.nodes[rootId]) fail(index, op, `根节点 id 冲突：${rootId}`, 'frame.id')
      draft.frames.push({
        id,
        name: isStr(data.name) && data.name.trim() ? data.name.trim() : '新画板',
        x: data.x === undefined ? 0 : asNumber(index, op, data.x, 'frame.x'),
        y: data.y === undefined ? 0 : asNumber(index, op, data.y, 'frame.y'),
        width,
        height,
        background,
      })
      draft.rootIds[id] = rootId
      draft.nodes[rootId] = {
        id: rootId,
        type: 'box',
        name: '页面',
        parent: null,
        children: [],
        x: 0,
        y: 0,
        w: width,
        h: height,
        opacity: 1,
        hidden: false,
        locked: false,
        layout: { mode: 'column', gap: 0, padding: 0, align: 'start', justify: 'start' },
        style: { fill: background },
        props: {},
      }
      return { op: kind, id, rootId }
    }
    case 'set-frame': {
      const frame = draft.frames.find(f => f.id === op.id)
      if (!frame) fail(index, op, `frame 不存在：${op.id}`, 'id')
      if (!FRAME_SET.has(op.path)) fail(index, op, `set-frame 支持 name/x/y/width/height/background，收到 ${op.path}`, 'path')
      if (op.path === 'name') {
        if (!isStr(op.value) || !op.value.trim()) fail(index, op, 'name 必须是非空字符串', 'value')
        frame.name = op.value.trim()
        return { op: kind, id: frame.id, path: op.path }
      }
      if (op.path === 'background') {
        if (!isStr(op.value)) fail(index, op, 'background 必须是字符串', 'value')
        frame.background = op.value
        const root = draft.nodes[draft.rootIds[frame.id]]
        if (root) root.style = { ...root.style, fill: op.value }
        return { op: kind, id: frame.id, path: op.path }
      }
      assertNumberValue(index, op, op.value, op.path)
      if ((op.path === 'width' || op.path === 'height') && op.value <= 0) fail(index, op, '尺寸必须大于 0', 'value')
      frame[op.path] = op.value
      if (op.path === 'width' || op.path === 'height') {
        const root = draft.nodes[draft.rootIds[frame.id]]
        if (root) root[op.path === 'width' ? 'w' : 'h'] = op.value
      }
      return { op: kind, id: frame.id, path: op.path }
    }
    case 'remove-frame': {
      const frame = draft.frames.find(f => f.id === op.id)
      if (!frame) fail(index, op, `frame 不存在：${op.id}`, 'id')
      const rootId = draft.rootIds[frame.id]
      if (rootId) removeSubtree(draft, rootId)
      delete draft.rootIds[frame.id]
      draft.frames = draft.frames.filter(f => f.id !== frame.id)
      return { op: kind, id: frame.id }
    }
    case 'set-theme': {
      if (!draft.theme) draft.theme = defaultTheme()
      const path = String(op.path || '')
      const segs = path.split('.')
      if (segs[0] === 'font' && segs.length === 1) {
        if (!isStr(op.value) || !op.value.trim()) fail(index, op, 'font 必须是非空字符串', 'value')
        draft.theme.font = op.value
        return { op: kind, path }
      }
      if (!THEME_GROUPS.has(segs[0]) || segs.length !== 2) {
        fail(index, op, `set-theme 支持 font 或 colors/radius/space/fontSize/shadow 下的 token，收到 ${path}`, 'path')
      }
      if (!TOKEN_RE.test(segs[1])) fail(index, op, `token 名非法：${segs[1]}`, 'path')
      if (!isObj(draft.theme[segs[0]])) draft.theme[segs[0]] = {}
      if (segs[0] === 'shadow') {
        if (!isStr(op.value)) fail(index, op, 'shadow token 必须是字符串', 'value')
        draft.theme.shadow[segs[1]] = op.value
      } else if (segs[0] === 'colors') {
        if (!isStr(op.value) || !op.value.trim()) fail(index, op, '颜色 token 必须是非空字符串', 'value')
        draft.theme.colors[segs[1]] = op.value
      } else {
        assertNumberValue(index, op, op.value, 'value')
        draft.theme[segs[0]][segs[1]] = op.value
      }
      return { op: kind, path }
    }
    default:
      fail(index, op, `未知操作：${JSON.stringify(kind)}（支持 add/remove/set/move/reorder/duplicate/add-frame/set-frame/remove-frame/set-theme）`)
  }
}

function assertNumberValue(index, op, value, path) {
  if (!isNum(value)) fail(index, op, `${path} 必须是数字，收到 ${JSON.stringify(value)}`, path)
}

function deepSet(target, segs, value) {
  let cursor = target
  for (let i = 0; i < segs.length - 1; i += 1) {
    const key = segs[i]
    if (!isObj(cursor[key])) cursor[key] = {}
    cursor = cursor[key]
  }
  cursor[segs[segs.length - 1]] = value
}

function duplicateSubtree(draft, source, wantedRootId, index, op) {
  const idMap = new Map()
  const used = new Set()
  const makeId = (oldId, isRoot) => {
    if (isRoot && wantedRootId) {
      const id = uniqueId(draft, wantedRootId, 'n')
      used.add(id)
      return id
    }
    let base = `${oldId}-copy`
    if (used.has(base) || draft.nodes[base]) base = nextId(draft, `${oldId}-copy`)
    while (used.has(base)) base = nextId(draft, `${oldId}-copy`)
    used.add(base)
    return base
  }
  const collect = oldId => {
    if (idMap.has(oldId)) return
    const old = draft.nodes[oldId]
    if (!old) return
    idMap.set(oldId, makeId(oldId, oldId === source.id))
    for (const childId of old.children || []) collect(childId)
  }
  collect(source.id)
  for (const [oldId, newId] of idMap) {
    const old = draft.nodes[oldId]
    const copy = cloneSpec(old)
    copy.id = newId
    copy.parent = old.parent ? idMap.get(old.parent) || old.parent : null
    copy.children = (old.children || []).map(cid => idMap.get(cid)).filter(Boolean)
    draft.nodes[newId] = copy
  }
  if (draft.nodes[source.parent]) {
    draft.nodes[idMap.get(source.id)].parent = source.parent
  }
  return idMap.get(source.id)
}

/**
 * Apply ops atomically. Throws OpsError (with .index) and leaves the input
 * spec untouched when any op fails.
 * @returns {{ spec: object, results: Array<object> }}
 */
export function applyOps(spec, ops) {
  if (!Array.isArray(ops)) throw new OpsError('ops 必须是数组')
  if (ops.length === 0) return { spec: cloneSpec(spec), results: [] }
  const draft = cloneSpec(spec)
  const results = []
  ops.forEach((op, index) => {
    try {
      results.push(applyOne(draft, op, index))
    } catch (error) {
      if (error instanceof OpsError) {
        if (error.index === -1) error.index = index
        error.message = `第 ${error.index + 1} 个操作（${(op && op.op) || '?'}）失败：${error.message}`
      }
      throw error
    }
  })
  const result = validateSpec(draft)
  if (!result.ok) {
    const detail = result.errors.slice(0, 8).map(e => `${e.path}: ${e.message}`).join('；')
    throw new OpsError(`应用操作后设计稿无效：${detail}`, { index: ops.length - 1 })
  }
  return { spec: draft, results }
}

/* ------------------------------------------------------------------ */
/* prompt compacting                                                   */
/* ------------------------------------------------------------------ */

function shortValue(value, max = 60) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function styleSummary(node) {
  const style = node.style || {}
  const parts = []
  if (style.fill !== undefined) parts.push(`fill=${shortValue(style.fill, 20)}`)
  if (style.radius !== undefined) parts.push(`r=${style.radius}`)
  if (style.stroke) parts.push(`stroke=${shortValue(style.stroke.color, 16)}/${style.stroke.width ?? 1}`)
  if (style.shadow) parts.push(`shadow=${style.shadow}`)
  if (style.padding !== undefined && style.padding !== null) {
    parts.push(`pad=${Array.isArray(style.padding) ? style.padding.join(',') : style.padding}`)
  }
  const font = style.font || {}
  if (font.size !== undefined) parts.push(`size=${font.size}`)
  if (font.weight !== undefined) parts.push(`w=${font.weight}`)
  if (font.color !== undefined) parts.push(`color=${shortValue(font.color, 16)}`)
  if (font.align !== undefined) parts.push(`align=${font.align}`)
  if (font.lineHeight !== undefined) parts.push(`lh=${font.lineHeight}`)
  return parts.join(' ')
}

function layoutSummary(node) {
  const layout = node.layout || {}
  if (!layout.mode || layout.mode === 'absolute') return ''
  const parts = [`layout=${layout.mode}`]
  if (layout.gap) parts.push(`gap=${layout.gap}`)
  if (layout.align && layout.align !== 'start') parts.push(`align=${layout.align}`)
  if (layout.justify && layout.justify !== 'start') parts.push(`justify=${layout.justify}`)
  if (layout.padding) parts.push(`pad=${Array.isArray(layout.padding) ? layout.padding.join(',') : layout.padding}`)
  return parts.join(' ')
}

function propsSummary(node) {
  const props = node.props || {}
  switch (node.type) {
    case 'text': return isStr(props.text) ? `"${shortValue(props.text, 48)}"` : ''
    case 'button': return isStr(props.label) ? `"${shortValue(props.label, 24)}"` : ''
    case 'input': return [props.placeholder && `ph="${shortValue(props.placeholder, 24)}"`, props.value && `v="${shortValue(props.value, 24)}"`, props.icon && `icon=${props.icon}`].filter(Boolean).join(' ')
    case 'select': return props.value ? `v="${shortValue(props.value, 24)}"` : ''
    case 'icon': return props.name ? `icon=${props.name}` : ''
    case 'badge': return [props.text && `"${shortValue(props.text, 20)}"`, props.tone && `tone=${props.tone}`].filter(Boolean).join(' ')
    case 'tabs': return Array.isArray(props.items) ? `[${props.items.map(i => shortValue(i, 12)).join('|')}] active=${props.active || 0}` : ''
    case 'table': return Array.isArray(props.columns) ? `cols=${props.columns.length} rows=${(props.rows || []).length}` : ''
    case 'chart': return `${props.kind || 'bar'} data=[${(props.data || []).join(',')}]`
    case 'toggle': return `checked=${props.checked !== false}`
    case 'checkbox': return `checked=${props.checked !== false}${props.label ? ` "${shortValue(props.label, 20)}"` : ''}`
    case 'card': return [props.title && `"${shortValue(props.title, 24)}"`, props.body && `"${shortValue(props.body, 24)}"`].filter(Boolean).join(' ')
    case 'avatar': return props.initials ? `initials=${props.initials}` : ''
    case 'image': return props.src ? `src=${shortValue(props.src, 32)}` : ''
    default: return ''
  }
}

export function tokensForPrompt(theme = DEFAULT_THEME) {
  const t = theme || DEFAULT_THEME
  const colors = Object.entries(t.colors || {}).map(([k, v]) => `${k}=${v}`).join(', ')
  const radius = Object.entries(t.radius || {}).map(([k, v]) => `${k}:${v}`).join(' ')
  const space = Object.entries(t.space || {}).map(([k, v]) => `${k}:${v}`).join(' ')
  const fontSize = Object.entries(t.fontSize || {}).map(([k, v]) => `${k}:${v}`).join(' ')
  return `font=${t.font || 'system-ui'} | colors: ${colors} | radius: ${radius} | space: ${space} | fontSize: ${fontSize}`
}

/**
 * Compact textual rendering of a design for model prompts.
 * @returns {string}
 */
export function compactSpec(spec, { maxChars = 8000 } = {}) {
  if (!spec || !spec.frames) return '(空设计稿)'
  const nodes = spec.nodes || {}
  const lines = []
  lines.push(`设计稿: ${spec.name} · ${spec.frames.length} frame(s)`)
  lines.push(`tokens: ${tokensForPrompt(spec.theme)}`)

  const renderNode = (id, depth) => {
    const node = nodes[id]
    if (!node) return
    if (node.hidden) return
    const indent = '  '.repeat(depth + 1)
    const geometry = node.parent === null ? `${node.w}x${node.h}` : `@${Math.round(node.x)},${Math.round(node.y)} ${node.w}x${node.h}`
    const bits = [
      `${indent}${node.id} ${node.type} "${node.name}" ${geometry}`,
      styleSummary(node),
      layoutSummary(node),
      propsSummary(node),
    ].filter(Boolean)
    lines.push(bits.join(' '))
    for (const childId of node.children || []) renderNode(childId, depth + 1)
  }

  for (const frame of spec.frames) {
    lines.push(`frame ${frame.id} "${frame.name}" @${frame.x},${frame.y} ${frame.width}x${frame.height} bg=${frame.background ?? 'transparent'}`)
    const rootId = spec.rootIds[frame.id]
    if (rootId) renderNode(rootId, 0)
  }

  let text = lines.join('\n')
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n…（设计稿过大已截断，优先操作已有 id，避免重建整页）`
  }
  return text
}

/* ------------------------------------------------------------------ */
/* review heuristics                                                   */
/* ------------------------------------------------------------------ */

function parseColor(input, theme) {
  const resolved = resolveColor(input, theme)
  if (!resolved || typeof resolved !== 'string') return null
  const value = resolved.trim()
  let m = /^#([0-9a-f]{3,8})$/i.exec(value)
  if (m) {
    let hex = m[1]
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
    if (hex.length === 4) hex = hex.split('').map(c => c + c).join('')
    if (hex.length === 6) hex += 'ff'
    if (hex.length !== 8) return null
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: parseInt(hex.slice(6, 8), 16) / 255,
    }
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(value)
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    if (parts.length >= 3) return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
  }
  return null
}

function luminance({ r, g, b }) {
  const channel = v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(foreground, background, theme = DEFAULT_THEME) {
  const fg = parseColor(foreground, theme)
  const bg = parseColor(background, theme)
  if (!fg || !bg) return null
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const light = Math.max(l1, l2)
  const dark = Math.min(l1, l2)
  return Number(((light + 0.05) / (dark + 0.05)).toFixed(2))
}

function absolutePosition(spec, node) {
  let x = 0
  let y = 0
  let cursor = node
  while (cursor) {
    x += cursor.x || 0
    y += cursor.y || 0
    cursor = cursor.parent ? spec.nodes[cursor.parent] : null
  }
  return { x, y }
}

function isAncestor(spec, ancestorId, nodeId) {
  let cursor = spec.nodes[nodeId]
  while (cursor && cursor.parent) {
    if (cursor.parent === ancestorId) return true
    cursor = spec.nodes[cursor.parent]
  }
  return false
}

function frameOuterFill(spec, node) {
  let cursor = node
  while (cursor) {
    const fill = cursor.style?.fill
    if (fill && fill !== 'transparent') return fill
    cursor = cursor.parent ? spec.nodes[cursor.parent] : null
  }
  const frame = spec.frames.find(f => spec.rootIds[f.id] && isAncestor(spec, spec.rootIds[f.id], node.id))
  return frame ? frame.background : 'bg'
}

/** Counts + heuristic warnings used by the critique prompt and UI. */
export function summarizeSpec(spec) {
  const counts = {}
  const warnings = []
  const nodes = Object.values(spec.nodes || {})
  for (const node of nodes) counts[node.type] = (counts[node.type] || 0) + 1

  for (const frame of spec.frames || []) {
    const rootId = spec.rootIds[frame.id]
    if (!rootId) continue
    for (const node of nodes) {
      if (!isAncestor(spec, rootId, node.id)) continue
      const pos = absolutePosition(spec, node)
      if (pos.x < -1 || pos.y < -1 || pos.x + node.w > frame.width + 1 || pos.y + node.h > frame.height + 1) {
        warnings.push({
          type: 'overflow',
          targetId: node.id,
          message: `节点「${node.name}」超出画板「${frame.name}」边界（${Math.round(pos.x)},${Math.round(pos.y)} ${node.w}x${node.h}）`,
        })
      }
    }
  }

  const textTypes = new Set(['text', 'button', 'input', 'select', 'badge', 'checkbox'])
  for (const node of nodes) {
    if (!textTypes.has(node.type)) continue
    const style = effectiveStyle(node)
    const fg = style.font?.color || (node.type === 'button' ? 'onPrimary' : 'text')
    const bg = frameOuterFill(spec, node)
    const ratio = contrastRatio(fg, bg, spec.theme)
    if (ratio !== null && ratio < 4.5) {
      warnings.push({
        type: 'contrast',
        targetId: node.id,
        message: `「${node.name}」文字对比度 ${ratio}:1 低于 4.5:1（${fg} on ${bg}）`,
      })
    }
  }

  for (const node of nodes) {
    if (!['button', 'input', 'toggle', 'checkbox', 'select'].includes(node.type)) continue
    if (node.w < 32 || node.h < 20) {
      warnings.push({
        type: 'target-size',
        targetId: node.id,
        message: `「${node.name}」点击区域偏小（${node.w}x${node.h}），建议至少 32x32`,
      })
    }
  }

  return {
    frames: (spec.frames || []).map(f => ({ id: f.id, name: f.name, width: f.width, height: f.height })),
    counts,
    nodeCount: nodes.length,
    warnings: warnings.slice(0, 40),
  }
}
