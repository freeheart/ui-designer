/**
 * UI Designer — prefab library (component palette).
 *
 * Pure data builders. `create(ctx)` receives `{ x, y, width }` where `width` is
 * the usable content width inside the target container (mobile 390 frame -> 358,
 * desktop frames -> frame width - 32) and returns a node JSON subtree WITHOUT
 * ids. `panels.js` inserts it through `POST /api/ops` so ids, validation and
 * persistence stay server-authoritative.
 *
 * Intended frame widths are documented per prefab:
 *  - basic elements: any width (mobile 390 default)
 *  - blocks: mobile-first, designed for 390 wide frames; wide blocks
 *    (sidebar-layout / table-page) adapt when width >= 960.
 */

const FONT_PX = { xs: 12, sm: 13, md: 15, lg: 18, xl: 24, '2xl': 32 }

const rnd = value => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

const normWidth = width => Math.max(160, Math.round(Number(width) || 358))

const TYPE_LABEL = {
  box: '容器',
  text: '文本',
  button: '按钮',
  input: '输入框',
  image: '图片',
  icon: '图标',
  divider: '分割线',
  badge: '徽标',
  avatar: '头像',
  toggle: '开关',
  checkbox: '复选框',
  select: '下拉框',
  tabs: '标签页',
  table: '表格',
  chart: '图表',
  card: '卡片',
}

/** Build a schema node (no id: the add op generates ids). */
function make(type, opts = {}) {
  const node = {
    type,
    name: opts.name || TYPE_LABEL[type] || type,
    x: rnd(opts.x),
    y: rnd(opts.y),
    w: rnd(opts.w),
    h: rnd(opts.h),
    style: opts.style || {},
    props: opts.props || {},
    children: opts.children || [],
  }
  if (opts.layout) node.layout = opts.layout
  if (opts.opacity !== undefined) node.opacity = opts.opacity
  if (opts.hidden) node.hidden = true
  if (opts.locked) node.locked = true
  return node
}

function text(content, opts = {}) {
  const {
    x = 0, y = 0, w = 120, h, size = 'md', weight = 400, color = 'text',
    align = 'left', lineHeight, name, maxLines,
  } = opts
  const fontPx = FONT_PX[size] || 15
  const lh = lineHeight || 1.45
  const props = { text: content }
  if (maxLines) props.maxLines = maxLines
  return make('text', {
    name: name || String(content).replace(/\s+/g, ' ').slice(0, 10) || '文本',
    x, y,
    w,
    h: h === undefined ? Math.round(fontPx * lh) : h,
    style: { font: { size, weight, color, align, ...(lineHeight ? { lineHeight } : {}) } },
    props,
  })
}

function button(label, opts = {}) {
  const { x = 0, y = 0, w = 120, h = 40, variant = 'primary', icon, radius = 'md' } = opts
  const style = variant === 'ghost'
    ? {
        fill: 'transparent',
        radius,
        stroke: { color: 'border', width: 1 },
        font: { size: 'md', weight: 600, color: 'text', align: 'center' },
      }
    : variant === 'soft'
      ? {
          fill: 'surface2',
          radius,
          font: { size: 'md', weight: 600, color: 'text', align: 'center' },
        }
      : {
          fill: 'primary',
          radius,
          font: { size: 'md', weight: 600, color: 'onPrimary', align: 'center' },
        }
  return make('button', {
    name: label,
    x, y, w, h,
    style,
    props: { label, ...(icon ? { icon } : {}) },
  })
}

function badge(textValue, opts = {}) {
  const { x = 0, y = 0, w = 76, h = 24, tone = 'primary' } = opts
  return make('badge', {
    name: textValue,
    x, y, w, h,
    style: {
      fill: tone,
      radius: 'full',
      font: { size: 'xs', weight: 600, color: tone === 'muted' ? 'text' : 'onPrimary', align: 'center' },
    },
    props: { text: textValue, tone },
  })
}

function icon(name, opts = {}) {
  const { x = 0, y = 0, size = 20, color = 'text', strokeWidth } = opts
  return make('icon', {
    name,
    x, y, w: size, h: size,
    style: { font: { color } },
    props: { name, ...(strokeWidth ? { strokeWidth } : {}) },
  })
}

function iconTile(name, iconName, opts = {}) {
  const { x = 0, y = 0, size = 32, fill = 'primary', radius = 'md', color = 'onPrimary' } = opts
  return make('box', {
    name,
    x, y, w: size, h: size,
    style: { fill, radius },
    children: [make('icon', {
      name: '图标',
      x: Math.round((size - 16) / 2),
      y: Math.round((size - 16) / 2),
      w: 16, h: 16,
      style: { font: { color } },
      props: { name: iconName },
    })],
  })
}

/* ------------------------------------------------------------------ */
/* palette categories                                                  */
/* ------------------------------------------------------------------ */

