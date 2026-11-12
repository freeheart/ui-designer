/**
 * UI Designer — left panel (layers / component palette) + right inspector.
 *
 * State lives in store.js: every edit goes through store.update() (property
 * edits) or POST /api/ops (structural edits: insert/duplicate/remove/reorder/
 * add-frame) followed by store.replaceSpecLocal(res.spec). Nothing here writes
 * state.spec directly and no DOM state is treated as truth.
 *
 * Inspector inputs are controlled but DOM is NOT rebuilt on every spec event
 * (only when the selected node/type/mode changes), so typing keeps focus.
 * Numeric inputs commit on change/Enter/blur; text content commits live through
 * beginHistory/update(history:'none')/commitHistory.
 */

import {
  bus, state, getNode, getFrameOf, getFrameById, parentOf, selectedNodes,
  setSelection, update, replaceSpecLocal, setSpecFromServer, api, toast, beginHistory, commitHistory,
} from './store.js'
import {
  DEFAULT_THEME, ICONS, effectiveStyle, resolveColor, expandPadding, layoutChildren, escapeHtml,
} from './shared/style.mjs'
import { PREFABS, PREFAB_CATEGORIES } from './prefabs.js'

const esc = escapeHtml
const escAttr = escapeHtml

/* ------------------------------------------------------------------ */
/* icons                                                               */
/* ------------------------------------------------------------------ */

const PANEL_ICONS = {
  box: '<rect x="3" y="3" width="18" height="18" rx="3"/>',
  frame: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  components: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  text: '<path d="M5 5h14M12 5v14M8.5 19h7"/>',
  button: '<rect x="3" y="7" width="18" height="10" rx="5"/><path d="M8 12h8"/>',
  input: '<rect x="3" y="7" width="18" height="10" rx="3"/><path d="M7 10.5v3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 5-4.5 3 2.5 3-3 5 5"/>',
  icon: '<path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3l-5.5 2.9 1.1-6.2L3 9.6l6.3-.9Z"/>',
  divider: '<path d="M3 12h18"/>',
  badge: '<rect x="3" y="8" width="18" height="8" rx="4"/>',
  avatar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3.2"/><path d="M6.4 18.6a6.2 6.2 0 0 1 11.2 0"/>',
  toggle: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><circle cx="16.5" cy="12" r="3"/>',
  checkbox: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7.5 12 3 3 6-6"/>',
  select: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="m14 10.5 2 2.5 2-2.5"/>',
  tabs: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 9v10"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 9v11"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  card: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18"/><path d="M7 14h6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  'eye-off': '<path d="m4 4 16 16"/><path d="M10.6 6.3A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a17.7 17.7 0 0 1-2.8 3.3M6.5 8.2A17 17 0 0 0 2 12s3.5 6 10 6a10.9 10.9 0 0 0 4-.7"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  'arrow-up': '<path d="M12 20V5m0 0-6 6m6-6 6 6"/>',
  'arrow-down': '<path d="M12 4v15m0 0-6-6m6 6 6-6"/>',
  rename: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  navbar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M6 6.5h3"/>',
  hero: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 12.5h7"/><rect x="7" y="15" width="4.5" height="2.4" rx="1.2"/>',
  stat: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="16" rx="1.5"/><rect x="17" y="4" width="4" height="16" rx="1.5"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  form: '<rect x="3" y="4" width="18" height="4" rx="2"/><rect x="3" y="10" width="18" height="4" rx="2"/><rect x="3" y="16" width="18" height="4" rx="2"/>',
  sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  modal: '<rect x="3" y="3" width="18" height="18" rx="3"/><rect x="7" y="7" width="10" height="10" rx="2"/>',
  toast: '<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 12h5"/>',
  empty: '<rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="3 3"/><path d="M9 14h6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12Z"/>',
  pricing: '<path d="M20.6 13.4 12 22l-9-9V4h9l8.6 8.6a1.4 1.4 0 0 1 0 2Z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  footer: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18"/>',
}

function svgIcon(name, size = 14) {
  const inner = PANEL_ICONS[name] || PANEL_ICONS.box
  return `<svg class="ud-ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
}

const TYPE_INFO = {
  box: { label: '容器', icon: 'box' },
  text: { label: '文本', icon: 'text' },
  button: { label: '按钮', icon: 'button' },
  input: { label: '输入框', icon: 'input' },
  image: { label: '图片', icon: 'image' },
  icon: { label: '图标', icon: 'icon' },
  divider: { label: '分割线', icon: 'divider' },
  badge: { label: '徽标', icon: 'badge' },
  avatar: { label: '头像', icon: 'avatar' },
  toggle: { label: '开关', icon: 'toggle' },
  checkbox: { label: '复选框', icon: 'checkbox' },
  select: { label: '下拉框', icon: 'select' },
  tabs: { label: '标签页', icon: 'tabs' },
  table: { label: '表格', icon: 'table' },
  chart: { label: '图表', icon: 'chart' },
  card: { label: '卡片', icon: 'card' },
}

const TEXT_TYPES = new Set(['text', 'button', 'input', 'badge', 'select', 'checkbox', 'tabs', 'table', 'card', 'avatar'])
const CONTAINER_TYPES = new Set(['box', 'card'])

const MODE_LABELS = { absolute: '自由', row: '横排', column: '竖排' }
const ALIGN_OPTIONS = [['start', '起始 start'], ['center', '居中 center'], ['end', '末尾 end'], ['stretch', '拉伸 stretch']]
const JUSTIFY_OPTIONS = [['start', '起始 start'], ['center', '居中 center'], ['end', '末尾 end'], ['between', '两端 between']]
const WEIGHT_OPTIONS = [['300', '300 细'], ['400', '400 常规'], ['500', '500 中等'], ['600', '600 半粗'], ['700', '700 粗'], ['800', '800 特粗']]
const TONE_OPTIONS = [['primary', 'primary'], ['success', 'success'], ['warning', 'warning'], ['danger', 'danger'], ['muted', 'muted']]
const FIT_OPTIONS = [['cover', 'cover 填充'], ['contain', 'contain 完整'], ['fill', 'fill 拉伸'], ['none', 'none 原始'], ['scale-down', 'scale-down']]
const ALIGN_TEXT_OPTIONS = [['left', '左'], ['center', '中'], ['right', '右']]

/* ------------------------------------------------------------------ */
/* module state                                                        */
/* ------------------------------------------------------------------ */

let leftRoot = null
let layersEl = null
let layerCountEl = null
let tabsEl = null
let paletteEl = null
let paletteSectionsEl = null
let paletteEmptyEl = null
let searchEl = null
let inspRoot = null

let activeTab = 'layers'
let paletteFilter = ''
const collapsed = new Set()
let lastFrameId = null
let lastInspSig = ''
let insertBusy = false
let opsBusy = false

/* ------------------------------------------------------------------ */
/* tiny helpers                                                        */
/* ------------------------------------------------------------------ */

const themeOf = () => (state.spec && state.spec.theme) || DEFAULT_THEME

function getPath(target, path) {
  if (!target || !path) return undefined
  const parts = String(path).split('.')
  let cursor = target
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined
    cursor = cursor[part]
  }
  return cursor
}

function setPath(target, path, value) {
  const parts = String(path).split('.')
  let cursor = target
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {}
    cursor = cursor[key]
  }
  cursor[parts[parts.length - 1]] = value
}

function sameValue(a, b) {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a === 'number' && typeof b === 'number') return a === b
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function parseNumeric(raw) {
  const text = String(raw === null || raw === undefined ? '' : raw).trim().replace(/px$/i, '')
  if (!text) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

function toHex6(color) {
  const value = typeof color === 'string' ? color.trim() : ''
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase()
  }
  const rgba = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (rgba) {
    const toHex = n => clampNumber(Math.round(Number(n)), 0, 255).toString(16).padStart(2, '0')
    return `#${toHex(rgba[1])}${toHex(rgba[2])}${toHex(rgba[3])}`
  }
  return '#000000'
}

function parseColorValue(raw) {
  const text = String(raw === null || raw === undefined ? '' : raw).trim()
  if (!text || text.toLowerCase() === 'transparent' || text.toLowerCase() === 'none') return null
  const theme = themeOf()
  if (Object.prototype.hasOwnProperty.call(theme.colors || {}, text)) return text
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return text
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('color', text)) return text
  if (/^(rgb|hsl)a?\(/i.test(text)) return text
  return undefined
}

function formatPaddingValue(value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.join(' ')
  return String(value)
}

function parsePaddingValue(raw) {
  const text = String(raw === null || raw === undefined ? '' : raw).trim()
  if (!text) return null
  const theme = themeOf()
  const parts = text.split(/[\s,，]+/).filter(Boolean)
  const nums = parts.map(part => {
    const n = parseNumeric(part)
    if (n !== null) return n
    if (Object.prototype.hasOwnProperty.call(theme.space || {}, part)) return Number(theme.space[part]) || 0
    return NaN
  })
  if (nums.some(n => !Number.isFinite(n))) return undefined
  if (nums.length === 1) return nums[0]
  if (nums.length === 2) return [nums[0], nums[1], nums[0], nums[1]]
  if (nums.length === 3) return [nums[0], nums[1], nums[2], nums[1]]
  if (nums.length === 4) return nums
  return undefined
}

function tokenKeysFor(path) {
  const theme = themeOf()
  if (path === 'style.radius') return Object.keys(theme.radius || {})
  if (path === 'style.font.size') return Object.keys(theme.fontSize || {})
  if (path === 'layout.padding' || path === 'style.padding' || path === 'layout.gap') return Object.keys(theme.space || {})
  return []
}

function labelForPath(path) {
  if (!path) return '编辑'
  if (path === 'name') return '重命名'
  if (path.startsWith('layout.')) return '调整布局'
  if (path.startsWith('style.font')) return '编辑文字样式'
  if (path.startsWith('style.')) return '编辑样式'
  if (path.startsWith('props.')) return '编辑内容'
  if (path === 'hidden') return '切换显隐'
  if (path === 'locked') return '切换锁定'
  return '编辑'
}

/* ------------------------------------------------------------------ */
/* init                                                                */
/* ------------------------------------------------------------------ */

export function initPanels({ leftEl, rightEl } = {}) {
  const left = leftEl || document.getElementById('ud-left')
  const right = rightEl || document.getElementById('ud-inspector')

  if (left) buildLeft(left)
  if (right) buildInspector(right)

  bus.addEventListener('spec', onSpec)
  bus.addEventListener('selection', onSelection)
  document.addEventListener('ud:focus-text', onFocusText)

  renderAll()
  return { refresh: renderAll, insertPrefab, focusContentEditor }
}

