/**
 * UI Designer — AI chat panel (right sidebar bottom).
 *
 * Two channels, one UI:
 *   api   — the local server calls an OpenAI-compatible model directly.
 *   agent — the server queues a request into `<designDir>/.ai/inbox`; the
 *           coding agent answers through scripts/agent-bridge.mjs.
 *
 * The panel only talks to `/api/*`; SSE results arrive through `bus` events
 * ('chat', 'queue') forwarded by app.js.
 */

import {
  bus,
  state,
  api,
  getNode,
  setSelection,
  setAiBusy,
  setFindings,
  replaceSpecLocal,
  refreshQueue,
  toast,
} from './store.js'
import { MODE_PROMPTS, QUICK_PROMPTS } from './prompts.mjs'

/* ------------------------------------------------------------------ */
/* tiny helpers                                                        */
/* ------------------------------------------------------------------ */

const ICONS = {
  spark: '<path d="M12 3.5l1.7 4.8L18.5 10l-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7Z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/>',
  send: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/>',
  retry: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/>',
  alert: '<path d="M12 4 3 20h18Z"/><path d="M12 10v4M12 17h.01"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  queue: '<rect x="4" y="5" width="16" height="4" rx="1.4"/><rect x="4" y="11" width="16" height="4" rx="1.4"/><rect x="4" y="17" width="10" height="3" rx="1.4"/>',
  empty: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 4v-4H6a2 2 0 0 1-2-2Z"/><path d="M8 9h8M8 13h5"/>',
}

function icon(name, size = 14) {
  const body = ICONS[name] || ICONS.more || ''
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const SEVERITY_META = {
  high: { label: '高优先', className: 'high' },
  medium: { label: '建议', className: 'medium' },
  low: { label: '细节', className: 'low' },
}

/* ------------------------------------------------------------------ */
/* markdown-lite (no external libs)                                    */
/* ------------------------------------------------------------------ */

function inlineMarkdown(text) {
  return String(text ?? '')
    .split(/(`[^`]*`)/g)
    .map(part => {
      if (part.length >= 2 && part.startsWith('`') && part.endsWith('`')) {
        return `<code class="ud-md__code">${esc(part.slice(1, -1))}</code>`
      }
      let html = esc(part)
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      html = html.replace(/(^|[\s（(])\*([^*\n]+)\*(?=$|[\s）).,，。!?！？])/g, '$1<em>$2</em>')
      return html
    })
    .join('')
}

/** Render paragraphs, bullet/number lists, bold, inline code and fences. */
export function markdownLite(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n')
  if (!source.trim()) return ''
  const lines = source.split('\n')
  const blocks = []
  let paragraph = []
  let list = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    const body = inlineMarkdown(paragraph.join('\n')).replace(/\n/g, '<br>')
    blocks.push(`<p>${body}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    const tag = list.type === 'ol' ? 'ol' : 'ul'
    blocks.push(`<${tag}>${list.items.map(item => `<li>${inlineMarkdown(item)}</li>`).join('')}</${tag}>`)
    list = null
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trimEnd()
    const fence = trimmed.match(/^\s*```([a-zA-Z0-9-]*)\s*$/)
    if (fence) {
      flushAll()
      const codeLines = []
      i += 1
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        codeLines.push(lines[i])
        i += 1
      }
      const lang = fence[1] ? ` data-lang="${esc(fence[1])}"` : ''
      blocks.push(`<pre class="ud-md__pre"${lang}><code>${esc(codeLines.join('\n'))}</code></pre>`)
      continue
    }
    if (!trimmed.trim()) {
      flushAll()
      continue
    }
    const heading = trimmed.match(/^\s*#{1,4}\s+(.*)$/)
    if (heading) {
      flushAll()
      blocks.push(`<div class="ud-md__heading">${inlineMarkdown(heading[1])}</div>`)
      continue
    }
    const bullet = trimmed.match(/^\s*[-*+]\s+(.*)$/)
    if (bullet) {
      flushParagraph()
      if (!list || list.type !== 'ul') {
        flushList()
        list = { type: 'ul', items: [] }
      }
      list.items.push(bullet[1])
      continue
    }
    const numbered = trimmed.match(/^\s*\d+[.)]\s+(.*)$/)
    if (numbered) {
      flushParagraph()
      if (!list || list.type !== 'ol') {
        flushList()
        list = { type: 'ol', items: [] }
      }
      list.items.push(numbered[1])
      continue
    }
    const quote = trimmed.match(/^\s*>\s?(.*)$/)
    if (quote) {
      flushAll()
      blocks.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`)
      continue
    }
    if (list) flushList()
    paragraph.push(trimmed)
  }
  flushAll()
  return blocks.join('')
}

