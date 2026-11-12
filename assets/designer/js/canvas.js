/**
 * UI Designer — canvas interactions.
 *
 * Owns pan/zoom, hit-test based selection, drag-move, resize (8 handles),
 * snapping with guides, auto-layout reorder and the small toolbar API used by
 * app.js. `store` remains the single source of truth for `selection` / `zoom` /
 * `pan` / `spec`; this module never writes spec directly, it goes through
 * store.update() with an explicit history strategy.
 *
 * World space: frame.x/y and node offsets, unscaled.
 * Screen space: world * zoom + pan, relative to the canvas area element.
 */

import {
  state,
  bus,
  getNode,
  parentOf,
  childrenOf,
  setSelection,
  setZoom as storeSetZoom,
  setPan as storeSetPan,
  update,
  beginHistory,
  commitHistory,
} from './store.js'
import { ensureCanvasDom, resolveCanvasArea, nodeWorldRect } from './render.js'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 3
const ZOOM_STEP = 1.2
const SNAP_SCREEN_PX = 6
const MIN_SIZE = 2
const DRAG_THRESHOLD_SCREEN_PX = 2

const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_ANCHORS = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
}

/* ------------------------------------------------------------------ */
/* small utils                                                         */
/* ------------------------------------------------------------------ */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

function isTypingTarget(target) {
  if (!target || target.nodeType !== 1) return false
  return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
}

function isInteractiveTarget(target) {
  return isTypingTarget(target) || !!(target && target.closest && target.closest('button, a'))
}

/** Multi-select toggle. store.js exposes setSelection only, so derive here. */
function toggleNodeSelection(id) {
  const current = Array.isArray(state.selection) ? state.selection : []
  const next = current.includes(id) ? current.filter(item => item !== id) : current.concat(id)
  setSelection(next)
}

