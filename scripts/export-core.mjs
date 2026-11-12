/**
 * UI Designer — export engine (pure functions, no dependencies, no DOM).
 *
 * The editor renderer, the exporter and the prompt builder all go through
 * `js/shared/style.mjs`, so exported markup uses the exact same box/font/
 * content calculations as the canvas. Theme tokens are emitted as `:root`
 * CSS variables; the HTML export is a standalone, JS-free document.
 *
 * Exports:
 *   exportHTML(spec, frameId)         -> string  (standalone HTML document)
 *   exportReactTailwind(spec, frameId)-> string  (React + Tailwind TSX)
 *   exportTokensCSS(spec)             -> string  (tokens as CSS variables)
 *   exportBundle(spec, frameId)       -> { files: [{ path, code }] }
 */

import {
  DEFAULT_THEME,
  boxStyle,
  fontStyle,
  contentHTML,
  layoutChildren,
  effectiveStyle,
  resolveColor,
  resolveRadius,
} from '../assets/designer/js/shared/style.mjs'

/* ------------------------------------------------------------------ */
/* theme tokens                                                        */
/* ------------------------------------------------------------------ */

const GROUP_PREFIX = {
  colors: 'color',
  radius: 'radius',
  space: 'space',
  fontSize: 'font-size',
  shadow: 'shadow',
}

const kebabCase = value =>
  String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .toLowerCase()

/** `colors.onPrimary` -> `--ud-color-on-primary` */
export function tokenVarName(group, name) {
  return `--ud-${GROUP_PREFIX[group] || kebabCase(group)}-${kebabCase(name)}`
}

const varRef = (group, name) => `var(${tokenVarName(group, name)})`
const themeOf = spec => (spec && spec.theme) || DEFAULT_THEME

/** Resolve a concrete colour value back to its token variable (if it is one). */
function colorVar(value, theme) {
  if (!value || typeof value !== 'string') return null
  const wanted = value.trim().toLowerCase()
  for (const [name, color] of Object.entries(theme.colors || {})) {
    if (String(color).trim().toLowerCase() === wanted) return varRef('colors', name)
  }
  return null
}

function radiusVar(value, theme) {
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n) || n === 0) return null
  for (const [name, radius] of Object.entries(theme.radius || {})) {
    if (Number(radius) === n) return varRef('radius', name)
  }
  return null
}

function fontSizeVar(value, theme) {
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n)) return null
  for (const [name, size] of Object.entries(theme.fontSize || {})) {
    if (Number(size) === n) return varRef('fontSize', name)
  }
  return null
}

function shadowVar(value, theme) {
  if (!value || typeof value !== 'string') return null
  for (const [name, shadow] of Object.entries(theme.shadow || {})) {
    if (String(shadow).trim() === value.trim()) return varRef('shadow', name)
  }
  return null
}

/** CSS variable declarations for the whole theme (`:root { ... }` body). */
export function tokensDeclarations(spec) {
  const theme = themeOf(spec)
  const lines = []
  const font = theme.font || DEFAULT_THEME.font
  lines.push(`  /* font */`)
  lines.push(`  --ud-font: ${font};`)
  const groups = [
    ['color', 'colors', 'colors', ''],
    ['radius', 'radius', 'radii', 'px'],
    ['space', 'space', 'spacing scale', 'px'],
    ['font-size', 'fontSize', 'type scale', 'px'],
    ['shadow', 'shadow', 'shadows', ''],
  ]
  for (const [prefix, group, label, unit] of groups) {
    const values = theme[group] || {}
    if (!Object.keys(values).length) continue
    lines.push('', `  /* ${label} */`)
    for (const [name, value] of Object.entries(values)) {
      lines.push(`  --ud-${prefix}-${kebabCase(name)}: ${value}${unit};`)
    }
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* CSS serialisation helpers                                           */
/* ------------------------------------------------------------------ */

const camelToKebab = prop =>
  prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, ch => '-' + ch.toLowerCase())

const paddingCss = value => {
  const [t, r, b, l] = value.map(n => `${Number(n) || 0}px`)
  return t === r && r === b && b === l ? t : `${t} ${r} ${b} ${l}`
}

/** Turn a style-properties object into a CSS declaration string. */
function cssDecls(props) {
  const out = []
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === '') continue
    out.push(`${camelToKebab(key)}:${value}`)
  }
  return out.join(';')
}

