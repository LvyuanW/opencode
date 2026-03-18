# 编剧 AI 编辑器改造说明

更新时间：2026-03-18

## 1. 这次改造的目标

我们要把当前项目从“AI 编码工作台”逐步改造成“面向编剧和长文本创作的 AI 编辑器”。

目标不是简单删掉代码功能，而是完成一次产品心智迁移：

- 从代码仓库、终端、Review、Git、MCP、Worktree 这些开发者心智，迁移到大纲、场景、对白、人物、修订、连续性这些创作心智。
- 保留现有成熟的 LLM、Provider、Session、Skill 内核，避免把已经稳定的 AI 基础设施推倒重来。
- 把 Anthropic / Claude 风格的 Skill 兼容作为核心约束，因为未来剧本创作能力会高度依赖 Skill 生态。
- 用“模式切换 + 渐进替换”的方式演进，而不是一次性硬删代码能力。

一句话概括：我们不是重写一个新内核，而是在现有 AI 内核上，把产品外壳和工作流重构成编剧编辑器。

## 2. 当前改造策略

当前采用的是“保留内核，重做体验”的路线，而不是“先删功能再补产品”的路线。

核心判断如下：

- 低风险可复用：Provider、Session、Agent、Command、Skill、项目上下文、流式消息链路。
- 中风险需改造：前端会话页、默认 Agent 选择、输入提示、命令入口、Review 文案、侧边面板行为。
- 高风险暂缓处理：直接物理删除 Git、Terminal、Review、Worktree 相关实现。

这样做的原因是：

- LLM 与 Skill 能力已经成熟，直接复用收益很高。
- 前端目前虽然仍带有明显的 coding UI 气质，但已经足够承载第一阶段的 writer mode。
- 如果过早删除底层代码能力，容易破坏已有会话、文件、差异、权限、工具链路。

## 3. 当前代码库已经完成的工作

下面列的是已经在当前代码库里落地的内容，不是口头计划。

### 3.1 已新增 writer agent

系统里已经加入了专门的 `writer` agent，用于创作型任务，而不是复用默认 `build` agent。

相关实现：

- `packages/opencode/src/agent/agent.ts`
- `packages/opencode/src/agent/prompt/writer.txt`

已落地能力：

- `writer` 被注册为 primary agent。
- `writer` 的描述已经改为面向故事开发、场景草拟、修订、连续性检查。
- `writer` 使用专门 prompt，明确把工作区视为“写作项目”而不是“编码项目”。
- `writer` 保留 `skill` 能力，允许直接调用已安装 Skill。
- `writer` 的权限比默认 coding agent 更收敛，默认重点保留 `read`、`edit`、`glob`、`grep`、`skill`、`webfetch`、`todo` 等与写作相关的能力。

### 3.2 已新增写作命令模板

系统命令层已经加入一批写作导向命令，并直接绑定到 `writer` agent。

相关实现：

- `packages/opencode/src/command/index.ts`

当前已存在的写作命令：

- `/outline`
- `/scene`
- `/dialog`
- `/polish`
- `/character`
- `/continuity`

这些命令的意义不是“多加几个 prompt”，而是开始把产品从通用聊天器，往“编剧工作流入口”推进。

### 3.3 Anthropic / Claude Skill 兼容链路已保留

这部分是当前方案最重要的基础之一，而且已经是代码中的真实能力。

相关实现：

- `packages/opencode/src/skill/skill.ts`
- `packages/opencode/src/provider/provider.ts`

当前状态：

- Skill 扫描已经原生支持 `.claude/skills/**/SKILL.md`
- Skill 扫描已经原生支持 `.agents/skills/**/SKILL.md`
- 仍然支持 `.opencode/skill` / `.opencode/skills` 这类目录
- Provider 层继续保留 `@ai-sdk/anthropic`
- Provider 层继续保留 `@ai-sdk/google-vertex/anthropic`

这意味着：

- 未来编剧 Skill 可以直接走 Claude 风格目录组织，不需要重新设计一套完全不同的 Skill 协议。
- Anthropic 兼容不是未来目标，而是现有内核已经具备的能力。

### 3.4 前端已加入 workspace mode

前端设置中已经存在 `Workspace mode`，可在 `Code` 与 `Writer` 之间切换。

相关实现：

- `packages/app/src/context/settings.tsx`
- `packages/app/src/components/settings-general.tsx`

当前行为：

- 新增 `WorkspaceMode = "code" | "writer"`
- 默认仍是 `code`
- 设置页里已经提供 `Workspace mode` 切换项

这一步的意义是：改造已经不是“分叉一个完全独立的新产品”，而是在现有应用内引入产品模式。

### 3.5 writer mode 会默认选中 writer agent

本地会话状态层已经根据 `workspaceMode` 自动偏向 writer agent。

相关实现：

- `packages/app/src/context/local.tsx`

当前行为：

