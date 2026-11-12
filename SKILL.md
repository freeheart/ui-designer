---
name: ui-designer
description: 浏览器内的 AI 辅助 UI 设计器：Figma 式画布（画板/图层/拖拽缩放/吸附/属性面板/组件库/设计令牌），支持 AI 对话直接改稿、品评并一键应用优化建议，双通道（直连 OpenAI 兼容模型 / 编码 Agent 文件队列）。设计稿保存为可被 Agent 读写的 design.json，可导出 HTML/CSS、React+Tailwind 与设计令牌。当用户想设计、评审、迭代界面/原型/视觉稿，或需要把设计稿落地为前端代码时使用。Use when the user wants to design, critique, or iterate a UI, build a mockup/prototype, or turn a visual design into frontend code.
---

# UI Designer

把「设计稿 + 可视化编辑器 + AI 设计助手」搬进当前开发项目。设计稿是磁盘上的
`design.json`（单一事实来源），本地服务器把它渲染成可拖拽的 Figma 式画布；你可以像
前端工程师一样读写这份 JSON，用户则可以在画布里手动调整、在右侧和 AI 对话改稿/品评。

```
designs/<name>/design.json   ← 唯一事实来源（git 友好、可被 Agent 直接读写）
        │  server.mjs (127.0.0.1:4173)
        ├─→ 浏览器编辑器：画布 / 图层 / 属性 / 组件库 / AI 面板
        └─→ AI 双通道：① 直连 OpenAI 兼容模型  ② .ai/inbox 文件队列（交给本 Agent）
```

## 何时用这套流程

- 用户要在写代码前先定 UI：从一句话需求生成可交互的高保真设计稿。
- 用户已有页面/截图描述，要按现有设计系统改版、加状态、做响应式。
- 用户要评审界面（视觉层级、间距、对比度、一致性）并希望直接改好。
- 设计稿定稿后需要落地成 React+Tailwind 或 HTML/CSS，再在 Cursor 里继续开发。

## 快速开始

```powershell
# 1. 初始化设计稿（也可 --from "<skill>/references/example-design.json" 作为种子）
node <skill>/scripts/init.mjs --dir designs/home --name "我的应用" --width 390 --height 844

# 2. 启动设计器（--open 自动开浏览器；长期运行请用后台任务/终端）
node <skill>/scripts/server.mjs --design designs/home/design.json --port 4173 --open
```

浏览器打开 `http://127.0.0.1:4173/`。`<skill>` 是技能目录（SKILL.md 所在目录）。
不想先初始化？`node <skill>/scripts/demo.mjs --no-open` 会用 `references/example-design.json`
生成示例稿并启动服务，适合第一次验证安装。人类用户文档（安装/界面/FAQ）见仓库 `README.md`。
设计器快捷键：`P` 预览、空格/中键拖动画布、`Ctrl+滚轮` 缩放、`Ctrl+0` 适应画布、
方向键微移、`Shift+方向键` 10px、`Delete` 删除、`Ctrl+D` 复制、`Ctrl+Z/Shift+Z` 撤销/重做。

## 工作流 A：从需求生成设计稿（Agent 主导）

1. `init.mjs` 生成骨架（或 `--from` 复制示例后改写）。
2. 用 **ops** 批量添加节点，而不是手改 JSON：先写一个 ops 文件（数组），再
   `node <skill>/scripts/ops.mjs --design designs/home/design.json --ops ops.json`。
   一次可添加整棵子树（`node.children` 嵌套），因此「导航栏 + 卡片 + 列表」各用一次 add。
3. 每批 ops 应用后跑 `ops.mjs --validate` 与 `ops.mjs --summary`（后者给越界/对比度/
   点击区域警告），再对照 `references/design-spec.md` 修正。
4. 让用户打开设计器审阅；后续小改用 ops 增量修改，不要整页重写（保留 id，便于 AI 定位）。

构图规则（重要，直接影响观感）：

- 遵守 8pt 间距网格；移动端 390 宽常用 16 边距 / 358 内容宽，桌面 1280 宽常用 24–32 边距。
- 用 `theme` 令牌（`primary`/`surface`/`muted`/`text`…）而不是散落 hex；改主题只改令牌。
- 重复元素（列表项、指标卡）用 `layout.mode: "row" | "column"` + `gap`/`padding`/`align`，
  让后续增删自动重排；自由定位元素用默认 `absolute`。
- 每个 section 先放容器（fill/radius/padding），再把内容放进容器，层级清晰便于图层操作。
- 可用节点类型：box · text · button · input · image · icon · divider · badge · avatar ·
  toggle · checkbox · select · tabs · table · chart(bar|line|donut) · card。
- 需要现成模块时，让用户在设计器左侧「组件」里插入（导航栏/英雄区/指标行/卡片网格/
  表单/表格页/侧边栏布局/设置列表/弹窗/空状态/定价/聊天列表…），再按实际调整。

## 工作流 B：AI 对话改稿 / 品评（设计器内）

右侧 AI 面板有三种模式：**改稿**（直接改）、**品评**（只给建议 + 一键应用）、**一键优化**。

**通道 ①：直连模型**（推荐，体验最顺）

- 面板右上角齿轮 → 填 `Base URL`（OpenAI 兼容，如 `https://api.deepseek.com/v1`）、
  模型名、API Key，保存到 `~/.dsh/ui-designer.json`（不进项目、不进 git）。
- 也可用环境变量启动服务：`UI_DESIGNER_BASE_URL` / `UI_DESIGNER_API_KEY` /
  `UI_DESIGNER_MODEL` / `UI_DESIGNER_MODE=api|agent|auto`。