function styleAttribute(props) {
  const decls = cssDecls(props)
  return decls ? ` style="${decls.replace(/"/g, '&quot;')}"` : ''
}

/**
 * Replace resolved theme values in a computed CSS object with `var(--ud-*)`
 * references. Shared by the HTML inline styles and the Tailwind classes so
 * both exports stay token-driven (and theme-switchable).
 */
export function tokenizeComputedStyle(css, theme) {
  const out = { ...css }
  if (out.background && out.background !== 'transparent') {
    out.background = colorVar(out.background, theme) || out.background
  }
  if (typeof out.border === 'string' && out.border !== 'none') {
    out.border = out.border.replace(
      /^(.*\s)(\S+)$/,
      (_, head, color) => head + (colorVar(color, theme) || color),
    )
  }
  if (out.borderRadius && out.borderRadius !== '0px') {
    out.borderRadius = radiusVar(out.borderRadius, theme) || out.borderRadius
  }
  if (out.boxShadow && out.boxShadow !== 'none') {
    out.boxShadow = shadowVar(out.boxShadow, theme) || out.boxShadow
  }
  if (out.fontSize) {
    out.fontSize = fontSizeVar(out.fontSize, theme) || out.fontSize
  }
  if (out.color) out.color = colorVar(out.color, theme) || out.color
  return out
}

/**
 * Inline CSS for one node: box + font styles from style.mjs, then replace
 * token-derived resolved values with `var(--ud-*)` references.
 */
export function nodeInlineStyle(node, theme, pos = null) {
  const style = effectiveStyle(node)
  const merged = tokenizeComputedStyle({ ...fontStyle(node, theme), ...boxStyle(node, theme, pos) }, theme)

  // Text nodes receive fontStyle through boxStyle too; normalise the family to
  // the theme variable so exported documents stay themeable.
  merged.fontFamily = style.font && style.font.family
    ? (String(style.font.family).includes(',') ? style.font.family : `"${style.font.family}", system-ui, sans-serif`)
    : 'var(--ud-font), system-ui, sans-serif'

  return merged
}

/* ------------------------------------------------------------------ */
/* frames                                                             */
/* ------------------------------------------------------------------ */

export function listFrames(spec) {
  return Array.isArray(spec && spec.frames) ? spec.frames : []
}

/** Filter by frame id; `null`/`undefined`/`'all'` -> every frame. */
export function resolveFrames(spec, frameId) {
  const frames = listFrames(spec)
  if (!frames.length) throw new Error('设计稿没有画板（frames 为空）')
  if (frameId === undefined || frameId === null || frameId === '' || frameId === 'all') return frames
  const frame = frames.find(f => f.id === frameId)
  if (!frame) throw new Error(`未找到画板：${frameId}`)
  return [frame]
}

export function frameName(spec, frameId) {
  const frames = resolveFrames(spec, frameId)
  return frames.length === 1 ? frames[0].name || frames[0].id : `${spec.name || 'Design'}`
}

/** PascalCase component name derived from the design / frame name. */
export function componentName(spec, frameId) {
  const frames = resolveFrames(spec, frameId)
  const source = frames.length === 1 ? frames[0].name || frames[0].id : spec.name || 'Design'
  const ascii = String(source)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  const fallback = frames.length === 1 ? frames[0].id || 'Frame' : 'Design'
  let name = ascii || fallback
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  if (!name) name = 'Design'
  if (!/^[A-Za-z]/.test(name)) name = 'Design' + name
  return name
}

function frameBackgroundVar(frame, theme) {
  const raw = frame.background === undefined || frame.background === null ? 'bg' : frame.background
  const resolved = resolveColor(raw, theme)
  if (!resolved) return null
  return colorVar(resolved, theme) || resolved
}

/* ------------------------------------------------------------------ */
/* HTML export                                                         */
/* ------------------------------------------------------------------ */

function renderNodeHTML(node, spec, theme, pos) {
  const props = nodeInlineStyle(node, theme, pos)
  const children = (node.children || []).map(id => spec.nodes[id]).filter(Boolean)
  let inner = ''
  if (children.length) {
    const positions = layoutChildren(node, spec)
    inner = children.map(child => renderNodeHTML(child, spec, theme, positions.get(child.id))).join('')
  } else {
    inner = contentHTML(node, theme)
  }
  return (
    `<div class="ud-node ud-node-${node.type}" data-node-id="${escapeAttr(node.id)}" ` +
    `data-node-type="${escapeAttr(node.type)}"${styleAttribute(props)}>${inner}</div>`
  )
}

