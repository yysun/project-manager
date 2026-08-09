# Project Manager Skill — 中文用户指南

Project Manager 将一个文件夹变成可持续维护的项目工作区，让 Codex 能够规划、协调、
跟踪、审查和汇报项目。项目事实保存在可检查、可版本管理的 Markdown 文件中。
该 Skill 还提供 Project Manager Studio，用同一份项目数据展示看板和时间线。

## 快速开始

可以通过 `$project-manager` 调用 Skill，也可以直接使用下面的自然语言项目指令。

```text
project init /absolute/path/.projects/website-launch "安全上线新版网站"
project plan /absolute/path/.projects/website-launch
project studio /absolute/path/.projects/website-launch
```

项目指明确选择的文件夹，而不是它所在的代码仓库。尽量使用明确的绝对路径。
如果要求使用默认工作区，项目会创建在 `.projects/` 下。

## 常用指令

| 目标 | 向 Codex 发出的指令 |
| --- | --- |
| 创建项目 | `project init <folder> <objective>` |
| 将目标拆分为任务 | `project plan <folder>` |
| 新增/更新任务、处置状态、阻塞或证据 | `project update <folder> <change-or-evidence>` |
| 查看当前事实 | `project status <folder>` |
| 找出最值得执行的工作 | `project next <folder>` |
| 审查计划和证据 | `project review <folder>` |
| 审查单个任务的质量 | `project validate-task <folder> <task-id>` |
| 生成面向不同受众的报告 | `project report <folder> <operator\|project-manager\|executive\|board>` |
| 打开看板和时间线 | `project studio [folder]` |

可以直接使用自然语言。例如：

```text
使用 $project-manager 查看 /work/.projects/launch 中有哪些阻塞项。
使用 $project-manager 记录法务已经批准 TASK-CONTRACTS。
使用 $project-manager 新增一个确认上线供应商的任务。
使用 $project-manager 为 /work/.projects/launch 生成一份高管报告。
```

## Project Manager Studio

为单个独立项目启动 Studio：

```text
project studio /absolute/path/to/project
```

如果当前工作区包含 `.projects/`，也可以不指定文件夹启动 Studio，然后从其中有效的
一级子项目里选择：

```text
project studio
```

Studio 会打开一个受令牌保护的本地页面。看板和时间线共用同一份项目快照、筛选条件、
任务详情、校验流程和保存边界。

### 看板

- 用看板查看普通流程：Planned、Ready、Active 和 Done；Deferred 与 Cancelled 作为旁路状态显示。
- 按优先级、负责人和阻塞状态搜索或筛选。
- 打开任务可查看目标、验收条件、依赖、阻塞、证据状态和计划时间。
- 只有从未开始过的任务才能修改任务定义字段，或在 `planned` 与 `ready` 之间切换。

### 时间线设置

时间线需要项目开始日期和目标日期，以确定完整的项目时间范围。请在 `PROJECT.md`
中把两个值都设置为纯日期字符串：

```yaml
start_date: "2026-09-01"
target_date: "2026-11-30"
```

`target_date` 是项目计划结束日期。缺少任务日期的任务会明确显示为未排期；Skill 不会根据
任务状态、依赖关系、创建时间或证据自行推断日期。

### 使用时间线

- 时间线按周分列，并固定任务列，提供类似电子表格的排期视图。
- 蓝色区块代表已计划或正在执行的工作，橙色突出显示已验证或受阻的工作，绿色代表已完成的工作。
  任务状态文字仍会显示在任务列中。
- 拖动排期区块可整体移动它的日期范围。
- 拖动左侧或右侧手柄可调整开始或结束日期。
- 区块或手柄获得焦点后，可按左方向键或右方向键逐日调整。
- 拖动和键盘操作只会产生草稿。选择 **Save schedule** 保存，或选择 **Cancel** 放弃。
- 打开未排期任务，同时输入计划开始和结束日期。必须同时清空两个日期，才能恢复为未排期状态。
- 依赖日期冲突只会产生警告，不会自动修改排期，也不会改变任务的生命周期阻塞状态。

排期是规划元数据，不代表实际执行日期、进度、工作量、预测或完成证据。

## 编辑和生命周期规则

Project Manager 明确区分规划权限与执行证据：

