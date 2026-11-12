# design.json 规格

设计稿是一份 JSON（UTF-8，2 空格缩进）。它必须能通过 `designer-core.mjs#validateSpec`：
设计器、ops CLI、Agent 回复、导出器都依赖同一个校验器。写设计稿前先读本文件。

## 顶层结构

```jsonc
{
  "version": 1,
  "name": "设计稿名称",              // 非空字符串，导出 HTML 的 <title>
  "theme": { /* 设计令牌，见下 */ },
  "frames": [ /* 画板，至少一个也可以为空 */ ],
  "rootIds": { "f-main": "f-main-root" },   // 画板 id -> 根节点 id
  "nodes": { "f-main-root": { /* 节点 */ } }
}
```

校验会拒绝：version 不是 1、theme 结构缺失、frame 尺寸非正、根节点尺寸与画板不一致、
节点 id 非 kebab-case、id 重复、parent/children 不一致、孤立节点、循环引用、
node.type/opacity/layout 枚举非法、frame 根节点 parent 不为 null 等。

## theme 令牌

```jsonc
"theme": {
  "font": "system-ui",
  "colors":    { "bg": "#0b0f17", "surface": "#111827", "surface2": "#1b2436",
                 "text": "#e5e7eb", "muted": "#94a3b8", "primary": "#6366f1",
                 "onPrimary": "#ffffff", "border": "#263244",
                 "success": "#22c55e", "warning": "#f59e0b", "danger": "#ef4444" },
  "radius":    { "sm": 4, "md": 8, "lg": 12, "xl": 20, "full": 999 },
  "space":     { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32, "2xl": 48 },
  "fontSize":  { "xs": 12, "sm": 13, "md": 15, "lg": 18, "xl": 24, "2xl": 32 },
  "shadow":    { "sm": "...", "md": "...", "lg": "..." }
}
```

- token 名允许 camelCase / kebab-case / 数字（`onPrimary`、`2xl`）。
- 颜色/圆角/间距/字号/阴影字段都可以写**token 名**或字面量（`"primary"` 或 `"#6366f1"`、
  `"md"` 或 `8`、`"sm"` 或 CSS 阴影字符串）。找不到 token 时按 CSS 字面量处理。
- 改令牌是最高杠杆的全局调整：一次 `set-theme` 会同步所有引用它的节点（编辑器与导出都一致）。

## 画板 frame

```jsonc
{ "id": "f-home", "name": "首页", "x": 0, "y": 0, "width": 390, "height": 844, "background": "bg" }
```

- `x/y` 是画板在画布上的位置（用于并排多个画板），与内容坐标无关。
- `background` 是 token/颜色；它同时是根节点 `style.fill`（二者保持一致，用 `set-frame` 修改）。
- 每个画板在 `rootIds` 里对应一个**根节点**：`type: "box"`、`parent: null`、`x=y=0`、
  `w/h` 与画板一致、`layout.mode: "column"`（或 `absolute`）。

## 节点

```jsonc
{
  "id": "n-title",                 // 全局唯一，kebab-case，创建后不要改
  "type": "text",                  // 见节点类型
  "name": "标题",                   // 图层显示名，可改
  "parent": "f-home-root",         // 根节点为 null
  "children": ["n-sub"],
  "x": 20, "y": 42, "w": 220, "h": 26,   // 相对父节点的绝对坐标（px）
  "opacity": 1,                    // 0-1
  "hidden": false,
  "locked": false,
  "layout": { "mode": "absolute", "gap": 0, "padding": 0, "align": "start", "justify": "start" },
  "style": { "fill": "surface", "radius": "lg", "stroke": { "color": "border", "width": 1 },
             "shadow": "sm", "padding": null, "font": { "size": "md", "weight": 400, "color": "text" } },
  "props": {}
}
```

### 布局

- `layout.mode: "absolute"`（默认）：子节点用自己的 `x/y`。
- `layout.mode: "row" | "column"`：子节点按 `children` 顺序自动排列：
  - 主轴：顺序排列，间隔 `layout.gap`；`padding` 是容器内边距（`layout.padding` 优先，
    否则 `style.padding`）；`justify: start|center|end|between` 控制主轴分布。
  - 交叉轴：`align: start|center|end|stretch`（stretch 时子节点交叉轴尺寸撑满）。
  - 子节点的 `x/y` 会被布局覆盖（保留原值作为 absolute 回退）；子节点 `w/h` 生效。
  - 编辑器中在自动布局容器里拖拽子节点 = 在兄弟间重排序，不会破坏布局。