const escapeAttr = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function renderFrameHTML(frame, spec, theme) {
  const root = spec.nodes[spec.rootIds[frame.id]]
  const background = frameBackgroundVar(frame, theme) || 'transparent'
  const rootHTML = root ? renderNodeHTML(root, spec, theme, null) : ''
  return (
    `<div class="ud-artboard" data-frame-id="${escapeAttr(frame.id)}" data-frame-name="${escapeAttr(frame.name || frame.id)}"` +
    ` style="position:relative;width:${Number(frame.width) || 0}px;height:${Number(frame.height) || 0}px;` +
    `background:${background};overflow:hidden;box-sizing:border-box;flex:0 0 auto">${rootHTML}</div>`
  )
}

function htmlDocument(spec, frames, bodyClass, bodyStyle) {
  const theme = themeOf(spec)
  const title = `${spec.name || 'Design'} · UI Designer`
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="ui-designer" />
<title>${escapeAttr(title)}</title>
<style>
/* Generated by UI Designer — theme tokens */
:root {
${tokensDeclarations(spec)}
}

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--ud-font), system-ui, sans-serif;
  background: ${resolveColor(theme.colors && theme.colors.bg, theme) || '#0b0f17'};
  color: ${resolveColor(theme.colors && theme.colors.text, theme) || '#e5e7eb'};
  -webkit-font-smoothing: antialiased;
}
.ud-artboard { font-family: var(--ud-font), system-ui, sans-serif; }
${bodyClass || ''}${bodyStyle || ''}
</style>
</head>
<body>
${frames.map(frame => renderFrameHTML(frame, spec, theme)).join('\n')}
</body>
</html>
`
}

/**
 * Standalone single-file HTML (no JS). Token-derived values reference
 * `--ud-*` variables declared in `:root`.
 */
export function exportHTML(spec, frameId) {
  const frames = resolveFrames(spec, frameId)
  if (frames.length === 1) {
    return htmlDocument(spec, frames, '', '')
  }
  return htmlDocument(
    spec,
    frames,
    `.ud-page { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 48px; padding: 48px; }
.ud-page > .ud-artboard { box-shadow: 0 24px 64px rgba(0, 0, 0, .4); }
`,
    '',
  )
    .replace('<body>', '<body>\n<div class="ud-page">')
    .replace('</body>', '</div>\n</body>')
}

/* ------------------------------------------------------------------ */
/* tokens CSS                                                          */
/* ------------------------------------------------------------------ */

/**
 * Theme tokens as `:root` CSS variables, with light/dark usage notes.
 */
export function exportTokensCSS(spec) {
  const theme = themeOf(spec)
  const designName = spec.name || 'Design'
  return `/* ==========================================================================
   ${designName} — design tokens
   Generated by UI Designer. Drop this file into your project and reference
   the variables from any stylesheet or Tailwind arbitrary value, e.g.
   background: var(--ud-color-surface); border-radius: var(--ud-radius-lg);
   ========================================================================== */

:root {
${tokensDeclarations(spec)}
}

/* --------------------------------------------------------------------------
   Light / dark themes
   Every token is a CSS variable, so switching themes means overriding the
   variables only. This design is authored for a ${isDarkTheme(theme) ? 'dark' : 'light'} theme;
   a light (or dark) counterpart can be layered in with a data attribute:

     :root[data-theme="light"] {
       --ud-color-bg: #f8fafc;
       --ud-color-surface: #ffffff;
       --ud-color-surface2: #f1f5f9;
       --ud-color-text: #0f172a;
       --ud-color-muted: #64748b;
       --ud-color-border: #e2e8f0;
       --ud-color-on-primary: #ffffff;
     }

   Or follow the operating system:

     @media (prefers-color-scheme: light) { :root { ... } }

   Shadows usually need to be softer on light backgrounds, e.g.
   --ud-shadow-sm: 0 1px 2px rgba(15, 23, 42, .08);
   -------------------------------------------------------------------------- */