- 从未开始过的任务可以修改规划字段，并使用 `planned` 或 `ready` 状态。
- 符合条件且尚未完成的任务，即使已经开始执行，仍可重新排期。
- 符合条件且尚未完成的任务可以独立延期、恢复或终止取消，不会混入任务定义或排期权限。
- 已完成任务、属于已完成里程碑的任务，以及已完成项目中的任务，都不能在 Studio 中重新排期。
- Studio 不会编辑任务 ID、实际执行日期、合同、清单、证据、执行尝试或重新验证状态。
- **Check changes** 会在不保存的情况下校验完整的候选项目。
- **Save** 会重新检查项目和任务版本，校验完整候选项目，然后以原子方式应用变更。

任务生命周期由证据驱动：

```text
planned → ready → in_progress → implemented → verification → verified → done
```

开始执行需要 Task Contract。后续生命周期推进需要经过验证的 Evidence Manifest。
一次提交、一个已关闭工单或一句肯定的状态说明，本身都不能作为完成证据。

Studio 默认把 `in_progress`、`implemented`、`verification` 和 `verified` 投影为 **Active**；
任务详情仍保留完整生命周期、合同和证据清单。

### 严格度配置

- `minimal` 与 `standard`：从未开始、且符合条件的人工任务可以通过一次 `project update`
  和明确审批完成；系统仍会原子写入标准的不可变合同与已验证证据清单。
- `controlled`：人工任务也必须按受控流程启动并用证据推进。
- Agent、External 和 RPD 任务在所有配置中都使用受控执行。

如果任务存在阻塞、未完成依赖、已有执行历史、已延期/取消，或一条审批无法满足自定义证据
要求，轻量完成会拒绝执行。

### 延期与取消

处置状态独立于生命周期。延期会暂停任务，之后可恢复；取消是终态。两者都不会进入下一任务
推荐；取消也不会满足依赖或证明项目成功。

## 项目文件

每个项目最初包含三个文件：

- `PROJECT.md` — 项目标识、目标、成功标准、负责人、状态和项目日期。
- `TASKS.md` — 任务定义、生命周期状态、依赖、阻塞和可选排期。
- `STATUS.md` — 从权威状态生成的派生缓存；不要把它作为项目事实直接编辑。

只有项目确实需要时，才会加入里程碑、风险、决策、来源、可追溯关系、变更、报告和
不可变执行记录等可选文件。

## 任务排期

已排期任务使用 `TASKS.md` schema v2 或 v3 保存包含首尾日期的时间范围：

```json
{"outcome":"上线素材已经准备完成。","acceptance":["市场团队批准所有素材。"],"scheduled_start":"2026-09-08","scheduled_end":"2026-09-12"}
```

两个排期字段必须同时存在或同时缺省，并且开始日期不能晚于结束日期。第一次保存排期时，
只会把 `TASKS.md` 从 schema v1 升级到 v2。清空全部任务排期不会自动降级文件版本。

第一次修改处置状态会把 TASKS 升级到 schema v3，并保留已有排期。Schema v3 只持久化
非 active 的处置状态及其 RFC3339 变更时间。

## 常见问题

### 时间线没有有效的项目范围

在 `PROJECT.md` 中同时设置 `start_date` 和 `target_date`，然后校验或刷新项目。

### 无法编辑任务

任务可能已经有执行历史、属于已完成里程碑、任务本身已经完成，或者项目已经完成。
请在任务对话框中查看只读原因。

### 任务无法变为 Ready

Ready 任务不能有明确的阻塞项，并且所有依赖任务都必须已经处于 Done 状态。

### Studio 提示项目已经变更

Studio 加载后，另一个进程修改了项目。请刷新并检查最新事实，然后重新应用本次编辑，
不要覆盖并发变更。

### `STATUS.md` 已过期

以 `PROJECT.md` 和 `TASKS.md` 为准。让 Project Manager 校验或更新项目，以安全地重新生成
派生状态缓存。

## 安全模型

- Project Manager 只读写明确选择的项目文件夹。
- Studio 只绑定到回环地址，并要求使用生成的访问令牌。
- 候选变更通过完整项目校验后，才会以原子方式替换现有内容。
- 已有合同、证据、报告和执行尝试历史保持不可变。
- 未知的日期、预测、负责人或覆盖率会明确保留为未知，不会被自行推断。

完整文件 schema 和集成细节请参阅 `SKILL.md` 和 `references/` 目录。