/* ------------------------------------------------------------------ */
/* panel state                                                         */
/* ------------------------------------------------------------------ */

const chat = {
  el: null,
  refs: {},
  mode: 'apply',
  busy: false,
  messages: [],
  seq: 0,
  channel: 'agent',
  lastRequestId: '',
  seenReplies: new Set(),
  configTimer: 0,
}

function currentModeInfo() {
  return MODE_PROMPTS[chat.mode] || MODE_PROMPTS.apply
}

function defaultMessageForMode(mode) {
  if (mode === 'critique') return '品评当前页'
  if (mode === 'polish') return '一键优化当前页'
  return ''
}

function selectedLabel() {
  const ids = state.selection || []
  if (!ids.length) return ''
  if (ids.length > 1) return `${ids.length} 个节点`
  const node = getNode(ids[0])
  return node ? node.name || node.id : ids[0]
}

/* ------------------------------------------------------------------ */
/* markup                                                              */
/* ------------------------------------------------------------------ */

function buildSkeleton(el) {
  el.innerHTML = `
    <div class="ud-chat__inner">
      <header class="ud-chat__head">
        <div class="ud-chat__brand">
          <span class="ud-chat__spark" aria-hidden="true">${icon('spark', 15)}</span>
          <span class="ud-chat__title">AI 设计助手</span>
        </div>
        <div class="ud-chat__tools">
          <button type="button" class="ud-chat__channel" data-testid="chat-channel" title="AI 通道">
            <span class="ud-chat__channel-dot" aria-hidden="true"></span>
            <span class="ud-chat__channel-label">Agent 队列</span>
          </button>
          <button type="button" class="ud-iconbtn ud-chat__gear" data-testid="chat-settings" title="AI 与设计器设置" aria-label="打开设置">
            ${icon('gear', 15)}
          </button>
        </div>
      </header>

      <div class="ud-chat__modes" role="tablist" aria-label="AI 模式">
        <button type="button" class="ud-chat__mode is-active" role="tab" aria-selected="true" data-mode="apply" data-testid="chat-mode-apply">改稿</button>
        <button type="button" class="ud-chat__mode" role="tab" aria-selected="false" data-mode="critique" data-testid="chat-mode-critique">品评</button>
        <button type="button" class="ud-chat__mode" role="tab" aria-selected="false" data-mode="polish" data-testid="chat-mode-polish">一键优化</button>
        <span class="ud-chat__modes-spacer"></span>
        <span class="ud-chat__status" data-testid="chat-status" title=""></span>
      </div>

      <div class="ud-chat__banner" data-testid="chat-banner" hidden></div>

      <div class="ud-chat__messages" data-testid="chat-messages"></div>

      <div class="ud-chat__composer">
        <div class="ud-chat__context" data-testid="chat-context" hidden>
          <span class="ud-chat__context-icon" aria-hidden="true">${icon('target', 12)}</span>
          <span class="ud-chat__context-label"></span>
          <button type="button" class="ud-chat__context-clear" data-action="clear-selection" title="取消选中" aria-label="取消选中">${icon('close', 11)}</button>
        </div>
        <div class="ud-chat__box">
          <textarea
            class="ud-chat__input"
            rows="1"
            spellcheck="false"
            data-testid="chat-input"
            placeholder="${esc(currentModeInfo().placeholder)}"
            aria-label="给 AI 发消息"></textarea>
          <button type="button" class="ud-chat__send" data-testid="chat-send" title="发送 (Enter)" aria-label="发送">
            <span class="ud-chat__send-icon">${icon('send', 15)}</span>
            <span class="ud-chat__send-spinner" aria-hidden="true"></span>
          </button>
        </div>
        <div class="ud-chat__hint">
          <span><kbd class="ud-kbd">Enter</kbd> 发送 · <kbd class="ud-kbd">Shift</kbd>+<kbd class="ud-kbd">Enter</kbd> 换行</span>
          <span class="ud-chat__hint-channel"></span>
        </div>
      </div>
    </div>
  `
}