- 当工作区模式是 `writer` 时，默认会优先选择名为 `writer` 的 agent。
- 这让用户切换模式后，不需要每次手动再切换 agent。

### 3.6 输入区已经开始转向写作场景

会话输入框已经具备写作示例语料，而不再只围绕代码任务。

相关实现：

- `packages/app/src/components/prompt-input.tsx`
- `packages/app/src/i18n/en.ts`

当前表现：

- 保留原有 coding 示例
- 新增 writer 示例，例如三幕式大纲、冲突场景、对白润色、人物小传、连续性检查等
- 在 writer mode 下，会更自然地把用户引导到创作型 prompt

### 3.7 新会话页已经有 writer 文案

新会话空状态已经开始体现写作产品语义。

相关实现：

- `packages/app/src/components/session/session-new-view.tsx`
- `packages/app/src/i18n/en.ts`

当前表现：

- `code` 模式沿用原有会话标题
- `writer` 模式下使用 `Write your next scene`

这说明产品已经开始从“写代码”转向“写内容”。

### 3.8 writer mode 下已经隐藏部分 coding 入口

当前 writer mode 并不会删除底层代码能力，但会隐藏一部分明显偏开发者的入口。

相关实现：

- `packages/app/src/pages/session/use-session-commands.tsx`
- `packages/app/src/components/session/session-header.tsx`
- `packages/app/src/pages/session.tsx`

当前行为：

- 隐藏 terminal 按钮
- 隐藏 terminal 相关命令
- 隐藏 MCP 快捷入口
- 页面底部不再显示 TerminalPanel

这一步的目标不是“代码能力彻底消失”，而是先让 writer mode 的第一视觉和第一操作路径不再以编程为中心。

### 3.9 文件预览面板已在 writer mode 下保留

此前 writer mode 如果完全隐藏 review 区，文件预览窗口会一起消失，这不符合写作场景。当前代码已经保留了文件预览侧栏。

相关实现：

- `packages/app/src/pages/session.tsx`
- `packages/app/src/pages/session/session-side-panel.tsx`

当前行为：

- writer mode 下仍然保留右侧侧栏
- 文件打开后仍可在侧栏预览
- 当存在已打开文件或修订面板时，会自动展开文件树

这一步非常关键，因为编剧产品同样需要“边聊天边看正文/资料”。

### 3.10 Review 在 writer mode 中已开始转译为 Revisions

我们已经不再把这块能力只当作代码 diff review，而是开始转成写作语义里的“修订对比”。

相关实现：

- `packages/app/src/pages/session/use-session-commands.tsx`
- `packages/app/src/pages/session/session-side-panel.tsx`
- `packages/app/src/components/session/session-header.tsx`
- `packages/app/src/i18n/en.ts`

当前表现：

- writer mode 下 `Toggle review` 文案会改成 `Toggle revisions`
- 移动端/标签页中已经有 `Revisions`
- 空状态文案已经改成 revision compare 语义
- writer mode 不再用 “没有 Git 就无法查看变化” 这种开发者导向描述作为唯一表达

重要说明：

- 底层目前仍然复用了原来的 diff / review 机制。
- 也就是说，这一块已经完成“语义改造”，但还没有完成“视觉和交互模型改造”。

## 4. 当前状态的真实评价

当前产品状态可以概括为：

“内核与行为已经部分写作化，但 UI 外观仍然主要是 coding workspace。”

这意味着：

- 现在已经不是纯 coding 产品了。
- 但现在也还不是一个完整成熟的编剧编辑器。
- 当前阶段更准确的定义是“writer mode 过渡版本”。

这个阶段的优点：

- 改造风险可控
- 复用了成熟 AI 内核
- 已经能让用户开始以写作方式使用系统

这个阶段的不足：

- 视觉结构仍然偏工程工具
- 大纲、角色、场景、连续性这些创作对象还没有成为一等 UI 模型
- “Revisions” 底层还是 diff 体系，不是专门为写作者设计的修订系统

## 5. 我们接下来要做什么

后续建议分阶段推进，而不是一次性大改。

### 阶段一：稳固 writer mode

这一阶段的目标是让当前 `writer mode` 从“可用”变成“稳定可持续开发”。

建议项：

- 增加 writer mode 的端到端测试
- 明确 writer mode 下允许的文件类型，例如 `.md`、`.txt`、`.fountain`、`.yaml`
- 继续收敛 writer agent 的工具权限，避免无关 coding 行为误触发
- 检查所有 session 相关空状态、按钮文案、命令说明，去掉残余开发者表述
- 为 writer mode 建立专门的 smoke test 清单

阶段验收标准：

- 用户无需理解代码工作流，也能独立完成写作型会话
- 主要入口不再出现明显的开发者阻断
- Revisions 与文件预览在 writer mode 下稳定可用

### 阶段二：做真正的编剧工作台

这是最重要的一阶段，也是产品从“模式切换”升级为“垂类产品”的关键。

建议新增的一等界面对象：