function onSpec() {
  syncLastFrame()
  renderLayers()
  renderInspector({ resetScroll: false })
}

function onSelection() {
  syncLastFrame()
  renderLayers()
  renderInspector({ resetScroll: true })
}

function onFocusText(event) {
  const id = event && event.detail && event.detail.id
  if (!id || !getNode(id)) return
  if (!state.selection.includes(id)) setSelection([id])
  requestAnimationFrame(() => focusContentEditor())
}

export function focusContentEditor() {
  const el = inspRoot && inspRoot.querySelector('[data-ud-text-editor]')
  if (el) {
    el.focus()
    if (typeof el.select === 'function') el.select()
  }
}

function renderAll() {
  renderLayers()
  renderInspector({ resetScroll: false })
}

function syncLastFrame() {
  if (!state.spec) return
  for (const id of state.selection) {
    const frame = getFrameOf(id)
    if (frame) {
      lastFrameId = frame.id
      return
    }
  }
  if (lastFrameId && !state.spec.frames.some(f => f.id === lastFrameId)) lastFrameId = null
}

/* ------------------------------------------------------------------ */
/* left panel: build shell                                             */
/* ------------------------------------------------------------------ */

function buildLeft(leftEl) {
  leftEl.innerHTML = `
  <div class="ud-left-panel">
    <div class="ud-panel-tabs" role="tablist" aria-label="图层面板">
      <button type="button" class="ud-panel-tab is-active" data-tab="layers" role="tab" aria-selected="true">
        ${svgIcon('layers', 14)}<span>图层</span><span class="ud-tabcount" data-role="layer-count">0</span>
      </button>
      <button type="button" class="ud-panel-tab" data-tab="components" role="tab" aria-selected="false">
        ${svgIcon('components', 14)}<span>组件</span>
      </button>
    </div>
    <div class="ud-left-body">
      <div class="ud-left-pane" data-pane="layers">
        <div class="ud-layers" role="tree" aria-label="图层树" aria-multiselectable="true"></div>
      </div>
      <div class="ud-left-pane" data-pane="components" hidden>
        <div class="ud-palette">
          <div class="ud-palette__search">
            <span class="ud-palette__search-icon">${svgIcon('search', 13)}</span>
            <input class="ud-input ud-palette__input" type="search" placeholder="搜索组件…" aria-label="搜索组件" spellcheck="false" />
          </div>
          <div class="ud-palette__scroll">
            <div class="ud-palette__sections"></div>
            <div class="ud-empty ud-palette__empty" hidden>
              <strong>没有匹配的组件</strong>
              <div>换个关键词试试，或清空搜索。</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`

  leftRoot = leftEl
  tabsEl = leftEl.querySelector('.ud-panel-tabs')
  layersEl = leftEl.querySelector('.ud-layers')
  layerCountEl = leftEl.querySelector('[data-role="layer-count"]')
  paletteEl = leftEl.querySelector('.ud-palette')
  paletteSectionsEl = leftEl.querySelector('.ud-palette__sections')
  paletteEmptyEl = leftEl.querySelector('.ud-palette__empty')
  searchEl = leftEl.querySelector('.ud-palette__input')

  tabsEl.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]')
    if (!tab) return
    setActiveTab(tab.dataset.tab)
  })

  layersEl.addEventListener('click', onLayersClick)
  layersEl.addEventListener('dblclick', onLayersDblClick)

  searchEl.addEventListener('input', () => {
    paletteFilter = searchEl.value
    applyPaletteFilter()
  })

  paletteSectionsEl.addEventListener('click', event => {
    const card = event.target.closest('[data-prefab]')
    if (!card) return
    const prefab = PREFABS.find(p => p.id === card.dataset.prefab)
    if (prefab) insertPrefab(prefab)
  })

  buildPalette()
  applyPaletteFilter()
}

function setActiveTab(tab) {
  if (tab !== 'layers' && tab !== 'components') return
  activeTab = tab
  if (!tabsEl) return
  for (const button of tabsEl.querySelectorAll('[data-tab]')) {
    const on = button.dataset.tab === tab
    button.classList.toggle('is-active', on)
    button.setAttribute('aria-selected', on ? 'true' : 'false')
  }
  const panes = leftRoot.querySelectorAll('[data-pane]')
  for (const pane of panes) pane.hidden = pane.dataset.pane !== tab
  if (tab === 'layers') renderLayers()
  else if (searchEl) searchEl.focus()
}

/* ------------------------------------------------------------------ */
/* left panel: layers                                                  */
/* ------------------------------------------------------------------ */

function updateLayerCount(count) {
  if (!layerCountEl) return
  layerCountEl.textContent = String(count)
  layerCountEl.classList.toggle('is-empty', count === 0)
}

function renderLayers() {
  if (!layersEl) return
  const spec = state.spec
  if (!spec || !Array.isArray(spec.frames) || spec.frames.length === 0) {
    updateLayerCount(0)
    layersEl.innerHTML = `<div class="ud-empty ud-layers__empty">
      <strong>还没有画板</strong>
      <div>在右侧检查器点击「添加画板」开始设计。</div>
    </div>`
    return
  }
  const scrollTop = layersEl.scrollTop
  const out = []
  for (const frame of spec.frames) {
    const rootId = spec.rootIds && spec.rootIds[frame.id]
    const root = rootId ? getNode(rootId) : null
    if (!root) continue
    out.push(frameRowHtml(frame, root))
    if (!collapsed.has(`frame:${frame.id}`)) appendLayerRows(out, root, 1)
  }
  layersEl.innerHTML = out.join('')
  layersEl.scrollTop = scrollTop
  updateLayerCount(Object.keys(spec.nodes || {}).length)
}

function appendLayerRows(out, parent, depth) {
  const ids = [...((parent && parent.children) || [])].reverse()
  for (const id of ids) {
    const node = getNode(id)
    if (!node) continue
    out.push(layerRowHtml(node, depth))
    const children = node.children || []
    if (children.length && !collapsed.has(node.id)) appendLayerRows(out, node, depth + 1)
  }
}

function layerRowHtml(node, depth) {
  const selected = state.selection.includes(node.id)
  const children = node.children || []
  const hasChildren = children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const info = TYPE_INFO[node.type] || TYPE_INFO.box
  const layoutMode = (node.layout && node.layout.mode) || 'absolute'
  const autoTag = layoutMode === 'row' ? '<span class="ud-layer__tag" title="自动布局：横排">H</span>'
    : layoutMode === 'column' ? '<span class="ud-layer__tag" title="自动布局：竖排">V</span>' : ''
  const eyeTitle = node.hidden ? '显示图层' : '隐藏图层'
  const lockTitle = node.locked ? '解锁图层' : '锁定图层'
  return `<div class="ud-layer${selected ? ' is-selected' : ''}${node.hidden ? ' is-hidden' : ''}${node.locked ? ' is-locked' : ''}" data-id="${escAttr(node.id)}" data-depth="${depth}" style="--ud-depth:${depth}" role="treeitem" aria-selected="${selected}" aria-expanded="${hasChildren ? String(!isCollapsed) : 'undefined'}" title="${escAttr(node.name)}">
    ${hasChildren
      ? `<button type="button" class="ud-layer__twist" data-act="toggle" data-key="${escAttr(node.id)}" aria-label="${isCollapsed ? '展开' : '折叠'}">${svgIcon(isCollapsed ? 'chevron-right' : 'chevron-down', 11)}</button>`
      : '<span class="ud-layer__twist ud-layer__twist--empty"></span>'}
    <span class="ud-layer__icon">${svgIcon(info.icon, 13)}</span>
    <span class="ud-layer__name">${esc(node.name)}</span>
    ${autoTag}
    <span class="ud-layer__acts">
      <button type="button" class="ud-layer__act${node.hidden ? ' is-on' : ''}" data-act="hidden" data-id="${escAttr(node.id)}" title="${eyeTitle}" aria-label="${eyeTitle}">${svgIcon(node.hidden ? 'eye-off' : 'eye', 12)}</button>
      <button type="button" class="ud-layer__act${node.locked ? ' is-on' : ''}" data-act="locked" data-id="${escAttr(node.id)}" title="${lockTitle}" aria-label="${lockTitle}">${svgIcon(node.locked ? 'lock' : 'unlock', 12)}</button>
    </span>
  </div>`
}

function frameRowHtml(frame, root) {
  const selected = state.selection.includes(root.id)
  const isCollapsed = collapsed.has(`frame:${frame.id}`)
  return `<div class="ud-layer ud-layer--frame${selected ? ' is-selected' : ''}" data-id="${escAttr(root.id)}" data-frame-id="${escAttr(frame.id)}" data-depth="0" style="--ud-depth:0" role="treeitem" aria-selected="${selected}" aria-expanded="${String(!isCollapsed)}" title="${escAttr(frame.name)}">
    <button type="button" class="ud-layer__twist" data-act="toggle" data-key="frame:${escAttr(frame.id)}" aria-label="${isCollapsed ? '展开画板' : '折叠画板'}">${svgIcon(isCollapsed ? 'chevron-right' : 'chevron-down', 11)}</button>
    <span class="ud-layer__icon ud-layer__icon--frame">${svgIcon('frame', 13)}</span>
    <span class="ud-layer__name">${esc(frame.name)}</span>
    <span class="ud-layer__meta">${Math.round(frame.width)}×${Math.round(frame.height)}</span>
  </div>`
}

function onLayersClick(event) {
  const act = event.target.closest('[data-act]')
  if (act) {
    event.preventDefault()
    event.stopPropagation()
    const action = act.dataset.act
    if (action === 'toggle') {
      const key = act.dataset.key
      if (collapsed.has(key)) collapsed.delete(key)
      else collapsed.add(key)
      renderLayers()
      return
    }
    const id = act.dataset.id
    if (!getNode(id)) return
    if (action === 'hidden') toggleNodeFlag(id, 'hidden')
    else if (action === 'locked') toggleNodeFlag(id, 'locked')
    return
  }
  const row = event.target.closest('.ud-layer')
  if (!row) return
  const id = row.dataset.id
  if (!getNode(id)) return
  if (event.shiftKey || event.metaKey || event.ctrlKey) {
    const next = state.selection.includes(id)
      ? state.selection.filter(item => item !== id)
      : [...state.selection, id]
    setSelection(next)
  } else {
    setSelection([id])
  }
}