export const PREFAB_CATEGORIES = [
  { id: 'basic', name: '基础元素' },
  { id: 'blocks', name: '组合区块' },
]

/* ------------------------------------------------------------------ */
/* basic elements (16)                                                 */
/* ------------------------------------------------------------------ */

const BASIC_PREFABS = [
  {
    id: 'box',
    name: '容器',
    category: 'basic',
    icon: 'box',
    keywords: 'box 容器 分组 frame group',
    create: ctx => make('box', {
      name: '容器',
      x: ctx.x, y: ctx.y,
      w: normWidth(ctx.width), h: 120,
      layout: { mode: 'absolute' },
      style: { fill: 'surface', radius: 'md', stroke: { color: 'border', width: 1 } },
    }),
  },
  {
    id: 'text',
    name: '文本',
    category: 'basic',
    icon: 'text',
    keywords: 'text 文字 标题 段落 label',
    create: ctx => text('这是一段文本，双击可直接编辑内容。', {
      name: '文本',
      x: ctx.x, y: ctx.y,
      w: normWidth(ctx.width), h: 44,
      size: 'md',
      lineHeight: 1.5,
    }),
  },
  {
    id: 'button',
    name: '按钮',
    category: 'basic',
    icon: 'button',
    keywords: 'button 按钮 操作 提交',
    create: ctx => button('按钮', { x: ctx.x, y: ctx.y, w: 112, h: 40 }),
  },
  {
    id: 'input',
    name: '输入框',
    category: 'basic',
    icon: 'input',
    keywords: 'input 输入框 表单 字段 field',
    create: ctx => make('input', {
      name: '输入框',
      x: ctx.x, y: ctx.y,
      w: normWidth(ctx.width), h: 40,
      style: {
        fill: 'surface2',
        radius: 'md',
        stroke: { color: 'border', width: 1 },
        padding: [10, 12],
        font: { size: 'md', weight: 400, color: 'muted', align: 'left' },
      },
      props: { placeholder: '请输入内容' },
    }),
  },
  {
    id: 'image',
    name: '图片',
    category: 'basic',
    icon: 'image',
    keywords: 'image 图片 配图 photo media',
    create: ctx => make('image', {
      name: '图片',
      x: ctx.x, y: ctx.y,
      w: normWidth(ctx.width), h: 180,
      style: { fill: 'surface2', radius: 'md' },
    }),
  },
  {
    id: 'icon',
    name: '图标',
    category: 'basic',
    icon: 'icon',
    keywords: 'icon 图标 符号 iconfont',
    create: ctx => icon('图标', { x: ctx.x, y: ctx.y, size: 24, color: 'primary' }),
  },
  {
    id: 'divider',
    name: '分割线',
    category: 'basic',
    icon: 'divider',
    keywords: 'divider 分割线 横线 line hr',
    create: ctx => make('divider', {
      name: '分割线',
      x: ctx.x, y: ctx.y,
      w: normWidth(ctx.width), h: 1,
      style: { stroke: { color: 'border', width: 1 } },
    }),
  },
  {
    id: 'badge',
    name: '徽标',
    category: 'basic',
    icon: 'badge',
    keywords: 'badge 徽标 标签 状态 tag',
    create: ctx => badge('标签', { x: ctx.x, y: ctx.y, w: 76, h: 24 }),
  },
  {
    id: 'avatar',
    name: '头像',
    category: 'basic',
    icon: 'avatar',
    keywords: 'avatar 头像 用户 user',
    create: ctx => make('avatar', {
      name: '头像',
      x: ctx.x, y: ctx.y,
      w: 40, h: 40,
      style: { fill: 'surface2', radius: 'full', font: { size: 'sm', weight: 600, color: 'text' } },
      props: { initials: 'AI' },
    }),
  },
  {
    id: 'toggle',
    name: '开关',
    category: 'basic',
    icon: 'toggle',
    keywords: 'toggle 开关 switch',
    create: ctx => make('toggle', {
      name: '开关',
      x: ctx.x, y: ctx.y,
      w: 44, h: 24,
      style: { fill: 'primary', radius: 'full' },
      props: { checked: true },
    }),
  },
  {
    id: 'checkbox',
    name: '复选框',
    category: 'basic',
    icon: 'checkbox',
    keywords: 'checkbox 复选 勾选 同意',
    create: ctx => make('checkbox', {
      name: '复选框',
      x: ctx.x, y: ctx.y,
      w: 164, h: 22,
      style: { font: { size: 'sm', weight: 400, color: 'text' } },
      props: { checked: true, label: '同意条款' },
    }),
  },
  {
    id: 'select',
    name: '下拉框',
    category: 'basic',
    icon: 'select',
    keywords: 'select 下拉 选择 选项',
    create: ctx => make('select', {
      name: '下拉框',
      x: ctx.x, y: ctx.y,
      w: normWidth(ctx.width), h: 40,
      style: {
        fill: 'surface2',
        radius: 'md',
        stroke: { color: 'border', width: 1 },
        padding: [10, 12],
        font: { size: 'md', weight: 400, color: 'text', align: 'left' },
      },
      props: { value: '', placeholder: '请选择' },
    }),
  },
  {
    id: 'tabs',
    name: '标签页',
    category: 'basic',
    icon: 'tabs',
    keywords: 'tabs 标签页 切换 tab',
    create: ctx => make('tabs', {
      name: '标签页',
      x: ctx.x, y: ctx.y,
      w: normWidth(ctx.width), h: 36,
      style: { font: { size: 'sm', weight: 500, color: 'muted', align: 'left' } },
      props: { items: ['全部', '进行中', '已完成'], active: 0 },
    }),
  },
  {
    id: 'table',
    name: '表格',
    category: 'basic',
    icon: 'table',
    keywords: 'table 表格 列表 数据 grid',
    create: ctx => make('table', {
      name: '表格',
      x: ctx.x, y: ctx.y,
      w: normWidth(ctx.width), h: 216,
      style: {
        fill: 'surface',
        radius: 'md',
        stroke: { color: 'border', width: 1 },
        font: { size: 'sm', weight: 400, color: 'text', align: 'left' },
      },
      props: {
        columns: ['名称', '状态', '金额'],
        rows: [
          ['订单 A-1024', '已完成', '¥1,280'],
          ['订单 A-1025', '进行中', '¥860'],
          ['订单 A-1026', '待付款', '¥2,400'],
        ],
        header: true,
      },
    }),
  },
  {
    id: 'chart',
    name: '图表',
    category: 'basic',
    icon: 'chart',
    keywords: 'chart 图表 柱状 折线 环形 data',
    create: ctx => make('chart', {
      name: '图表',
      x: ctx.x, y: ctx.y,
      w: normWidth(ctx.width), h: 160,
      props: { kind: 'bar', data: [12, 28, 20, 36, 18, 30], color: 'primary' },
    }),
  },
  {
    id: 'card',
    name: '卡片',
    category: 'basic',
    icon: 'card',
    keywords: 'card 卡片 面板 内容块',
    create: ctx => make('card', {
      name: '卡片',
      x: ctx.x, y: ctx.y,
      w: normWidth(ctx.width), h: 120,
      style: {
        fill: 'surface',
        radius: 'lg',
        stroke: { color: 'border', width: 1 },
        shadow: 'sm',
        font: { size: 'md', color: 'text', align: 'left' },
      },
      props: { title: '卡片标题', body: '这里是卡片的描述内容，可以放置任意说明文字。' },
    }),
  },
]

