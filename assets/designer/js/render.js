/**
 * UI Designer — canvas renderer.
 *
 * Renders `state.spec.frames` as `.ud-frame` artboards inside the canvas DOM
 * shell, and each frame's node tree with the shared, pure style engine from
 * `js/shared/style.mjs` (boxStyle / fontStyle / contentHTML / layoutChildren).
 * The exporter and the server prompt builder use the same functions, so the
 * editor cannot drift from the exported code.
 *
 * This module also owns the canvas DOM shell
 * (`.ud-viewport > .ud-world > .ud-frame-layer + .ud-overlay`) because both the
 * renderer and the interaction layer need the same elements. `initCanvas()`
 * calls `ensureCanvasDom()` and adopts whatever is already there.
 *
 * Public API:
 *   initRender(appEl)          wire bus subscriptions + first paint
 *   nodeElement(id)            DOM element for a node id (hit testing)
 *   ensureCanvasDom(areaEl)    idempotent canvas shell builder
 *   resolveCanvasArea(input)   element | app root | { areaEl } -> canvas area
 *   nodeWorldRect(id)          world-space rect (used by canvas guides/handles)
 *   nodeParentWorldRect(id)
 *   nodeEffectiveLocal(id)
 */

import { bus, state, getNode, getFrameOf, parentOf } from './store.js'
import {
  DEFAULT_THEME,
  boxStyle,
  contentHTML,
  effectiveStyle,
  fontStyle,
  layoutChildren,
  resolveColor,
} from './shared/style.mjs'

/* ------------------------------------------------------------------ */
/* canvas DOM shell                                                    */
/* ------------------------------------------------------------------ */

const domCache = new WeakMap()

/** Resolve the canvas area element from an element / app root / options bag. */
export function resolveCanvasArea(input) {
  if (input && input.nodeType === 1) {
    if (input.id === 'ud-canvas-area' || input.classList.contains('ud-canvas-area')) return input
    return input.querySelector('#ud-canvas-area, .ud-canvas-area') || input
  }
  if (input && (input.appEl || input.areaEl || input.el)) {
    return resolveCanvasArea(input.appEl || input.areaEl || input.el)
  }
  return document.getElementById('ud-canvas-area') || document.querySelector('.ud-canvas-area')
}

function div(className) {
  const el = document.createElement('div')
  if (className) el.className = className
  return el
}

/**
 * Build (once) the structure canvas.js and render.js share:
 *
 *   .ud-canvas-area
 *     .ud-viewport                 screen space, clips the world, owns the wheel
 *       .ud-canvas-empty           placeholder when the design has no frames
 *       .ud-world                  pan/zoom transform lives here
 *         .ud-frame-layer          one .ud-frame per artboard (render.js writes)
 *         .ud-overlay              guides / resize handles / size badge
 *           .ud-guides .ud-handles .ud-size-badge
 */
export function ensureCanvasDom(input) {
  const area = resolveCanvasArea(input)
  if (!area) return null
  const cached = domCache.get(area)
  if (cached && cached.viewport.isConnected) return cached

  const viewport = area.querySelector('.ud-viewport') || div('ud-viewport')
  if (!viewport.parentNode) area.append(viewport)

  const world = viewport.querySelector('.ud-world') || div('ud-world')
  if (!world.parentNode) viewport.append(world)

  const frameLayer = world.querySelector('.ud-frame-layer') || div('ud-frame-layer')
  if (!frameLayer.parentNode) world.append(frameLayer)

  let overlay = world.querySelector('.ud-overlay')
  if (!overlay) {
    overlay = div('ud-overlay')
    overlay.innerHTML =
      '<div class="ud-guides"></div><div class="ud-handles"></div><div class="ud-size-badge" hidden></div>'
    world.append(overlay)
  }

  let emptyEl = viewport.querySelector('.ud-canvas-empty')
  if (!emptyEl) {
    emptyEl = div('ud-canvas-empty')
    emptyEl.innerHTML =
      '<strong>画布是空的</strong><span>用左侧「组件」添加区块，或让 AI 生成界面</span>'
    emptyEl.hidden = true
    viewport.append(emptyEl)
  }

  const dom = {
    area,
    viewport,
    world,
    frameLayer,
    overlay,
    guideLayer: overlay.querySelector('.ud-guides'),
    handleLayer: overlay.querySelector('.ud-handles'),
    sizeBadge: overlay.querySelector('.ud-size-badge'),
    emptyEl,
  }
  domCache.set(area, dom)
  return dom
}