function onLayersDblClick(event) {
  const row = event.target.closest('.ud-layer')
  if (!row || event.target.closest('[data-act]')) return
  const id = row.dataset.id
  if (!getNode(id)) return
  setSelection([id])
  requestAnimationFrame(() => {
    const title = inspRoot && inspRoot.querySelector('[data-role="node-name"]')
    if (title) {
      title.focus()
      if (typeof title.select === 'function') title.select()
    }
  })
}

/* ------------------------------------------------------------------ */
/* left panel: palette                                                 */
/* ------------------------------------------------------------------ */

function buildPalette() {
  if (!paletteSectionsEl) return
  paletteSectionsEl.innerHTML = PREFAB_CATEGORIES.map(category => {
    const items = PREFABS.filter(prefab => prefab.category === category.id)
    if (!items.length) return ''
    return `<section class="ud-palette__section" data-cat="${escAttr(category.id)}">
      <header class="ud-palette__head"><span>${esc(category.name)}</span><span class="ud-palette__count">${items.length}</span></header>
      <div class="ud-palette__grid">${items.map(paletteCardHtml).join('')}</div>
    </section>`
  }).join('')
}

function paletteCardHtml(prefab) {
  const keywords = `${prefab.name} ${prefab.id} ${prefab.keywords || ''} ${prefab.category === 'basic' ? '基础元素' : '组合区块'}`.toLowerCase()
  return `<button type="button" class="ud-palette__card" data-prefab="${escAttr(prefab.id)}" data-keywords="${escAttr(keywords)}" title="插入「${escAttr(prefab.name)}」" aria-label="插入${escAttr(prefab.name)}">
    <span class="ud-palette__ico">${svgIcon(prefab.icon, 17)}</span>
    <span class="ud-palette__label">${esc(prefab.name)}</span>
  </button>`
}

function applyPaletteFilter() {
  if (!paletteSectionsEl) return
  const query = paletteFilter.trim().toLowerCase()
  let visible = 0
  for (const card of paletteSectionsEl.querySelectorAll('.ud-palette__card')) {
    const hit = !query || String(card.dataset.keywords || '').includes(query)
    card.hidden = !hit
    if (hit) visible += 1
  }
  for (const section of paletteSectionsEl.querySelectorAll('.ud-palette__section')) {
    const anyVisible = Array.from(section.querySelectorAll('.ud-palette__card')).some(card => !card.hidden)
    section.hidden = !anyVisible
  }
  if (paletteEmptyEl) paletteEmptyEl.hidden = visible > 0
}

/* ------------------------------------------------------------------ */
/* insertion                                                           */
/* ------------------------------------------------------------------ */

function currentFrame() {
  const spec = state.spec
  if (!spec || !Array.isArray(spec.frames) || spec.frames.length === 0) return null
  if (lastFrameId) {
    const found = spec.frames.find(frame => frame.id === lastFrameId)
    if (found) return found
  }
  return spec.frames[0]
}

function resolveInsertTarget() {
  const spec = state.spec
  if (!spec) return null
  let frame = currentFrame()
  const selection = selectedNodes()
  let parent = null
  if (selection.length) {
    const first = selection[0]
    const frameOfSelection = getFrameOf(first.id)
    if (frameOfSelection) {
      frame = frameOfSelection
      lastFrameId = frame.id
    }
    if (CONTAINER_TYPES.has(first.type) || !first.parent) parent = first
    else parent = parentOf(first.id)
    if (!parent && frame) parent = getNode(spec.rootIds[frame.id])
  } else if (frame) {
    parent = getNode(spec.rootIds[frame.id])
  }
  if (!parent) return null
  return { parent, frame: getFrameOf(parent.id) || frame }
}

function buildInsertNode(prefab, parent) {
  const theme = themeOf()
  const layout = parent.layout || {}
  const mode = layout.mode || 'absolute'
  const themePadding = parent.style ? parent.style.padding : null
  const pad = expandPadding(layout.padding !== undefined && layout.padding !== null ? layout.padding : themePadding, theme)
  const [pt, pr, pb, pl] = pad
  const hasPadding = pt + pr + pb + pl > 0
  const gutter = hasPadding ? 0 : 16
  const innerW = Math.max(60, (parent.w || 0) - pl - pr)
  const width = Math.max(60, Math.round(mode === 'row' ? Math.min(innerW - gutter * 2, 240) : innerW - gutter * 2))
  let x = mode === 'absolute' ? pl + gutter : 0
  let y = mode === 'absolute' ? pt + gutter : 0
  if (mode === 'absolute') {
    const positions = layoutChildren(parent, state.spec)
    let bottom = 0
    for (const pos of positions.values()) bottom = Math.max(bottom, pos.y + pos.h)
    if ((parent.children || []).length) y = Math.round(bottom + 16)
  }
  const node = prefab.create({ x, y, width })
  node.x = Math.round(x)
  node.y = Math.round(y)
  if (mode === 'absolute') {
    const maxX = Math.max(0, (parent.w || 0) - (node.w || 0))
    const maxY = Math.max(0, (parent.h || 0) - (node.h || 0))
    node.x = clampNumber(node.x, 0, maxX)
    node.y = clampNumber(node.y, 0, maxY)
  }
  return node
}

/**
 * POST /api/ops then adopt the server's canonical spec.
 *
 * The server broadcasts SSE `state` before the HTTP response resolves, so the
 * store may already hold the new spec when we get here; in that case
 * replaceSpecLocal would record a no-op undo entry. Roll the store back to the
 * pre-op spec first (no history) so the undo entry restores the real change.
 */
async function applyOpsAndSync(ops, label) {
  const beforeJson = JSON.stringify(state.spec)
  const res = await api('/api/ops', { method: 'POST', body: { ops } })
  if (!res || !res.spec) throw new Error('服务端未返回设计稿')
  // SSE may have installed the new spec already: roll back (no history) so the
  // replaceSpecLocal undo entry restores the pre-op state instead of a no-op.
  if (JSON.stringify(state.spec) !== beforeJson) {
    setSpecFromServer(JSON.parse(beforeJson), { external: false })
  }
  replaceSpecLocal(res.spec, label)
  return res
}

export async function insertPrefab(prefab) {
  if (!prefab || insertBusy) return
  if (!state.spec) {
    toast('设计稿尚未加载完成', 'warning')
    return
  }
  const target = resolveInsertTarget()
  if (!target || !target.parent) {
    toast('请先添加一个画板再插入组件', 'warning')
    return
  }
  const parent = target.parent
  const node = buildInsertNode(prefab, parent)
  insertBusy = true
  try {
    const res = await applyOpsAndSync([{ op: 'add', parent: parent.id, node }], `插入「${prefab.name}」`)
    const addResult = Array.isArray(res.results) ? res.results.find(item => item && item.op === 'add') : null
    const newId = addResult && addResult.id
    if (newId && res.spec.nodes[newId]) setSelection([newId])
    toast(`已插入「${prefab.name}」`, 'success')
  } catch (error) {
    toast(`插入失败：${error.message}`, 'error')
  } finally {
    insertBusy = false
  }
}

/* ------------------------------------------------------------------ */
/* structural ops                                                      */
/* ------------------------------------------------------------------ */

async function runOps(ops, label) {
  if (opsBusy) return null
  opsBusy = true
  try {
    return await applyOpsAndSync(ops, label)
  } catch (error) {
    toast(`${label}失败：${error.message}`, 'error')
    return null
  } finally {
    opsBusy = false
  }
}

function uniqueNodeId(base) {
  const spec = state.spec
  const safe = String(base || 'node').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  let id = safe
  let i = 2
  while ((spec.nodes && spec.nodes[id]) || (spec.frames || []).some(frame => frame.id === id)) {
    id = `${safe}-${i}`
    i += 1
  }
  return id
}

async function duplicateNode(id) {
  const node = getNode(id)
  if (!node || !node.parent) {
    toast('画板根节点不能复制', 'warning')
    return
  }
  const newId = uniqueNodeId(`${node.id}-copy`)
  const res = await runOps([{ op: 'duplicate', id, newId }], '复制节点')
  if (!res) return
  const result = Array.isArray(res.results) ? res.results[0] : null
  const created = (result && result.id) || newId
  if (res.spec.nodes[created]) setSelection([created])
  toast('已复制节点', 'success')
}

async function reorderNode(id, delta) {
  const node = getNode(id)
  if (!node || !node.parent) return
  const parent = parentOf(id)
  if (!parent) return
  const index = parent.children.indexOf(id)
  const next = index + delta
  if (next < 0 || next >= parent.children.length) {
    toast(delta > 0 ? '已经在最上层' : '已经在最下层', 'info')
    return
  }
  const res = await runOps([{ op: 'reorder', id, index: next }], delta > 0 ? '上移图层' : '下移图层')
  if (res) setSelection([id])
}

async function removeNode(id) {
  const node = getNode(id)
  if (!node) return
  if (!node.parent) {
    toast('画板根节点请在「文档」面板删除整个画板', 'warning')
    return
  }
  const res = await runOps([{ op: 'remove', id }], '删除节点')
  if (!res) return
  setSelection(state.selection.filter(item => item !== id))
  toast('已删除节点', 'success')
}

function toggleNodeFlag(id, flag) {
  const node = getNode(id)
  if (!node) return
  update(spec => {
    const target = spec.nodes[id]
    if (!target) return
    target[flag] = !target[flag]
  }, { label: flag === 'hidden' ? '切换显隐' : '切换锁定', history: 'auto' })
}

/* ------------------------------------------------------------------ */
/* right panel: shell / events                                         */
/* ------------------------------------------------------------------ */

function buildInspector(rightEl) {
  let host = rightEl
  if (!host.classList.contains('ud-inspector')) {
    const section = document.createElement('section')
    section.className = 'ud-inspector'
    rightEl.prepend(section)
    host = section
  }
  host.classList.add('ud-inspector--panels')
  inspRoot = host
  attachInspectorEvents(host)
}