function dedupeNumbers(list) {
  const out = []
  const seen = new Set()
  for (const v of list) {
    if (!Number.isFinite(v)) continue
    const key = Math.round(v * 1000) / 1000
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function sameOrder(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/* ------------------------------------------------------------------ */
/* init                                                                */
/* ------------------------------------------------------------------ */

let initialized = false
let api = null
let area = null
let dom = null

let spaceDown = false
let drag = null
let animTimer = 0
let didAutoFit = false

export function initCanvas(options) {
  const requested = options && options.nodeType === 1 ? options : options && options.areaEl ? options.areaEl : options
  const resolved = resolveCanvasArea(requested)
  if (!resolved) {
    console.warn('[ui-designer] initCanvas: canvas area not found')
    return null
  }
  if (initialized && area === resolved) return api

  area = resolved
  dom = ensureCanvasDom(area)
  if (!dom) return null
  initialized = true

  bindEvents()
  applyView()
  drawSelection()
  requestAnimationFrame(maybeAutoFit)

  api = {
    fitView,
    zoomBy,
    setZoom: setZoomCentered,
    screenToWorld,
    nudgeSelection,
    panBy,
    getZoom: () => state.zoom,
    viewportEl: dom.viewport,
    worldEl: dom.world,
  }
  return api
}

/* ------------------------------------------------------------------ */
/* view: pan / zoom                                                    */
/* ------------------------------------------------------------------ */

function applyView() {
  if (!dom) return
  const zoom = Number(state.zoom) || 1
  const pan = state.pan || { x: 0, y: 0 }
  dom.world.style.transform = `translate3d(${pan.x || 0}px, ${pan.y || 0}px, 0) scale(${zoom})`
  dom.world.style.setProperty('--ud-zoom', String(zoom))
  dom.world.style.setProperty('--ud-inv-zoom', String(1 / zoom))
}

/** Screen (area-relative) point -> world point. */
function screenToWorld(pt) {
  const zoom = Number(state.zoom) || 1
  const pan = state.pan || { x: 0, y: 0 }
  return { x: ((pt ? pt.x : 0) - pan.x) / zoom, y: ((pt ? pt.y : 0) - pan.y) / zoom }
}

function viewportRect() {
  return dom.viewport.getBoundingClientRect()
}

function areaPoint(event) {
  const rect = viewportRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function clientToWorld(event) {
  return screenToWorld(areaPoint(event))
}

function viewportSize() {
  return {
    w: dom.viewport.clientWidth || area.clientWidth || 0,
    h: dom.viewport.clientHeight || area.clientHeight || 0,
  }
}

function animateView(fn) {
  if (!dom) return
  dom.world.classList.add('is-animating')
  // Force a style flush so the transition applies to the change fn() makes.
  void dom.world.offsetWidth
  fn()
  clearTimeout(animTimer)
  animTimer = setTimeout(() => dom.world.classList.remove('is-animating'), 240)
}

function zoomAtPoint(point, nextZoom, animate = false) {
  const zoom = Number(state.zoom) || 1
  const target = clamp(Number(nextZoom) || zoom, MIN_ZOOM, MAX_ZOOM)
  if (Math.abs(target - zoom) < 1e-4) return
  const pan = state.pan || { x: 0, y: 0 }
  const world = { x: (point.x - pan.x) / zoom, y: (point.y - pan.y) / zoom }
  const apply = () => {
    storeSetZoom(target)
    storeSetPan({ x: point.x - world.x * target, y: point.y - world.y * target })
  }
  if (animate) animateView(apply)
  else apply()
}

function setZoomCentered(z, animate = false) {
  const size = viewportSize()
  zoomAtPoint({ x: size.w / 2, y: size.h / 2 }, z, animate)
}

function zoomBy(factor, animate = true) {
  zoomAtPoint({ x: viewportSize().w / 2, y: viewportSize().h / 2 }, (Number(state.zoom) || 1) * (Number(factor) || 1), animate)
}

function panBy(dx, dy) {
  if (!dom) return
  const pan = state.pan || { x: 0, y: 0 }
  storeSetPan({ x: pan.x + (Number(dx) || 0), y: pan.y + (Number(dy) || 0) })
}

function fitView(animate = true) {
  if (!dom) return
  const frames = (state.spec && state.spec.frames) || []
  const size = viewportSize()
  if (!frames.length || !size.w || !size.h) {
    const reset = () => {
      storeSetZoom(1)
      storeSetPan({ x: 0, y: 0 })
    }
    if (animate) animateView(reset)
    else reset()
    return
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const frame of frames) {
    const x = Number(frame.x) || 0
    const y = Number(frame.y) || 0
    const w = Number(frame.width) || 0
    const h = Number(frame.height) || 0
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }
  const bboxW = Math.max(1, maxX - minX)
  const bboxH = Math.max(1, maxY - minY)
  // Keep room for the frame labels above each artboard (none in preview mode).
  const preview = !!(document.getElementById('ud-app') && document.getElementById('ud-app').classList.contains('ud-preview'))
  const padX = preview ? 24 : 64
  const padTop = preview ? 24 : 88
  const padBottom = preview ? 24 : 56
  const zoom = clamp(Math.min((size.w - padX * 2) / bboxW, (size.h - padTop - padBottom) / bboxH), MIN_ZOOM, MAX_ZOOM)
  const pan = {
    x: (size.w - bboxW * zoom) / 2 - minX * zoom,
    y: padTop + (size.h - padTop - padBottom - bboxH * zoom) / 2 - minY * zoom,
  }
  const apply = () => {
    storeSetZoom(zoom)
    storeSetPan(pan)
  }
  if (animate) animateView(apply)
  else apply()
}

function maybeAutoFit() {
  if (didAutoFit) return
  if (!state.spec || !Array.isArray(state.spec.frames) || !state.spec.frames.length) return
  const size = viewportSize()
  if (size.w < 40 || size.h < 40) {
    // Layout not ready yet; retry once on the next frame.
    requestAnimationFrame(maybeAutoFit)
    return
  }
  didAutoFit = true
  const pristine = (Number(state.zoom) || 1) === 1 && !(state.pan && (state.pan.x || state.pan.y))
  if (pristine) fitView(false)
}

/* ------------------------------------------------------------------ */
/* selection chrome                                                    */
/* ------------------------------------------------------------------ */

function clearGuides() {
  if (dom && dom.guideLayer) dom.guideLayer.replaceChildren()
}

function showGuides(guides) {
  if (!dom || !dom.guideLayer) return
  if (!guides || !guides.length) {
    clearGuides()
    return
  }
  const zoom = Number(state.zoom) || 1
  const pad = 16 / zoom
  const frag = document.createDocumentFragment()
  for (const guide of guides) {
    const line = document.createElement('div')
    if (guide.orientation === 'v') {
      line.className = 'ud-guide ud-guide--v'
      line.style.left = `${guide.pos}px`
      line.style.top = `${Math.min(guide.from, guide.to) - pad}px`
      line.style.height = `${Math.abs(guide.to - guide.from) + pad * 2}px`
    } else {
      line.className = 'ud-guide ud-guide--h'
      line.style.top = `${guide.pos}px`
      line.style.left = `${Math.min(guide.from, guide.to) - pad}px`
      line.style.width = `${Math.abs(guide.to - guide.from) + pad * 2}px`
    }
    frag.append(line)
  }
  dom.guideLayer.replaceChildren(frag)
}

function showSizeBadge(rect) {
  if (!dom || !dom.sizeBadge || !rect) return
  const zoom = Number(state.zoom) || 1
  const badge = dom.sizeBadge
  badge.hidden = false
  badge.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)}`
  badge.style.left = `${rect.x + rect.w}px`
  badge.style.top = `${rect.y + rect.h + 12 / zoom}px`
}

function hideSizeBadge() {
  if (dom && dom.sizeBadge) dom.sizeBadge.hidden = true
}

function drawSelection() {
  if (!dom) return
  const layer = dom.handleLayer
  if (!layer) return
  layer.replaceChildren()
  const selection = Array.isArray(state.selection) ? state.selection : []
  if (selection.length !== 1) return
  const id = selection[0]
  const node = getNode(id)
  if (!node || node.locked) return
  if (!node.parent) return // frame root: frame outline only
  const rect = nodeWorldRect(id)
  if (!rect) return
  const frag = document.createDocumentFragment()
  for (const dir of HANDLE_DIRS) {
    const anchor = HANDLE_ANCHORS[dir]
    const handle = document.createElement('div')
    handle.className = `ud-handle ud-handle--${dir}`
    handle.dataset.dir = dir
    handle.setAttribute('aria-hidden', 'true')
    handle.style.left = `${rect.x + rect.w * anchor[0]}px`
    handle.style.top = `${rect.y + rect.h * anchor[1]}px`
    frag.append(handle)
  }
  layer.append(frag)
}

/* ------------------------------------------------------------------ */
/* event wiring                                                        */
/* ------------------------------------------------------------------ */

function bindEvents() {
  const viewport = dom.viewport
  viewport.addEventListener('wheel', onWheel, { passive: false })
  viewport.addEventListener('pointerdown', onPointerDown)
  viewport.addEventListener('pointermove', onPointerMove)
  viewport.addEventListener('pointerup', onPointerUp)
  viewport.addEventListener('pointercancel', onPointerUp)
  viewport.addEventListener('dblclick', onDoubleClick)
  viewport.addEventListener('contextmenu', event => event.preventDefault())
  viewport.addEventListener('dragstart', event => event.preventDefault())
  // Capture phase so cancelling a drag does not also let app.js clear selection.
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onWindowBlur)
  bus.addEventListener('view', applyView)
  bus.addEventListener('selection', () => {
    drawSelection()
    applyCursorHint()
  })
  bus.addEventListener('spec', () => {
    drawSelection()
    maybeAutoFit()
  })
}

function applyCursorHint() {
  if (dom) dom.viewport.classList.toggle('ud-viewport--pan', spaceDown)
}

function onWindowBlur() {
  spaceDown = false
  applyCursorHint()
  if (drag && drag.mode === 'pan') {
    drag = null
    dom.viewport.classList.remove('is-panning')
  }
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    if (drag) {
      event.preventDefault()
      event.stopPropagation()
      cancelDrag()
    }
    return
  }
  if (event.code !== 'Space' && event.key !== ' ') return
  if (isInteractiveTarget(event.target)) return
  if (!spaceDown) {
    spaceDown = true
    applyCursorHint()
  }
  event.preventDefault()
}

function onKeyUp(event) {
  if (event.code !== 'Space' && event.key !== ' ') return
  spaceDown = false
  applyCursorHint()
}

/* ------------------------------------------------------------------ */
/* pointer: down                                                       */
/* ------------------------------------------------------------------ */

function capturePointer(event) {
  try {
    dom.viewport.setPointerCapture(event.pointerId)
  } catch {
    /* ignore */
  }
}

function releasePointer(event) {
  try {
    dom.viewport.releasePointerCapture(event.pointerId)
  } catch {
    /* ignore */
  }
}

function startPan(event) {
  const pan = state.pan || { x: 0, y: 0 }
  drag = {
    mode: 'pan',
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    panStart: { x: pan.x, y: pan.y },
  }
  capturePointer(event)
  dom.viewport.classList.add('is-panning')
}

function selectFrameRoot(frameId, event) {
  const spec = state.spec
  const rootId = spec && spec.rootIds ? spec.rootIds[frameId] : null
  const additive = event.shiftKey || event.metaKey || event.ctrlKey
  if (additive && rootId) toggleNodeSelection(rootId)
  else setSelection(rootId ? [rootId] : [])
}

function onPointerDown(event) {
  if (event.button === 2) return
  const target = event.target
  if (!target || target.nodeType !== 1) return

  if ((spaceDown && event.button === 0) || event.button === 1) {
    event.preventDefault()
    startPan(event)
    return
  }
  if (event.button !== 0) return

  const handle = target.closest('.ud-handle')
  if (handle && Array.isArray(state.selection) && state.selection.length === 1) {
    event.preventDefault()
    startResize(event, handle.dataset.dir)
    return
  }

  const nodeEl = target.closest('.ud-node')
  if (nodeEl) {
    onNodePointerDown(event, nodeEl)
    return
  }

  const frameEl = target.closest('.ud-frame')
  if (frameEl) {
    event.preventDefault()
    selectFrameRoot(frameEl.dataset.frameId, event)
    return
  }

  if (!event.shiftKey && !event.metaKey && !event.ctrlKey) setSelection([])
}

function onNodePointerDown(event, nodeEl) {
  const id = nodeEl.dataset.nodeId
  const node = getNode(id)
  if (!node) return
  const additive = event.shiftKey || event.metaKey || event.ctrlKey
  if (additive) {
    event.preventDefault()
    toggleNodeSelection(id)
    return
  }
  if (!state.selection.includes(id)) setSelection([id])
  if (node.locked) return
  if (!node.parent) return

  const parent = parentOf(id)
  const mode = parent && parent.layout ? parent.layout.mode : 'absolute'
  event.preventDefault()
  if (mode === 'row' || mode === 'column') startReorder(event, node, parent)
  else startMove(event, node)
}

/** Selected nodes without an ancestor also selected (avoids moving twice). */
function movableTargets(hitId) {
  const selection = Array.isArray(state.selection) ? state.selection.slice() : []
  const ids = selection.includes(hitId) ? selection : [hitId]
  const set = new Set(ids)
  const out = []
  for (const id of ids) {
    let cur = parentOf(id)
    let covered = false
    let guard = 0
    while (cur && guard++ < 256) {
      if (set.has(cur.id)) {
        covered = true
        break
      }
      cur = parentOf(cur.id)
    }
    if (covered) continue
    const node = getNode(id)
    if (!node || node.locked || !node.parent) continue
    const parent = parentOf(id)
    const mode = parent && parent.layout ? parent.layout.mode : 'absolute'
    if (mode === 'row' || mode === 'column') continue
    out.push(node)
  }
  return out
}

function startMove(event, hitNode) {
  const targets = movableTargets(hitNode.id)
  if (!targets.length) return
  const primary = targets.find(node => node.id === hitNode.id) || targets[0]
  const primaryRect = nodeWorldRect(primary.id)
  if (!primaryRect) return
  const origin = targets.map(node => ({ id: node.id, x: Number(node.x) || 0, y: Number(node.y) || 0 }))
  const snapCtx = buildSnapContext(primary)
  beginHistory(targets.length > 1 ? '移动多个图层' : '移动图层')
  capturePointer(event)
  drag = {
    mode: 'move',
    pointerId: event.pointerId,
    startWorld: clientToWorld(event),
    startClient: { x: event.clientX, y: event.clientY },
    origin,
    primaryRect,
    snapCtx,
    moved: false,
  }
  dom.viewport.classList.add('is-dragging')
}

function startResize(event, dir) {
  if (!dir || !HANDLE_ANCHORS[dir]) return
  const id = state.selection[0]
  const node = getNode(id)
  if (!node || node.locked || !node.parent) return
  const startRect = nodeWorldRect(id)
  if (!startRect) return
  beginHistory('调整大小')
  capturePointer(event)
  drag = {
    mode: 'resize',
    pointerId: event.pointerId,
    dir,
    id,
    startWorld: clientToWorld(event),
    startClient: { x: event.clientX, y: event.clientY },
    startRect,
    startNode: {
      x: Number(node.x) || 0,
      y: Number(node.y) || 0,
      w: Number(node.w) || 0,
      h: Number(node.h) || 0,
    },
    snapCtx: buildSnapContext(node),
    moved: false,
  }
  dom.viewport.classList.add('is-dragging')
}

function startReorder(event, node, parent) {
  beginHistory('调整图层顺序')
  capturePointer(event)
  drag = {
    mode: 'reorder',
    pointerId: event.pointerId,
    id: node.id,
    parentId: parent.id,
    horizontal: parent.layout.mode === 'row',
    startClient: { x: event.clientX, y: event.clientY },
    reordered: false,
  }
  dom.viewport.classList.add('is-dragging')
}

/* ------------------------------------------------------------------ */
/* pointer: move                                                       */
/* ------------------------------------------------------------------ */

function onPointerMove(event) {
  if (!drag) return
  if (drag.mode === 'pan') {
    storeSetPan({
      x: drag.panStart.x + (event.clientX - drag.clientX),
      y: drag.panStart.y + (event.clientY - drag.clientY),
    })
    return
  }
  if (drag.mode === 'move') handleMove(event)
  else if (drag.mode === 'resize') handleResize(event)
  else if (drag.mode === 'reorder') handleReorder(event)
}

function dragPastThreshold(event) {
  const dx = event.clientX - drag.startClient.x
  const dy = event.clientY - drag.startClient.y
  if (Math.hypot(dx, dy) < DRAG_THRESHOLD_SCREEN_PX) return false
  drag.moved = true
  return true
}

/* ---- snapping ---------------------------------------------------- */

function buildSnapContext(node) {
  const zoom = Number(state.zoom) || 1
  const threshold = SNAP_SCREEN_PX / zoom
  const vlines = []
  const hlines = []
  const parent = parentOf(node.id)
  const parentRect = parent ? nodeWorldRect(parent.id) : null
  if (parentRect) {
    vlines.push(parentRect.x, parentRect.x + parentRect.w / 2, parentRect.x + parentRect.w)
    hlines.push(parentRect.y, parentRect.y + parentRect.h / 2, parentRect.y + parentRect.h)
    for (const sibling of childrenOf(parent.id)) {
      if (!sibling || sibling.id === node.id || sibling.hidden) continue
      const rect = nodeWorldRect(sibling.id)
      if (!rect) continue
      vlines.push(rect.x, rect.x + rect.w / 2, rect.x + rect.w)
      hlines.push(rect.y, rect.y + rect.h / 2, rect.y + rect.h)
    }
  }
  return {
    threshold,
    vlines: dedupeNumbers(vlines),
    hlines: dedupeNumbers(hlines),
    parentRect,
  }
}

function nearestLine(lines, value, threshold) {
  let best = null
  for (const line of lines) {
    const diff = line - value
    if (Math.abs(diff) > threshold) continue
    if (best === null || Math.abs(diff) < Math.abs(best.diff)) best = { diff, line }
  }
  return best
}

function snapMove(snapCtx, rect, dx, dy) {
  if (!snapCtx) return { dx, dy, guides: [] }
  const moved = { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h }
  const xAnchors = [moved.x, moved.x + moved.w / 2, moved.x + moved.w]
  const yAnchors = [moved.y, moved.y + moved.h / 2, moved.y + moved.h]
  let bestX = null
  let bestY = null
  for (const anchor of xAnchors) {
    const found = nearestLine(snapCtx.vlines, anchor, snapCtx.threshold)
    if (found && (!bestX || Math.abs(found.diff) < Math.abs(bestX.diff))) bestX = found
  }
  for (const anchor of yAnchors) {
    const found = nearestLine(snapCtx.hlines, anchor, snapCtx.threshold)
    if (found && (!bestY || Math.abs(found.diff) < Math.abs(bestY.diff))) bestY = found
  }
  const guides = []
  const span = snapCtx.parentRect
  if (bestX && span) {
    guides.push({ orientation: 'v', pos: bestX.line, from: span.y, to: span.y + span.h })
  }
  if (bestY && span) {
    guides.push({ orientation: 'h', pos: bestY.line, from: span.x, to: span.x + span.w })
  }
  return { dx: dx + (bestX ? bestX.diff : 0), dy: dy + (bestY ? bestY.diff : 0), guides }
}

/* ---- move -------------------------------------------------------- */

function handleMove(event) {
  if (!dragPastThreshold(event)) return
  const world = clientToWorld(event)
  const rawDx = world.x - drag.startWorld.x
  const rawDy = world.y - drag.startWorld.y
  const snapped = snapMove(drag.snapCtx, drag.primaryRect, rawDx, rawDy)
  const dx = snapped.dx
  const dy = snapped.dy

  update(
    spec => {
      for (const origin of drag.origin) {
        const node = spec.nodes[origin.id]
        if (!node) continue
        node.x = Math.round(origin.x + dx)
        node.y = Math.round(origin.y + dy)
      }
    },
    { history: 'none', label: '移动图层' },
  )

  showGuides(snapped.guides)
  showSizeBadge({
    x: drag.primaryRect.x + dx,
    y: drag.primaryRect.y + dy,
    w: drag.primaryRect.w,
    h: drag.primaryRect.h,
  })
}

/* ---- resize ------------------------------------------------------ */

function handleResize(event) {
  if (!dragPastThreshold(event)) return
  const world = clientToWorld(event)
  const dx = world.x - drag.startWorld.x
  const dy = world.y - drag.startWorld.y
  const start = drag.startRect
  const dir = drag.dir
  const has = test => dir.includes(test)
  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h

  if (has('w')) left = Math.min(right - MIN_SIZE, start.x + dx)
  if (has('e')) right = Math.max(left + MIN_SIZE, start.x + start.w + dx)
  if (has('n')) top = Math.min(bottom - MIN_SIZE, start.y + dy)
  if (has('s')) bottom = Math.max(top + MIN_SIZE, start.y + start.h + dy)

  const guides = []
  const ctx = drag.snapCtx
  const span = ctx && ctx.parentRect
  if (ctx) {
    if (has('w')) {
      const found = nearestLine(ctx.vlines, left, ctx.threshold)
      if (found) {
        left = found.line
        if (span) guides.push({ orientation: 'v', pos: found.line, from: span.y, to: span.y + span.h })
      }
    }
    if (has('e')) {
      const found = nearestLine(ctx.vlines, right, ctx.threshold)
      if (found) {
        right = found.line
        if (span) guides.push({ orientation: 'v', pos: found.line, from: span.y, to: span.y + span.h })
      }
    }
    if (has('n')) {
      const found = nearestLine(ctx.hlines, top, ctx.threshold)
      if (found) {
        top = found.line
        if (span) guides.push({ orientation: 'h', pos: found.line, from: span.x, to: span.x + span.w })
      }
    }
    if (has('s')) {
      const found = nearestLine(ctx.hlines, bottom, ctx.threshold)
      if (found) {
        bottom = found.line
        if (span) guides.push({ orientation: 'h', pos: found.line, from: span.x, to: span.x + span.w })
      }
    }
  }
  if (right - left < MIN_SIZE) {
    if (has('w')) left = right - MIN_SIZE
    else right = left + MIN_SIZE
  }
  if (bottom - top < MIN_SIZE) {
    if (has('n')) top = bottom - MIN_SIZE
    else bottom = top + MIN_SIZE
  }

  const newX = Math.round(drag.startNode.x + (left - start.x))
  const newY = Math.round(drag.startNode.y + (top - start.y))
  const newW = Math.max(MIN_SIZE, Math.round(right - left))
  const newH = Math.max(MIN_SIZE, Math.round(bottom - top))

  update(
    spec => {
      const node = spec.nodes[drag.id]
      if (!node) return
      node.x = newX
      node.y = newY
      node.w = newW
      node.h = newH
    },
    { history: 'none', label: '调整大小' },
  )

  showGuides(guides)
  showSizeBadge({ x: left, y: top, w: right - left, h: bottom - top })
}

/* ---- auto-layout reorder ----------------------------------------- */

function handleReorder(event) {
  if (!dragPastThreshold(event)) return
  const parent = getNode(drag.parentId)
  if (!parent) return
  const world = clientToWorld(event)
  const main = drag.horizontal ? world.x : world.y
  const current = Array.isArray(parent.children) ? parent.children.slice() : []
  if (!current.includes(drag.id)) return
  const rest = current.filter(id => id !== drag.id)

  let index = rest.length
  for (let i = 0; i < rest.length; i++) {
    const rect = nodeWorldRect(rest[i])
    if (!rect) continue
    const mid = drag.horizontal ? rect.x + rect.w / 2 : rect.y + rect.h / 2
    if (main < mid) {
      index = i
      break
    }
  }
  const nextOrder = rest.slice()
  nextOrder.splice(index, 0, drag.id)
  if (sameOrder(current, nextOrder)) return

  drag.reordered = true
  update(
    spec => {
      const target = spec.nodes[drag.parentId]
      if (target) target.children = nextOrder
    },
    { history: 'none', label: '调整图层顺序' },
  )
}

/* ------------------------------------------------------------------ */
/* pointer: up / cancel                                                */
/* ------------------------------------------------------------------ */

function onPointerUp(event) {
  if (!drag) return
  const finished = drag
  drag = null
  dom.viewport.classList.remove('is-dragging', 'is-panning')
  releasePointer(event)
  clearGuides()
  hideSizeBadge()
  if (finished.mode === 'pan') return
  // Always close the pending history entry: a no-op commit creates no undo
  // step, so a plain click stays clean while a drag becomes one step.
  commitHistory()
}

function cancelDrag() {
  if (!drag) return
  const cancelled = drag
  drag = null
  dom.viewport.classList.remove('is-dragging', 'is-panning')
  clearGuides()
  hideSizeBadge()
  if (cancelled.mode === 'move') {
    update(
      spec => {
        for (const origin of cancelled.origin) {
          const node = spec.nodes[origin.id]
          if (!node) continue
          node.x = origin.x
          node.y = origin.y
        }
      },
      { history: 'none', label: '移动图层' },
    )
  } else if (cancelled.mode === 'resize') {
    update(
      spec => {
        const node = spec.nodes[cancelled.id]
        if (!node) return
        node.x = cancelled.startNode.x
        node.y = cancelled.startNode.y
        node.w = cancelled.startNode.w
        node.h = cancelled.startNode.h
      },
      { history: 'none', label: '调整大小' },
    )
  }
  commitHistory()
}

/* ------------------------------------------------------------------ */
/* double click + keyboard nudge                                       */
/* ------------------------------------------------------------------ */

function onDoubleClick(event) {
  const target = event.target
  if (!target || target.nodeType !== 1) return
  const nodeEl = target.closest('.ud-node')
  if (!nodeEl) return
  const node = getNode(nodeEl.dataset.nodeId)
  if (!node) return
  if (node.type !== 'text') return
  event.preventDefault()
  setSelection([node.id])
  document.dispatchEvent(new CustomEvent('ud:focus-text', { detail: { id: node.id } }))
}

/**
 * Move the current selection by (dx, dy) world px. app.js calls this for the
 * arrow keys (1px, shift = 10px).
 */
export function nudgeSelection(dx, dy) {
  if (!state.spec) return false
  const stepX = Number(dx) || 0
  const stepY = Number(dy) || 0
  if (!stepX && !stepY) return false
  const targets = []
  for (const id of state.selection || []) {
    const node = getNode(id)
    if (!node || node.locked || !node.parent) continue
    const parent = parentOf(id)
    if (parent && parent.layout && (parent.layout.mode === 'row' || parent.layout.mode === 'column')) continue
    targets.push(node)
  }
  if (!targets.length) return false
  update(
    spec => {
      for (const node of targets) {
        const target = spec.nodes[node.id]
        if (!target) continue
        target.x = (Number(target.x) || 0) + stepX
        target.y = (Number(target.y) || 0) + stepY
      }
    },
    { label: '微移图层' },
  )
  return true
}

/* ------------------------------------------------------------------ */
/* wheel                                                               */
/* ------------------------------------------------------------------ */

function wheelNormalized(event) {
  const mode = event.deltaMode
  const factor = mode === 1 ? 16 : mode === 2 ? viewportSize().h || 800 : 1
  return { x: (event.deltaX || 0) * factor, y: (event.deltaY || 0) * factor }
}

function onWheel(event) {
  event.preventDefault()
  if (event.ctrlKey || event.metaKey) {
    const point = areaPoint(event)
    const delta = wheelNormalized(event).y
    const zoom = Number(state.zoom) || 1
    zoomAtPoint(point, zoom * Math.exp(-delta * 0.0018))
    return
  }
  let { x: dx, y: dy } = wheelNormalized(event)
  if (event.shiftKey && !dx) {
    dx = dy
    dy = 0
  }
  const pan = state.pan || { x: 0, y: 0 }
  storeSetPan({ x: pan.x - dx, y: pan.y - dy })
}