function messageHtml(message) {
  if (message.role === 'user') {
    return `
      <div class="ud-msg ud-msg--user" data-msg-id="${message.id}">
        <div class="ud-msg__bubble">${markdownLite(message.text)}</div>
      </div>`
  }
  if (message.role === 'assistant') {
    const findings = findingsHtml(message)
    return `
      <div class="ud-msg ud-msg--assistant" data-msg-id="${message.id}">
        <span class="ud-msg__avatar" aria-hidden="true">${icon('spark', 13)}</span>
        <div class="ud-msg__stack">
          <div class="ud-msg__bubble">${markdownLite(message.text)}</div>
          ${findings}
        </div>
      </div>`
  }
  if (message.role === 'queue') {
    const done = message.done
    return `
      <div class="ud-msg ud-msg--queue${done ? ' is-done' : ''}" data-msg-id="${message.id}">
        <span class="ud-msg__queue-icon" aria-hidden="true">${icon(done ? 'check' : 'queue', 13)}</span>
        <div class="ud-msg__stack">
          <div class="ud-msg__bubble">
            ${done ? 'Agent 已回复' : '已加入 Agent 队列'}
            <code>${esc(message.requestId || '')}</code>
            <div class="ud-msg__queue-hint">${done ? '已通过文件队列送达' : '在对话里让 Agent 处理设计器请求'}</div>
          </div>
        </div>
      </div>`
  }
  if (message.role === 'error') {
    const canRetry = message.canRetry !== false
    return `
      <div class="ud-msg ud-msg--error" data-msg-id="${message.id}" data-testid="chat-error">
        <span class="ud-msg__avatar ud-msg__avatar--error" aria-hidden="true">${icon('alert', 13)}</span>
        <div class="ud-msg__stack">
          <div class="ud-msg__bubble">
            <div class="ud-msg__error-title">请求失败</div>
            <p>${esc(message.text)}</p>
            <div class="ud-msg__actions">
              ${canRetry && !message.retried ? `<button type="button" class="ud-btn ud-btn--primary ud-chat__retry" data-action="retry-agent" data-msg-id="${message.id}">${icon('retry', 12)} 改用 Agent 队列重试</button>` : ''}
              <button type="button" class="ud-btn ud-btn--quiet" data-action="open-settings">打开设置</button>
            </div>
          </div>
        </div>
      </div>`
  }
  return ''
}

function findingsHtml(message) {
  if (!Array.isArray(message.findings) || !message.findings.length) return ''
  const cards = message.findings
    .map((finding, index) => {
      const meta = SEVERITY_META[finding.severity] || SEVERITY_META.medium
      const targets = Array.isArray(finding.targets) ? finding.targets : []
      const targetChips = targets
        .map(id => {
          const node = getNode(id)
          const label = node ? node.name || node.id : id
          return `<button type="button" class="ud-chip ud-chip--target" data-action="select-node" data-node-id="${esc(id)}" title="选中节点 ${esc(id)}">${icon('target', 10)} ${esc(label)}</button>`
        })
        .join('')
      const hasOps = Array.isArray(finding.suggestedOps) && finding.suggestedOps.length > 0
      const applying = Boolean(finding.applying)
      const action = hasOps
        ? `<button type="button" class="ud-btn ud-btn--primary ud-finding__apply" data-action="apply-finding" data-msg-id="${message.id}" data-finding-index="${index}" data-testid="finding-apply" ${finding.applied || applying ? 'disabled' : ''}>
             ${finding.applied ? `${icon('check', 12)} 已应用` : applying ? '应用中…' : '应用建议'}
           </button>`
        : ''
      return `
        <article class="ud-finding" data-sev="${meta.className}" data-testid="finding" data-finding-index="${index}">
          <span class="ud-finding__bar" aria-hidden="true"></span>
          <div class="ud-finding__main">
            <div class="ud-finding__head">
              <span class="ud-finding__sev">${meta.label}</span>
              <strong class="ud-finding__title">${esc(finding.title)}</strong>
            </div>
            ${finding.detail ? `<p class="ud-finding__detail">${esc(finding.detail)}</p>` : ''}
            ${targetChips ? `<div class="ud-finding__targets">${targetChips}</div>` : ''}
            ${action ? `<div class="ud-finding__actions">${action}</div>` : ''}
          </div>
        </article>`
    })
    .join('')
  return `<div class="ud-findings" data-testid="findings">${cards}</div>`
}