- 容器有 `style.padding` 时，绝对定位子节点不受影响（绝对定位相对 padding box 外沿），
  只有 `row/column` 布局和内置内容（card 标题/正文、table 等）使用内边距。

### 节点类型与 props

| type | props | 说明 |
|---|---|---|
| `box` | – | 通用容器；可承载 children |
| `text` | `{ text }` | 纯文本；字体由 `style.font` 控制，自动换行 |
| `button` | `{ label, icon? }` | 居中文字；`icon` 取图标名 |
| `input` | `{ placeholder, value?, icon? }` | 单行输入框外观 |
| `image` | `{ src?, fit? }` | 无 `src` 显示棋盘占位；`fit: cover|contain` |
| `icon` | `{ name, color?, strokeWidth? }` | 图标名见下表；颜色可写 token |
| `divider` | – | 1px 分割线，颜色取 `style.stroke.color` |
| `badge` | `{ text, tone? }` | `tone: primary|success|warning|danger|muted`，自带胶囊底 |
| `avatar` | `{ src?, initials? }` | 圆形头像；无图时显示首字母 |
| `toggle` | `{ checked? }` | 开关 |
| `checkbox` | `{ checked?, label? }` | 复选框 + 文案 |
| `select` | `{ value?, placeholder? }` | 下拉框外观（带 chevron） |
| `tabs` | `{ items: string[], active? }` | 下划线标签页 |
| `table` | `{ columns: string[], rows: string[][], header? }` | 简易表格 |
| `chart` | `{ kind: "bar"|"line"|"donut", data: number[], color? }` | 内联 SVG |
| `card` | `{ title?, body? }` | 有 children 时忽略 title/body |

可用图标名：`search bell user users settings home plus check chevron-down chevron-right
arrow-right x menu star heart chart calendar folder logout edit trash filter more
trending-up trending-down message shield zap grid layout`。未知名字回退为 `more`。

### 各类型默认样式（`style` 未写时生效）

| type | 默认 |
|---|---|
| `text` | 字号 `md`，颜色 `text`，常规字重，行高 1.5 |
| `button` | 填充 `primary`，文字 `onPrimary`、字重 600、居中，圆角 `md`，内边距 `[10,16]` |
| `input` | 填充 `surface2`，1px `border` 描边，圆角 `md`，内边距 `[10,12]`，文字 `muted` |
| `image` | 填充 `surface2`，圆角 `md` |
| `icon` | 无填充，颜色 `text` |
| `divider` | 1px `border` |
| `badge` | 无填充；胶囊底由 tone 决定，字号 `xs` |
| `avatar` | 填充 `surface2`，全圆角，字重 600 |
| `toggle` | 无填充；开/关外观由 checked 决定 |
| `checkbox` | 无填充；方框由 checked 决定 |
| `select` | 填充 `surface2`，`border` 描边，圆角 `md` |
| `tabs` | 无填充，字号 `sm`，颜色 `muted` |
| `table` | 填充 `surface`，`border` 描边，圆角 `md`，字号 `sm` |
| `chart` | 无填充，主题色 `primary` |
| `card` | 填充 `surface`，`border` 描边，圆角 `lg`，内边距 `lg`，阴影 `sm` |

`style` 只需要写**覆盖项**；导出与编辑器都按同一张表合并（`js/shared/style.mjs` 的
`TYPE_DEFAULTS`），所以手写 style 不会出现「编辑器好看、导出变样」。

## 从模型视角看设计稿

`ops.mjs --compact` 输出紧凑树，适合喂给模型或自查：

```
设计稿: Acme · 2 frame(s)
tokens: font=system-ui | colors: bg=#0b0f17, surface=#111827, ... | radius: ... | space: ...
frame f-main "首页" @0,0 390x844 bg=bg
  f-main-root box "首页" 390x844 fill=bg layout=column
    n-header box "顶部栏" @0,0 390x96 fill=surface
      n-title text "标题" @20,42 220x26 size=xl w=700 "林小满"
```

每行：`id type "name" @x,y WxH` + 显式写出的 style 覆盖项 + layout + props 摘要。
大稿会截断（`…（设计稿过大已截断）`），此时应基于 id 增量修改而非重建。

## 校验规则速记

- frame 根节点：`parent: null`、`w/h === frame.width/height`、`rootIds` 映射存在。
- 所有节点必须从某个 frame 根节点可达（不能有孤立节点）。
- `children` 与 `parent` 必须互相一致；不能循环。
- 数字必须有限；`opacity ∈ [0,1]`；`w/h ≥ 0`；frame 尺寸 > 0。
- token 名合法；`layout.mode/align/justify` 枚举合法。
- 修改后可随时用 `node scripts/ops.mjs --design <d> --validate` 复查。
