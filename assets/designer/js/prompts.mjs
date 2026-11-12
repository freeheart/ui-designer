/**
 * UI Designer — prompt construction and AI response parsing.
 *
 * Shared by the local server (which builds the real prompt from compactSpec /
 * summarizeSpec) and by the browser chat panel (mode labels, quick prompts),
 * so keep this module pure: no DOM, no Node APIs, no imports.
 *
 * Exports (contract):
 *   MODE_PROMPTS, buildMessages({ mode, spec, selection, message, history, compactSpec, theme })
 *   parseAIResponse(text) -> { reply, ops, findings, question }
 */

/* ------------------------------------------------------------------ */
/* mode copy                                                           */
/* ------------------------------------------------------------------ */

export const MODE_PROMPTS = {
  apply: {
    key: 'apply',
    label: '改稿',
    title: '对话改稿',
    placeholder: '描述你想怎么改，例如：把标题改大、按钮换成主色',
    emptyTitle: '和 AI 一起打磨界面',
    emptyHint: '选中一个节点，或直接描述你想改的地方，AI 会直接改到画布上。',
    instruction: `## 当前模式：改稿（apply）
根据用户最新消息直接修改设计。必须返回至少一条真正改变设计的 op；如果用户只是在提问、不需要改动，ops 返回 [] 并在 reply 中回答。
改动要克制、可撤销，贴合现有设计系统，不要重构整页。`,
  },
  critique: {
    key: 'critique',
    label: '品评',
    title: '设计品评',
    placeholder: '可以补充评审重点，例如：只看首屏层级和对比度',
    emptyTitle: '让 AI 评审当前页面',
    emptyHint: 'AI 会从层级、布局、对比度、一致性等角度给出建议，不会直接改稿。',
    instruction: `## 当前模式：品评（critique）
只评审当前页面，绝对不修改设计：ops 必须为 []。
从信息层级、布局与对齐、间距节奏、对比度与可读性、视觉一致性（圆角/字号/颜色）、文案、可用性角度给出 3–6 条 findings。
每条 finding 的 targets 必须填写当前设计中真实存在的 node id（取自 compact spec）；无法确定时用 []。
suggestedOps 给出可直接“一键应用”的修复 ops；如果建议不适合自动执行，可以为 []。
severity 用 high/medium/low 衡量影响面与严重度：high = 明显影响可用性/可读性，medium = 一致性/节奏问题，low = 锦上添花。`,
  },
  polish: {
    key: 'polish',
    label: '一键优化',
    title: '一键优化',
    placeholder: '可直接发送做整体优化，或补充你的偏好',
    emptyTitle: '一键优化当前页面',
    emptyHint: '统一间距与圆角、修正对比度、强化首屏层级，一次完成。',
    instruction: `## 当前模式：一键优化（polish）
在用户没有其它明确要求时，对当前页面做一轮克制、系统的优化：统一间距与圆角、修正对比度、强化首屏层级、补齐必要的空状态/辅助文案。
必须返回 ops；不要改变整体风格和品牌色，不要新增无关页面，不要删除内容。`,
  },
}

/** Quick prompts shown in the empty state. `mode` decides which mode is used. */
export const QUICK_PROMPTS = [
  { label: '品评当前页', prompt: '品评当前页', mode: 'critique' },
  { label: '提升对比度', prompt: '提升页面文字与背景的对比度，正文至少达到 4.5:1', mode: 'apply' },
  { label: '统一间距与圆角', prompt: '统一页面的间距与圆角，间距使用 8pt 网格，圆角统一使用 radius token', mode: 'apply' },
  { label: '增加空状态', prompt: '为主要数据区域增加空状态设计，包含图标、说明和行动按钮', mode: 'apply' },
  { label: '优化首屏层级', prompt: '优化首屏的信息层级，突出主标题和主操作，弱化次要信息', mode: 'apply' },
]

/* ------------------------------------------------------------------ */
/* system prompt                                                       */
/* ------------------------------------------------------------------ */

