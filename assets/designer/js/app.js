/**
 * UI Designer — app shell: boot, toolbar, keyboard, SSE, modals, preview.
 * Feature modules (canvas/render/panels/chat) are loaded dynamically so a
 * missing module degrades gracefully instead of breaking the whole page.
 */

import {
  state, bus, init as initStore, api, saveNow, scheduleSave, toast, setStatus,
  setSelection, getNode, getFrameOf, replaceSpecLocal, setFindings,
} from './store.js'

const $ = selector => document.querySelector(selector)

const els = {}

/* ------------------------------------------------------------------ */
/* bootstrap                                                           */
/* ------------------------------------------------------------------ */

async function boot() {
  els.app = $('#ud-app')
  els.zoomLabel = $('#ud-zoom-label')
  els.saveStatus = $('#ud-save-status')
  els.designName = $('#ud-design-name')

  bindChrome()
  wireEvents()

  let payload
  try {
    payload = await api('/api/state')
  } catch (error) {
    showBootError(error.message)
    return
  }
  initStore({
    spec: payload.spec,
    designPath: payload.designPath,
    config: payload.config,
    skillVersion: payload.skillVersion,
  })
  renderDesignName()
  renderSaveStatus()

  // feature modules
  const canvas = await loadModule('canvas', () => import('./canvas.js'), m => m.initCanvas)
  const render = await loadModule('render', () => import('./render.js'), m => m.initRender)
  const panels = await loadModule('panels', () => import('./panels.js'), m => m.initPanels)
  const chat = await loadModule('chat', () => import('./chat.js'), m => m.initChat)

  if (render) {
    try { render({ appEl: $('#ud-canvas-area') }) } catch (error) { console.error(error); toast(`画布渲染初始化失败：${error.message}`, 'error') }
  }
  if (canvas) {
    try {
      els.canvas = canvas({ areaEl: $('#ud-canvas-area') }) || {}
    } catch (error) { console.error(error); toast(`画布交互初始化失败：${error.message}`, 'error') }
  }
  if (panels) {
    try { panels({ leftEl: $('#ud-left'), rightEl: $('#ud-inspector') }) } catch (error) { console.error(error); toast(`属性面板初始化失败：${error.message}`, 'error') }
  }
  if (chat) {
    try { chat({ el: $('#ud-chat') }) } catch (error) { console.error(error); toast(`AI 面板初始化失败：${error.message}`, 'error') }
  }

  connectEvents()
  if (els.canvas && typeof els.canvas.fitView === 'function') {
    setTimeout(() => { try { els.canvas.fitView() } catch {} }, 120)
  }
}

async function loadModule(name, loader, pick) {
  try {
    const mod = await loader()
    const fn = pick(mod)
    if (typeof fn !== 'function') throw new Error(`模块缺少导出函数（${name}）`)
    return fn
  } catch (error) {
    console.warn(`[ui-designer] 模块 ${name} 未就绪：`, error.message)
    toast(`模块 ${name} 未就绪：${error.message}`, 'warning')
    return null
  }
}

function showBootError(message) {
  const area = $('#ud-canvas-area')
  if (area) {
    area.innerHTML = `<div class="ud-empty" style="height:100%">
      <strong>无法连接设计器服务</strong>
      <div>${escapeHtml(message)}</div>
      <div class="ud-dim">请确认 server.mjs 正在运行，然后刷新页面。</div>
    </div>`
  }
}

/* ------------------------------------------------------------------ */
/* toolbar                                                             */
/* ------------------------------------------------------------------ */

function bindChrome() {
  $('#ud-btn-undo').addEventListener('click', () => withBusy(() => undo()))
  $('#ud-btn-redo').addEventListener('click', () => withBusy(() => redo()))
  $('#ud-zoom-out').addEventListener('click', () => zoomBy(1 / 1.2))
  $('#ud-zoom-in').addEventListener('click', () => zoomBy(1.2))
  els.zoomLabel.addEventListener('click', () => {
    if (els.canvas && typeof els.canvas.setZoom === 'function') els.canvas.setZoom(1)
    else import('./store.js').then(m => m.setZoom(1))
  })
  $('#ud-btn-fit').addEventListener('click', () => els.canvas && els.canvas.fitView && els.canvas.fitView())
  $('#ud-btn-preview').addEventListener('click', togglePreview)
  $('#ud-btn-export').addEventListener('click', openExportDialog)
  $('#ud-btn-settings').addEventListener('click', openSettingsDialog)
  els.designName.addEventListener('dblclick', openRenameDialog)
  els.designName.addEventListener('click', () => openRenameDialog())
}