function emptyStateHtml() {
  const info = currentModeInfo()
  const quick = QUICK_PROMPTS.map(
    (item, index) => `<button type="button" class="ud-chip ud-chat__quick-item" data-action="quick-prompt" data-quick-index="${index}">${esc(item.label)}</button>`,
  ).join('')
  return `
    <div class="ud-chat__empty" data-testid="chat-empty">
      <span class="ud-chat__empty-icon" aria-hidden="true">${icon('empty', 20)}</span>
      <strong>${esc(info.emptyTitle)}</strong>
      <p>${esc(info.emptyHint)}</p>
      <div class="ud-chat__quick">${quick}</div>
    </div>`
}

function loadingHtml() {
  return `
    <div class="ud-msg ud-msg--assistant ud-msg--loading" data-testid="chat-loading">
      <span class="ud-msg__avatar" aria-hidden="true">${icon('spark', 13)}</span>
      <div class="ud-msg__bubble ud-chat__thinking">
        <span class="ud-spinner" aria-hidden="true"></span>
        <span>${chat.mode === 'critique' ? '正在品评…' : chat.mode === 'polish' ? '正在优化…' : '正在改稿…'}</span>
      </div>
    </div>`
}

/* ------------------------------------------------------------------ */
/* rendering                                                           */
/* ------------------------------------------------------------------ */

function isNearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

function scrollToBottom() {
  const el = chat.refs.messages
  if (!el) return
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight
  })
}

function renderMessages({ forceScroll = false } = {}) {
  const box = chat.refs.messages
  if (!box) return
  const stick = forceScroll || isNearBottom(box)
  if (!chat.messages.length) {
    box.innerHTML = emptyStateHtml()
  } else {
    box.innerHTML = chat.messages.map(messageHtml).join('') + (chat.busy ? loadingHtml() : '')
  }
  if (stick) scrollToBottom()
}

function renderQueueBanner(pending) {
  const banner = chat.refs.banner
  if (!banner) return
  const list = Array.isArray(pending) ? pending.filter(Boolean) : []
  state.pendingRequests = list.length
  if (!list.length) {
    banner.hidden = true
    banner.innerHTML = ''
    return
  }
  const latest = list[list.length - 1] || {}
  const requestId = latest.id || chat.lastRequestId || ''
  const count = list.length
  banner.hidden = false
  banner.innerHTML = `
    <span class="ud-chat__banner-icon" aria-hidden="true">${icon('queue', 14)}</span>
    <div class="ud-chat__banner-body">
      <strong>${count > 1 ? `已加入 Agent 队列 · ${count} 条待处理` : '已加入 Agent 队列'}${requestId ? ` · <code>${esc(requestId)}</code>` : ''}</strong>
      <span>在对话里让 Agent 处理设计器请求；空闲时运行 <code>agent-bridge.mjs pending</code> 查看。</span>
    </div>
    <button type="button" class="ud-iconbtn ud-chat__banner-refresh" data-action="refresh-queue" title="刷新队列" aria-label="刷新队列">${icon('refresh', 13)}</button>
  `
}

function updateContext() {
  const ref = chat.refs.context
  if (!ref) return
  const label = selectedLabel()
  ref.hidden = !label
  if (!label) return
  ref.querySelector('.ud-chat__context-label').textContent = label
  const ids = state.selection || []
  ref.title = ids
    .map(id => {
      const node = getNode(id)
      return node ? `${node.name || id} (${id})` : id
    })
    .join('、')
}