- 大纲树
- 场景卡片
- 人物库
- 世界观/设定库
- 资料侧栏
- 连续性提示区

建议实现方式：

- 继续复用 `packages/opencode` 作为 AI orchestration 内核
- 优先在 `packages/app` 内完成 writer-specific UI 改造
- 等 writer 工作流稳定后，再评估是否拆出独立 app 包

阶段验收标准：

- 用户可以不依赖 slash 命令，仅通过界面完成主要创作流程
- 故事对象不再只是“文件”，而是“角色、场景、大纲、资料”这类结构化对象

### 阶段三：做写作领域工具

这一阶段不是继续堆通用 agent，而是补足创作专业能力。

建议优先实现的领域工具：

- Fountain 解析与预览
- 场景结构识别
- 人物出场与关系跟踪
- 连续性检查
- 时间线检查
- 人物口吻一致性检查
- 伏笔与回收提示

建议补充的命令或 Skill：

- Beat sheet 生成
- 幕结构调整
- 分场拆分
- 对白去解释化
- 场景目标与冲突强化
- 角色弧光检查

### 阶段四：重做修订体验

当前 Revisions 已经有了语义基础，但还没有成为真正适合编剧的修订系统。

建议演进方向：

- 从“代码 diff 面板”进化为“修订前 / 修订后”
- 支持段落级接受与撤销
- 支持场景级版本快照
- 支持对白改写对比
- 支持润色与重写的差异高亮

目标不是保留工程师的 review 心智，而是建立写作者的 revision compare 心智。

## 6. 目前还没有完成的内容

下面这些内容不要误判为“已经有了”。

- 还没有真正重做首页与主会话页视觉结构
- 还没有大纲树 UI
- 还没有场景卡片 UI
- 还没有角色库 UI
- 还没有 Fountain 专用编辑体验
- 还没有连续性检测面板
- 还没有写作对象级的数据模型
- 还没有把 Revisions 完全重做成写作者专用修订系统
- 还没有把所有 coding 术语和代码导向交互彻底清理干净

## 7. 为什么不建议现在就大删代码能力

这点需要明确记录。

不建议现在就大面积删除 Git、Terminal、Review、Worktree、Tool 等实现，原因有三点：

- 这些模块和现有会话、文件、修订、权限、消息链路存在复用关系
- 过早删除会提高回归风险
- 当前 writer mode 仍然依赖部分原有基础设施做过渡

更合理的路线是：

- 先从 UI 和默认工作流层面“去代码化”
- 再把真正不再需要的内核能力逐步下沉为隐藏能力或可选能力
- 最后再评估是否物理删除部分模块

## 8. 风险评估

当前总体风险判断：中等。

风险主要来自以下几类：

### 8.1 产品心智混杂

风险：

- 用户切到 writer mode 后，仍可能感受到 coding UI 残留。

应对：

- 持续替换文案、入口、布局、空状态和默认操作路径。

### 8.2 修订能力仍带工程化基因

风险：

- Revisions 虽然已改名，但底层仍基于 diff/review 体系。

应对：

- 后续优先把修订体验从工程语义升级到写作语义。

### 8.3 写作对象尚未结构化

风险：

- 目前系统仍偏“文件中心”，而不是“故事对象中心”。

应对：

- 下一阶段尽快建立角色、场景、大纲、设定等一等对象。

### 8.4 权限与工具仍偏通用

风险：

- writer agent 仍复用部分通用工具，存在行为越界的可能。

应对：

- 继续收敛 writer agent 的工具集合，并建立 writer-specific 测试集。

## 9. 我们当前已经达成的阶段性成果

到目前为止，这次改造已经完成了一个重要转折点：

- `writer` agent 已存在
- 写作命令已存在
- Anthropic / Claude Skill 兼容链路已保留
- 前端已经支持 `Workspace mode = Writer`
- writer mode 默认行为已经开始向写作任务倾斜
- 文件预览与修订对比已在 writer mode 中保留
- 部分 Review 语义已转成 Revisions

这说明项目已经从“纯编码助手”进入了“可被继续打磨成编剧编辑器”的阶段。

## 10. 下一步建议的明确实施顺序

建议严格按下面顺序推进：

1. 稳固 writer mode 的行为和测试
2. 重做 writer 首页和会话页布局
3. 建立大纲 / 场景 / 人物 / 设定 的结构化 UI
4. 补 Fountain 与连续性工具
5. 把 Revisions 重构成真正的写作修订系统
6. 最后再决定是否进一步物理下线部分 coding 模块

## 11. 结论

当前方向是正确的，而且第一阶段已经真实落地。

我们已经不再停留在“讨论要不要做编剧编辑器”的阶段，而是已经把内核、模式、Agent、命令和部分会话行为改到了正确方向上。

接下来最关键的任务，不再是证明这条路是否可行，而是把现在这个“writer mode 过渡版本”继续推进成真正的“编剧工作台”。