`
}

function isDarkTheme(theme) {
  const bg = resolveColor('bg', theme) || ''
  const match = /^#([0-9a-f]{6})$/i.exec(bg)
  if (!match) return true
  const n = Number.parseInt(match[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

/* ------------------------------------------------------------------ */
/* React + Tailwind export                                             */
/* ------------------------------------------------------------------ */

const TW_ALIGN = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' }
const TW_JUSTIFY = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between' }

const twValue = value => String(value).replace(/\s+/g, '_').replace(/"/g, "'")

/** Translate a node's computed CSS properties into Tailwind arbitrary classes. */
export function tailwindClasses(node, theme, pos) {
  const style = effectiveStyle(node)
  const css = tokenizeComputedStyle({ ...fontStyle(node, theme), ...boxStyle(node, theme, pos) }, theme)
  const classes = []
  const x = pos ? pos.x : node.x || 0
  const y = pos ? pos.y : node.y || 0
  const w = pos ? pos.w : node.w || 0
  const h = pos ? pos.h : node.h || 0
  classes.push('absolute', `left-[${x}px]`, `top-[${y}px]`, `w-[${w}px]`, `h-[${h}px]`)

  if (css.padding) classes.push(`p-[${twValue(css.padding)}]`)
  if (css.background && css.background !== 'transparent') {
    classes.push(`bg-[${twValue(css.background)}]`)
  }
  if (typeof css.border === 'string' && css.border !== 'none') {
    const match = /^(\d+(?:\.\d+)?)px\s+solid\s+(.+)$/.exec(css.border)
    if (match) {
      classes.push(`border-[${match[1]}px]`, `border-[${twValue(match[2])}]`)
    }
  }
  if (css.borderRadius && css.borderRadius !== '0px') {
    classes.push(`rounded-[${twValue(css.borderRadius)}]`)
  }
  if (css.boxShadow && css.boxShadow !== 'none') {
    classes.push(`shadow-[${twValue(css.boxShadow)}]`)
  }
  if (css.opacity !== undefined && Number(css.opacity) !== 1) {
    classes.push(`opacity-[${css.opacity}]`)
  }
  if (css.display === 'flex') classes.push('flex')
  if (css.display === 'none') classes.push('hidden')
  if (css.flexDirection === 'column') classes.push('flex-col')
  if (css.alignItems && TW_ALIGN[css.alignItems]) classes.push(TW_ALIGN[css.alignItems])
  if (css.justifyContent && TW_JUSTIFY[css.justifyContent]) classes.push(TW_JUSTIFY[css.justifyContent])
  if (css.gap) classes.push(`gap-[${twValue(typeof css.gap === 'number' ? css.gap + 'px' : css.gap)}]`)
  if (css.whiteSpace === 'pre-wrap') classes.push('whitespace-pre-wrap')
  if (css.wordBreak === 'break-word') classes.push('break-words')
  if (css.overflow === 'hidden') classes.push('overflow-hidden')

  // Typography. Font family is inherited from the component root; only set it
  // when a node opts into a custom family.
  if (style.font && style.font.family) classes.push(`[font-family:${twValue(style.font.family)}]`)
  if (css.fontSize) classes.push(`text-[${twValue(css.fontSize)}]`)
  if (css.fontWeight) {
    const weight = String(css.fontWeight)
    const weightClass = { '400': 'font-normal', '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold', '800': 'font-extrabold' }[weight]
    classes.push(weightClass || `font-[${weight}]`)
  }
  if (css.color) classes.push(`text-[${twValue(css.color)}]`)
  if (css.textAlign === 'center') classes.push('text-center')
  else if (css.textAlign === 'right') classes.push('text-right')
  else if (css.textAlign === 'left') classes.push('text-left')
  if (css.lineHeight) classes.push(`leading-[${twValue(css.lineHeight)}]`)
  if (css.letterSpacing) classes.push(`tracking-[${twValue(css.letterSpacing)}]`)
  if (css.textTransform === 'uppercase') classes.push('uppercase')

  return classes
}

const jsxComment = text => `{/* ${String(text).replace(/\*\//g, '*\\/')} */}`

function renderNodeTSX(node, spec, theme, pos, indent) {
  const pad = ' '.repeat(indent)
  const classes = tailwindClasses(node, theme, pos).join(' ')
  const children = (node.children || []).map(id => spec.nodes[id]).filter(Boolean)
  const label = `n:${node.id} · ${node.name || node.type}`
  const open = `${pad}${jsxComment(label)}\n${pad}<div className="${classes}">`

  if (children.length) {
    const positions = layoutChildren(node, spec)
    const inner = children
      .map(child => renderNodeTSX(child, spec, theme, positions.get(child.id), indent + 2))
      .join('\n')
    return `${open}\n${inner}\n${pad}</div>`
  }

  if (node.type === 'text') {
    return `${open}{${JSON.stringify((node.props && node.props.text) || '')}}</div>`
  }

  const html = contentHTML(node, theme)
  if (html) {
    return `${open}<span dangerouslySetInnerHTML={{ __html: ${JSON.stringify(html)} }} /></div>`
  }
  return `${open}</div>`
}

function renderComponentTSX(frame, spec, theme, exportKind, componentName) {
  const root = spec.nodes[spec.rootIds[frame.id]]
  const positions = root ? layoutChildren(root, spec) : new Map()
  const children = root
    ? (root.children || []).map(id => spec.nodes[id]).filter(Boolean)
    : []
  const body = children
    .map(child => renderNodeTSX(child, spec, theme, positions.get(child.id), 6))
    .join('\n')
  const bg = frameBackgroundVar(frame, theme) || 'transparent'
  const width = Number(frame.width) || 0
  const height = Number(frame.height) || 0
  const name = frame.name || frame.id
  const slots = body ? `\n      ${jsxComment(`frame ${frame.id} · ${name}`)}\n${body}\n    ` : ''
  return `/**
 * ${name} (${width}×${height}) — exported from UI Designer.
 * Static layout: absolutely positioned Tailwind arbitrary values + CSS
 * variables from tokens.css. No interactivity is generated.
 */