function updateChannel() {
  const ai = (state.config && state.config.ai) || {}
  let channel = ai.channel
  if (!channel) {
    if (ai.mode === 'agent') channel = 'agent'
    else if (ai.mode === 'api') channel = 'api'
    else channel = ai.configured ? 'api' : 'agent'
  }
  chat.channel = channel
  const badge = chat.refs.channel
  if (!badge) return
  badge.dataset.channel = channel
  const label = channel === 'api' ? '直连模型' : 'Agent 队列'
  badge.querySelector('.ud-chat__channel-label').textContent = label
  const model = ai.model ? ` · ${ai.model}` : ''
  badge.title = channel === 'api' ? `当前通道：直连模型${model}` : '当前通道：Agent 队列（请求写入 .ai/inbox，由编码 Agent 处理）'
  const hint = chat.refs.hintChannel
  if (hint) hint.textContent = channel === 'api' ? '直连模型' : 'Agent 队列'
  const status = chat.refs.status
  if (status) {
    status.textContent = channel === 'api' ? '已连接' : '文件队列'
    status.dataset.channel = channel
    status.title = badge.title
  }
}

function setMode(mode) {
  if (!MODE_PROMPTS[mode] || mode === chat.mode) return
  chat.mode = mode
  renderModeChips()
  const input = chat.refs.input
  if (input) {
    input.placeholder = currentModeInfo().placeholder
    input.setAttribute('aria-label', `给 AI 发消息（${currentModeInfo().label}模式）`)
  }
  updateSendState()
  if (!chat.messages.length) renderMessages()
}

function renderModeChips() {
  const chips = chat.el ? chat.el.querySelectorAll('.ud-chat__mode') : []
  chips.forEach(chip => {
    const active = chip.dataset.mode === chat.mode
    chip.classList.toggle('is-active', active)
    chip.setAttribute('aria-selected', active ? 'true' : 'false')
  })
}

function updateSendState() {
  const button = chat.refs.send
  const input = chat.refs.input
  if (!button || !input) return
  const needsText = chat.mode === 'apply'
  const hasText = input.value.trim().length > 0
  button.disabled = chat.busy || (needsText && !hasText)
  button.classList.toggle('is-busy', chat.busy)
}

function setBusy(busy) {
  chat.busy = !!busy
  setAiBusy(chat.busy)
  updateSendState()
  renderMessages({ forceScroll: chat.busy })
}

/* ------------------------------------------------------------------ */
/* message flow                                                        */
/* ------------------------------------------------------------------ */

function addMessage(message) {
  const entry = { id: message.id || `m${++chat.seq}`, ...message }
  chat.messages.push(entry)
  renderMessages({ forceScroll: true })
  return entry
}

function historyPayload() {
  const turns = []
  for (const message of chat.messages) {
    if (message.role === 'user' && typeof message.text === 'string') turns.push({ role: 'user', content: message.text })
    else if (message.role === 'assistant' && typeof message.text === 'string' && message.text.trim()) {
      turns.push({ role: 'assistant', content: message.text })
    }
  }
  return turns.slice(-8)
}

async function send(text, { channel = 'auto' } = {}) {
  if (chat.busy) return
  const raw = typeof text === 'string' ? text.trim() : ''
  const mode = chat.mode
  const message = raw || defaultMessageForMode(mode)
  if (!message) {
    chat.refs.input && chat.refs.input.focus()
    return
  }
  const history = historyPayload()
  const selection = Array.isArray(state.selection) ? state.selection.slice() : []
  addMessage({ role: 'user', text: message })
  if (chat.refs.input) {
    chat.refs.input.value = ''
    autoGrow()
  }
  setBusy(true)
  try {
    const response = await api('/api/chat', {
      method: 'POST',
      body: { mode, message, selection, channel, history },
    })
    if (response && response.queued) {
      handleQueued(response, message)
      return
    }
    if (response && response.spec) replaceSpecLocal(response.spec, 'AI 改稿')
    const findings = Array.isArray(response && response.findings) ? response.findings : []
    if (findings.length) {
      findingTargetsExist(findings)
      setFindings(findings)
    }
    addMessage({
      role: 'assistant',
      text: (response && response.reply) || '已收到。',
      findings,
    })
    if (response && Array.isArray(response.ops) && response.ops.length) {
      toast(`AI 已应用 ${response.ops.length} 项改动`, 'success')
    }
    await refreshQueue()
  } catch (error) {
    addMessage({
      role: 'error',
      text: error && error.message ? error.message : 'AI 请求失败',
      retryText: message,
      retryMode: mode,
      canRetry: channel !== 'agent',
    })
  } finally {
    setBusy(false)
  }
}