/* ------------------------------------------------------------------ */
/* module state                                                        */
/* ------------------------------------------------------------------ */

let areaEl = null
let dom = null
let mounted = false
let hoverId = null

/** node id -> element */
const nodeEls = new Map()
/** frame id -> { el, name, size, content, frame } */
const frameEls = new Map()

/* ------------------------------------------------------------------ */
/* misc helpers                                                        */
/* ------------------------------------------------------------------ */

const TYPE_CLASS_CACHE = new Map()

function cssTextFromStyle(style) {
  let out = ''
  for (const key in style) {
    const value = style[key]
    if (value === undefined || value === null || value === '') continue
    const prop = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
    out += `${prop}:${value};`
  }
  return out
}

function applyInlineStyle(el, style) {
  const css = cssTextFromStyle(style)
  if (el.__udCss === css) return
  el.__udCss = css
  el.style.cssText = css
}

function isRootNode(node) {
  return !node || !node.parent
}

function visibleChildren(node, spec) {
  if (!node || !Array.isArray(node.children) || !node.children.length) return []
  const out = []
  for (const id of node.children) {
    const child = spec.nodes && spec.nodes[id]
    if (child && !child.hidden) out.push(child)
  }
  return out
}

/** Keep parentEl's element children in exactly `els` order without churn. */
function syncChildren(parentEl, els) {
  const wanted = new Set(els)
  for (const el of els) {
    if (el.parentNode === parentEl) continue
    parentEl.append(el)
  }
  // Remove anything that is no longer wanted (stale element children only;
  // content nodes are text/HTML and only exist on leaf nodes which have no
  // element children).
  let node = parentEl.firstChild
  while (node) {
    const next = node.nextSibling
    if (node.nodeType === 1 && !wanted.has(node)) parentEl.removeChild(node)
    node = next
  }
  // Reorder: walk the desired list once, inserting before the current cursor.
  let cursor = parentEl.firstChild
  for (const el of els) {
    if (cursor === el) {
      cursor = cursor.nextSibling
      continue
    }
    parentEl.insertBefore(el, cursor || null)
  }
}

/* ------------------------------------------------------------------ */
/* render                                                              */
/* ------------------------------------------------------------------ */

function ensureFrame(frame) {
  let entry = frameEls.get(frame.id)
  if (entry && entry.el.isConnected) return entry
  const el = div('ud-frame')
  el.dataset.frameId = frame.id
  const label = div('ud-frame__label')
  const name = div('ud-frame__name')
  const size = div('ud-frame__size')
  label.append(name, size)
  const content = div('ud-frame__content')
  el.append(label, content)
  entry = { el, label, name, size, content, frame }
  frameEls.set(frame.id, entry)
  return entry
}

function updateFrame(entry, frame, theme) {
  const { el, name, size, content } = entry
  entry.frame = frame
  const left = `${Number(frame.x) || 0}px`
  const top = `${Number(frame.y) || 0}px`
  const width = `${Number(frame.width) || 0}px`
  const height = `${Number(frame.height) || 0}px`
  if (el.__udFrameBox !== `${left}/${top}/${width}/${height}`) {
    el.__udFrameBox = `${left}/${top}/${width}/${height}`
    el.style.left = left
    el.style.top = top
    el.style.width = width
    el.style.height = height
  }
  const labelText = frame.name || frame.id
  if (name.textContent !== labelText) name.textContent = labelText
  const sizeText = `${Math.round(Number(frame.width) || 0)} × ${Math.round(Number(frame.height) || 0)}`
  if (size.textContent !== sizeText) size.textContent = sizeText
  const bg = resolveColor(frame.background, theme) || 'transparent'
  if (el.__udBg !== bg) {
    el.__udBg = bg
    content.style.background = bg
  }
}

function createNodeEl(node) {
  const el = document.createElement('div')
  el.dataset.nodeId = node.id
  el.dataset.nodeType = node.type
  return el
}

