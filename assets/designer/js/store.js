/**
 * UI Designer — single mutable app store.
 *
 * Modules never write `state.spec` directly. Every change goes through
 * update()/applyOps()/replaceSpecLocal()/setSpecFromServer() so validation,
 * undo history, autosave and re-render stay consistent.
 */

export const bus = new EventTarget()

export const state = {
  spec: null,
  designPath: '',
  config: { ai: { mode: 'agent', configured: false, model: '', baseUrl: '' } },
  skillVersion: '',
  selection: [],
  zoom: 1,
  pan: { x: 0, y: 0 },
  tool: 'select',
  dirty: false,
  saving: false,
  savedAt: 0,
  aiBusy: false,
  pendingRequests: 0,
  findings: [],
}

const HISTORY_LIMIT = 80
const undoStack = []
const redoStack = []
let pendingBefore = null
let pendingLabel = ''
let saveTimer = 0
let saveInFlight = false
let lastSavedJson = ''

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export const clone = value =>
  typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))

export function getNode(id) {
  if (!id || !state.spec) return null
  return state.spec.nodes[id] || null
}

export function childrenOf(id) {
  const node = getNode(id)
  return node ? node.children.map(cid => state.spec.nodes[cid]).filter(Boolean) : []
}

export function parentOf(id) {
  const node = getNode(id)
  return node && node.parent ? state.spec.nodes[node.parent] || null : null
}

export function ancestorsOf(id) {
  const out = []
  let node = getNode(id)
  while (node && node.parent) {
    node = getNode(node.parent)
    if (node) out.push(node)
  }
  return out
}

export function descendantsOf(id) {
  const out = []
  const walk = nodeId => {
    for (const child of childrenOf(nodeId)) {
      out.push(child)
      walk(child.id)
    }
  }
  walk(id)
  return out
}

/** Frame meta (from spec.frames) that owns a node, or null. */
export function getFrameOf(id) {
  if (!state.spec || !id) return null
  let node = getNode(id)
  if (!node) return null
  while (node && node.parent) node = getNode(node.parent)
  if (!node) return null
  const frame = state.spec.frames.find(f => state.spec.rootIds[f.id] === node.id)
  return frame || null
}

export function getFrameById(frameId) {
  return state.spec ? state.spec.frames.find(f => f.id === frameId) || null : null
}

export function selectedNodes() {
  return state.selection.map(getNode).filter(Boolean)
}

/* ------------------------------------------------------------------ */
/* init                                                                */
/* ------------------------------------------------------------------ */

export function init({ spec, designPath, config, skillVersion }) {
  state.spec = spec
  state.designPath = designPath || ''
  state.config = config || state.config
  state.skillVersion = skillVersion || ''
  undoStack.length = 0
  redoStack.length = 0
  lastSavedJson = JSON.stringify(spec)
  state.dirty = false
  state.selection = []
  emit('spec', { reason: 'init', source: 'init' })
}

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */

export function emit(type, detail = {}) {
  bus.dispatchEvent(new CustomEvent(type, { detail }))
}

export function toast(message, kind = 'info') {
  emit('toast', { message, kind })
}

export function setStatus(text, kind = 'idle') {
  emit('status', { text, kind })
}

/* ------------------------------------------------------------------ */
/* mutation & history                                                  */
/* ------------------------------------------------------------------ */

export function beginHistory(label = '编辑') {
  pendingBefore = clone(state.spec)
  pendingLabel = label
}

export function commitHistory() {
  if (!pendingBefore) return
  const before = pendingBefore
  pendingBefore = null
  if (JSON.stringify(before) === JSON.stringify(state.spec)) return
  undoStack.push({ label: pendingLabel, spec: before })
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  redoStack.length = 0
  emit('history')
}

/**
 * Run a mutation against a deep clone of the spec.
 * opts.history: 'auto' (default, one undo entry), 'none' (caller manages with
 * beginHistory/commitHistory), or 'replace' (no undo entry, e.g. server sync).
 */
export function update(mutator, opts = {}) {
  const { label = '编辑', history = 'auto' } = opts
  if (!state.spec) return null
  const before = history === 'auto' ? clone(state.spec) : null
  const next = clone(state.spec)
  const result = mutator(next)
  state.spec = next
  if (history === 'auto' && before) pushAutoHistory(label, before)
  state.dirty = JSON.stringify(next) !== lastSavedJson
  emit('spec', { reason: 'update', label })
  if (state.dirty) scheduleSave()
  return result
}

function pushAutoHistory(label, before) {
  if (!before) return
  undoStack.push({ label, spec: before })
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  redoStack.length = 0
  emit('history')
}

export function undo() {
  const entry = undoStack.pop()
  if (!entry) return false
  redoStack.push({ label: entry.label, spec: clone(state.spec) })
  state.spec = entry.spec
  state.selection = state.selection.filter(id => state.spec.nodes[id])
  state.dirty = JSON.stringify(state.spec) !== lastSavedJson
  emit('spec', { reason: 'undo', label: entry.label })
  emit('selection', { ids: state.selection })
  if (state.dirty) scheduleSave()
  return true
}