- 服务端负责调用与校验：模型只能返回 ops；解析/应用失败会自动带错误重试一次。

**通道 ②：Agent 文件队列**（没有 API Key 时自动启用）

设计器把请求写入 `designs/<name>/.ai/inbox/<requestId>.json`（含 message/selection/designPath）。
用户在编码对话里让你处理时，按下面流程做：

```powershell
$d = "designs/home/design.json"
# 1. 看有没有待处理请求（JSON 数组）
node <skill>/scripts/agent-bridge.mjs pending --design $d
# 2. 读设计稿（紧凑树，比整份 JSON 省 token）
node <skill>/scripts/ops.mjs --design $d --compact
# 3. 写 ops 文件并回复（reply 会先应用 ops、写回 design.json，再写 outbox；服务端把回复推回浏览器）
node <skill>/scripts/agent-bridge.mjs reply --design $d --id req-xxxxxxxx `
     --message "已把主按钮对比度提高到 7.2:1" --ops ops.json
```

回复约定：`--ops` 用于改稿；品评请求用 `--findings findings.json`（结构见
`references/review-rubric.md`），不要改稿。`--dry-run` 可先验证 ops。队列目录下的
`.ai/.gitignore` 已忽略 inbox/outbox，不要把请求文件提交进仓库。

## 工作流 C：品评（critique）

- 编辑器内「品评」模式会返回 findings 卡片，用户可逐条「应用建议」。
- Agent 侧品评时按 `references/review-rubric.md` 的维度给 3–6 条，严重度
  `high|medium|low`，每条给出 `targets`（节点 id）与 `suggestedOps`（可直接应用的修复）。
- 服务端会自动附加 `summarizeSpec` 的越界/对比度/点击区域警告，不要重复报同类问题。

## 工作流 D：导出并接入代码库

```powershell
# 三种格式：html（单文件可视化预览）/ react（React+Tailwind）/ tokens（设计令牌 CSS）
node <skill>/scripts/export.mjs --design designs/home/design.json --format all `
     --out src/design-export
```

- 导出结果与编辑器共用同一套样式计算（`assets/designer/js/shared/style.mjs`），
  圆角/间距/颜色令牌一致；`tokens.css` 里的 `:root` 变量可直接并入项目全局样式。
- React 导出是按画板生成的独立组件（绝对定位 + Tailwind arbitrary values + CSS 变量），
  拿到后按项目规范拆成组件、替换占位图片、接真实数据。
- 设计器内「导出」按钮等价（写入 `designs/<name>/export/`，可复制代码）。
- 交互/状态（hover、loading、空态）不在静态画板里，导出后由你在代码里补；需要多状态时
  在设计稿里加多个画板（`add-frame`）分别表达。

## 数据模型与命令速查

- 设计稿：`design.json`（version/name/theme/frames/rootIds/nodes），schema 详见
  `references/design-spec.md`；节点是扁平 `nodes` map + 树形 `children`。
- 修改设计稿只能通过三种途径：设计器 HTTP API、`ops.mjs`、`agent-bridge.mjs reply`。
  它们都会做 schema 校验；**不要绕过校验直接改 JSON**，否则设计器会拒绝加载。
- 设计器的唯一事实来源是磁盘文件：浏览器改动会自动保存；你改完文件后设计器会实时刷新。

| 命令 | 用途 |
|---|---|
| `init.mjs --dir <dir> --name <name>` | 新建 design.json + .ai 目录 |
| `server.mjs --design <design.json> --port <p> --open` | 启动设计器 |
| `ops.mjs --design <d> --ops <ops.json>` | 原子应用 ops |
| `ops.mjs --design <d> --validate` | schema 校验 |
| `ops.mjs --design <d> --compact` | 紧凑树（给模型/自己看） |
| `ops.mjs --design <d> --summary` | 统计 + 越界/对比度/点击区域警告 |
| `agent-bridge.mjs pending --design <d>` | 列出待处理 AI 请求 |
| `agent-bridge.mjs reply --design <d> --id <id> --message "..." --ops ops.json` | 回复并应用改稿 |
| `export.mjs --design <d> --format html\|react\|tokens\|all --out <dir>` | 导出代码 |

## 护栏

- **id 不可变**：AI ops、图层、历史都靠 id 定位；不要重命名已有 id，新增节点可省略 id 自动生成。
- **frame 根节点尺寸**用 `set-frame` 改，不能用 `set` 改根节点 w/h；根节点 w/h 必须等于画板尺寸。
- 不要在项目里提交 API Key；队列文件不要提交；`designs/` 建议提交（设计稿可 review）。
- 端口被占用时换 `--port`，或先结束旧服务；服务被关掉后浏览器会提示连接断开，重启即可。
- 越界/对比度问题以 `ops.mjs --summary` 与 `references/review-rubric.md` 为准，不要凭手感。
- 复杂改动先 `ops.mjs --compact` 看现状，再分批 ops；一次性重写整页会丢失用户手动调整。

## 参考文档

- `references/design-spec.md` — design.json 完整 schema、节点类型/默认样式、布局算法、校验规则。
- `references/ops-protocol.md` — 全部 ops、字段约束、错误与配方。
- `references/review-rubric.md` — 品评维度、严重度、findings 结构、常见问题模式。
- `references/prompts.md` — AI 系统提示词/返回 JSON 约定（直连与 Agent 通道共用）。
- `references/example-design.json` — 可直接 `init.mjs --from` 的完整示例（钱包首页，54 节点）。