function renderNode(node, parentEl, pos, theme, spec, seen) {
  seen.add(node.id)

  let el = nodeEls.get(node.id)
  if (!el) {
    el = createNodeEl(node)
    nodeEls.set(node.id, el)
  }

  if (el.__udType !== node.type) {
    el.__udType = node.type
    el.className = `ud-node ud-node--${node.type}`
  }
  el.dataset.nodeId = node.id
  el.dataset.nodeType = node.type
  if (el.dataset.nodeName !== (node.name || '')) el.dataset.nodeName = node.name || ''
  el.classList.toggle('ud-node--root', isRootNode(node))
  el.classList.toggle('ud-node--locked', !!node.locked)

  applyInlineStyle(el, { ...fontStyle(node, theme), ...boxStyle(node, theme, pos) })

  const kids = visibleChildren(node, spec)
  const content = kids.length ? '' : contentHTML(node, theme)
  if (el.__udContent !== content) {
    el.__udContent = content
    el.innerHTML = content
  }

  const childEls = []
  if (kids.length) {
    const positions = layoutChildren(node, spec)
    for (const child of kids) {
      const p = positions.get(child.id) || {
        x: child.x || 0,
        y: child.y || 0,
        w: child.w || 0,
        h: child.h || 0,
      }
      childEls.push(renderNode(child, el, p, theme, spec, seen))
    }
    syncChildren(el, childEls)
  }

  if (!el.isConnected && el.parentNode !== parentEl) parentEl.append(el)
  return el
}

function clearCanvas() {
  for (const el of nodeEls.values()) el.remove()
  nodeEls.clear()
  for (const entry of frameEls.values()) entry.el.remove()
  frameEls.clear()
  hoverId = null
}

function setEmpty(show) {
  if (!dom) return
  if (dom.emptyEl.hidden === show) dom.emptyEl.hidden = !show
}

function render() {
  if (!dom || !dom.viewport.isConnected) dom = ensureCanvasDom(areaEl)
  if (!dom) return
  const spec = state.spec
  if (!spec || !Array.isArray(spec.frames)) {
    clearCanvas()
    setEmpty(true)
    return
  }
  const theme = spec.theme || DEFAULT_THEME
  const seen = new Set()
  const frameOrder = []

  for (const frame of spec.frames) {
    if (!frame || !frame.id) continue
    const entry = ensureFrame(frame)
    frameOrder.push(entry.el)
    updateFrame(entry, frame, theme)
    const rootId = spec.rootIds ? spec.rootIds[frame.id] : null
    const root = rootId && spec.nodes ? spec.nodes[rootId] : null
    if (root && !root.hidden) {
      const pos = {
        x: Number(root.x) || 0,
        y: Number(root.y) || 0,
        w: Number(root.w) || Number(frame.width) || 0,
        h: Number(root.h) || Number(frame.height) || 0,
      }
      renderNode(root, entry.content, pos, theme, spec, seen)
    }
  }

  // Drop nodes that disappeared (or moved under a hidden ancestor).
  for (const [id, el] of nodeEls) {
    if (!seen.has(id)) {
      el.remove()
      nodeEls.delete(id)
    }
  }
  // Drop frames that disappeared.
  const frameIds = new Set(spec.frames.map(f => f && f.id).filter(Boolean))
  for (const [id, entry] of frameEls) {
    if (!frameIds.has(id)) {
      entry.el.remove()
      frameEls.delete(id)
    }
  }
  syncChildren(dom.frameLayer, frameOrder)

  setEmpty(!spec.frames.length)
  applyStateClasses()
}

/* ------------------------------------------------------------------ */
/* selection / hover classes                                           */
/* ------------------------------------------------------------------ */

function setHover(id) {
  if (id === hoverId) return
  const prev = hoverId ? nodeEls.get(hoverId) : null
  if (prev) prev.classList.remove('ud-node--hover')
  hoverId = id
  const next = id ? nodeEls.get(id) : null
  if (next) next.classList.add('ud-node--hover')
}

function applyStateClasses() {
  const spec = state.spec
  const selection = new Set(Array.isArray(state.selection) ? state.selection : [])
  for (const [id, el] of nodeEls) {
    el.classList.toggle('ud-node--selected', selection.has(id))
    const node = spec && spec.nodes ? spec.nodes[id] : null
    if (!node) continue
    el.classList.toggle('ud-node--locked', !!node.locked)
    if (hoverId === id) el.classList.add('ud-node--hover')
  }
  for (const [frameId, entry] of frameEls) {
    const rootId = spec && spec.rootIds ? spec.rootIds[frameId] : null
    entry.el.classList.toggle('ud-frame--selected', !!(rootId && selection.has(rootId)))
  }
}

/* ------------------------------------------------------------------ */
/* bus wiring                                                          */
/* ------------------------------------------------------------------ */

function onSpec() {
  render()
}

function onSelection() {
  applyStateClasses()
}

function onView() {
  if (!dom) return
  const pct = Math.round((state.zoom || 1) * 100)
  if (dom.area.dataset.zoom !== String(pct)) dom.area.dataset.zoom = String(pct)
}

