/**
 * UI Designer — shared style/content engine (pure, no DOM).
 *
 * Imported by the editor renderer (browser), the exporter (server) and the
 * prompt builder (server), so the three never disagree about how a node looks.
 * Keep this file dependency-free and side-effect-free.
 */

export const DEFAULT_THEME = {
  font: 'system-ui',
  colors: {
    bg: '#0b0f17',
    surface: '#111827',
    surface2: '#1b2436',
    text: '#e5e7eb',
    muted: '#94a3b8',
    primary: '#6366f1',
    onPrimary: '#ffffff',
    border: '#263244',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
  radius: { sm: 4, md: 8, lg: 12, xl: 20, full: 999 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48 },
  fontSize: { xs: 12, sm: 13, md: 15, lg: 18, xl: 24, '2xl': 32 },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,.25)',
    md: '0 8px 24px rgba(0,0,0,.28)',
    lg: '0 24px 64px rgba(0,0,0,.4)',
  },
}

export const NODE_TYPES = [
  'box', 'text', 'button', 'input', 'image', 'icon', 'divider', 'badge',
  'avatar', 'toggle', 'checkbox', 'select', 'tabs', 'table', 'chart', 'card',
]

/** Per-type default style. Node.style overrides these; export/render agree. */
export const TYPE_DEFAULTS = {
  box: { fill: null, radius: 0, stroke: null, shadow: null, padding: null, font: {} },
  text: {
    fill: null,
    radius: 0,
    stroke: null,
    padding: null,
    font: { size: 'md', weight: 400, color: 'text', align: 'left', lineHeight: 1.5 },
  },
  button: {
    fill: 'primary',
    radius: 'md',
    padding: [10, 16],
    shadow: null,
    font: { size: 'md', weight: 600, color: 'onPrimary', align: 'center' },
  },
  input: {
    fill: 'surface2',
    radius: 'md',
    stroke: { color: 'border', width: 1 },
    padding: [10, 12],
    font: { size: 'md', weight: 400, color: 'muted', align: 'left' },
  },
  image: { fill: 'surface2', radius: 'md', stroke: null, padding: null, font: {} },
  icon: { fill: null, radius: 0, padding: null, font: { color: 'text' } },
  divider: { fill: null, radius: 0, stroke: { color: 'border', width: 1 }, padding: null, font: {} },
  badge: {
    fill: null,
    radius: 0,
    stroke: null,
    padding: null,
    font: { size: 'xs', weight: 600, color: 'onPrimary', align: 'center' },
  },
  avatar: { fill: 'surface2', radius: 'full', padding: null, font: { size: 'sm', weight: 600, color: 'text' } },
  toggle: { fill: null, radius: 0, padding: null, font: {} },
  checkbox: { fill: null, radius: 0, stroke: null, padding: null, font: { size: 'sm', color: 'text' } },
  select: {
    fill: 'surface2',
    radius: 'md',
    stroke: { color: 'border', width: 1 },
    padding: [10, 12],
    font: { size: 'md', weight: 400, color: 'text', align: 'left' },
  },
  tabs: {
    fill: null,
    radius: 0,
    padding: null,
    font: { size: 'sm', weight: 500, color: 'muted', align: 'left' },
  },
  table: {
    fill: 'surface',
    radius: 'md',
    stroke: { color: 'border', width: 1 },
    padding: null,
    font: { size: 'sm', weight: 400, color: 'text', align: 'left' },
  },
  chart: { fill: null, radius: 0, padding: null, font: { color: 'primary' } },
  card: {
    fill: 'surface',
    radius: 'lg',
    stroke: { color: 'border', width: 1 },
    padding: 'lg',
    shadow: 'sm',
    font: { size: 'md', color: 'text', align: 'left' },
  },
}

export const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 5.6"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 6.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'arrow-right': '<path d="M4 12h16m0 0-6-6m6 6-6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  star: '<path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3l-5.5 2.9 1.1-6.2L3 9.6l6.3-.9Z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  'trending-up': '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  'trending-down': '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  message: '<path d="M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12Z"/>',
  shield: '<path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6Z"/>',
  zap: '<path d="M13 2 4 14h6l-1 8 9-12h-6Z"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
}

/* ------------------------------------------------------------------ */
/* token resolution                                                    */
/* ------------------------------------------------------------------ */

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

export function resolveColor(value, theme = DEFAULT_THEME) {
  if (value === null || value === undefined || value === '' || value === 'transparent') return null
  if (typeof value === 'string') {
    const colors = theme.colors || {}
    if (Object.prototype.hasOwnProperty.call(colors, value)) return colors[value]
    return value
  }
  return null
}