function attachInspectorEvents(root) {
  root.addEventListener('change', event => {
    const el = event.target.closest('[data-target]')
    if (!el) return
    if (el.matches('textarea[data-live]')) return
    commitField(el)
  })

  root.addEventListener('input', event => {
    const el = event.target.closest('[data-target]')
    if (!el) return
    if (el.type === 'range') {
      const label = el.closest('.ud-range') && el.closest('.ud-range').querySelector('[data-role="opacity-label"]')
      if (label) label.textContent = `${Math.round((Number(el.value) || 0) * 100)}%`
      return
    }
    if (el.matches('textarea[data-live]')) commitField(el, { history: 'none' })
  })

  root.addEventListener('focusin', event => {
    const el = event.target.closest('textarea[data-live]')
    if (el) beginHistory('编辑内容')
  })

  root.addEventListener('focusout', event => {
    const el = event.target.closest('textarea[data-live]')
    if (el) commitHistory()
  })

  root.addEventListener('click', event => {
    const actionEl = event.target.closest('[data-action]')
    if (actionEl) {
      event.preventDefault()
      handleAction(actionEl)
      return
    }
    const frameRow = event.target.closest('.ud-framerow')
    if (frameRow && !event.target.closest('input,button,select')) selectFrameRow(frameRow)
  })

  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    const el = event.target.closest('[data-target]')
    if (!el) return
    event.preventDefault()
    revertField(el)
    el.blur()
  })
}

function selectFrameRow(row) {
  const frameId = row.dataset.frameId
  if (!state.spec) return
  const rootId = state.spec.rootIds[frameId]
  if (!rootId || !getNode(rootId)) return
  lastFrameId = frameId
  setSelection([rootId])
}

/* ------------------------------------------------------------------ */
/* right panel: context & render                                       */
/* ------------------------------------------------------------------ */

function getContext() {
  const spec = state.spec
  if (!spec) return { mode: 'loading', sig: 'loading' }
  const selection = selectedNodes()
  const framesKey = (spec.frames || []).map(frame => frame.id).join(',')
  if (selection.length > 1) {
    return { mode: 'multi', nodes: selection, sig: `multi|${selection.map(node => node.id).join(',')}` }
  }
  if (selection.length === 1 && selection[0].parent) {
    const node = selection[0]
    const frame = getFrameOf(node.id) || currentFrame()
    if (frame) lastFrameId = frame.id
    return { mode: 'node', node, frame, sig: `node|${node.id}|${node.type}` }
  }
  let frame = currentFrame()
  if (selection.length === 1) {
    const frameOfRoot = getFrameOf(selection[0].id)
    if (frameOfRoot) frame = frameOfRoot
  }
  if (frame) lastFrameId = frame.id
  return { mode: 'doc', frame, sig: `doc|${frame ? frame.id : '-'}|${framesKey}|${Object.keys(spec.nodes || {}).length}` }
}

function renderInspector({ resetScroll = false } = {}) {
  if (!inspRoot) return
  if (!state.spec) {
    if (lastInspSig !== 'loading') {
      lastInspSig = 'loading'
      inspRoot.innerHTML = `<div class="ud-empty ud-insp-empty">
        <strong>正在加载设计稿…</strong>
        <div>等待设计器服务返回数据。</div>
      </div>`
    }
    return
  }
  const context = getContext()
  if (context.sig === lastInspSig) {
    refreshInspector()
    return
  }
  lastInspSig = context.sig
  const scrollTop = inspRoot.scrollTop
  let html = ''
  if (context.mode === 'node') html = buildNodeInspector(context.node)
  else if (context.mode === 'multi') html = buildMultiInspector(context.nodes)
  else html = buildDocInspector(context.frame)
  inspRoot.innerHTML = html + datalistsHtml()
  inspRoot.scrollTop = resetScroll ? 0 : scrollTop
  refreshInspector()
}

function refreshInspector() {
  if (!inspRoot || !state.spec) return
  for (const el of inspRoot.querySelectorAll('[data-target]')) syncField(el)
  refreshExtras()
}

/* ------------------------------------------------------------------ */
/* right panel: controlled values                                      */
/* ------------------------------------------------------------------ */

function displayValue(target, id, path) {
  if (target === 'node') {
    const node = getNode(id)
    if (!node) return undefined
    if (path.startsWith('style.')) return getPath(effectiveStyle(node), path.slice(6))
    if (path.startsWith('layout.')) {
      const layout = node.layout || {}
      const fallback = { mode: 'absolute', gap: 0, padding: null, align: 'start', justify: 'start' }
      return getPath({ ...fallback, ...layout }, path.slice(7))
    }
    if (path.startsWith('props.')) return getPath(node.props || {}, path.slice(6))
    return getPath(node, path)
  }
  if (target === 'theme') return getPath(themeOf(), path)
  if (target === 'frame') {
    const frame = getFrameById(id)
    return frame ? getPath(frame, path) : undefined
  }
  if (target === 'spec') return getPath(state.spec, path)
  return undefined
}

function readRawNode(node, path) {
  if (!node) return undefined
  if (path.startsWith('style.')) return getPath(node.style || {}, path.slice(6))
  if (path.startsWith('layout.')) return getPath(node.layout || {}, path.slice(7))
  if (path.startsWith('props.')) return getPath(node.props || {}, path.slice(6))
  return getPath(node, path)
}

function applyDisplayToField(el) {
  const target = el.dataset.target
  const id = el.dataset.id
  const path = el.dataset.path
  const kind = el.dataset.kind || 'text'
  if (!target || !path) return
  let value = displayValue(target, id, path)
  if ((value === undefined || value === null || value === '') && el.dataset.default !== undefined) {
    value = el.dataset.default
  }
  if (kind === 'checkbox') {
    if (el.dataset.default === 'true' && (value === undefined || value === null || value === '')) el.checked = true
    else el.checked = value === true || value === 'true'
    return
  }
  if (kind === 'stroke') {
    el.checked = !!value
    return
  }
  if (kind === 'colorpick') {
    el.value = toHex6(resolveColor(value, themeOf()) || '#000000')
    return
  }
  if (kind === 'padding') {
    el.value = formatPaddingValue(value)
    return
  }
  if (kind === 'csv' || kind === 'csvnum') {
    el.value = Array.isArray(value) ? value.join(', ') : (value === null || value === undefined ? '' : String(value))
    return
  }
  if (kind === 'rows') {
    el.value = Array.isArray(value)
      ? value.map(row => (Array.isArray(row) ? row.join(', ') : String(row))).join('\n')
      : (value === null || value === undefined ? '' : String(value))
    return
  }
  if (el.tagName === 'SELECT') {
    const next = value === null || value === undefined ? '' : String(value)
    if (el.value !== next) el.value = next
    return
  }
  el.value = value === null || value === undefined ? '' : String(value)
}

function syncField(el) {
  if (document.activeElement === el) return
  applyDisplayToField(el)
}

function revertField(el) {
  applyDisplayToField(el)
}

function commitField(el, { history = 'auto' } = {}) {
  if (!el || !state.spec) return
  const target = el.dataset.target
  const id = el.dataset.id
  const path = el.dataset.path
  const kind = el.dataset.kind || 'text'
  if (!target || !path) return
  let value
  if (kind === 'checkbox') {
    value = el.checked
  } else if (kind === 'stroke') {
    value = el.checked ? { color: 'border', width: 1 } : null
  } else if (kind === 'number') {
    const n = parseNumeric(el.value)
    if (n === null) return revertField(el)
    value = n
  } else if (kind === 'numtoken') {
    const text = String(el.value).trim()
    if (!text) return revertField(el)
    const n = parseNumeric(text)
    if (n !== null) value = n
    else if (tokenKeysFor(path).includes(text)) value = text
    else return revertField(el)
  } else if (kind === 'color') {
    const parsed = parseColorValue(el.value)
    if (parsed === undefined) return revertField(el)
    if (parsed === null && target === 'theme') return revertField(el)
    if (parsed === null && path === 'style.stroke.color') return revertField(el)
    value = parsed
  } else if (kind === 'colorpick') {
    value = String(el.value).trim()
  } else if (kind === 'padding') {
    const parsed = parsePaddingValue(el.value)
    if (parsed === undefined) return revertField(el)
    value = parsed
  } else if (kind === 'shadow') {
    const text = String(el.value).trim()
    value = text && text.toLowerCase() !== 'none' ? text : null
    if (value === null && target === 'theme') return revertField(el)
  } else if (kind === 'csv') {
    value = String(el.value).split(/[,，]/).map(part => part.trim()).filter(Boolean)
  } else if (kind === 'csvnum') {
    const nums = String(el.value).split(/[,，\s]+/).map(part => Number(part.trim())).filter(n => Number.isFinite(n))
    value = nums
  } else if (kind === 'rows') {
    value = String(el.value)
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.split(/[,，]/).map(cell => cell.trim()))
  } else if (kind === 'select') {
    if (el.dataset.coerce === 'number') {
      if (el.value === '') return revertField(el)
      const n = Number(el.value)
      if (!Number.isFinite(n)) return revertField(el)
      value = n
    } else {
      value = el.value === '' ? null : el.value
    }
  } else {
    value = el.value
  }

  // semantic guards (keep the spec valid; the server rejects invalid specs)
  if (target === 'node') {
    if (path === 'w' || path === 'h') value = Math.max(0, value)
    if (path === 'layout.gap') value = Math.max(0, value)
    if (path === 'opacity') value = clampNumber(Number(value) || 0, 0, 1)
    if (path === 'style.stroke.width') value = Math.max(0, value)
    if (path === 'style.font.lineHeight') value = Math.max(0.5, value)
    if (path === 'layout.mode' && !Object.prototype.hasOwnProperty.call(MODE_LABELS, value)) return revertField(el)
    if (path === 'name' && !String(value).trim()) return revertField(el)
  }
  if (target === 'frame' && path === 'name' && !String(value).trim()) return revertField(el)
  if (target === 'theme') {
    if (path === 'font' && !String(value).trim()) return revertField(el)
    if (path === 'colors' || path.startsWith('colors.')) {
      // colors are strings only; empty handled above
    }
  }
  applyValue({ target, id, path, value, label: labelForPath(path), history })
}

function applyValue({ target, id, path, value, label = '编辑', history = 'auto' }) {
  if (target === 'node') {
    const node = getNode(id)
    if (!node) return
    if (sameValue(readRawNode(node, path), value)) return
    update(spec => {
      const next = spec.nodes[id]
      if (!next) return
      if (!next.style) next.style = {}
      if (!next.props) next.props = {}
      if (!next.layout) next.layout = { mode: 'absolute', gap: 0, padding: 0, align: 'start', justify: 'start' }
      setPath(next, path, value)
    }, { label, history })
    return
  }
  if (target === 'theme') {
    if (sameValue(getPath(themeOf(), path), value)) return
    update(spec => {
      if (!spec.theme) spec.theme = {}
      setPath(spec.theme, path, value)
    }, { label: '编辑主题', history })
    return
  }
  if (target === 'frame') {
    applyFrameValue(id, path, value, history)
    return
  }
  if (target === 'spec' && path === 'name') {
    const name = String(value || '').trim()
    if (!name || name === state.spec.name) {
      refreshInspector()
      return
    }
    update(spec => { spec.name = name }, { label: '重命名设计稿', history })
  }
}