const BASE_SYSTEM = `你是资深产品设计师兼视觉设计师，正在一个浏览器内的可视化 UI 设计器中与用户协作，帮助用户把界面改得更好。

## 工作规则
1. 你只能通过 ops 修改设计；禁止输出 HTML、CSS、JS 或 DOM。
2. 保持所有既有节点 id 不变；不要重命名、删除与用户请求无关的节点。新节点可省略 id（系统自动生成）。
3. 最小改动：只处理用户提到的部分，不要顺手重构整页；不确定时采用保守的小改动。
4. 遵守设计系统：间距使用 8pt 网格（4/8/16/24/32/48）；字号使用阶梯（12/13/15/18/24/32）；正文与背景对比度 ≥ 4.5:1；同一区块圆角统一；颜色/圆角/间距优先使用 theme token 名称，而不是硬编码值。
5. 视觉层级：一个页面只保留一个最强主视觉；主要操作使用主色按钮；次要信息使用 muted 色；不要同时堆叠过多强调色。
6. 回复使用用户的语言（用户用中文则用中文），语气专业、简洁、具体，不夸张、不堆砌形容词。
7. 输出严格 JSON：一个 JSON 对象，不要 markdown 围栏、不要注释、不要在 JSON 之外写任何解释。

## 输出格式（JSON）
{
  "reply": "给用户看的一句话说明（中文，尽量 ≤ 60 字）",
  "ops": [ ... ],
  "findings": [ ... ],
  "question": null
}
- reply：必填，说明你做了什么，或品评的核心结论。
- ops：改稿/一键优化时必填（至少 1 条，若确实无需改动可为 []）；品评模式必须为 []。
- findings：仅品评模式使用，3–6 条，字段 { id, severity: "high"|"medium"|"low", title, detail, targets: ["nodeId"], suggestedOps: [ ... ] }；其它模式为 []。
- question：需要用户澄清时填一句话，否则 null。

## ops 可用操作（designer-core 协议）
- 修改节点属性：{"op":"set","id":"n1","path":"style.fill","value":"primary"}
  path 仅限 name | x | y | w | h | opacity | hidden | locked | style.* | layout.mode | layout.gap | layout.padding | layout.align | layout.justify | props.*
- 新增节点：{"op":"add","parent":"<nodeId 或 frameId>","index":0,"node":{"type":"text","name":"标题","x":16,"y":24,"w":320,"h":28,"props":{"text":"本周概览"},"style":{"font":{"size":"xl","weight":700}}}}
  node 支持 children 嵌套（用于整块组件）；type 取值：box/text/button/input/image/icon/divider/badge/avatar/toggle/checkbox/select/tabs/table/chart/card
- 删除节点：{"op":"remove","id":"n1"}
- 移动节点：{"op":"move","id":"n1","parent":"<nodeId>","index":1}
- 同级排序：{"op":"reorder","id":"n1","index":0}
- 复制节点：{"op":"duplicate","id":"n1","newId":"n1-copy"}
- 修改主题：{"op":"set-theme","path":"colors.primary","value":"#8b5cf6"}（路径：colors.* | radius.* | space.* | fontSize.* | shadow.* | font）
- 画板：{"op":"add-frame","frame":{"id":"f-2","name":"详情","x":440,"y":0,"width":390,"height":844,"background":"bg"}} / {"op":"set-frame","id":"f-home","path":"name","value":"首页 v2"} / {"op":"remove-frame","id":"f-2"}
所有数字必须有限；显式 id 必须是 kebab-case 且唯一。`

export function buildSystemPrompt(mode = 'apply') {
  const modeInfo = MODE_PROMPTS[mode] || MODE_PROMPTS.apply
  return `${BASE_SYSTEM}\n\n${modeInfo.instruction}`
}

/* ------------------------------------------------------------------ */
/* context rendering                                                   */
/* ------------------------------------------------------------------ */

