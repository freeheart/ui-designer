# Ops 协议

所有设计稿修改都表达为 **ops 数组**。设计器的 AI 改稿、Agent 回复、`ops.mjs` CLI 共用
`designer-core.mjs#applyOps`：先深拷贝设计稿，逐个应用，统一校验；**任何一步失败则整体不生效**
（原子性），已持久化的设计稿不受影响。

```bash
node scripts/ops.mjs --design designs/home/design.json --ops ops.json
# stdin 也可以：cat ops.json | node scripts/ops.mjs --design ... --ops -
# 只验证不落盘：--dry-run；打印结果 JSON 而不写文件：--stdout
```

`ops.json` 可以是 `[ {...}, {...} ]`，也可以是 `{ "ops": [ ... ] }`。

## 操作一览

### add — 添加节点（支持整棵子树）

```json
{ "op": "add", "parent": "f-main", "index": 0,
  "node": {
    "type": "card", "name": "指标卡", "x": 16, "y": 120, "w": 358, "h": 120,
    "style": { "fill": "surface", "radius": "lg", "stroke": { "color": "border", "width": 1 } },
    "children": [
      { "type": "text", "name": "标签", "x": 16, "y": 16, "w": 200, "h": 18,
        "props": { "text": "本月活跃" }, "style": { "font": { "size": "sm", "color": "muted" } } },
      { "type": "text", "name": "数值", "x": 16, "y": 42, "w": 240, "h": 36,
        "props": { "text": "12,480" }, "style": { "font": { "size": "2xl", "weight": 700 } } }
    ]
  }
}
```

- `parent`：节点 id 或 frame id（frame id 自动解析为根节点）。`index` 省略时追加到末尾。
- `node.id` 省略时按类型自动生成（`text`、`text-2`…）；显式 id 必须 kebab-case 且唯一。
- `node.children` 可递归嵌套；嵌套节点的 `parent` 自动设置，不要手写。
- `x/y/w/h` 省略时有按类型的默认尺寸；建议总是显式给，保证布局可控。

### remove — 删除节点（含子孙）

```json
{ "op": "remove", "id": "n-old" }
```

不能删 frame 根节点（用 `remove-frame`）。

### set — 修改节点属性（最常用）

```json
{ "op": "set", "id": "n-title", "path": "props.text", "value": "新的标题" }
{ "op": "set", "id": "n-btn",  "path": "style.fill", "value": "primary" }
{ "op": "set", "id": "n-btn",  "path": "style.font.weight", "value": 700 }
{ "op": "set", "id": "n-card", "path": "layout.mode", "value": "column" }
{ "op": "set", "id": "n-card", "path": "layout.gap", "value": 12 }
{ "op": "set", "id": "n-card", "path": "layout.padding", "value": 16 }
{ "op": "set", "id": "n-x",    "path": "hidden", "value": true }
```

- path 允许的首段：`name | x | y | w | h | opacity | hidden | locked | style.* | layout.* | props.*`。
- 数组/对象值（如 `layout.padding: [16,16]`、`props.items`）整体替换。
- 传 `null` 清空（如 `style.stroke` 去边框、`style.shadow` 去阴影）。
- frame 根节点的 `w/h` 不允许 set，用 `set-frame`。

### move / reorder — 换父节点 / 调整顺序

```json
{ "op": "move", "id": "n-item", "parent": "n-list", "index": 2 }
{ "op": "reorder", "id": "n-item", "index": 0 }
```

`move` 不能把节点移进自己的子孙；`index` 超出范围会被夹到有效区间。

### duplicate — 复制子树

```json
{ "op": "duplicate", "id": "n-row", "newId": "n-row-2" }
```

`newId` 可省略；子孙 id 自动派生（`n-avatar-copy` 等），插在源节点后面。返回值 `results`
里带新根 id（可用于后续 op 引用）。

### 画板操作

```json
{ "op": "add-frame", "frame": { "id": "f-detail", "name": "详情", "x": 440, "y": 0,
                                "width": 390, "height": 844, "background": "bg" } }
{ "op": "set-frame", "id": "f-main", "path": "width", "value": 768 }
{ "op": "set-frame", "id": "f-main", "path": "background", "value": "surface" }
{ "op": "remove-frame", "id": "f-detail" }
```

`set-frame` 支持 `name/x/y/width/height/background`；改尺寸会同步根节点 w/h 与画板背景。

### set-theme — 修改设计令牌

```json
{ "op": "set-theme", "path": "colors.primary", "value": "#8b5cf6" }
{ "op": "set-theme", "path": "radius.md", "value": 10 }
{ "op": "set-theme", "path": "font", "value": "Inter" }
```

支持 `font` 或 `colors/radius/space/fontSize/shadow` 下的任意 token（可新增 token 名）。
颜色值非空字符串；数值组必须是数字；`shadow` 必须是 CSS 阴影字符串。

## 返回值与错误

`applyOps` 返回 `{ spec, results }`：`results[i]` 形如 `{ op, id?, path?, parent?, index? }`，
`add`/`duplicate` 的 `id` 是新节点 id。CLI 会打印：

```json
{ "ok": true, "opCount": 2, "results": [...], "nodeCount": 131 }
```

失败时抛 `OpsError`，CLI 打印并退出码 1：

```json
{ "ok": false, "index": 1, "error": "第 2 个操作（set）失败：节点不存在：n-typo" }
```

常见错误：节点/frame 不存在；id 重复或非 kebab-case；数字字段传了字符串；未知 op；
删除 frame 根节点；根节点 set w/h；把节点 move 进自己的子孙；应用后设计稿校验失败
（例如改 w/h 后导致越界不校验，但破坏了 parent 链会报错）。

## 配方

**改整页配色**：`set-theme` 一到两次即可（`colors.primary`、`colors.surface`），不要逐节点改。

**把卡片里内容改为纵向排布**：给卡片 `set layout.mode=column`、`gap=12`、`padding=16`，
子节点保持当前 w/h（或 `set` 调整），布局会自动重排。

**列表增删**：结构相同就 `duplicate` 一项，再 `set` 改文案/数值；需要新结构才 `add`。
列表容器建议用 `layout.mode:"column"`，新增项会自然排开。

**换图**：`set props.src`（https URL 或项目内可访问路径）；图像占位时保持 w/h。

**响应式**：不要缩放坐标，另开一个画板（`add-frame` 宽度 768/1280），按新宽度重排关键
section（通常是 `layout.mode` + 宽度/边距调整）。

**批量改一组同类节点**：在 ops 数组里逐条 `set`；先 `ops.mjs --compact` 拿到 id 列表。
不要用未定义的选择器语法（协议没有 CSS 选择器）。

**先验证再落盘**：`ops.mjs --ops ops.json --dry-run`，确认后去掉 `--dry-run`；
复杂改动可以一次写多批，每批后用 `--validate` + `--summary` 自查。