export ${exportKind === 'default' ? 'default ' : ''}function ${componentName}() {
  return (
    <div
      className="relative w-[${width}px] h-[${height}px] overflow-hidden [font-family:var(--ud-font)]"
      style={{ background: '${bg}' }}
    >${slots}
    </div>
  )
}`
}

/**
 * React + TypeScript component using Tailwind arbitrary values and CSS
 * variables for theme colours. Nested structure mirrors the design tree.
 */
export function exportReactTailwind(spec, frameId) {
  const theme = themeOf(spec)
  const frames = resolveFrames(spec, frameId)
  const baseName = componentName(spec, frameId)
  const components = frames.map((frame, index) => {
    const name = frames.length === 1
      ? baseName
      : baseName + (frame.id.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('') || index)
    return renderComponentTSX(frame, spec, theme, frames.length === 1 ? 'default' : index === 0 ? 'default' : 'named', name)
  })
  return `/**
 * Generated by UI Designer — React + Tailwind export.
 *
 * Requirements:
 *   - Tailwind CSS v3+ (arbitrary values, e.g. \`left-[16px]\`, \`bg-[var(--ud-color-surface)]\`)
 *   - tokens.css from the same export, imported once by the app:
 *       import './tokens.css'
 *   - React 17+ (automatic JSX runtime). No tailwind.config change is needed:
 *     all design tokens are plain CSS variables, arbitrary values carry the rest.
 *   - Typography uses the theme font through \`--ud-font\`.
 *
 * This file is a static, responsive-agnostic reproduction of the design: every
 * node is absolutely positioned exactly like the canvas. Use it as a starting
 * point and refactor into layout components as needed.
 */
import './tokens.css'

${components.join('\n\n')}
`
}

/* ------------------------------------------------------------------ */
/* bundle                                                              */
/* ------------------------------------------------------------------ */

/**
 * All exports at once: standalone HTML, React+Tailwind TSX, tokens CSS.
 * `format` lets the server filter by format ('html' | 'react' | 'tokens').
 * @returns {{files: {path: string, format: 'html'|'react'|'tokens', code: string}[]}}
 */
export function exportBundle(spec, frameId) {
  const component = componentName(spec, frameId)
  return {
    files: [
      { path: 'index.html', format: 'html', code: exportHTML(spec, frameId) },
      { path: `${component}.tsx`, format: 'react', code: exportReactTailwind(spec, frameId) },
      { path: 'tokens.css', format: 'tokens', code: exportTokensCSS(spec) },
    ],
  }
}