function applyFrameValue(frameId, path, value, history = 'auto') {
  const spec = state.spec
  if (!spec) return
  const frame = (spec.frames || []).find(item => item.id === frameId)
  if (!frame) return
  let next = value
  if (path === 'name') {
    next = String(next || '').trim()
    if (!next) return refreshInspector()
    if (frame.name === next) return
  } else if (path === 'width' || path === 'height') {
    const n = parseNumeric(next)
    if (n === null || n < 1) return refreshInspector()
    next = Math.round(n)
    if (frame[path] === next) return
  } else if (path === 'background') {
    if (next !== null && typeof next !== 'string') return refreshInspector()
    if (frame.background === next) return
  } else {
    return
  }
  update(spec => {
    const target = spec.frames.find(item => item.id === frameId)
    if (!target) return
    const root = spec.nodes[spec.rootIds[frameId]]
    if (path === 'name') {
      target.name = next
      if (root) root.name = next
    } else if (path === 'width' || path === 'height') {
      target[path] = next
      if (root) root[path === 'width' ? 'w' : 'h'] = next
    } else if (path === 'background') {
      target.background = next
      if (root) root.style = { ...(root.style || {}), fill: next }
    }
  }, { label: '编辑画板', history })
}

async function addFrame() {
  const spec = state.spec
  if (!spec) return
  const current = currentFrame()
  let maxRight = 0
  for (const frame of spec.frames || []) maxRight = Math.max(maxRight, (frame.x || 0) + (frame.width || 0))
  const frame = {
    name: `画板 ${(spec.frames || []).length + 1}`,
    x: (spec.frames || []).length ? Math.round(maxRight + 48) : 0,
    y: current ? Math.round(current.y || 0) : 0,
    width: current ? Math.round(current.width) : 1440,
    height: current ? Math.round(current.height) : 1024,
    background: current ? current.background || 'bg' : 'bg',
  }
  const res = await runOps([{ op: 'add-frame', frame }], '添加画板')
  if (!res) return
  const result = Array.isArray(res.results) ? res.results[0] : null
  const frameId = result && result.id
  const rootId = result && result.rootId
  if (frameId) lastFrameId = frameId
  if (rootId && res.spec.nodes[rootId]) setSelection([rootId])
  toast('已添加画板', 'success')
}

async function removeFrame(frameId) {
  const spec = state.spec
  if (!spec) return
  if ((spec.frames || []).length <= 1) {
    toast('至少需要保留一个画板', 'warning')
    return
  }
  const res = await runOps([{ op: 'remove-frame', id: frameId }], '删除画板')
  if (!res) return
  if (lastFrameId === frameId) {
    const remaining = res.spec.frames[0]
    lastFrameId = remaining ? remaining.id : null
  }
  setSelection([])
  toast('已删除画板', 'success')
}

/* ------------------------------------------------------------------ */
/* right panel: action buttons                                         */
/* ------------------------------------------------------------------ */

function singleSelectedNode() {
  const selection = selectedNodes()
  return selection.length === 1 && selection[0].parent ? getNode(selection[0].id) : null
}

function batchTargets() {
  return state.selection
    .map(id => getNode(id))
    .filter(node => node && node.parent)
}

function handleAction(el) {
  const action = el.dataset.action
  if (!action) return
  const node = singleSelectedNode()
  switch (action) {
    case 'layout-mode':
      if (node) applyValue({ target: 'node', id: node.id, path: 'layout.mode', value: el.dataset.mode, label: '布局模式' })
      break
    case 'font-align':
      if (node) applyValue({ target: 'node', id: node.id, path: 'style.font.align', value: el.dataset.value, label: '文字对齐' })
      break
    case 'chart-kind':
      if (node) applyValue({ target: 'node', id: node.id, path: 'props.kind', value: el.dataset.value, label: '图表类型' })
      break
    case 'fill-token':
      if (node) applyValue({ target: 'node', id: node.id, path: 'style.fill', value: el.dataset.token, label: '填充颜色' })
      break
    case 'clear-color':
      applyValue({
        target: el.dataset.target,
        id: el.dataset.id,
        path: el.dataset.path,
        value: null,
        label: '清除颜色',
      })
      break
    case 'select-node':
      if (el.dataset.id) setSelection([el.dataset.id])
      break
    case 'rename':
      focusNodeName()
      break
    case 'duplicate':
      if (node) duplicateNode(node.id)
      break
    case 'forward':
      if (node) reorderNode(node.id, 1)
      break
    case 'backward':
      if (node) reorderNode(node.id, -1)
      break
    case 'toggle-hidden':
      if (node) toggleNodeFlag(node.id, 'hidden')
      break
    case 'toggle-locked':
      if (node) toggleNodeFlag(node.id, 'locked')
      break
    case 'delete':
      if (node) removeNode(node.id)
      break
    case 'batch-hidden':
    case 'batch-locked': {
      const flag = action === 'batch-hidden' ? 'hidden' : 'locked'
      const targets = batchTargets()
      if (!targets.length) return
      const allOn = targets.every(item => item[flag])
      update(spec => {
        for (const item of targets) {
          const target = spec.nodes[item.id]
          if (target) target[flag] = !allOn
        }
      }, { label: flag === 'hidden' ? '批量显隐' : '批量锁定', history: 'auto' })
      break
    }
    case 'batch-delete': {
      const targets = batchTargets()
      if (!targets.length) {
        toast('画板根节点不能删除', 'warning')
        return
      }
      runOps(targets.map(item => ({ op: 'remove', id: item.id })), '批量删除').then(res => {
        if (res) setSelection([])
      })
      break
    }
    case 'add-frame':
      addFrame()
      break
    case 'remove-frame':
      if (el.dataset.frameId) removeFrame(el.dataset.frameId)
      break
    case 'select-frame': {
      const frameId = el.dataset.frameId
      const rootId = state.spec && state.spec.rootIds ? state.spec.rootIds[frameId] : null
      if (rootId) setSelection([rootId])
      break
    }
    default:
      break
  }
}

function focusNodeName() {
  if (!inspRoot) return
  const input = inspRoot.querySelector('[data-role="node-name"]')
  if (input) {
    input.focus()
    if (typeof input.select === 'function') input.select()
  }
}

/* ------------------------------------------------------------------ */
/* right panel: dynamic extras (state that is not a single input)      */
/* ------------------------------------------------------------------ */

function refreshExtras() {
  if (!inspRoot || !state.spec) return
  const node = singleSelectedNode()
  if (node) {
    const mode = (node.layout && node.layout.mode) || 'absolute'
    for (const button of inspRoot.querySelectorAll('[data-action="layout-mode"]')) {
      button.classList.toggle('is-active', button.dataset.mode === mode)
    }
    for (const el of inspRoot.querySelectorAll('[data-absolute-disabled]')) el.disabled = mode === 'absolute'
    const font = effectiveStyle(node).font || {}
    const align = font.align || 'left'
    for (const button of inspRoot.querySelectorAll('[data-action="font-align"]')) {
      button.classList.toggle('is-active', button.dataset.value === align)
    }
    if (node.type === 'chart') {
      const kind = (node.props && node.props.kind) || 'bar'
      for (const button of inspRoot.querySelectorAll('[data-action="chart-kind"]')) {
        button.classList.toggle('is-active', button.dataset.value === kind)
      }
    }
    const opacity = node.opacity === undefined ? 1 : node.opacity
    const opacityLabel = inspRoot.querySelector('[data-role="opacity-label"]')
    if (opacityLabel) opacityLabel.textContent = `${Math.round(opacity * 100)}%`
    const hasStroke = !!effectiveStyle(node).stroke
    for (const field of inspRoot.querySelectorAll('[data-stroke-field]')) field.classList.toggle('is-disabled', !hasStroke)
    const strokeSwitch = inspRoot.querySelector('[data-kind="stroke"]')
    if (strokeSwitch && document.activeElement !== strokeSwitch) strokeSwitch.checked = hasStroke
    const fillValue = (node.style && node.style.fill) || (effectiveStyle(node) || {}).fill
    for (const swatch of inspRoot.querySelectorAll('.ud-swatch')) {
      swatch.classList.toggle('is-active', swatch.dataset.token === fillValue)
    }
    const hiddenButton = inspRoot.querySelector('[data-action="toggle-hidden"]')
    if (hiddenButton) hiddenButton.textContent = node.hidden ? '显示元素' : '隐藏元素'
    const lockedButton = inspRoot.querySelector('[data-action="toggle-locked"]')
    if (lockedButton) lockedButton.textContent = node.locked ? '解锁元素' : '锁定元素'
    const cardHint = inspRoot.querySelector('[data-role="card-children-hint"]')
    if (cardHint) cardHint.hidden = !(Array.isArray(node.children) && node.children.length > 0)
  } else {
    const targets = batchTargets()
    const multiHidden = inspRoot.querySelector('[data-action="batch-hidden"]')
    if (multiHidden) multiHidden.textContent = targets.length && targets.every(item => item.hidden) ? '显示所选' : '隐藏所选'
    const multiLocked = inspRoot.querySelector('[data-action="batch-locked"]')
    if (multiLocked) multiLocked.textContent = targets.length && targets.every(item => item.locked) ? '解锁所选' : '锁定所选'
  }
  const frame = currentFrame()
  if (frame) {
    for (const row of inspRoot.querySelectorAll('.ud-framerow')) {
      row.classList.toggle('is-current', row.dataset.frameId === frame.id)
      const badge = row.querySelector('[data-role="frame-current"]')
      if (badge) badge.hidden = row.dataset.frameId !== frame.id
    }
  }
}

/* ------------------------------------------------------------------ */
/* right panel: form control builders                                  */
/* ------------------------------------------------------------------ */

function field(label, control, hint) {
  return `<div class="ud-field">
    <span class="ud-field__label">${esc(label)}${hint ? `<span class="ud-field__hint">${esc(hint)}</span>` : ''}</span>
    ${control}
  </div>`
}

function miniField(label, control) {
  return `<label class="ud-mini"><span class="ud-mini__label">${esc(label)}</span>${control}</label>`
}