function truncate(text, max) {
  const value = String(text ?? '')
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n…（内容过大已截断；请优先修改已有节点，避免重建整页）`
}

function themeSummary(theme) {
  if (!theme || typeof theme !== 'object') return ''
  const parts = []
  if (theme.font) parts.push(`font=${theme.font}`)
  const groups = { colors: 'colors', radius: 'radius', space: 'space', fontSize: 'fontSize' }
  for (const [key, label] of Object.entries(groups)) {
    const group = theme[key]
    if (!group || typeof group !== 'object') continue
    parts.push(`${label}: ${Object.entries(group).map(([name, value]) => `${name}=${value}`).join(', ')}`)
  }
  return parts.join(' | ')
}

/**
 * Local fallback compact spec (the server normally passes designer-core's
 * compactSpec). Kept intentionally close to designer-core's format so a browser
 * that calls buildMessages directly still produces a sane prompt.
 */
export function compactSpecLocal(spec, { maxChars = 12000 } = {}) {
  if (!spec || !Array.isArray(spec.frames)) return '(空设计稿)'
  const nodes = spec.nodes || {}
  const lines = [`设计稿: ${spec.name || '未命名设计'} · ${spec.frames.length} frame(s)`]
  const tokens = themeSummary(spec.theme)
  if (tokens) lines.push(`tokens: ${tokens}`)

  const renderNode = (id, depth) => {
    const node = nodes[id]
    if (!node || node.hidden) return
    const indent = '  '.repeat(depth + 1)
    const geometry = node.parent === null ? `${node.w}x${node.h}` : `@${Math.round(node.x || 0)},${Math.round(node.y || 0)} ${node.w}x${node.h}`
    const bits = [`${indent}${node.id} ${node.type} "${node.name || node.id}" ${geometry}`]
    const style = node.style || {}
    const styleBits = []
    if (style.fill !== undefined) styleBits.push(`fill=${style.fill}`)
    if (style.radius !== undefined) styleBits.push(`r=${style.radius}`)
    if (style.stroke) styleBits.push(`stroke=${style.stroke.color}/${style.stroke.width ?? 1}`)
    if (style.padding !== undefined && style.padding !== null) styleBits.push(`pad=${Array.isArray(style.padding) ? style.padding.join(',') : style.padding}`)
    const font = style.font || {}
    if (font.size !== undefined) styleBits.push(`size=${font.size}`)
    if (font.weight !== undefined) styleBits.push(`w=${font.weight}`)
    if (font.color !== undefined) styleBits.push(`color=${font.color}`)
    if (font.align !== undefined) styleBits.push(`align=${font.align}`)
    if (styleBits.length) bits.push(styleBits.join(' '))
    const layout = node.layout || {}
    if (layout.mode && layout.mode !== 'absolute') bits.push(`layout=${layout.mode}${layout.gap ? ` gap=${layout.gap}` : ''}`)
    const props = node.props || {}
    const propsText = props.text ?? props.label ?? props.title ?? props.placeholder
    if (typeof propsText === 'string' && propsText) bits.push(`"${String(propsText).slice(0, 60)}"`)
    lines.push(bits.join(' '))
    for (const childId of node.children || []) renderNode(childId, depth + 1)
  }

  for (const frame of spec.frames) {
    lines.push(`frame ${frame.id} "${frame.name}" @${frame.x},${frame.y} ${frame.width}x${frame.height} bg=${frame.background ?? 'transparent'}`)
    const rootId = spec.rootIds && spec.rootIds[frame.id]
    if (rootId) renderNode(rootId, 0)
  }
  return truncate(lines.join('\n'), maxChars)
}

function describeSelection(spec, selection) {
  const ids = Array.isArray(selection) ? selection.filter(id => typeof id === 'string' && id) : []
  if (!ids.length) return ''
  const nodes = (spec && spec.nodes) || {}
  const lines = ['## 当前选中节点']
  for (const id of ids.slice(0, 6)) {
    const node = nodes[id]
    if (!node) {
      lines.push(`- ${id}（当前设计中没有该节点）`)
      continue
    }
    const bits = [`- ${node.id}（${node.type}）"${node.name}" @${Math.round(node.x || 0)},${Math.round(node.y || 0)} ${node.w}x${node.h}`]
    if (node.parent) bits.push(`父节点=${node.parent}`)
    const style = node.style || {}
    const styleBits = []
    if (style.fill !== undefined) styleBits.push(`fill=${style.fill}`)
    if (style.radius !== undefined) styleBits.push(`radius=${style.radius}`)
    if (style.font && style.font.size !== undefined) styleBits.push(`字号=${style.font.size}`)
    if (style.font && style.font.weight !== undefined) styleBits.push(`字重=${style.font.weight}`)
    if (style.font && style.font.color !== undefined) styleBits.push(`文字色=${style.font.color}`)
    if (styleBits.length) bits.push(styleBits.join(' '))
    const props = node.props || {}
    const content = props.text ?? props.label ?? props.value ?? props.title
    if (typeof content === 'string' && content) bits.push(`内容="${content.slice(0, 60)}"`)
    lines.push(bits.join('；'))
  }
  return lines.join('\n')
}

function summarizeWarnings(summary) {
  if (!summary || typeof summary !== 'object') return ''
  const warnings = Array.isArray(summary.warnings) ? summary.warnings.slice(0, 12) : []
  if (!warnings.length) return ''
  const lines = ['## 自动检测告警（供品评参考，不必全部覆盖）']
  for (const warning of warnings) {
    const target = warning.targetId ? `（target=${warning.targetId}）` : ''
    lines.push(`- [${warning.type || 'warning'}] ${warning.message || ''}${target}`)
  }
  return lines.join('\n')
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return []
  const turns = []
  for (const turn of history.slice(-8)) {
    if (!turn || (turn.role !== 'user' && turn.role !== 'assistant')) continue
    const content = typeof turn.content === 'string' ? turn.content.trim() : ''
    if (!content) continue
    turns.push({ role: turn.role, content: content.slice(0, 4000) })
  }
  return turns
}

function buildContextMessage({ mode, spec, selection, message, compactSpec, theme, summary, tokens }) {
  const sections = []
  const compact = (compactSpec && String(compactSpec).trim()) || (spec ? compactSpecLocal(spec) : '')
  if (compact) {
    sections.push(`## 当前设计（compact spec，缩进表示层级；tokens 在首行）\n${truncate(compact, 12000)}`)
  } else {
    sections.push('## 当前设计\n（暂无设计数据；如果用户要求改稿，请在 reply 中说明需要先创建页面）')
  }
  if (!compactSpec && !spec && tokens) sections.push(`## 设计令牌\n${tokens}`)
  else if (!compactSpec && !spec && theme) sections.push(`## 设计令牌\n${themeSummary(theme)}`)

  const selectionText = describeSelection(spec, selection)
  sections.push(selectionText || '## 当前选中节点\n（未选中节点；按用户描述作用于整页或最相关节点）')

  const warnings = summarizeWarnings(summary)
  if (warnings) sections.push(warnings)

  const request = typeof message === 'string' ? message.trim() : ''
  const fallback = mode === 'critique' ? '品评当前页面的设计质量，给出可执行的改进建议。' : mode === 'polish' ? '对当前页面做一轮克制、系统的整体优化。' : '（无额外说明）'
  sections.push(`## 用户请求\n${request || fallback}`)
  return sections.join('\n\n')
}