/* ------------------------------------------------------------------ */
/* composed blocks (14) — mobile-first (390 frame -> 358 usable)       */
/* ------------------------------------------------------------------ */

const BLOCK_PREFABS = [
  {
    id: 'navbar',
    name: '导航栏',
    category: 'blocks',
    icon: 'navbar',
    keywords: 'navbar header 导航 顶栏 头部 appbar',
    create({ x, y, width }) {
      const w = normWidth(width)
      const h = 56
      return make('box', {
        name: '导航栏',
        x, y, w, h,
        layout: { mode: 'absolute' },
        style: { fill: 'surface' },
        children: [
          make('box', { name: 'Logo', x: 16, y: 16, w: 24, h: 24, style: { fill: 'primary', radius: 'sm' } }),
          text('品牌名', { x: 50, y: 17, w: Math.max(80, w - 200), h: 22, size: 'lg', weight: 700, name: '品牌名' }),
          icon('搜索', { x: w - 96, y: 18, size: 20, color: 'muted' }),
          icon('通知', { x: w - 64, y: 18, size: 20, color: 'muted' }),
          make('avatar', {
            name: '头像',
            x: w - 36, y: 14, w: 28, h: 28,
            style: { fill: 'surface2', radius: 'full', font: { size: 'xs', weight: 600, color: 'text' } },
            props: { initials: 'AI' },
          }),
          make('divider', { name: '底边', x: 0, y: h - 1, w, h: 1, style: { stroke: { color: 'border', width: 1 } } }),
        ],
      })
    },
  },
  {
    id: 'hero',
    name: 'Hero 首屏',
    category: 'blocks',
    icon: 'hero',
    keywords: 'hero banner 首屏 头图 主视觉 宣传',
    create({ x, y, width }) {
      const w = normWidth(width)
      const compact = w < 520
      const h = compact ? 236 : 248
      return make('box', {
        name: 'Hero 首屏',
        x, y, w, h,
        layout: { mode: 'absolute' },
        children: [
          badge('全新版本', { x: 20, y: 24, w: 92, h: 24 }),
          text('为你的产品设计\n更好的界面', {
            x: 20, y: 60, w: w - 40, h: compact ? 70 : 76,
            size: '2xl', weight: 700, lineHeight: 1.25, name: '主标题',
          }),
          text('用 AI 快速搭建界面，从想法到可交付的设计稿只需几分钟。', {
            x: 20, y: compact ? 138 : 146, w: compact ? w - 40 : Math.min(w - 40, 520),
            h: 44, size: 'md', color: 'muted', name: '副标题',
          }),
          button('开始使用', { x: 20, y: h - 64, w: 132, h: 44 }),
          button('了解更多', { x: 164, y: h - 64, w: 120, h: 44, variant: 'ghost' }),
        ],
      })
    },
  },
  {
    id: 'stat-row',
    name: '数据指标',
    category: 'blocks',
    icon: 'stat',
    keywords: 'stat kpi 指标 数据 统计 数字',
    create({ x, y, width }) {
      const w = normWidth(width)
      const pad = 16
      const gap = 10
      const stats = [
        { label: '总用户', value: '12.4k', delta: '+12.4%' },
        { label: '活跃用户', value: '3,206', delta: '+8.1%' },
        { label: '转化率', value: '6.8%', delta: '+1.2%' },
      ]
      const cw = Math.floor((w - pad * 2 - gap * (stats.length - 1)) / stats.length)
      const h = 92
      const children = stats.map((stat, i) => make('box', {
        name: `${stat.label}卡片`,
        x: pad + i * (cw + gap), y: 0, w: cw, h,
        style: { fill: 'surface', radius: 'lg', stroke: { color: 'border', width: 1 } },
        children: [
          text(stat.label, { x: 12, y: 12, w: cw - 24, h: 18, size: 'xs', weight: 500, color: 'muted', name: '指标名' }),
          text(stat.value, { x: 12, y: 34, w: cw - 24, h: 30, size: 'xl', weight: 700, name: '指标值' }),
          text(stat.delta, { x: 12, y: 66, w: cw - 24, h: 16, size: 'xs', weight: 500, color: 'success', name: '变化' }),
        ],
      }))
      return make('box', { name: '数据指标', x, y, w, h, layout: { mode: 'absolute' }, children })
    },
  },
  {
    id: 'card-grid',
    name: '卡片网格',
    category: 'blocks',
    icon: 'grid',
    keywords: 'card grid 卡片 网格 功能 列表',
    create({ x, y, width }) {
      const w = normWidth(width)
      const pad = 16
      const gap = 12
      const cols = w >= 700 ? 3 : 2
      const cw = Math.floor((w - pad * 2 - gap * (cols - 1)) / cols)
      const items = [
        { title: '项目管理', body: '看板视图跟踪任务进度', icon: 'layout' },
        { title: '团队协作', body: '实时评论与提醒通知', icon: 'users' },
        { title: '数据分析', body: '关键指标一屏掌握', icon: 'chart' },
        { title: '自动化', body: '重复工作交给规则引擎', icon: 'zap' },
      ]
      const cardH = 116
      const rows = Math.ceil(items.length / cols)
      const children = items.map((item, i) => {
        const r = Math.floor(i / cols)
        const c = i % cols
        return make('box', {
          name: item.title,
          x: pad + c * (cw + gap),
          y: r * (cardH + gap),
          w: cw, h: cardH,
          style: { fill: 'surface', radius: 'lg', stroke: { color: 'border', width: 1 } },
          children: [
            iconTile('图标底', item.icon, { x: 14, y: 14, size: 30 }),
            text(item.title, { x: 14, y: 54, w: cw - 28, h: 20, size: 'md', weight: 600, name: '卡片标题' }),
            text(item.body, { x: 14, y: 78, w: cw - 28, h: 30, size: 'sm', color: 'muted', name: '卡片描述' }),
          ],
        })
      })
      return make('box', {
        name: '卡片网格',
        x, y, w,
        h: rows * cardH + (rows - 1) * gap,
        layout: { mode: 'absolute' },
        children,
      })
    },
  },
  {
    id: 'form',
    name: '表单',
    category: 'blocks',
    icon: 'form',
    keywords: 'form 表单 登录 注册 输入 提交',
    create({ x, y, width }) {
      const w = normWidth(width)
      const pad = 16
      const fieldH = 70
      const fields = [
        { label: '姓名', placeholder: '请输入姓名' },
        { label: '邮箱', placeholder: 'you@example.com' },
        { label: '密码', placeholder: '至少 8 位字符' },
      ]
      const h = pad * 2 + fields.length * fieldH + 52
      const children = []
      fields.forEach((field, i) => {
        const top = pad + i * fieldH
        children.push(text(field.label, { x: pad, y: top, w: w - pad * 2, h: 18, size: 'sm', weight: 500, color: 'muted', name: '字段名' }))
        children.push(make('input', {
          name: `${field.label}输入框`,
          x: pad, y: top + 22, w: w - pad * 2, h: 40,
          style: {
            fill: 'surface2',
            radius: 'md',
            stroke: { color: 'border', width: 1 },
            padding: [10, 12],
            font: { size: 'md', weight: 400, color: 'muted', align: 'left' },
          },
          props: { placeholder: field.placeholder },
        }))
      })
      children.push(button('提交', { x: pad, y: h - pad - 40, w: w - pad * 2, h: 40 }))
      return make('box', { name: '表单', x, y, w, h, layout: { mode: 'absolute' }, children })
    },
  },
  {
    id: 'sidebar-layout',
    name: '侧边栏布局',
    category: 'blocks',
    icon: 'sidebar',
    keywords: 'sidebar layout 侧边栏 后台 布局 工作台',
    create({ x, y, width }) {
      const w = normWidth(width)
      const h = 520
      const sideW = Math.min(216, Math.max(120, Math.round(w * 0.24)))
      const contentW = Math.max(0, w - sideW)
      const nav = [
        { label: '首页', icon: 'home' },
        { label: '项目', icon: 'folder' },
        { label: '团队', icon: 'users' },
        { label: '设置', icon: 'settings' },
      ]
      const navChildren = [
        make('box', { name: 'Logo', x: 16, y: 18, w: 24, h: 24, style: { fill: 'primary', radius: 'sm' } }),
        text('工作台', { x: 48, y: 19, w: Math.max(20, sideW - 64), h: 22, size: 'md', weight: 700, name: '产品名' }),
      ]
      nav.forEach((item, i) => {
        const active = i === 0
        navChildren.push(make('box', {
          name: item.label,
          x: 12, y: 60 + i * 44, w: sideW - 24, h: 36,
          style: { fill: active ? 'primary' : 'transparent', radius: 'md' },
          children: [
            make('icon', {
              name: '图标', x: 11, y: 9, w: 18, h: 18,
              style: { font: { color: active ? 'onPrimary' : 'muted' } },
              props: { name: item.icon },
            }),
            text(item.label, {
              x: 38, y: 9, w: Math.max(20, sideW - 70), h: 20,
              size: 'sm', weight: 500,
              color: active ? 'onPrimary' : 'muted',
              name: '菜单文字',
            }),
          ],
        }))
      })
      const cardW = Math.max(40, Math.floor((contentW - 60) / 2))
      const contentChildren = [
        text('项目概览', { x: 24, y: 22, w: Math.max(20, contentW - 48), h: 28, size: 'lg', weight: 700, name: '页面标题' }),
        make('box', {
          name: '指标卡片 A', x: 24, y: 66, w: cardW, h: 84,
          style: { fill: 'surface2', radius: 'lg' },
          children: [
            text('本周新增', { x: 14, y: 14, w: Math.max(16, cardW - 28), h: 18, size: 'xs', color: 'muted', name: '指标名' }),
            text('128', { x: 14, y: 36, w: Math.max(16, cardW - 28), h: 30, size: 'xl', weight: 700, name: '指标值' }),
          ],
        }),
        make('box', {
          name: '指标卡片 B', x: 24 + cardW + 12, y: 66, w: cardW, h: 84,
          style: { fill: 'surface2', radius: 'lg' },
          children: [
            text('完成率', { x: 14, y: 14, w: Math.max(16, cardW - 28), h: 18, size: 'xs', color: 'muted', name: '指标名' }),
            text('86%', { x: 14, y: 36, w: Math.max(16, cardW - 28), h: 30, size: 'xl', weight: 700, name: '指标值' }),
          ],
        }),
      ]
      const rows = ['项目 Alpha', '项目 Beta', '项目 Gamma', '项目 Delta']
      rows.forEach((label, i) => {
        contentChildren.push(make('box', {
          name: label,
          x: 24, y: 174 + i * 60, w: Math.max(20, contentW - 48), h: 48,
          style: { fill: 'surface2', radius: 'md' },
          children: [
            text(label, { x: 14, y: 14, w: Math.max(20, contentW - 120), h: 20, size: 'sm', weight: 500, name: '项目名' }),
            text('进行中', { x: contentW - 100, y: 15, w: 60, h: 18, size: 'xs', color: 'success', align: 'right', name: '状态' }),
          ],
        }))
      })
      return make('box', {
        name: '侧边栏布局',
        x, y, w, h,
        layout: { mode: 'absolute' },
        style: { fill: 'surface', radius: 'lg', stroke: { color: 'border', width: 1 } },
        children: [
          make('box', {
            name: '侧边栏',
            x: 0, y: 0, w: sideW, h,
            style: { fill: 'surface2', radius: 'lg' },
            children: navChildren,
          }),
          make('box', {
            name: '内容区',
            x: sideW, y: 0, w: contentW, h,
            children: contentChildren,
          }),
        ],
      })
    },
  },
  {
    id: 'table-page',
    name: '表格页',
    category: 'blocks',
    icon: 'table',
    keywords: 'table page 列表页 表格 数据 后台',
    create({ x, y, width }) {
      const w = normWidth(width)
      const h = 428
      const pad = 16
      const footerY = h - 52
      return make('box', {
        name: '表格页',
        x, y, w, h,
        layout: { mode: 'absolute' },
        children: [
          text('项目列表', { x: pad, y: 20, w: w - pad * 2, h: 26, size: 'lg', weight: 700, name: '页面标题' }),
          text('共 128 个项目，按更新时间排序', { x: pad, y: 50, w: w - pad * 2, h: 18, size: 'sm', color: 'muted', name: '页面描述' }),
          make('box', {
            name: '搜索框', x: pad, y: 82, w: Math.floor((w - pad * 2) * 0.56), h: 36,
            style: {
              fill: 'surface2', radius: 'md',
              stroke: { color: 'border', width: 1 },
              padding: [8, 12],
              font: { size: 'sm', color: 'muted' },
            },
            props: { placeholder: '搜索项目…', icon: 'search' },
          }),
          button('新建项目', { x: w - pad - 104, y: 82, w: 104, h: 36 }),
          make('table', {
            name: '数据表格',
            x: pad, y: 136, w: w - pad * 2, h: 244,
            style: {
              fill: 'surface', radius: 'md',
              stroke: { color: 'border', width: 1 },
              font: { size: 'sm', color: 'text', align: 'left' },
            },
            props: {
              columns: ['项目', '负责人', '状态'],
              rows: [
                ['项目 Alpha', '张三', '进行中'],
                ['项目 Beta', '李四', '已完成'],
                ['项目 Gamma', '王五', '已完成'],
                ['项目 Delta', '赵六', '进行中'],
              ],
              header: true,
            },
          }),
          text('共 128 条', { x: pad, y: footerY + 12, w: 120, h: 18, size: 'xs', color: 'muted', name: '分页信息' }),
          text('上一页 1 2 3 下一页', {
            x: w - pad - 180, y: footerY + 12, w: 180, h: 18,
            size: 'xs', color: 'muted', align: 'right', name: '分页',
          }),
        ],
      })
    },
  },
  {
    id: 'settings-list',
    name: '设置列表',
    category: 'blocks',
    icon: 'list',
    keywords: 'settings list 设置 列表 选项 菜单',
    create({ x, y, width }) {
      const w = normWidth(width)
      const pad = 16
      const groups = [
        { title: '账户', items: [{ label: '个人资料', icon: 'user' }, { label: '安全与登录', icon: 'shield' }, { label: '通知设置', icon: 'bell' }] },
        { title: '通用', items: [{ label: '主题外观', icon: 'star' }, { label: '语言与地区', icon: 'message' }] },
      ]
      const rowH = 52
      const groupHead = 26
      let cursor = pad
      const children = []
      groups.forEach(group => {
        children.push(text(group.title, {
          x: pad, y: cursor, w: w - pad * 2, h: 20,
          size: 'xs', weight: 600, color: 'muted', name: '分组标题',
        }))
        cursor += groupHead
        group.items.forEach((item, i) => {
          children.push(make('box', {
            name: item.label,
            x: pad, y: cursor, w: w - pad * 2, h: rowH,
            style: {
              fill: 'surface', radius: i === 0 ? 'md' : 'md',
              stroke: { color: 'border', width: 1 },
            },
            children: [
              iconTile('图标底', item.icon, { x: 12, y: 12, size: 28, fill: 'surface2', color: 'text' }),
              text(item.label, { x: 52, y: 16, w: w - pad * 2 - 100, h: 20, size: 'md', weight: 500, name: '设置项' }),
              icon('箭头', { x: w - pad * 2 - 32, y: 17, size: 18, color: 'dim' }),
            ],
          }))
          cursor += rowH + 6
        })
        cursor += 10
      })
      return make('box', { name: '设置列表', x, y, w, h: cursor, layout: { mode: 'absolute' }, children })
    },
  },
  {
    id: 'modal',
    name: '对话框',
    category: 'blocks',
    icon: 'modal',
    keywords: 'modal dialog 弹窗 对话框 确认',
    create({ x, y, width }) {
      const w = normWidth(width)
      const h = 340
      const cardW = Math.min(320, w - 32)
      const cardX = Math.round((w - cardW) / 2)
      const cardY = 60
      const cardH = 220
      return make('box', {
        name: '对话框',
        x, y, w, h,
        layout: { mode: 'absolute' },
        children: [
          make('box', {
            name: '遮罩', x: 0, y: 0, w, h,
            style: { fill: 'rgba(8,11,17,0.55)', radius: 'lg' },
          }),
          make('box', {
            name: '对话框卡片',
            x: cardX, y: cardY, w: cardW, h: cardH,
            style: {
              fill: 'surface',
              radius: 'lg',
              stroke: { color: 'border', width: 1 },
              shadow: 'lg',
              padding: 20,
            },
            children: [
              text('确认删除？', { x: 20, y: 20, w: cardW - 40, h: 26, size: 'lg', weight: 700, name: '标题' }),
              text('删除后将无法恢复，请确认是否继续操作。', {
                x: 20, y: 54, w: cardW - 40, h: 44,
                size: 'sm', color: 'muted', name: '正文',
              }),
              button('取消', { x: 20, y: cardH - 60, w: Math.floor((cardW - 52) / 2), h: 40, variant: 'ghost' }),
              button('确认', {
                x: 20 + Math.floor((cardW - 52) / 2) + 12,
                y: cardH - 60,
                w: Math.floor((cardW - 52) / 2),
                h: 40,
              }),
            ],
          }),
        ],
      })
    },
  },
  {
    id: 'toast',
    name: '提示条',
    category: 'blocks',
    icon: 'toast',
    keywords: 'toast 提示 通知 消息 浮层',
    create({ x, y, width }) {
      const w = Math.min(360, normWidth(width))
      const h = 56
      return make('box', {
        name: '提示条',
        x, y, w, h,
        style: { fill: 'surface', radius: 'md', stroke: { color: 'border', width: 1 }, shadow: 'md' },
        layout: { mode: 'absolute' },
        children: [
          make('box', {
            name: '成功图标', x: 12, y: 14, w: 28, h: 28,
            style: { fill: 'success', radius: 'full' },
            children: [make('icon', {
              name: '对勾', x: 7, y: 7, w: 14, h: 14,
              style: { font: { color: 'onPrimary' } },
              props: { name: 'check' },
            })],
          }),
          text('保存成功', { x: 50, y: 10, w: w - 96, h: 20, size: 'sm', weight: 600, name: '提示标题' }),
          text('设计稿已同步到本地文件', { x: 50, y: 30, w: w - 84, h: 18, size: 'xs', color: 'muted', name: '提示描述' }),
          icon('关闭', { x: w - 32, y: 20, size: 16, color: 'muted' }),
        ],
      })
    },
  },
  {
    id: 'empty-state',
    name: '空状态',
    category: 'blocks',
    icon: 'empty',
    keywords: 'empty 空状态 无数据 占位',
    create({ x, y, width }) {
      const w = normWidth(width)
      const h = 240
      return make('box', {
        name: '空状态',
        x, y, w, h,
        layout: { mode: 'absolute' },
        children: [
          make('box', {
            name: '图标底', x: Math.round((w - 64) / 2), y: 24, w: 64, h: 64,
            style: { fill: 'surface2', radius: 'full' },
            children: [make('icon', {
              name: '图标', x: 22, y: 22, w: 20, h: 20,
              style: { font: { color: 'muted' } },
              props: { name: 'folder' },
            })],
          }),
          text('还没有任何项目', {
            x: 24, y: 104, w: w - 48, h: 24,
            size: 'lg', weight: 600, align: 'center', name: '空状态标题',
          }),
          text('创建第一个项目，开始你的设计之旅。', {
            x: 24, y: 132, w: w - 48, h: 40,
            size: 'sm', color: 'muted', align: 'center', name: '空状态描述',
          }),
          button('新建项目', { x: Math.round((w - 124) / 2), y: 180, w: 124, h: 40 }),
        ],
      })
    },
  },
  {
    id: 'chat-list',
    name: '消息列表',
    category: 'blocks',
    icon: 'chat',
    keywords: 'chat list 消息 会话 聊天 列表',
    create({ x, y, width }) {
      const w = normWidth(width)
      const pad = 16
      const rowH = 64
      const people = [
        { name: '设计团队', message: '首页稿已经更新，请查收', time: '09:24', initials: 'DE' },
        { name: '张三', message: '这版配色我更喜欢', time: '09:02', initials: 'ZS' },
        { name: '李四', message: '表格组件还缺一个空状态', time: '昨天', initials: 'LS' },
        { name: '产品群', message: '王五：明天上午评审', time: '昨天', initials: 'PM' },
      ]
      const children = []
      people.forEach((person, i) => {
        const top = i * rowH
        children.push(make('avatar', {
          name: '头像', x: pad, y: top + 12, w: 40, h: 40,
          style: { fill: 'surface2', radius: 'full', font: { size: 'sm', weight: 600, color: 'text' } },
          props: { initials: person.initials },
        }))
        children.push(text(person.name, {
          x: pad + 54, y: top + 12, w: w - pad * 2 - 130, h: 18,
          size: 'sm', weight: 600, name: '会话名',
        }))
        children.push(text(person.message, {
          x: pad + 54, y: top + 34, w: w - pad * 2 - 76, h: 18,
          size: 'xs', color: 'muted', name: '最后消息',
        }))
        children.push(text(person.time, {
          x: w - pad - 44, y: top + 13, w: 44, h: 16,
          size: 'xs', color: 'dim', align: 'right', name: '时间',
        }))
        if (i < people.length - 1) {
          children.push(make('divider', {
            name: '分隔线', x: pad + 54, y: top + rowH - 1, w: w - pad * 2 - 54, h: 1,
            style: { stroke: { color: 'border', width: 1 } },
          }))
        }
      })
      return make('box', {
        name: '消息列表',
        x, y, w, h: people.length * rowH,
        layout: { mode: 'absolute' },
        style: { fill: 'surface', radius: 'lg', stroke: { color: 'border', width: 1 } },
        children,
      })
    },
  },
  {
    id: 'pricing',
    name: '价格方案',
    category: 'blocks',
    icon: 'pricing',
    keywords: 'pricing 价格 方案 订阅 套餐',
    create({ x, y, width }) {
      const w = normWidth(width)
      const pad = 16
      const gap = 12
      const cols = 3
      const cw = Math.floor((w - pad * 2 - gap * (cols - 1)) / cols)
      const cardH = 248
      const plans = [
        { name: '基础版', price: '¥0', features: ['1 个项目', '基础组件', '社区支持'], highlight: false },
        { name: '专业版', price: '¥49', features: ['无限项目', 'AI 辅助', '团队协作'], highlight: true },
        { name: '团队版', price: '¥199', features: ['不限成员', '导出源码', '专属支持'], highlight: false },
      ]
      const children = plans.map((plan, i) => make('box', {
        name: `${plan.name}卡片`,
        x: pad + i * (cw + gap), y: 0, w: cw, h: cardH,
        style: {
          fill: plan.highlight ? 'surface2' : 'surface',
          radius: 'lg',
          stroke: { color: plan.highlight ? 'primary' : 'border', width: plan.highlight ? 2 : 1 },
        },
        children: [
          text(plan.name, { x: 16, y: 18, w: cw - 32, h: 20, size: 'sm', weight: 600, color: 'muted', name: '方案名' }),
          text(plan.price, { x: 16, y: 46, w: cw - 32, h: 38, size: '2xl', weight: 700, name: '价格' }),
          text('/ 月', { x: 16, y: 86, w: cw - 32, h: 16, size: 'xs', color: 'dim', name: '周期' }),
          ...plan.features.map((feature, fi) => text(`· ${feature}`, {
            x: 16, y: 120 + fi * 24, w: cw - 32, h: 20,
            size: 'xs', color: 'muted', name: '权益',
          })),
          button(i === 1 ? '立即升级' : '选择方案', {
            x: 16, y: cardH - 56, w: cw - 32, h: 40,
            variant: plan.highlight ? 'primary' : 'ghost',
          }),
        ],
      }))
      return make('box', {
        name: '价格方案',
        x, y, w, h: cardH,
        layout: { mode: 'absolute' },
        children,
      })
    },
  },
  {
    id: 'footer',
    name: '页脚',
    category: 'blocks',
    icon: 'footer',
    keywords: 'footer 页脚 底部 版权 链接',
    create({ x, y, width }) {
      const w = normWidth(width)
      const h = 104
      return make('box', {
        name: '页脚',
        x, y, w, h,
        layout: { mode: 'absolute' },
        style: { fill: 'surface' },
        children: [
          make('divider', { name: '顶边', x: 0, y: 0, w, h: 1, style: { stroke: { color: 'border', width: 1 } } }),
          text('品牌名', { x: 16, y: 24, w: 120, h: 20, size: 'sm', weight: 700, name: '品牌' }),
          text('关于', { x: w - 176, y: 25, w: 40, h: 18, size: 'xs', color: 'muted', align: 'right', name: '链接' }),
          text('隐私', { x: w - 120, y: 25, w: 40, h: 18, size: 'xs', color: 'muted', align: 'right', name: '链接' }),
          text('联系', { x: w - 64, y: 25, w: 40, h: 18, size: 'xs', color: 'muted', align: 'right', name: '链接' }),
          make('divider', { name: '分隔线', x: 16, y: 64, w: w - 32, h: 1, style: { stroke: { color: 'border', width: 1 } } }),
          text('© 2026 Acme Inc. 保留所有权利。', {
            x: 16, y: 78, w: w - 32, h: 18,
            size: 'xs', color: 'dim', name: '版权',
          }),
        ],
      })
    },
  },
]

export const PREFABS = [...BASIC_PREFABS, ...BLOCK_PREFABS]

export default PREFABS