function numberInput({ target = 'node', id, path, value, kind = 'number', datalist, placeholder = '', attr = '', label = '', defaultAttr = '' }) {
  return `<input class="ud-input ud-input--num" type="text" inputmode="decimal" spellcheck="false" autocomplete="off"
    value="${escAttr(value === null || value === undefined ? '' : value)}"
    data-target="${escAttr(target)}"${id ? ` data-id="${escAttr(id)}"` : ''} data-path="${escAttr(path)}" data-kind="${escAttr(kind)}"
    ${defaultAttr ? `data-default="${escAttr(defaultAttr)}"` : ''}
    ${datalist ? `list="${escAttr(datalist)}"` : ''} placeholder="${escAttr(placeholder)}" aria-label="${escAttr(label || path)}" ${attr}/>`
}

function textInput({ target = 'node', id, path, value, kind = 'text', placeholder = '', attr = '', label = '' }) {
  return `<input class="ud-input" type="text" spellcheck="false" autocomplete="off"
    value="${escAttr(value === null || value === undefined ? '' : value)}"
    data-target="${escAttr(target)}"${id ? ` data-id="${escAttr(id)}"` : ''} data-path="${escAttr(path)}" data-kind="${escAttr(kind)}"
    placeholder="${escAttr(placeholder)}" aria-label="${escAttr(label || path)}" ${attr}/>`
}

function textareaField({ target = 'node', id, path, value, kind = 'text', rows = 3, live = false, placeholder = '', textEditor = false, label = '' }) {
  return `<textarea class="ud-textarea" rows="${rows}" spellcheck="false"
    data-target="${escAttr(target)}"${id ? ` data-id="${escAttr(id)}"` : ''} data-path="${escAttr(path)}" data-kind="${escAttr(kind)}"
    ${live ? 'data-live="1"' : ''} ${textEditor ? 'data-ud-text-editor' : ''}
    placeholder="${escAttr(placeholder)}" aria-label="${escAttr(label || path)}">${esc(value === null || value === undefined ? '' : value)}</textarea>`
}

function selectField({ target = 'node', id, path, value, options, coerce = '', attr = '', label = '', defaultAttr = '' }) {
  const current = value === null || value === undefined ? '' : String(value)
  return `<div class="ud-select-wrap"><select class="ud-select"
    data-target="${escAttr(target)}"${id ? ` data-id="${escAttr(id)}"` : ''} data-path="${escAttr(path)}" data-kind="select"
    ${coerce ? `data-coerce="${escAttr(coerce)}"` : ''} ${defaultAttr ? `data-default="${escAttr(defaultAttr)}"` : ''}
    aria-label="${escAttr(label || path)}" ${attr}>
    ${options.map(([optionValue, optionLabel]) => `<option value="${escAttr(optionValue)}"${String(optionValue) === current ? ' selected' : ''}>${esc(optionLabel)}</option>`).join('')}
  </select></div>`
}

function checkboxField({ target = 'node', id, path, checked, label, attr = '', defaultAttr = '' }) {
  return `<label class="ud-switch ud-checkline">
    <input type="checkbox" data-target="${escAttr(target)}"${id ? ` data-id="${escAttr(id)}"` : ''} data-path="${escAttr(path)}" data-kind="checkbox"
      ${defaultAttr ? `data-default="${escAttr(defaultAttr)}"` : ''} ${checked ? 'checked' : ''} ${attr} aria-label="${escAttr(label || path)}"/>
    <span class="ud-switch__track" aria-hidden="true"></span>
    <span class="ud-checkline__label">${esc(label || '')}</span>
  </label>`
}

function colorField({ target = 'node', id, path, value, allowClear = false, reference = null, label = '颜色' }) {
  const theme = themeOf()
  const resolved = resolveColor(reference === null ? value : reference, theme) || '#000000'
  return `<div class="ud-colorfield">
    <input type="color" value="${toHex6(resolved)}" data-target="${escAttr(target)}"${id ? ` data-id="${escAttr(id)}"` : ''} data-path="${escAttr(path)}" data-kind="colorpick" title="取色器" aria-label="${escAttr(label)} 取色器"/>
    <input class="ud-input ud-colorfield__text" type="text" spellcheck="false" autocomplete="off"
      value="${escAttr(value === null || value === undefined ? '' : value)}"
      data-target="${escAttr(target)}"${id ? ` data-id="${escAttr(id)}"` : ''} data-path="${escAttr(path)}" data-kind="color"
      list="ud-color-tokens" placeholder="token 或 #hex" aria-label="${escAttr(label)} 色值"/>
    ${allowClear ? `<button type="button" class="ud-iconbtn ud-iconbtn--mini" data-action="clear-color" data-target="${escAttr(target)}"${id ? ` data-id="${escAttr(id)}"` : ''} data-path="${escAttr(path)}" title="清除颜色" aria-label="清除颜色">${svgIcon('x', 12)}</button>` : ''}
  </div>`
}

function colorSwatchRow(activeValue) {
  const theme = themeOf()
  const tokens = Object.entries(theme.colors || {})
  return `<div class="ud-swatches" role="group" aria-label="主题色板">
    ${tokens.map(([name]) => {
      const hex = resolveColor(name, theme) || '#000000'
      const active = activeValue === name
      return `<button type="button" class="ud-swatch${active ? ' is-active' : ''}" data-action="fill-token" data-token="${escAttr(name)}" title="${escAttr(name)} · ${escAttr(hex)}" aria-label="使用 ${escAttr(name)} 填充" style="--ud-swatch:${escAttr(hex)}"></button>`
    }).join('')}
  </div>`
}

function section(title, body, { aside = '' } = {}) {
  return `<section class="ud-sec">
    <header class="ud-sec__head">${esc(title)}${aside ? `<span class="ud-sec__aside">${aside}</span>` : ''}</header>
    <div class="ud-sec__body">${body}</div>
  </section>`
}

function datalistsHtml() {
  const theme = themeOf()
  const options = list => list.map(value => `<option value="${escAttr(value)}"></option>`).join('')
  return `<datalist id="ud-color-tokens">${options(Object.keys(theme.colors || {}))}</datalist>
    <datalist id="ud-radius-tokens">${options(Object.keys(theme.radius || {}))}</datalist>
    <datalist id="ud-space-tokens">${options(Object.keys(theme.space || {}))}</datalist>
    <datalist id="ud-fontsize-tokens">${options(Object.keys(theme.fontSize || {}))}</datalist>
    <datalist id="ud-shadow-tokens">${options(Object.keys(theme.shadow || {}))}</datalist>
    <datalist id="ud-font-families">${options(['system-ui', 'Inter', 'Microsoft YaHei', 'PingFang SC', 'Segoe UI', 'Roboto', 'Arial', 'ui-monospace', 'monospace'])}</datalist>`
}

/* ------------------------------------------------------------------ */
/* right panel: node inspector                                         */
/* ------------------------------------------------------------------ */

function buildNodeInspector(node) {
  const frame = getFrameOf(node.id)
  const info = TYPE_INFO[node.type] || TYPE_INFO.box
  const parts = [
    `<div class="ud-insp-head">
      <span class="ud-insp-head__icon">${svgIcon(info.icon, 15)}</span>
      <div class="ud-insp-head__meta">
        <input class="ud-insp-head__name" data-role="node-name" type="text" value="${escAttr(node.name)}" data-target="node" data-id="${escAttr(node.id)}" data-path="name" data-kind="text" aria-label="图层名称" spellcheck="false" autocomplete="off"/>
        <span class="ud-insp-head__sub">${esc(info.label)} · <span class="ud-mono">#${esc(node.id)}</span></span>
      </div>
    </div>`,
    layoutSection(node),
    styleSection(node),
  ]
  if (TEXT_TYPES.has(node.type)) parts.push(textSection(node))
  const content = contentSection(node)
  if (content) parts.push(content)
  parts.push(actionsSection(node, frame))
  return parts.join('')
}

function layoutSection(node) {
  const layout = node.layout || {}
  const mode = layout.mode || 'absolute'
  const modeButtons = Object.entries(MODE_LABELS).map(([value, label]) => (
    `<button type="button" class="ud-segbtn${value === mode ? ' is-active' : ''}" data-action="layout-mode" data-mode="${value}" title="布局模式：${label}">${label}</button>`
  )).join('')
  const absoluteAttr = mode === 'absolute' ? 'disabled' : ''
  return section('布局', `
    <div class="ud-grid4">
      ${miniField('X', numberInput({ id: node.id, path: 'x', value: node.x, label: 'X 坐标' }))}
      ${miniField('Y', numberInput({ id: node.id, path: 'y', value: node.y, label: 'Y 坐标' }))}
      ${miniField('宽', numberInput({ id: node.id, path: 'w', value: node.w, label: '宽度' }))}
      ${miniField('高', numberInput({ id: node.id, path: 'h', value: node.h, label: '高度' }))}
    </div>
    <div class="ud-inline">
      <span class="ud-inline__label">布局模式</span>
      <div class="ud-segment" role="group" aria-label="布局模式">${modeButtons}</div>
    </div>
    <div class="ud-grid2">
      ${miniField('间距 gap', numberInput({ id: node.id, path: 'layout.gap', value: layout.gap === undefined ? 0 : layout.gap, label: '布局间距', attr: `data-absolute-disabled ${absoluteAttr}` }))}
      ${miniField('内边距', numberInput({ id: node.id, path: 'layout.padding', value: formatPaddingValue(layout.padding), kind: 'padding', datalist: 'ud-space-tokens', placeholder: '0 或 12 16', label: '布局内边距', attr: `data-absolute-disabled ${absoluteAttr}` }))}
    </div>
    <div class="ud-grid2">
      ${miniField('交叉轴 align', selectField({ id: node.id, path: 'layout.align', value: layout.align === undefined ? 'start' : layout.align, options: ALIGN_OPTIONS, label: '交叉轴对齐', attr: `data-absolute-disabled ${absoluteAttr}` }))}
      ${miniField('主轴 justify', selectField({ id: node.id, path: 'layout.justify', value: layout.justify === undefined ? 'start' : layout.justify, options: JUSTIFY_OPTIONS, label: '主轴对齐', attr: `data-absolute-disabled ${absoluteAttr}` }))}
    </div>
    <div class="ud-insp-hint">${mode === 'absolute' ? '自由布局：子元素使用各自的 x / y 定位。' : '自动布局：子元素按顺序排列，x / y 不再生效。'}</div>
  `)
}