export function resolveRadius(value, theme = DEFAULT_THEME) {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Math.max(0, value)
  const radius = theme.radius || {}
  if (Object.prototype.hasOwnProperty.call(radius, value)) return Number(radius[value]) || 0
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

export function resolveSpace(value, theme = DEFAULT_THEME) {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const space = theme.space || {}
  if (Object.prototype.hasOwnProperty.call(space, value)) return Number(space[value]) || 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function resolveFontSize(value, theme = DEFAULT_THEME) {
  if (value === null || value === undefined) return 15
  if (typeof value === 'number') return value
  const sizes = theme.fontSize || {}
  if (Object.prototype.hasOwnProperty.call(sizes, value)) return Number(sizes[value]) || 15
  const n = Number(value)
  return Number.isFinite(n) ? n : 15
}

export function resolveShadow(value, theme = DEFAULT_THEME) {
  if (value === null || value === undefined || value === '' || value === 'none') return null
  if (typeof value === 'string') {
    const shadows = theme.shadow || {}
    return Object.prototype.hasOwnProperty.call(shadows, value) ? shadows[value] : value
  }
  return null
}

/** number | [t,r,b,l] | {t,r,b,l} -> [t,r,b,l] */
export function expandPadding(value, theme = DEFAULT_THEME) {
  if (value === null || value === undefined) return [0, 0, 0, 0]
  if (typeof value === 'number') return [value, value, value, value]
  if (typeof value === 'string') {
    const n = resolveSpace(value, theme)
    return [n, n, n, n]
  }
  if (Array.isArray(value)) {
    if (value.length === 1) return [value[0], value[0], value[0], value[0]]
    if (value.length === 2) return [value[0], value[1], value[0], value[1]]
    if (value.length === 3) return [value[0], value[1], value[2], value[1]]
    return [value[0] || 0, value[1] || 0, value[2] || 0, value[3] || 0]
  }
  if (isPlainObject(value)) {
    const t = value.t ?? value.top ?? 0
    const r = value.r ?? value.right ?? t
    const b = value.b ?? value.bottom ?? t
    const l = value.l ?? value.left ?? r
    return [t, r, b, l]
  }
  return [0, 0, 0, 0]
}

export function paddingCss(value, theme = DEFAULT_THEME) {
  const [t, r, b, l] = expandPadding(value, theme)
  return `${t}px ${r}px ${b}px ${l}px`
}

export function fontFamilyCss(family, theme = DEFAULT_THEME) {
  const f = family || theme.font || 'system-ui'
  return String(f).includes(',') ? String(f) : `"${f}", system-ui, sans-serif`
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ------------------------------------------------------------------ */
/* effective style                                                     */
/* ------------------------------------------------------------------ */

export function effectiveStyle(node) {
  const defaults = TYPE_DEFAULTS[node.type] || TYPE_DEFAULTS.box
  const style = node.style || {}
  return {
    ...defaults,
    ...style,
    font: { ...(defaults.font || {}), ...(style.font || {}) },
  }
}

const BOX_EXTRA = {
  text: { display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  button: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  badge: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  icon: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  input: { display: 'flex', alignItems: 'center', gap: '8px' },
  select: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  checkbox: { display: 'flex', alignItems: 'center', gap: '8px' },
  tabs: { display: 'flex', alignItems: 'stretch', gap: '20px' },
  avatar: { display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { overflow: 'hidden' },
  table: { overflow: 'hidden' },
  chart: { overflow: 'hidden' },
  divider: { padding: '0' },
}

const POSITION_TYPES = new Set(['absolute'])

/**
 * Outer box style of a node.
 * @param {object} node
 * @param {object} theme
 * @param {{x:number,y:number,w:number,h:number}} [pos] override (layout containers)
 * @returns {Record<string,string|number>} CSS properties as inline style object
 */
export function boxStyle(node, theme = DEFAULT_THEME, pos = null) {
  const style = effectiveStyle(node)
  const extra = BOX_EXTRA[node.type] || {}
  const out = {
    position: 'absolute',
    left: `${pos ? pos.x : node.x || 0}px`,
    top: `${pos ? pos.y : node.y || 0}px`,
    width: `${pos ? pos.w : node.w || 0}px`,
    height: `${pos ? pos.h : node.h || 0}px`,
    boxSizing: 'border-box',
    background: resolveColor(style.fill, theme) || 'transparent',
    borderRadius: `${resolveRadius(style.radius, theme)}px`,
    border: style.stroke && style.stroke.width !== 0
      ? `${style.stroke.width ?? 1}px solid ${resolveColor(style.stroke.color, theme) || 'transparent'}`
      : 'none',
    boxShadow: resolveShadow(style.shadow, theme) || 'none',
    opacity: node.opacity === undefined ? 1 : node.opacity,
    ...extra,
  }
  if (node.hidden) out.display = 'none'
  if (style.padding !== null && style.padding !== undefined) {
    out.padding = paddingCss(style.padding, theme)
  }
  if (node.type === 'text') {
    Object.assign(out, fontStyle(node, theme))
    out.padding = style.padding ? paddingCss(style.padding, theme) : out.padding
  }
  if (node.type === 'button' || node.type === 'badge') {
    Object.assign(out, fontStyle(node, theme))
  }
  if (node.type === 'chart' && style.fill) {
    out.background = 'transparent'
  }
  if (node.type === 'divider') {
    out.background = resolveColor(style.stroke?.color, theme) || resolveColor(style.fill, theme) || 'transparent'
    out.border = 'none'
    out.height = `${Math.max(1, style.stroke?.width || 1)}px`
  }
  return out
}

/** CSS properties for text content inherited by inner markup. */
export function fontStyle(node, theme = DEFAULT_THEME) {
  const style = effectiveStyle(node)
  const font = style.font || {}
  const out = {
    fontFamily: fontFamilyCss(font.family, theme),
    fontSize: `${resolveFontSize(font.size, theme)}px`,
    fontWeight: String(font.weight || 400),
    color: resolveColor(font.color, theme) || resolveColor('text', theme) || '#e5e7eb',
    textAlign: font.align || 'left',
    lineHeight: String(font.lineHeight || 1.5),
  }
  if (font.letterSpacing) out.letterSpacing = `${font.letterSpacing}px`
  if (font.transform && font.transform !== 'none') out.textTransform = font.transform
  return out
}

/** Container layout that is independent of child absolute positions. */
export function containerPaddingCss(container, theme = DEFAULT_THEME) {
  const layout = container.layout || {}
  const style = effectiveStyle(container)
  const padding = layout.padding !== undefined && layout.padding !== null
    ? layout.padding
    : style.padding
  return paddingCss(padding, theme)
}

/* ------------------------------------------------------------------ */
/* layout                                                              */
/* ------------------------------------------------------------------ */

/**
 * Positions of a container's children. Absolute containers use stored x/y;
 * row/column containers are computed here (same maths the exporter uses).
 * @returns {Map<string,{x:number,y:number,w:number,h:number}>}
 */
export function layoutChildren(container, spec) {
  const out = new Map()
  if (!container || !Array.isArray(container.children)) return out
  const nodes = (spec && spec.nodes) || {}
  const children = container.children.map(id => nodes[id]).filter(Boolean)
  const layout = container.layout || {}
  const mode = layout.mode || 'absolute'
  const theme = (spec && spec.theme) || DEFAULT_THEME
  if (mode !== 'row' && mode !== 'column') {
    for (const child of children) {
      out.set(child.id, { x: child.x || 0, y: child.y || 0, w: child.w || 0, h: child.h || 0 })
    }
    return out
  }
  const [pt, pr, pb, pl] = expandPadding(
    layout.padding !== undefined && layout.padding !== null ? layout.padding : effectiveStyle(container).padding,
    theme,
  )
  const innerW = Math.max(0, (container.w || 0) - pl - pr)
  const innerH = Math.max(0, (container.h || 0) - pt - pb)
  const gap = Number(layout.gap) || 0
  const row = mode === 'row'
  const mainAvail = row ? innerW : innerH
  const crossAvail = row ? innerH : innerW
  const sizes = children.map(c => (row ? c.w || 0 : c.h || 0))
  const crossSizes = children.map(c => (row ? c.h || 0 : c.w || 0))
  const total = sizes.reduce((a, b) => a + b, 0) + gap * Math.max(0, children.length - 1)
  const justify = layout.justify || 'start'
  let cursor = 0
  let spacing = gap
  if (justify === 'center') cursor = (mainAvail - total) / 2
  else if (justify === 'end') cursor = mainAvail - total
  else if (justify === 'between' && children.length > 1) {
    spacing = gap
    cursor = 0
    const free = mainAvail - sizes.reduce((a, b) => a + b, 0)
    spacing = Math.max(gap, free / (children.length - 1))
  }
  const align = layout.align || 'start'
  children.forEach((child, i) => {
    const mainSize = sizes[i]
    const crossSize = crossSizes[i]
    let crossPos = 0
    if (align === 'center') crossPos = (crossAvail - crossSize) / 2
    else if (align === 'end') crossPos = crossAvail - crossSize
    else if (align === 'stretch') crossPos = 0
    const w = row ? mainSize : align === 'stretch' ? crossAvail : crossSize
    const h = row ? (align === 'stretch' ? crossAvail : crossSize) : mainSize
    const x = row ? pl + cursor : pl + crossPos
    const y = row ? pt + crossPos : pt + cursor
    out.set(child.id, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) })
    cursor += mainSize + spacing
  })
  return out
}

/* ------------------------------------------------------------------ */
/* content HTML                                                        */
/* ------------------------------------------------------------------ */

export function iconSvg(name, { size = 20, color = 'currentColor', strokeWidth = 1.8 } = {}) {
  const path = ICONS[name] || ICONS.more
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
}

function resolvedTheme(theme) {
  return theme || DEFAULT_THEME
}

function mutedBorder(theme) {
  return resolveColor('border', theme) || '#263244'
}

/**
 * Inner HTML for a node's content. Container types return '' (children are
 * rendered separately) except card/table which may draw their own content.
 */
export function contentHTML(node, theme = DEFAULT_THEME) {
  const t = resolvedTheme(theme)
  const props = node.props || {}
  const style = effectiveStyle(node)
  const font = fontStyle(node, t)
  const color = font.color
  const primary = resolveColor('primary', t)
  const onPrimary = resolveColor('onPrimary', t)
  const muted = resolveColor('muted', t)
  const border = mutedBorder(t)

  switch (node.type) {
    case 'text':
      return escapeHtml(props.text || '')
    case 'button': {
      const icon = props.icon ? iconSvg(props.icon, { size: 16, color: 'currentColor' }) : ''
      return `${icon}<span>${escapeHtml(props.label || '按钮')}</span>`
    }
    case 'input': {
      const icon = props.icon ? iconSvg(props.icon, { size: 16, color: color }) : ''
      const text = props.value || props.placeholder || '输入内容'
      return `${icon}<span style="opacity:${props.value ? 0.95 : 0.6};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(text)}</span>`
    }
    case 'select': {
      return `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(props.value || props.placeholder || '请选择')}</span>
        <span style="display:inline-flex;color:${muted}">${iconSvg('chevron-down', { size: 15 })}</span>`
    }
    case 'icon':
      return iconSvg(props.name || 'star', {
        size: Math.max(8, Math.min(node.w || 20, node.h || 20)),
        color: resolveColor(props.color || style.font?.color, t) || color,
        strokeWidth: props.strokeWidth || 1.8,
      })
    case 'image': {
      if (props.src) {
        return `<img src="${escapeHtml(props.src)}" alt="" style="width:100%;height:100%;object-fit:${props.fit || 'cover'};display:block;border-radius:inherit" />`
      }
      const bg = `repeating-conic-gradient(${resolveColor('surface2', t) || '#1b2436'} 0 25%, ${resolveColor('surface', t) || '#111827'} 0 50%) 0 0/18px 18px`
      return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${bg};color:${muted};border-radius:inherit">
        ${iconSvg('image', { size: Math.min(28, Math.max(14, (node.w || 40) / 4)), color: muted })}</div>`
    }
    case 'divider':
      return ''
    case 'badge': {
      const tone = props.tone || 'primary'
      const bg = resolveColor(tone, t) || primary
      const fg = tone === 'primary' ? onPrimary : resolveColor('onPrimary', t) || '#fff'
      return `<span style="background:${bg}22;color:${bg};border:1px solid ${bg}55;border-radius:999px;padding:1px 7px;font-size:${font.fontSize};font-weight:600;line-height:1.4">${escapeHtml(props.text || '标签')}</span>`
    }
    case 'avatar': {
      const initials = escapeHtml(props.initials || 'AI')
      if (props.src) {
        return `<img src="${escapeHtml(props.src)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" />`
      }
      return `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:${Math.max(10, Math.min(18, (node.w || 32) / 2.6))}px;font-weight:600;color:${color};letter-spacing:.5px">${initials}</span>`
    }
    case 'toggle': {
      const on = props.checked !== false
      return `<span style="display:block;width:100%;height:100%;border-radius:999px;background:${on ? resolveColor('primary', t) : resolveColor('surface2', t)};position:relative">
        <span style="position:absolute;top:2px;${on ? 'right:2px' : 'left:2px'};width:calc(50% - 2px);height:calc(100% - 4px);border-radius:999px;background:${on ? onPrimary : muted}"></span></span>`
    }
    case 'checkbox': {
      const checked = props.checked !== false
      const box = `<span style="width:16px;height:16px;flex:0 0 auto;border-radius:4px;border:1px solid ${checked ? primary : border};background:${checked ? primary : 'transparent'};display:inline-flex;align-items:center;justify-content:center;color:${onPrimary}">${checked ? iconSvg('check', { size: 12, color: onPrimary, strokeWidth: 2.4 }) : ''}</span>`
      const label = props.label ? `<span style="color:${color}">${escapeHtml(props.label)}</span>` : ''
      return `${box}${label}`
    }
    case 'tabs': {
      const items = Array.isArray(props.items) && props.items.length ? props.items : ['标签一', '标签二', '标签三']
      const active = Number(props.active) || 0
      return items
        .map((item, i) => {
          const on = i === active
          return `<span style="display:inline-flex;align-items:stretch;padding-bottom:${on ? '6px' : '0'};border-bottom:2px solid ${on ? primary : 'transparent'};color:${on ? color : muted};font-weight:${on ? 600 : 500}">${escapeHtml(item)}</span>`
        })
        .join('')
    }
    case 'table': {
      const columns = Array.isArray(props.columns) && props.columns.length ? props.columns : ['名称', '状态', '金额']
      const rows = Array.isArray(props.rows) ? props.rows : []
      const cell = 'padding:8px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 0;min-width:0'
      const header = props.header === false
        ? ''
        : `<div style="display:flex;color:${muted};font-size:${resolveFontSize('xs', t)}px;letter-spacing:.3px;background:${resolveColor('surface2', t) || '#1b2436'};border-bottom:1px solid ${border}">${columns
            .map(c => `<span style="${cell};font-weight:600">${escapeHtml(c)}</span>`)
            .join('')}</div>`
      const body = rows
        .map(
          row =>
            `<div style="display:flex;border-bottom:1px solid ${border};font-size:${resolveFontSize('sm', t)}px">${columns
              .map((_, ci) => `<span style="${cell};color:${color}">${escapeHtml(row[ci] ?? '')}</span>`)
              .join('')}</div>`,
        )
        .join('')
      return header + body
    }
    case 'chart': {
      const data = Array.isArray(props.data) && props.data.length ? props.data : [12, 28, 20, 36, 18, 30]
      const kind = props.kind || 'bar'
      const accent = resolveColor(props.color || style.font?.color || 'primary', t) || primary
      const w = Math.max(40, node.w || 200)
      const h = Math.max(40, node.h || 120)
      const max = Math.max(...data, 1)
      if (kind === 'line') {
        const step = data.length > 1 ? w / (data.length - 1) : w
        const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 8) - 4).toFixed(1)}`).join(' ')
        return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="${pts}" fill="none" stroke="${accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          <polyline points="${pts} ${w},${h} 0,${h}" fill="${accent}18" stroke="none" /></svg>`
      }
      if (kind === 'donut') {
        const total = data.reduce((a, b) => a + b, 0) || 1
        const r = Math.min(w, h) / 2 - 8
        const cx = w / 2
        const cy = h / 2
        let angle = -Math.PI / 2
        const colors = [accent, muted, resolveColor('success', t), resolveColor('warning', t), resolveColor('surface2', t)]
        const arcs = data.map((v, i) => {
          const sweep = (v / total) * Math.PI * 2
          const x1 = cx + r * Math.cos(angle)
          const y1 = cy + r * Math.sin(angle)
          angle += sweep
          const x2 = cx + r * Math.cos(angle)
          const y2 = cy + r * Math.sin(angle)
          const large = sweep > Math.PI ? 1 : 0
          return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="12" />`
        })
        return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%">${arcs.join('')}</svg>`
      }
      const gap = 6
      const barW = (w - gap * (data.length - 1)) / data.length
      const bars = data
        .map((v, i) => {
          const bh = Math.max(2, (v / max) * (h - 6))
          return `<rect x="${(i * (barW + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${accent}" />`
        })
        .join('')
      return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none">${bars}</svg>`
    }
    case 'card': {
      if (Array.isArray(node.children) && node.children.length > 0) return ''
      const title = props.title
        ? `<div style="font-size:${resolveFontSize('lg', t)}px;font-weight:600;color:${color};margin-bottom:6px">${escapeHtml(props.title)}</div>`
        : ''
      const body = props.body
        ? `<div style="font-size:${resolveFontSize('sm', t)}px;color:${muted};line-height:1.6;white-space:pre-wrap">${escapeHtml(props.body)}</div>`
        : ''
      return title + body
    }
    default:
      return ''
  }
}