/**
 * Build the OpenAI `messages` array for a chat request.
 *
 * @param {object} input
 * @param {'apply'|'critique'|'polish'} [input.mode='apply']
 * @param {object|null} [input.spec]        full design spec (fallback context)
 * @param {string[]} [input.selection]      selected node ids
 * @param {string} [input.message]          user message
 * @param {Array<{role:string,content:string}>} [input.history]
 * @param {string} [input.compactSpec]      designer-core compactSpec (preferred context)
 * @param {object} [input.theme]
 * @param {object} [input.summary]          designer-core summarizeSpec (optional, for critique)
 * @param {string} [input.tokens]           designer-core tokensForPrompt (optional)
 * @returns {Array<{role:string,content:string}>}
 */
export function buildMessages({
  mode = 'apply',
  spec = null,
  selection = [],
  message = '',
  history = [],
  compactSpec = '',
  theme = null,
  summary = null,
  tokens = '',
} = {}) {
  const key = MODE_PROMPTS[mode] ? mode : 'apply'
  const messages = [{ role: 'system', content: buildSystemPrompt(key) }]
  for (const turn of sanitizeHistory(history)) messages.push(turn)
  messages.push({
    role: 'user',
    content: buildContextMessage({ mode: key, spec, selection, message, compactSpec, theme, summary, tokens }),
  })
  return messages
}