function styleSection(node) {
  const style = effectiveStyle(node)
  const stroke = style.stroke
  const opacity = node.opacity === undefined ? 1 : node.opacity
  return section('样式', `
    ${field('填充', colorField({ id: node.id, path: 'style.fill', value: style.fill === undefined ? '' : style.fill, allowClear: true, label: '填充颜色' }))}
    ${colorSwatchRow(style.fill)}
    <div class="ud-grid2">
      ${miniField('圆角', numberInput({ id: node.id, path: 'style.radius', value: style.radius, kind: 'numtoken', datalist: 'ud-radius-tokens', label: '圆角' }))}
      ${miniField('不透明度', `<div class="ud-range">
        <input type="range" min="0" max="1" step="0.05" value="${opacity}" data-target="node" data-id="${escAttr(node.id)}" data-path="opacity" data-kind="number" aria-label="不透明度"/>
        <span class="ud-range__val" data-role="opacity-label">${Math.round(opacity * 100)}%</span>
      </div>`)}
    </div>
    <div class="ud-stroke">
      <label class="ud-checkline">
        <input type="checkbox" data-target="node" data-id="${escAttr(node.id)}" data-path="style.stroke" data-kind="stroke" ${stroke ? 'checked' : ''} aria-label="启用描边"/>
        <span class="ud-checkline__label">描边</span>
      </label>
      <div class="ud-stroke__body${stroke ? '' : ' is-disabled'}" data-stroke-field>
        <div class="ud-colorfield">
          <input type="color" value="${toHex6(resolveColor(stroke ? stroke.color : 'border', themeOf()) || '#263244')}" data-target="node" data-id="${escAttr(node.id)}" data-path="style.stroke.color" data-kind="colorpick" title="描边颜色" aria-label="描边颜色取色器"/>
          <input class="ud-input ud-colorfield__text" type="text" spellcheck="false" autocomplete="off" value="${escAttr(stroke && stroke.color ? stroke.color : 'border')}" data-target="node" data-id="${escAttr(node.id)}" data-path="style.stroke.color" data-kind="color" list="ud-color-tokens" placeholder="token 或 #hex" aria-label="描边颜色"/>
          <input class="ud-input ud-colorfield__num" type="text" inputmode="decimal" value="${escAttr(stroke && stroke.width !== undefined ? stroke.width : 1)}" data-target="node" data-id="${escAttr(node.id)}" data-path="style.stroke.width" data-kind="number" aria-label="描边宽度" title="描边宽度"/>
        </div>
      </div>
    </div>
    ${field('阴影', textInput({ id: node.id, path: 'style.shadow', value: style.shadow === null || style.shadow === undefined ? '' : style.shadow, placeholder: '无 / sm / md / lg / 自定义 CSS', label: '阴影' }), '主题 shadow token 或原始 CSS')}
  `)
}

function textSection(node) {
  const font = effectiveStyle(node).font || {}
  const alignButtons = ALIGN_TEXT_OPTIONS.map(([value, label]) => (
    `<button type="button" class="ud-segbtn${(font.align || 'left') === value ? ' is-active' : ''}" data-action="font-align" data-value="${value}" title="文字对齐：${label}">${label}</button>`
  )).join('')
  return section('文字', `
    <div class="ud-grid2">
      ${miniField('字号', numberInput({ id: node.id, path: 'style.font.size', value: font.size, kind: 'numtoken', datalist: 'ud-fontsize-tokens', label: '字号' }))}
      ${miniField('字重', selectField({ id: node.id, path: 'style.font.weight', value: font.weight === undefined ? 400 : font.weight, options: WEIGHT_OPTIONS, coerce: 'number', label: '字重' }))}
    </div>
    ${field('文字颜色', colorField({ id: node.id, path: 'style.font.color', value: font.color === undefined ? 'text' : font.color, label: '文字颜色' }))}
    <div class="ud-inline">
      <span class="ud-inline__label">对齐</span>
      <div class="ud-segment" role="group" aria-label="文字对齐">${alignButtons}</div>
    </div>
    <div class="ud-grid2">
      ${miniField('行高', numberInput({ id: node.id, path: 'style.font.lineHeight', value: font.lineHeight === undefined ? 1.5 : font.lineHeight, label: '行高', defaultAttr: '1.5' }))}
      ${miniField('字距', numberInput({ id: node.id, path: 'style.font.letterSpacing', value: font.letterSpacing === undefined ? 0 : font.letterSpacing, label: '字间距', defaultAttr: '0' }))}
    </div>
  `)
}

function contentSection(node) {
  const props = node.props || {}
  const rows = node.children || []
  let body = ''
  switch (node.type) {
    case 'text':
      body = textareaField({
        id: node.id, path: 'props.text', value: props.text || '', rows: 4, live: true, textEditor: true,
        placeholder: '输入文本内容…', label: '文本内容',
      }) + `<div class="ud-grid2">
        ${miniField('最大行数', numberInput({ id: node.id, path: 'props.maxLines', value: props.maxLines, placeholder: '不限', label: '最大行数' }))}
      </div>`
      break
    case 'button':
      body = field('文字', textInput({ id: node.id, path: 'props.label', value: props.label || '', placeholder: '按钮文字', label: '按钮文字' }))
        + field('图标', iconSelect(node, 'props.icon', props.icon, true))
      break
    case 'input':
      body = field('占位文字', textInput({ id: node.id, path: 'props.placeholder', value: props.placeholder || '', placeholder: '请输入内容', label: '占位文字' }))
        + field('已填内容', textInput({ id: node.id, path: 'props.value', value: props.value || '', placeholder: '可选', label: '已填内容' }))
        + field('左侧图标', iconSelect(node, 'props.icon', props.icon, true))
      break
    case 'icon':
      body = field('图标', iconSelect(node, 'props.name', props.name || 'star', false))
        + field('颜色', colorField({ id: node.id, path: 'props.color', value: props.color === undefined ? '' : props.color, label: '图标颜色' }))
        + `<div class="ud-grid2">${miniField('线宽', numberInput({ id: node.id, path: 'props.strokeWidth', value: props.strokeWidth === undefined ? 1.8 : props.strokeWidth, label: '描边线宽', defaultAttr: '1.8' }))}</div>`
      break
    case 'badge':
      body = field('文字', textInput({ id: node.id, path: 'props.text', value: props.text || '', placeholder: '标签文字', label: '徽标文字' }))
        + field('色调', selectField({ id: node.id, path: 'props.tone', value: props.tone || 'primary', options: TONE_OPTIONS, label: '徽标色调', defaultAttr: 'primary' }))
      break
    case 'chart':
      body = `<div class="ud-inline">
          <span class="ud-inline__label">类型</span>
          <div class="ud-segment" role="group" aria-label="图表类型">
            ${[['bar', '柱状'], ['line', '折线'], ['donut', '环形']].map(([value, label]) => `<button type="button" class="ud-segbtn${(props.kind || 'bar') === value ? ' is-active' : ''}" data-action="chart-kind" data-value="${value}">${label}</button>`).join('')}
          </div>
        </div>
        ${field('数据', textInput({ id: node.id, path: 'props.data', value: Array.isArray(props.data) ? props.data.join(', ') : '', kind: 'csvnum', placeholder: '12, 28, 20, 36', label: '图表数据' }), '逗号分隔的数值')}
        ${field('主色', colorField({ id: node.id, path: 'props.color', value: props.color === undefined ? '' : props.color, label: '图表主色' }))}`
      break
    case 'table':
      body = field('列', textInput({ id: node.id, path: 'props.columns', value: Array.isArray(props.columns) ? props.columns.join(', ') : '', kind: 'csv', placeholder: '名称, 状态, 金额', label: '表格列' }), '逗号分隔')
        + field('行数据', textareaField({ id: node.id, path: 'props.rows', value: Array.isArray(props.rows) ? props.rows.map(row => (Array.isArray(row) ? row.join(', ') : row)).join('\n') : '', kind: 'rows', rows: 4, placeholder: '每行一条记录，单元格用逗号分隔', label: '表格行数据' }))
        + checkboxField({ id: node.id, path: 'props.header', checked: props.header !== false, label: '显示表头', defaultAttr: 'true' })
      break
    case 'tabs':
      body = field('标签项', textInput({ id: node.id, path: 'props.items', value: Array.isArray(props.items) ? props.items.join(', ') : '', kind: 'csv', placeholder: '全部, 进行中, 已完成', label: '标签项' }), '逗号分隔')
        + `<div class="ud-grid2">${miniField('激活项', numberInput({ id: node.id, path: 'props.active', value: props.active === undefined ? 0 : props.active, label: '激活标签序号', defaultAttr: '0' }))}</div>`
      break
    case 'image':
      body = field('图片地址', textInput({ id: node.id, path: 'props.src', value: props.src || '', placeholder: 'https://… 或留空显示占位图', label: '图片地址' }))
        + field('填充方式', selectField({ id: node.id, path: 'props.fit', value: props.fit || 'cover', options: FIT_OPTIONS, label: '图片填充方式', defaultAttr: 'cover' }))
      break
    case 'select':
      body = field('当前值', textInput({ id: node.id, path: 'props.value', value: props.value || '', placeholder: '请选择', label: '下拉当前值' }))
        + field('占位文字', textInput({ id: node.id, path: 'props.placeholder', value: props.placeholder || '', placeholder: '请选择', label: '下拉占位文字' }))
      break
    case 'checkbox':
      body = field('标签文字', textInput({ id: node.id, path: 'props.label', value: props.label || '', placeholder: '同意条款', label: '复选框文字' }))
        + checkboxField({ id: node.id, path: 'props.checked', checked: props.checked !== false, label: '选中状态', defaultAttr: 'true' })
      break
    case 'avatar':
      body = field('缩写', textInput({ id: node.id, path: 'props.initials', value: props.initials || '', placeholder: 'AI', label: '头像缩写' }))
        + field('图片地址', textInput({ id: node.id, path: 'props.src', value: props.src || '', placeholder: '可选，留空显示缩写', label: '头像图片地址' }))
      break
    case 'toggle':
      body = checkboxField({ id: node.id, path: 'props.checked', checked: props.checked !== false, label: '开启状态', defaultAttr: 'true' })
      break
    case 'card':
      body = field('标题', textInput({ id: node.id, path: 'props.title', value: props.title || '', placeholder: '卡片标题', label: '卡片标题' }))
        + field('正文', textareaField({ id: node.id, path: 'props.body', value: props.body || '', rows: 3, live: true, placeholder: '卡片描述', label: '卡片正文' }))
        + `<div class="ud-insp-hint" data-role="card-children-hint"${rows.length ? '' : ' hidden'}>该卡片包含子节点，标题 / 正文不会显示在画布上。</div>`
      break
    case 'divider':
      body = `<div class="ud-insp-hint">分割线没有内容属性，颜色与粗细在「样式」中调整。</div>`
      break
    case 'box':
      body = `<div class="ud-insp-hint">容器用于分组子元素，可在左侧「组件」面板把元素插入到选中的容器。</div>`
      break
    default:
      return ''
  }
  return section('内容', body)
}