function handleQueued(response, message) {
  const requestId = response.requestId || ''
  chat.lastRequestId = requestId
  addMessage({ role: 'queue', requestId, done: false, text: message })
  renderQueueBanner([{ id: requestId, message }])
  updateChannel()
  refreshQueue()
}

async function retryWithAgent(errorMessage) {
  if (chat.busy || !errorMessage) return
  setBusy(true)
  try {
    const response = await api('/api/chat', {
      method: 'POST',
      body: {
        mode: errorMessage.retryMode || chat.mode,
        message: errorMessage.retryText || errorMessage.text,
        selection: Array.isArray(state.selection) ? state.selection.slice() : [],
        channel: 'agent',
        history: historyPayload(),
      },
    })
    if (response && response.queued) {
      errorMessage.retried = true
      handleQueued(response, errorMessage.retryText || '')
    }
  } catch (error) {
    errorMessage.text = `改用 Agent 队列失败：${error && error.message ? error.message : '未知错误'}`
  } finally {
    setBusy(false)
    renderMessages()
  }
}

async function applyFinding(messageId, findingIndex) {
  const message = chat.messages.find(item => item.id === messageId)
  const finding = message && Array.isArray(message.findings) ? message.findings[findingIndex] : null
  if (!finding || finding.applying || finding.applied) return
  const ops = Array.isArray(finding.suggestedOps) ? finding.suggestedOps : []
  if (!ops.length) return
  finding.applying = true
  renderMessages()
  const before = JSON.parse(JSON.stringify(state.spec))
  try {
    const result = await api('/api/ops', { method: 'POST', body: { ops } })
    if (result && result.spec) replaceSpecLocal(result.spec, '应用 AI 建议', before)
    finding.applied = true
    toast(`已应用「${finding.title}」`, 'success')
  } catch (error) {
    toast(`应用建议失败：${error && error.message ? error.message : '未知错误'}`, 'error')
  } finally {
    finding.applying = false
    renderMessages()
  }
}

/* ------------------------------------------------------------------ */
/* bus / settings events                                               */
/* ------------------------------------------------------------------ */

function onChatEvent(event) {
  const detail = (event && event.detail) || {}
  const requestId = detail.requestId || ''
  const reply = typeof detail.reply === 'string' ? detail.reply.trim() : ''
  const findings = Array.isArray(detail.findings) ? detail.findings : []
  if (!reply && !findings.length) return
  const key = requestId || `reply-${reply.slice(0, 80)}`
  if (chat.seenReplies.has(key)) return
  chat.seenReplies.add(key)

  if (requestId) {
    for (const message of chat.messages) {
      if (message.role === 'queue' && message.requestId === requestId) message.done = true
    }
  }
  if (findings.length) {
    setFindings(findings)
    findingTargetsExist(findings)
  }
  addMessage({ role: 'assistant', text: reply || '品评完成，请查看下方建议。', findings })
  refreshQueue()
}

function findingTargetsExist(findings) {
  // Agent replies may reference stale ids after the design changed; drop them so
  // the chips never point at nothing.
  for (const finding of findings) {
    if (!Array.isArray(finding.targets)) continue
    finding.targets = finding.targets.filter(id => getNode(id))
  }
}

function onQueueEvent(event) {
  const detail = (event && event.detail) || {}
  const pending = Array.isArray(detail.pending) ? detail.pending : []
  renderQueueBanner(pending)
}

function onSelectionEvent() {
  updateContext()
}

async function onConfigEvent() {
  updateChannel()
  chat.configTimer = 0
  await refreshConfig()
}

function openSettings() {
  document.dispatchEvent(new CustomEvent('ud:open-settings'))
}