/* ------------------------------------------------------------------ */
/* response parsing + JSON repair                                      */
/* ------------------------------------------------------------------ */

function snippet(text, max = 180) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function stripCodeFences(text) {
  const value = text.trim()
  const fenced = value.match(/```(?:json|JSON|javascript|js)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  return value.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim()
}

/** Find the first balanced JSON object/array in a text blob (string-aware). */
export function extractJSONValue(text) {
  const source = String(text || '')
  const start = source.search(/[[{]/)
  if (start === -1) return ''
  const stack = []
  let inString = false
  let quote = ''
  let escaped = false
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === quote) inString = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      continue
    }
    if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']')
      continue
    }
    if (ch === '}' || ch === ']') {
      if (!stack.length) return source.slice(start, i + 1)
      const expected = stack.pop()
      if (ch !== expected) return source.slice(start, i + 1)
      if (!stack.length) return source.slice(start, i + 1)
    }
  }
  return source.slice(start)
}

function stripJsonComments(text) {
  let out = ''
  let i = 0
  let quote = ''
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]
    if (quote) {
      out += ch
      if (ch === '\\') {
        out += next ?? ''
        i += 2
        continue
      }
      if (ch === quote) quote = ''
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += ch
    i += 1
  }
  return out
}

function removeTrailingCommas(text) {
  let previous = ''
  let next = text
  while (next !== previous) {
    previous = next
    next = next.replace(/,(\s*[}\]])/g, '$1')
  }
  return next
}

function normalizeSmartQuotes(text) {
  return text.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'")
}

function convertSingleQuotes(text) {
  let out = ''
  let i = 0
  let inDouble = false
  while (i < text.length) {
    const ch = text[i]
    if (inDouble) {
      out += ch
      if (ch === '\\') {
        out += text[i + 1] ?? ''
        i += 2
        continue
      }
      if (ch === '"') inDouble = false
      i += 1
      continue
    }
    if (ch === '"') {
      inDouble = true
      out += ch
      i += 1
      continue
    }
    if (ch === "'") {
      let content = ''
      let j = i + 1
      let closed = false
      while (j < text.length) {
        const c = text[j]
        if (c === '\\') {
          const escaped = text[j + 1] ?? ''
          if (escaped === "'") content += "'"
          else if (escaped === 'n') content += '\n'
          else if (escaped === 't') content += '\t'
          else if (escaped === 'r') content += '\r'
          else content += escaped
          j += 2
          continue
        }
        if (c === "'") {
          closed = true
          j += 1
          break
        }
        content += c
        j += 1
      }
      if (!closed) {
        out += ch
        i += 1
        continue
      }
      out += JSON.stringify(content)
      i = j
      continue
    }
    out += ch
    i += 1
  }
  return out
}

function quoteUnquotedKeys(text) {
  return text.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3')
}

function repairCandidates(text) {
  const variants = []
  const add = value => {
    if (typeof value === 'string' && value && !variants.includes(value)) variants.push(value)
  }
  const base = removeTrailingCommas(stripJsonComments(text))
  add(base)
  add(convertSingleQuotes(base))
  add(quoteUnquotedKeys(convertSingleQuotes(base)))
  const smart = removeTrailingCommas(stripJsonComments(normalizeSmartQuotes(text)))
  add(smart)
  add(quoteUnquotedKeys(convertSingleQuotes(smart)))
  return variants
}

const SEVERITY_MAP = {
  high: 'high', critical: 'high', major: 'high', blocker: 'high', severe: 'high',
  高: 'high', 严重: 'high', 高优先级: 'high', 紧急: 'high',
  medium: 'medium', warning: 'medium', normal: 'medium', moderate: 'medium',
  中: 'medium', 中优先级: 'medium', 一般: 'medium',
  low: 'low', minor: 'low', info: 'low', suggestion: 'low',
  低: 'low', 低优先级: 'low', 轻微: 'low', 建议: 'low',
}

function normalizeSeverity(value) {
  if (typeof value !== 'string') return 'medium'
  const key = value.trim().toLowerCase()
  if (SEVERITY_MAP[key]) return SEVERITY_MAP[key]
  if (/high|严重|高/.test(key)) return 'high'
  if (/low|轻微|低|建议/.test(key)) return 'low'
  return 'medium'
}

function isOp(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && typeof value.op === 'string' && value.op
}

function normalizeOps(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(isOp)
  if (isOp(value)) return [value]
  return []
}

function normalizeFinding(raw, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const title = raw.title ?? raw.name ?? raw.summary ?? ''
  const detail = raw.detail ?? raw.description ?? raw.body ?? raw.message ?? ''
  if (!String(title).trim() && !String(detail).trim()) return null
  const targetsRaw = raw.targets ?? raw.target ?? raw.nodeIds ?? raw.ids ?? []
  const targets = (Array.isArray(targetsRaw) ? targetsRaw : [targetsRaw])
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim())
  const suggestedOps = normalizeOps(raw.suggestedOps ?? raw.ops ?? raw.fixOps ?? raw.suggestions)
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `finding-${index + 1}`,
    severity: normalizeSeverity(raw.severity ?? raw.level ?? raw.priority),
    title: String(title || `问题 ${index + 1}`).trim(),
    detail: String(detail || '').trim(),
    targets,
    suggestedOps,
  }
}

function normalizeResponse(data) {
  if (Array.isArray(data)) {
    const ops = normalizeOps(data)
    if (ops.length === data.length && data.length > 0) {
      return { reply: '已更新设计。', ops, findings: [], question: null }
    }
    return {
      reply: '品评完成，请查看下方建议。',
      ops: [],
      findings: data.map((item, index) => normalizeFinding(item, index)).filter(Boolean),
      question: null,
    }
  }
  if (!data || typeof data !== 'object') throw new Error('AI 返回的 JSON 不是对象')

  const findings = Array.isArray(data.findings)
    ? data.findings.map((item, index) => normalizeFinding(item, index)).filter(Boolean)
    : []
  const ops = normalizeOps(data.ops ?? data.operations ?? data.actions)
  const replyCandidates = [data.reply, data.message, data.summary, data.explanation, data.comment]
  let reply = ''
  for (const candidate of replyCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      reply = candidate.trim()
      break
    }
  }
  if (!reply) reply = findings.length ? '品评完成，请查看下方建议。' : ops.length ? '已更新设计。' : '已收到。'
  let question = null
  for (const candidate of [data.question, data.followUp, data.clarification]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      question = candidate.trim()
      break
    }
  }
  return { reply, ops, findings, question }
}

/**
 * Parse an AI chat completion into the UI-ready response shape.
 * Tolerates code fences, leading prose, trailing commas, single quotes,
 * smart quotes and unquoted keys. Throws a readable Error when repair fails.
 *
 * @param {string} text raw assistant content
 * @returns {{reply: string, ops: object[], findings: object[], question: string|null}}
 */
export function parseAIResponse(text) {
  if (text === null || text === undefined) throw new Error('AI 返回为空，没有可解析的内容')
  let raw = String(text).replace(/^\uFEFF/, '').trim()
  if (!raw) throw new Error('AI 返回为空，没有可解析的内容')

  raw = stripCodeFences(raw)
  const jsonText = extractJSONValue(raw)
  if (!jsonText) {
    throw new Error(`AI 返回的内容中没有找到 JSON 对象：${snippet(raw)}`)
  }

  const candidates = [jsonText, ...repairCandidates(jsonText)]
  let data
  let parsed = false
  let lastError = null
  for (const candidate of candidates) {
    try {
      data = JSON.parse(candidate)
      parsed = true
      break
    } catch (error) {
      lastError = error
    }
  }
  if (!parsed) {
    const reason = lastError && lastError.message ? lastError.message : '未知解析错误'
    throw new Error(`AI 返回的 JSON 无法解析（${reason}）；片段：${snippet(jsonText)}`)
  }

  try {
    return normalizeResponse(data)
  } catch (error) {
    throw new Error(`AI 返回结构不符合约定：${error.message}；片段：${snippet(jsonText)}`)
  }
}