export function redo() {
  const entry = redoStack.pop()
  if (!entry) return false
  undoStack.push({ label: entry.label, spec: clone(state.spec) })
  state.spec = entry.spec
  state.selection = state.selection.filter(id => state.spec.nodes[id])
  state.dirty = JSON.stringify(state.spec) !== lastSavedJson
  emit('spec', { reason: 'redo', label: entry.label })
  emit('selection', { ids: state.selection })
  if (state.dirty) scheduleSave()
  return true
}

export const canUndo = () => undoStack.length > 0
export const canRedo = () => redoStack.length > 0

/** Replace the spec with the server's canonical version for a LOCAL change
 *  (e.g. after POST /api/ops). Adds exactly one undo entry.
 *  Pass `beforeSpec` when the server broadcast may already have updated
 *  `state.spec` (SSE can arrive before the HTTP response); otherwise the
 *  current spec is used as the undo baseline. */
export function replaceSpecLocal(nextSpec, label = '编辑', beforeSpec = null) {
  const before = beforeSpec ? clone(beforeSpec) : (state.spec ? clone(state.spec) : null)
  if (before) {
    undoStack.push({ label, spec: before })
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
  }
  redoStack.length = 0
  state.spec = nextSpec
  state.dirty = false
  lastSavedJson = JSON.stringify(nextSpec)
  emit('spec', { reason: 'local', label })
  setStatus('已保存', 'saved')
}

/** Replace spec from an external writer (agent / another tab). No undo entry. */
export function setSpecFromServer(nextSpec, { external = true } = {}) {
  const asJson = JSON.stringify(nextSpec)
  if (asJson === JSON.stringify(state.spec)) return false
  state.spec = nextSpec
  state.selection = state.selection.filter(id => nextSpec.nodes[id])
  state.dirty = false
  lastSavedJson = asJson
  emit('spec', { reason: 'remote', source: external ? 'external' : 'server' })
  emit('selection', { ids: state.selection })
  setStatus(external ? '已同步远端更新' : '已保存', external ? 'remote' : 'saved')
  return true
}

/* ------------------------------------------------------------------ */
/* selection / view                                                    */
/* ------------------------------------------------------------------ */

export function setSelection(ids) {
  const next = Array.from(new Set((ids || []).filter(Boolean)))
  const same = next.length === state.selection.length && next.every((id, i) => id === state.selection[i])
  if (same) return
  state.selection = next
  emit('selection', { ids: next })
}

export function selectOnly(id) {
  setSelection(id ? [id] : [])
}

export function setZoom(z, anchor) {
  const next = Math.min(3, Math.max(0.25, Number(z) || 1))
  if (next === state.zoom) return
  state.zoom = next
  emit('view', { zoom: next, anchor })
}

export function setPan(pan) {
  state.pan = { x: pan.x, y: pan.y }
  emit('view', { pan: state.pan })
}

export function setFindings(findings) {
  state.findings = findings || []
  emit('findings', { findings: state.findings })
}

export function setAiBusy(busy) {
  state.aiBusy = !!busy
  emit('ai-busy', { busy: state.aiBusy })
}

/* ------------------------------------------------------------------ */
/* persistence                                                         */
/* ------------------------------------------------------------------ */

export function scheduleSave(delay = 420) {
  clearTimeout(saveTimer)
  setStatus('保存中…', 'saving')
  saveTimer = setTimeout(saveNow, delay)
}

export async function saveNow() {
  clearTimeout(saveTimer)
  if (!state.spec || saveInFlight) return
  const snapshot = state.spec
  saveInFlight = true
  state.saving = true
  try {
    const res = await api('/api/state', { method: 'PUT', body: { spec: snapshot } })
    if (res && res.ok) {
      const asJson = JSON.stringify(snapshot)
      if (asJson === JSON.stringify(state.spec)) {
        state.dirty = false
        lastSavedJson = asJson
      }
      state.savedAt = Date.now()
      setStatus('已保存', 'saved')
    }
  } catch (error) {
    setStatus('保存失败', 'error')
    toast(`保存失败：${error.message}`, 'error')
  } finally {
    saveInFlight = false
    state.saving = false
  }
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export async function api(path, options = {}) {
  const { method = 'GET', body, signal } = options
  const init = { method, headers: {}, signal }
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(path, init)
  } catch (cause) {
    throw new Error(`无法连接到设计器服务（${path}）`)
  }
  let data = null
  const text = await res.text()
  if (text) {
    try { data = JSON.parse(text) } catch { data = { raw: text } }
  }
  if (!res.ok || (data && data.ok === false)) {
    const message = (data && (data.error || data.message)) || `请求失败（HTTP ${res.status}）`
    throw new Error(message)
  }
  return data
}

export async function refreshQueue() {
  try {
    const data = await api('/api/queue')
    const pending = (data && data.pending) || []
    state.pendingRequests = pending.length
    emit('queue', { pending })
    return pending
  } catch {
    return []
  }
}

export function designDir() {
  // design.json lives in <designDir>/design.json
  const parts = (state.designPath || '').replace(/\\/g, '/').split('/')
  parts.pop()
  return parts.join('/')
}
