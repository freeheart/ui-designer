# AI 提示词与返回约定

设计器的 AI 面板有两条通道，**共用同一套提示词约定与 JSON 结构**：

- 直连通道：`server.mjs` 调 `js/prompts.mjs#buildMessages` 组装消息，`js/llm.mjs#callLLM`
  请求 OpenAI 兼容接口，`parseAIResponse` 解析返回。
- Agent 通道：请求进入 `.ai/inbox`，由你（编码 Agent）读取、按本文件约定处理，再用
  `agent-bridge.mjs reply` 回复。

## 模式

| 模式 | 行为 | 返回 |
|---|---|---|
| `apply` 改稿 | 根据用户消息修改设计稿 | `reply` + `ops` |
| `polish` 一键优化 | 在不改变信息结构的前提下做一轮系统优化 | `reply` + `ops` |
| `critique` 品评 | **不改稿**，给建议 | `reply` + `findings` |

## 返回 JSON（严格）

```jsonc
{
  "reply": "给用户看的一句话说明（中文，尽量 ≤60 字）",
  "ops": [ /* apply/polish 模式：要应用的修改；critique 为 [] */ ],
  "findings": [ /* critique 模式：3–6 条；其它模式为 [] */ ],
  "question": null  // 需要用户澄清时填一句话，否则 null
}
```

- 只输出一个 JSON 对象；**不要 markdown 围栏、不要前后解释**。服务端会剥离 ```json 围栏、
  容忍尾逗号并尝试找平衡括号，但严格 JSON 最稳。
- `ops` 必须符合 `references/ops-protocol.md`，并且能通过 `applyOps` 校验；宁可少改也不要
  给非法 op（非法时服务端会把错误回灌，自动重试一次；仍失败则报错给用户）。
- `findings` 结构见 `references/review-rubric.md`；`suggestedOps` 同样必须是合法 op。
- 用户语言是中文时用中文回复；设计稿里的文案保持用户原有语言。

## 系统提示词要点（`buildMessages` 生成）

1. 你是资深产品/视觉设计师，在**可视化编辑器**中工作；用户能直接看到画布，回复要短。
2. 你**只能通过 ops 改稿**；不要输出完整 design.json，不要重写整页。
3. 保持已有节点 id 不变；只改必要的字段；新增节点优先放进合适的容器。
4. 遵守设计系统：使用 theme 令牌（`primary`/`surface`/`text`/`muted`/`border`…）、
   8pt 间距（4/8/16/24/32/48）、字号阶梯（xs/sm/md/lg/xl/2xl）、统一圆角。
5. 可读性优先：正文对比度 ≥ 4.5:1，大字号/粗体 ≥ 3:1；点击区域 ≥ 32px。
6. 保留用户的布局意图；不要为了「好看」删掉功能元素。
7. 品评模式只给 findings，不改稿；每条给精确 targets 与可执行的 suggestedOps。
8. 不确定时返回 `question` 询问，而不是猜着大改。

## 请求里会带什么

`buildMessages` 会拼装：

- 系统提示词（含模式说明、ops 语法摘要、设计原则、返回 JSON 契约）。
- 当前设计稿的紧凑树（`designer-core.mjs#compactSpec`，超 12k 字符截断）。
- tokens 摘要（`tokensForPrompt`）与机械告警（`summarizeSpec`）。
- 当前选中节点 id；用户消息；最近 8 条对话历史。

服务端还会：把 `mode` 映射到提示词、限制 `maxTokens`、请求超时 120s（可配
`timeoutMs`）、自动重试一次（解析失败或 ops 失败）。

## Agent 通道的处理示例

```powershell
# 1) 待处理请求
node scripts/agent-bridge.mjs pending --design designs/home/design.json
# 2) 看当前稿子
node scripts/ops.mjs --design designs/home/design.json --compact
# 3) 写 ops（改稿）或 findings（品评），然后回复
node scripts/agent-bridge.mjs reply --design designs/home/design.json `
  --id req-1a2b3c4d --message "已调整主按钮对比度并统一卡片圆角" --ops ops.json
```

如果你选择直接编辑 `design.json`（手工或脚本），也必须经过校验：回复前跑
`node scripts/ops.mjs --design <d> --validate`；设计器会实时加载磁盘改动，但非法 JSON
会被拒绝并保持上一版。

## 质量自检（回复前）

- ops 能用 `applyOps` 通过、且效果符合 `reply` 的描述。
- 没有把 `w/h` 改成负数、没有把节点移到画板外（用 `--summary` 看越界）。
- 没有改已有 id、没有删 frame 根节点。
- 品评的 targets 都存在，suggestedOps 真的是「一键能变好」的最小改动。
- 回复里不要出现「作为 AI」「建议您」等空话；直接说改了什么/问题是什么。