function bindHover() {
  if (!dom || dom.frameLayer.__udHoverBound) return
  dom.frameLayer.__udHoverBound = true
  dom.frameLayer.addEventListener('pointerover', event => {
    const target = event.target
    if (!target || target.nodeType !== 1) return
    const el = target.closest('.ud-node')
    setHover(el ? el.dataset.nodeId : null)
  })
  dom.frameLayer.addEventListener('pointerleave', () => setHover(null))
}

/* ------------------------------------------------------------------ */
/* public geometry (shared with canvas.js)                             */
/* ------------------------------------------------------------------ */

function borderWidth(node) {
  if (!node) return 0
  const stroke = effectiveStyle(node).stroke
  if (!stroke || !stroke.width) return 0
  return Number(stroke.width) || 0
}

function frameRectOf(id) {
  const frame = getFrameOf(id)
  if (!frame) return { x: 0, y: 0, w: 0, h: 0 }
  return {
    x: Number(frame.x) || 0,
    y: Number(frame.y) || 0,
    w: Number(frame.width) || 0,
    h: Number(frame.height) || 0,
  }
}

function chainOf(id) {
  const chain = []
  let cur = getNode(id)
  let guard = 0
  while (cur && guard++ < 256) {
    chain.unshift(cur)
    if (!cur.parent) break
    cur = getNode(cur.parent)
  }
  return chain
}

function localPosition(parent, childId, spec) {
  const positions = layoutChildren(parent, spec)
  const pos = positions.get(childId)
  if (pos) return pos
  const child = getNode(childId)
  return { x: (child && child.x) || 0, y: (child && child.y) || 0, w: (child && child.w) || 0, h: (child && child.h) || 0 }
}

/** Node rect in world coordinates (frame + ancestor offsets + layout overrides). */
export function nodeWorldRect(id) {
  const spec = state.spec
  const node = getNode(id)
  if (!spec || !node) return null
  const chain = chainOf(id)
  const frame = getFrameOf(id) || null
  let x = frame ? Number(frame.x) || 0 : 0
  let y = frame ? Number(frame.y) || 0 : 0
  // Root nodes live at frame origin (root.x/root.y should be 0).
  x += Number(chain[0].x) || 0
  y += Number(chain[0].y) || 0
  for (let i = 1; i < chain.length; i++) {
    const parent = chain[i - 1]
    const local = localPosition(parent, chain[i].id, spec)
    x += borderWidth(parent) + local.x
    y += borderWidth(parent) + local.y
  }
  return { x, y, w: Number(node.w) || 0, h: Number(node.h) || 0 }
}

/** Rect of the node's parent (node or frame background) in world coordinates. */
export function nodeParentWorldRect(id) {
  const parent = parentOf(id)
  if (parent) return nodeWorldRect(parent.id)
  const node = getNode(id)
  if (!node) return null
  const frame = getFrameOf(id)
  if (!frame) return null
  return { x: Number(frame.x) || 0, y: Number(frame.y) || 0, w: Number(frame.width) || 0, h: Number(frame.height) || 0 }
}

/** Effective position/size of a node relative to its parent origin. */
export function nodeEffectiveLocal(id) {
  const node = getNode(id)
  if (!node) return null
  const parent = parentOf(id)
  if (!parent) return { x: Number(node.x) || 0, y: Number(node.y) || 0, w: Number(node.w) || 0, h: Number(node.h) || 0 }
  const pos = localPosition(parent, id, state.spec)
  return { x: pos.x, y: pos.y, w: pos.w, h: pos.h }
}

/** Element currently rendering `id`, or null (hidden / not rendered). */
export function nodeElement(id) {
  return nodeEls.get(id) || null
}

/* ------------------------------------------------------------------ */
/* init                                                                */
/* ------------------------------------------------------------------ */

let renderArea = null
let renderApi = null

export function initRender(appEl) {
  const area = resolveCanvasArea(appEl)
  if (!area) {
    console.warn('[ui-designer] initRender: canvas area not found')
    return null
  }
  if (mounted && renderArea === area) {
    render()
    return renderApi
  }
  areaEl = area
  renderArea = area
  dom = ensureCanvasDom(area)
  if (!dom) return null
  bindHover()
  bus.addEventListener('spec', onSpec)
  bus.addEventListener('selection', onSelection)
  bus.addEventListener('view', onView)
  mounted = true
  renderApi = {
    render,
    nodeElement,
    nodeWorldRect,
    nodeParentWorldRect,
    nodeEffectiveLocal,
    setHover,
  }
  render()
  return renderApi
}