function zoomBy(factor) {
  if (els.canvas && typeof els.canvas.zoomBy === 'function') {
    els.canvas.zoomBy(factor)
    return
  }
  import('./store.js').then(m => m.setZoom(state.zoom * factor))
}

function undo() { import('./store.js').then(m => m.undo()) }
function redo() { import('./store.js').then(m => m.redo()) }

function renderDesignName() {
  if (!state.spec) return
  els.designName.textContent = state.spec.name || '未命名设计'
  document.title = `${state.spec.name || 'UI Designer'} · UI Designer`
}

function renderSaveStatus() {
  const kind = state.dirty ? 'saving' : 'saved'
  els.saveStatus.dataset.kind = kind
  els.saveStatus.textContent = state.dirty ? '未保存' : '已保存'
}

function withBusy(fn) {
  try { fn() } catch (error) { toast(error.message, 'error') }
}

/* ------------------------------------------------------------------ */
/* store/bus wiring                                                    */
/* ------------------------------------------------------------------ */

function wireEvents() {
  bus.addEventListener('spec', event => {
    renderDesignName()
    renderSaveStatus()
    if (event.detail && event.detail.reason === 'remote' && event.detail.source === 'external') {
      toast('设计稿已被外部更新', 'info')
    }
  })
  bus.addEventListener('view', () => {
    els.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`
  })
  bus.addEventListener('status', event => {
    const { text, kind } = event.detail || {}
    if (!els.saveStatus) return
    if (kind === 'saving') {
      els.saveStatus.dataset.kind = 'saving'
      els.saveStatus.textContent = text || '保存中…'
    } else if (kind === 'saved') {
      els.saveStatus.dataset.kind = 'saved'
      els.saveStatus.textContent = text || '已保存'
    } else if (kind === 'remote') {
      els.saveStatus.dataset.kind = 'remote'
      els.saveStatus.textContent = text || '已同步'
      setTimeout(renderSaveStatus, 1600)
    } else if (kind === 'error') {
      els.saveStatus.dataset.kind = 'error'
      els.saveStatus.textContent = text || '保存失败'
    } else {
      els.saveStatus.dataset.kind = 'idle'
      els.saveStatus.textContent = text || '已保存'
    }
  })
  bus.addEventListener('toast', event => {
    const { message, kind } = event.detail || {}
    showToast(message, kind)
  })
  bus.addEventListener('findings', () => {})
  bus.addEventListener('chat', () => {})
  bus.addEventListener('selection', updateStatusChip)
}

function updateStatusChip() {}

/* ------------------------------------------------------------------ */
/* SSE                                                                 */
/* ------------------------------------------------------------------ */

let eventSource = null

function connectEvents() {
  try {
    eventSource = new EventSource('/api/events')
  } catch (error) {
    toast(`无法建立实时连接：${error.message}`, 'error')
    return
  }
  eventSource.addEventListener('state', event => {
    const data = safeParse(event.data)
    if (!data || !data.spec) return
    import('./store.js').then(m => m.setSpecFromServer(data.spec, { external: data.source === 'external' }))
  })
  eventSource.addEventListener('chat', event => {
    const data = safeParse(event.data)
    if (!data) return
    bus.dispatchEvent(new CustomEvent('chat', { detail: data }))
  })
  eventSource.addEventListener('queue', event => {
    const data = safeParse(event.data)
    if (!data) return
    state.pendingRequests = (data.pending || []).length
    bus.dispatchEvent(new CustomEvent('queue', { detail: data }))
  })
  eventSource.addEventListener('status', event => {
    const data = safeParse(event.data)
    if (data && data.text) toast(data.text, data.kind === 'warning' ? 'warning' : 'info')
  })
  eventSource.onerror = () => {
    if (eventSource && eventSource.readyState === EventSource.CLOSED) {
      toast('与设计器服务的实时连接已断开，刷新页面可恢复', 'warning')
    }
  }
}

function safeParse(text) {
  try { return JSON.parse(text) } catch { return null }
}

/* ------------------------------------------------------------------ */
/* keyboard                                                            */
/* ------------------------------------------------------------------ */

window.addEventListener('keydown', event => {
  const target = event.target
  const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  const mod = event.ctrlKey || event.metaKey

  if (event.key === 'Escape') {
    if (els.app.classList.contains('ud-preview')) {
      togglePreview()
      event.preventDefault()
      return
    }
    if (typing) return
    setSelection([])
    return
  }
  if (typing) return

  if (mod && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if (mod && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
    return
  }
  if (mod && event.key.toLowerCase() === 's') {
    event.preventDefault()
    saveNow()
    return
  }
  if (mod && event.key === '0') {
    event.preventDefault()
    if (els.canvas && els.canvas.fitView) els.canvas.fitView()
    return
  }
  if (mod && (event.key === '=' || event.key === '+')) {
    event.preventDefault()
    zoomBy(1.2)
    return
  }
  if (mod && event.key === '-') {
    event.preventDefault()
    zoomBy(1 / 1.2)
    return
  }
  if (event.key === 'p' || event.key === 'P') {
    if (!mod) { event.preventDefault(); togglePreview() }
    return
  }
  if (els.app.classList.contains('ud-preview')) return
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (!state.selection.length) return
    event.preventDefault()
    removeSelection()
    return
  }
  if (mod && event.key.toLowerCase() === 'd') {
    if (!state.selection.length) return
    event.preventDefault()
    duplicateSelection()
    return
  }
  if (event.key.startsWith('Arrow')) {
    if (!state.selection.length) return
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    nudgeSelection(dx, dy)
  }
})

async function nudgeSelection(dx, dy) {
  if (!state.selection.length) return
  const ids = state.selection.filter(id => {
    const node = getNode(id)
    return node && node.parent !== null
  })
  if (!ids.length) return
  import('./store.js').then(m => {
    m.update(spec => {
      for (const id of ids) {
        const node = spec.nodes[id]
        if (!node) continue
        node.x = Math.round((node.x || 0) + dx)
        node.y = Math.round((node.y || 0) + dy)
      }
    }, { label: '移动节点' })
  })
}

async function removeSelection() {
  const ids = state.selection.filter(id => {
    const node = getNode(id)
    return node && node.parent !== null
  })
  if (!ids.length) {
    toast('frame 根节点不能删除，可在左侧「画板」中删除整个画板', 'warning')
    return
  }
  try {
    const before = JSON.parse(JSON.stringify(state.spec))
    const res = await fetch('/api/ops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops: ids.map(id => ({ op: 'remove', id })) }),
    }).then(r => r.json())
    if (!res.ok) throw new Error(res.error || '删除失败')
    const m = await import('./store.js')
    m.replaceSpecLocal(res.spec, '删除节点', before)
    m.setSelection([])
  } catch (error) {
    toast(error.message, 'error')
  }
}

async function duplicateSelection() {
  const ids = state.selection.filter(id => {
    const node = getNode(id)
    return node && node.parent !== null
  })
  if (!ids.length) return
  try {
    const before = JSON.parse(JSON.stringify(state.spec))
    const res = await fetch('/api/ops', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ops: ids.map(id => ({ op: 'duplicate', id })) }),
    }).then(r => r.json())
    if (!res.ok) throw new Error(res.error || '复制失败')
    const m = await import('./store.js')
    m.replaceSpecLocal(res.spec, '复制节点', before)
    m.setSelection((res.results || []).map(r => r.id).filter(Boolean))
  } catch (error) {
    toast(error.message, 'error')
  }
}

/* ------------------------------------------------------------------ */
/* preview                                                             */
/* ------------------------------------------------------------------ */

function togglePreview() {
  const on = els.app.classList.toggle('ud-preview')
  let bar = document.querySelector('.ud-preview-bar')
  if (on) {
    if (!bar) {
      bar = document.createElement('div')
      bar.className = 'ud-preview-bar'
      const btn = document.createElement('button')
      btn.className = 'ud-btn ud-btn--primary'
      btn.textContent = '退出预览 (Esc)'
      btn.addEventListener('click', togglePreview)
      bar.appendChild(btn)
      document.body.appendChild(bar)
    }
    bar.classList.remove('ud-hidden')
    window.dispatchEvent(new Event('resize'))
    setTimeout(() => {
      if (els.canvas && els.canvas.fitView) els.canvas.fitView()
    }, 120)
  } else if (bar) {
    bar.classList.add('ud-hidden')
    window.dispatchEvent(new Event('resize'))
    setTimeout(() => {
      if (els.canvas && els.canvas.fitView) els.canvas.fitView()
    }, 120)
  }
}

/* ------------------------------------------------------------------ */
/* modals                                                              */
/* ------------------------------------------------------------------ */

function openModal({ title, body, footer, wide = false }) {
  closeModal()
  const backdrop = document.createElement('div')
  backdrop.className = 'ud-modal-backdrop'
  backdrop.addEventListener('mousedown', event => {
    if (event.target === backdrop) closeModal()
  })
  const modal = document.createElement('div')
  modal.className = `ud-modal${wide ? ' ud-modal--wide' : ''}`
  const head = document.createElement('div')
  head.className = 'ud-modal__head'
  const h2 = document.createElement('h2')
  h2.textContent = title
  const close = document.createElement('button')
  close.className = 'ud-iconbtn ud-modal__close'
  close.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  close.title = '关闭 (Esc)'
  close.addEventListener('click', closeModal)
  head.append(h2, close)
  const bodyEl = document.createElement('div')
  bodyEl.className = 'ud-modal__body'
  if (typeof body === 'string') bodyEl.innerHTML = body
  else bodyEl.appendChild(body)
  modal.append(head, bodyEl)
  if (footer) {
    const foot = document.createElement('div')
    foot.className = 'ud-modal__foot'
    for (const node of footer) foot.appendChild(node)
    modal.appendChild(foot)
  }
  backdrop.appendChild(modal)
  document.getElementById('ud-modal-root').appendChild(backdrop)
  els.modalBackdrop = backdrop
  return { bodyEl, modal }
}

function closeModal() {
  const root = document.getElementById('ud-modal-root')
  if (root) root.innerHTML = ''
  els.modalBackdrop = null
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && els.modalBackdrop) {
    closeModal()
    event.stopPropagation()
  }
}, true)

/* ------------------------------------------------------------------ */
/* rename / settings / export                                          */
/* ------------------------------------------------------------------ */

function openRenameDialog() {
  const body = document.createElement('div')
  body.className = 'ud-stack'
  body.innerHTML = `
    <label class="ud-field">
      <span class="ud-field__label">设计稿名称</span>
      <input class="ud-input" id="ud-rename-input" value="${escapeAttr(state.spec ? state.spec.name : '')}" />
    </label>
    <div class="ud-dim" style="font-size:11.5px">名称会写入 design.json，并作为导出页面的标题。</div>`
  const apply = document.createElement('button')
  apply.className = 'ud-btn ud-btn--primary'
  apply.textContent = '保存'
  apply.addEventListener('click', () => {
    const value = body.querySelector('#ud-rename-input').value.trim()
    if (!value) return
    import('./store.js').then(m => {
      m.update(spec => { spec.name = value }, { label: '重命名设计稿' })
      closeModal()
    })
  })
  const cancel = document.createElement('button')
  cancel.className = 'ud-btn'
  cancel.textContent = '取消'
  cancel.addEventListener('click', closeModal)
  openModal({ title: '重命名设计稿', body, footer: [spacer(), cancel, apply] })
  const input = body.querySelector('#ud-rename-input')
  input.focus()
  input.select()
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') apply.click()
  })
}

function spacer() {
  const el = document.createElement('span')
  el.className = 'ud-modal__spacer'
  return el
}

function openSettingsDialog() {
  const ai = (state.config && state.config.ai) || {}
  const body = document.createElement('div')
  body.className = 'ud-stack'
  body.innerHTML = `
    <div class="ud-row ud-row--between">
      <div>
        <div style="font-weight:600;margin-bottom:2px">AI 通道</div>
        <div class="ud-dim" style="font-size:11.5px">直连模型走 OpenAI 兼容接口；Agent 队列把请求交给当前编码 Agent 处理。</div>
      </div>
      <span class="ud-badge ${ai.configured ? 'ud-badge--success' : 'ud-badge--warning'}">${ai.configured ? '已配置密钥' : '未配置密钥'}</span>
    </div>
    <label class="ud-field">
      <span class="ud-field__label">通道模式</span>
      <div class="ud-select-wrap">
        <select class="ud-select" id="ud-ai-mode">
          <option value="auto"${ai.mode === 'auto' ? ' selected' : ''}>自动（有密钥直连，否则 Agent 队列）</option>
          <option value="api"${ai.mode === 'api' ? ' selected' : ''}>直连模型 API</option>
          <option value="agent"${ai.mode === 'agent' ? ' selected' : ''}>Agent 文件队列</option>
        </select>
      </div>
    </label>
    <label class="ud-field">
      <span class="ud-field__label">Base URL <span class="ud-field__hint">例如 https://api.deepseek.com/v1</span></span>
      <input class="ud-input" id="ud-ai-base" placeholder="https://api.openai.com/v1" value="${escapeAttr(ai.baseUrl || '')}" />
    </label>
    <label class="ud-field">
      <span class="ud-field__label">模型名</span>
      <input class="ud-input" id="ud-ai-model" placeholder="deepseek-chat / gpt-4o-mini" value="${escapeAttr(ai.model || '')}" />
    </label>
    <label class="ud-field">
      <span class="ud-field__label">API Key <span class="ud-field__hint">保存到 ~/.dsh/ui-designer.json，不写入项目</span></span>
      <input class="ud-input" id="ud-ai-key" type="password" placeholder="${ai.hasKey ? '已保存，留空表示不修改' : 'sk-…'}" />
    </label>
    <div class="ud-hr"></div>
    <div class="ud-dim" style="font-size:11.5px;line-height:1.7">
      设计稿：<span class="ud-mono">${escapeHtml(state.designPath || '')}</span><br/>
      也可以设置环境变量 <span class="ud-mono">UI_DESIGNER_BASE_URL / UI_DESIGNER_API_KEY / UI_DESIGNER_MODEL</span> 后重启服务。
    </div>`
  const save = document.createElement('button')
  save.className = 'ud-btn ud-btn--primary'
  save.textContent = '保存设置'
  save.addEventListener('click', async () => {
    const payload = {
      mode: body.querySelector('#ud-ai-mode').value,
      baseUrl: body.querySelector('#ud-ai-base').value.trim(),
      model: body.querySelector('#ud-ai-model').value.trim(),
      apiKey: body.querySelector('#ud-ai-key').value.trim(),
    }
    if (!payload.apiKey) delete payload.apiKey
    try {
      const res = await api('/api/config', { method: 'PUT', body: payload })
      state.config = { ...(state.config || {}), ai: res.config }
      closeModal()
      toast('AI 设置已保存', 'success')
      bus.dispatchEvent(new CustomEvent('config'))
    } catch (error) {
      toast(`保存失败：${error.message}`, 'error')
    }
  })
  const cancel = document.createElement('button')
  cancel.className = 'ud-btn'
  cancel.textContent = '取消'
  cancel.addEventListener('click', closeModal)
  openModal({ title: 'AI 与设计器设置', body, footer: [spacer(), cancel, save] })
}

async function openExportDialog() {
  if (!state.spec) return
  const frames = state.spec.frames || []
  const body = document.createElement('div')
  body.className = 'ud-stack'
  body.innerHTML = `
    <div class="ud-row" style="gap:10px">
      <label class="ud-field ud-grow">
        <span class="ud-field__label">画板</span>
        <div class="ud-select-wrap"><select class="ud-select" id="ud-export-frame">
          ${frames.map(f => `<option value="${escapeAttr(f.id)}">${escapeHtml(f.name)} · ${f.width}×${f.height}</option>`).join('')}
        </select></div>
      </label>
      <label class="ud-field ud-grow">
        <span class="ud-field__label">格式</span>
        <div class="ud-select-wrap"><select class="ud-select" id="ud-export-format">
          <option value="html">HTML + CSS（单文件）</option>
          <option value="react">React + Tailwind</option>
          <option value="tokens">设计令牌 CSS</option>
          <option value="all">全部</option>
        </select></div>
      </label>
    </div>
    <div class="ud-row" style="gap:8px">
      <button class="ud-btn" id="ud-export-run">生成代码</button>
      <button class="ud-btn" id="ud-export-write" disabled>写入项目 export/ 目录</button>
      <span class="ud-dim" id="ud-export-path" style="font-size:11.5px"></span>
    </div>
    <pre class="ud-code" id="ud-export-code">选择画板与格式后点击「生成代码」。</pre>`
  const actions = document.createElement('button')
  actions.className = 'ud-btn'
  actions.textContent = '复制代码'
  actions.addEventListener('click', async () => {
    const code = body.querySelector('#ud-export-code').textContent
    try {
      await navigator.clipboard.writeText(code)
      toast('已复制到剪贴板', 'success')
    } catch {
      toast('复制失败，请手动选择代码复制', 'warning')
    }
  })
  const close = document.createElement('button')
  close.className = 'ud-btn'
  close.textContent = '关闭'
  close.addEventListener('click', closeModal)
  openModal({ title: '导出设计', body, footer: [spacer(), actions, close], wide: true })

  const run = async write => {
    const frame = body.querySelector('#ud-export-frame').value
    const format = body.querySelector('#ud-export-format').value
    const codeEl = body.querySelector('#ud-export-code')
    codeEl.textContent = '生成中…'
    try {
      const res = await api('/api/export', { method: 'POST', body: { frameId: frame, format, write } })
      const files = Array.isArray(res.files) ? res.files : []
      codeEl.textContent = files.length
        ? files.map(f => `// ==== ${f.path} ====\n${f.code}`).join('\n\n')
        : res.code || '（无输出）'
      if (write && res.writtenTo) {
        body.querySelector('#ud-export-path').textContent = `已写入 ${res.writtenTo}`
        toast('代码已写入项目 export/ 目录', 'success')
      }
    } catch (error) {
      codeEl.textContent = `导出失败：${error.message}`
      toast(`导出失败：${error.message}`, 'error')
    }
  }
  body.querySelector('#ud-export-run').addEventListener('click', () => run(false))
  body.querySelector('#ud-export-write').addEventListener('click', () => run(true))
  body.querySelector('#ud-export-frame').addEventListener('change', () => {
    body.querySelector('#ud-export-code').textContent = '选择格式后点击「生成代码」。'
  })
}