async function refreshConfig() {
  const now = Date.now()
  if (now - chat.configTimer < 1200) return
  chat.configTimer = now
  try {
    const data = await api('/api/config')
    const config = (data && (data.config || data.ai || data)) || null
    if (config && typeof config === 'object') {
      state.config = { ...(state.config || {}), ai: { ...((state.config && state.config.ai) || {}), ...config } }
      updateChannel()
    }
  } catch {
    /* config endpoint is optional for the panel */
  }
}

/* ------------------------------------------------------------------ */
/* composer                                                            */
/* ------------------------------------------------------------------ */

function autoGrow() {
  const input = chat.refs.input
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(140, Math.max(38, input.scrollHeight))}px`
}

function bindEvents() {
  const el = chat.el
  const input = chat.refs.input
  const sendButton = chat.refs.send

  input.addEventListener('input', () => {
    autoGrow()
    updateSendState()
  })

  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.isComposing || event.keyCode === 229) return
    event.preventDefault()
    send(input.value)
  })

  sendButton.addEventListener('click', () => send(input.value))

  chat.refs.gear.addEventListener('click', openSettings)
  chat.refs.channel.addEventListener('click', openSettings)

  el.querySelector('.ud-chat__modes').addEventListener('click', event => {
    const chip = event.target.closest('.ud-chat__mode')
    if (chip) setMode(chip.dataset.mode)
  })

  chat.refs.messages.addEventListener('click', event => {
    const actionEl = event.target.closest('[data-action]')
    if (!actionEl) return
    const action = actionEl.dataset.action
    if (action === 'apply-finding') {
      applyFinding(actionEl.dataset.msgId, Number(actionEl.dataset.findingIndex))
    } else if (action === 'select-node') {
      const id = actionEl.dataset.nodeId
      if (id) setSelection([id])
    } else if (action === 'retry-agent') {
      const message = chat.messages.find(item => item.id === actionEl.dataset.msgId)
      retryWithAgent(message)
    } else if (action === 'open-settings') {
      openSettings()
    } else if (action === 'quick-prompt') {
      const quick = QUICK_PROMPTS[Number(actionEl.dataset.quickIndex)]
      if (quick) {
        setMode(quick.mode || 'apply')
        send(quick.prompt)
      }
    }
  })

  chat.refs.banner.addEventListener('click', event => {
    if (event.target.closest('[data-action="refresh-queue"]')) refreshQueue()
  })

  chat.refs.context.addEventListener('click', event => {
    if (event.target.closest('[data-action="clear-selection"]')) setSelection([])
  })

  bus.addEventListener('chat', onChatEvent)
  bus.addEventListener('queue', onQueueEvent)
  bus.addEventListener('selection', onSelectionEvent)
  bus.addEventListener('config', onConfigEvent)
  document.addEventListener('ud:config-changed', onConfigEvent)
  document.addEventListener('ud:chat-focus', () => chat.refs.input && chat.refs.input.focus())
  window.addEventListener('focus', refreshConfig)
}

/* ------------------------------------------------------------------ */
/* init                                                                */
/* ------------------------------------------------------------------ */

/**
 * @param {{el: HTMLElement}} options
 * @returns {{send: Function, setMode: Function, focus: Function, refreshConfig: Function}}
 */
export function initChat({ el } = {}) {
  if (!el) return { send: () => {}, setMode: () => {}, focus: () => {}, refreshConfig: () => {} }
  chat.el = el
  buildSkeleton(el)
  chat.refs = {
    messages: el.querySelector('.ud-chat__messages'),
    input: el.querySelector('.ud-chat__input'),
    send: el.querySelector('.ud-chat__send'),
    banner: el.querySelector('.ud-chat__banner'),
    context: el.querySelector('.ud-chat__context'),
    channel: el.querySelector('.ud-chat__channel'),
    gear: el.querySelector('.ud-chat__gear'),
    status: el.querySelector('.ud-chat__status'),
    hintChannel: el.querySelector('.ud-chat__hint-channel'),
  }

  bindEvents()
  updateChannel()
  updateContext()
  autoGrow()
  updateSendState()
  renderMessages({ forceScroll: true })
  refreshQueue()
  refreshConfig()

  return {
    send,
    setMode,
    focus: () => chat.refs.input && chat.refs.input.focus(),
    refreshConfig,
    state: chat,
  }
}