function iconSelect(node, path, value, allowEmpty) {
  const options = []
  if (allowEmpty) options.push(['', '无'])
  for (const name of Object.keys(ICONS)) options.push([name, name])
  return selectField({
    id: node.id,
    path,
    value: value || (allowEmpty ? '' : 'star'),
    options,
    label: '图标',
    defaultAttr: allowEmpty ? '' : 'star',
  })
}

function actionsSection(node, frame) {
  const parent = node.parent ? getNode(node.parent) : null
  const parts = [
    `<div class="ud-insp-actions">
      <button type="button" class="ud-btn" data-action="rename">${svgIcon('rename', 13)}重命名</button>
      <button type="button" class="ud-btn" data-action="duplicate">${svgIcon('copy', 13)}复制</button>
      <button type="button" class="ud-btn" data-action="forward">${svgIcon('arrow-up', 13)}上移</button>
      <button type="button" class="ud-btn" data-action="backward">${svgIcon('arrow-down', 13)}下移</button>
      <button type="button" class="ud-btn" data-action="toggle-hidden">${node.hidden ? '显示元素' : '隐藏元素'}</button>
      <button type="button" class="ud-btn" data-action="toggle-locked">${node.locked ? '解锁元素' : '锁定元素'}</button>
      <button type="button" class="ud-btn ud-btn--danger ud-insp-actions__wide" data-action="delete">${svgIcon('trash', 13)}删除元素</button>
    </div>`,
  ]
  if (parent || frame) {
    parts.push(`<div class="ud-insp-meta">
      <span>父级</span><strong>${esc(parent ? parent.name : '画板根节点')}</strong>
      ${frame ? `<span>画板</span><strong>${esc(frame.name)}</strong>` : ''}
    </div>`)
  }
  return section('操作', parts.join(''))
}

/* ------------------------------------------------------------------ */
/* right panel: multi selection                                        */
/* ------------------------------------------------------------------ */

function buildMultiInspector(nodes) {
  const items = nodes.map(node => {
    const info = TYPE_INFO[node.type] || TYPE_INFO.box
    return `<button type="button" class="ud-multi__item" data-action="select-node" data-id="${escAttr(node.id)}">
      ${svgIcon(info.icon, 13)}<span>${esc(node.name)}</span><em>${esc(info.label)}</em>
    </button>`
  }).join('')
  const targets = nodes.filter(node => node.parent)
  const allHidden = targets.length > 0 && targets.every(node => node.hidden)
  const allLocked = targets.length > 0 && targets.every(node => node.locked)
  return `<div class="ud-insp-head ud-insp-head--multi">
    <span class="ud-insp-head__icon">${svgIcon('layers', 15)}</span>
    <div class="ud-insp-head__meta">
      <div class="ud-insp-head__title">已选中 ${nodes.length} 个元素</div>
      <div class="ud-insp-head__sub">多选批量编辑</div>
    </div>
  </div>
  ${section('选中元素', `<div class="ud-multi">${items}</div>`)}
  ${section('批量操作', `<div class="ud-insp-actions">
    <button type="button" class="ud-btn" data-action="batch-hidden">${allHidden ? '显示所选' : '隐藏所选'}</button>
    <button type="button" class="ud-btn" data-action="batch-locked">${allLocked ? '解锁所选' : '锁定所选'}</button>
    <button type="button" class="ud-btn ud-btn--danger ud-insp-actions__wide" data-action="batch-delete">删除所选</button>
  </div>`)}`
}

/* ------------------------------------------------------------------ */
/* right panel: document / theme inspector                             */
/* ------------------------------------------------------------------ */

function buildDocInspector(frame) {
  const spec = state.spec
  const theme = themeOf()
  const frames = spec.frames || []
  const nodeCount = Object.keys(spec.nodes || {}).length
  const currentFrameId = frame ? frame.id : null
  const head = `<div class="ud-insp-head">
    <span class="ud-insp-head__icon">${svgIcon('frame', 15)}</span>
    <div class="ud-insp-head__meta">
      <div class="ud-insp-head__title">设计稿</div>
      <div class="ud-insp-head__sub">${frames.length} 个画板 · ${nodeCount} 个节点 · <span class="ud-mono">v${spec.version || 1}</span></div>
    </div>
  </div>
  ${field('设计稿名称', textInput({ target: 'spec', path: 'name', value: spec.name || '', label: '设计稿名称' }))}`

  const frameRows = frames.map(item => frameRowInspector(item, item.id === currentFrameId, theme)).join('')
  const framesSection = section('画板', `
    <div class="ud-frames">${frameRows || '<div class="ud-empty">还没有画板</div>'}</div>
    <button type="button" class="ud-btn ud-btn--primary ud-btn--block" data-action="add-frame">${svgIcon('plus', 13)}添加画板</button>
  `, { aside: currentFrameId ? '当前画板已高亮' : '' })

  const colorRows = Object.entries(theme.colors || {}).map(([name, value]) => colorTokenRow(name, value)).join('')
  const colorsSection = section('主题 · 颜色', `<div class="ud-tokens">${colorRows}</div>`, { aside: `${Object.keys(theme.colors || {}).length} 个 token` })

  const tokenGroup = (group, label) => {
    const entries = Object.entries(theme[group] || {})
    return `<div class="ud-tokengroup">
      <div class="ud-tokengroup__head">${esc(label)}</div>
      <div class="ud-tokens ud-tokens--num">
        ${entries.map(([name, value]) => numberTokenRow(group, name, value)).join('')}
      </div>
    </div>`
  }
  const scaleSection = section('主题 · 尺度', `
    ${tokenGroup('radius', '圆角 radius')}
    ${tokenGroup('space', '间距 space')}
    ${tokenGroup('fontSize', '字号 fontSize')}
  `)

  const shadowRows = Object.entries(theme.shadow || {}).map(([name, value]) => `<div class="ud-token">
      <span class="ud-token__name">${esc(name)}</span>
      <input class="ud-input ud-token__value" type="text" spellcheck="false" autocomplete="off" value="${escAttr(value)}"
        data-target="theme" data-path="shadow.${escAttr(name)}" data-kind="shadow" list="ud-shadow-tokens" aria-label="${escAttr(name)} 阴影"/>
    </div>`).join('')
  const fontSection = section('主题 · 字体与阴影', `
    ${field('字体族', textInput({ target: 'theme', path: 'font', value: theme.font || 'system-ui', placeholder: 'system-ui', attr: 'list="ud-font-families"', label: '主题字体族' }))}
    <div class="ud-tokens">${shadowRows}</div>
  `)

  return [head, framesSection, colorsSection, scaleSection, fontSection].join('')
}

function frameRowInspector(frame, isCurrent, theme) {
  const rootId = state.spec.rootIds[frame.id]
  const selected = state.selection.includes(rootId)
  return `<div class="ud-framerow${isCurrent ? ' is-current' : ''}${selected ? ' is-selected' : ''}" data-frame-id="${escAttr(frame.id)}">
    <div class="ud-framerow__head">
      <input class="ud-framerow__swatch" type="color" value="${toHex6(resolveColor(frame.background, theme) || '#0b0f17')}"
        data-target="frame" data-id="${escAttr(frame.id)}" data-path="background" data-kind="colorpick" title="画板背景色" aria-label="画板背景色"/>
      <input class="ud-input ud-framerow__name" type="text" spellcheck="false" autocomplete="off" value="${escAttr(frame.name)}"
        data-target="frame" data-id="${escAttr(frame.id)}" data-path="name" data-kind="text" aria-label="画板名称"/>
      <span class="ud-framerow__tag" data-role="frame-current"${isCurrent ? '' : ' hidden'}>当前</span>
      <button type="button" class="ud-iconbtn ud-iconbtn--mini" data-action="remove-frame" data-frame-id="${escAttr(frame.id)}" title="删除画板" aria-label="删除画板">${svgIcon('x', 12)}</button>
    </div>
    <div class="ud-framerow__dims">
      ${miniField('宽', numberInput({ target: 'frame', id: frame.id, path: 'width', value: frame.width, label: '画板宽度' }))}
      <span class="ud-framerow__x">×</span>
      ${miniField('高', numberInput({ target: 'frame', id: frame.id, path: 'height', value: frame.height, label: '画板高度' }))}
      <span class="ud-framerow__pos ud-dim">@${Math.round(frame.x)},${Math.round(frame.y)}</span>
    </div>
  </div>`
}

function colorTokenRow(name, value) {
  const theme = themeOf()
  return `<div class="ud-token">
    <input class="ud-token__swatch" type="color" value="${toHex6(resolveColor(value, theme) || '#000000')}"
      data-target="theme" data-path="colors.${escAttr(name)}" data-kind="colorpick" title="${escAttr(name)}" aria-label="${escAttr(name)} 颜色"/>
    <span class="ud-token__name" title="${escAttr(name)}">${esc(name)}</span>
    <input class="ud-input ud-token__value" type="text" spellcheck="false" autocomplete="off" value="${escAttr(value)}"
      data-target="theme" data-path="colors.${escAttr(name)}" data-kind="color" list="ud-color-tokens" aria-label="${escAttr(name)} 色值"/>
  </div>`
}

function numberTokenRow(group, name, value) {
  const unit = group === 'radius' || group === 'space' || group === 'fontSize' ? 'px' : ''
  return `<div class="ud-token ud-token--num">
    <span class="ud-token__name" title="${escAttr(name)}">${esc(name)}</span>
    <input class="ud-input ud-token__value" type="text" inputmode="decimal" value="${escAttr(value)}"
      data-target="theme" data-path="${escAttr(group)}.${escAttr(name)}" data-kind="number" aria-label="${escAttr(name)} 数值"/>
    ${unit ? `<span class="ud-token__unit">${unit}</span>` : ''}
  </div>`
}