/* ------------------------------------------------------------------ */
/* toasts                                                              */
/* ------------------------------------------------------------------ */

function showToast(message, kind = 'info') {
  if (!message) return
  const root = document.getElementById('ud-toast-root')
  if (!root) return
  const el = document.createElement('div')
  el.className = `ud-toast ud-toast--${kind || 'info'}`
  const icon = kind === 'error' ? '⚠' : kind === 'success' ? '✓' : kind === 'warning' ? '!' : 'i'
  el.innerHTML = `<span class="ud-toast__icon">${icon}</span><span class="ud-toast__body">${escapeHtml(message)}</span>`
  root.appendChild(el)
  while (root.children.length > 4) root.firstElementChild.remove()
  setTimeout(() => {
    el.style.transition = 'opacity .2s, transform .2s'
    el.style.opacity = '0'
    el.style.transform = 'translateY(4px)'
    setTimeout(() => el.remove(), 220)
  }, kind === 'error' ? 6000 : 3200)
}

/* ------------------------------------------------------------------ */
/* small utilities                                                     */
/* ------------------------------------------------------------------ */

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function escapeAttr(text) {
  return escapeHtml(text).replace(/'/g, '&#39;')
}

// cross-module hooks
document.addEventListener('ud:open-settings', openSettingsDialog)
document.addEventListener('ud:focus-text', () => {
  const textarea = document.querySelector('#ud-inspector [data-ud-text-editor]')
  if (textarea) {
    textarea.focus()
    textarea.select && textarea.select()
  }
})
window.addEventListener('resize', () => {})

boot().catch(error => {
  console.error('[ui-designer] boot failed', error)
  showBootError(error.message)
})
