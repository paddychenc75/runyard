# 快速打开与大量终端输出的真实包性能验收

来源：desktop/editor 的 EDITOR-74、desktop/terminal 的 TERMINAL-24，issue #267，PRD #prd-editor、PRD #prd-terminal。

## 测量前提

- 产品代码基线为 `f4021092`，不加产品接口、不调整阈值。使用同代码的真实 e2e 包，只有调试连接开关与发行包不同；不安装这个包。
- Apple M3 Max、48 GiB、macOS 27.0.1（26A434）；测量驱动 Node 24.21.0，应用 Electron 44.5.1。
- 三轮各用新应用、临时 HOME/root 和真实磁盘文件；固定环境，开始前由协调人确认其它 verify、构建、截图任务都停止。不清操作系统文件缓存，因此是新应用实例，不称整机冷缓存。
- 每轮输出独立 JSON；不挑最好的一轮，不遇失败便重复直到通过。截图及原始数据写在新建临时目录，不能覆盖前一轮证据。

## EDITOR-74

每轮在依赖目录之外创建 10000 个真实文本文件，另外保留 HTML 模板自带文件。正常打开项目会由产品自动读取文件清单；夹具不额外调用或预热 files.listAll。先从文件树打开两个文件，建立真实的最近文件列表，然后首次按下⌘P。空查询按既定产品规则显示最近文件，不把“最近文件列表出现”描述为“10000个列表行全部绘制”。

四次逐字查询为 z、ze、zet、zeta；每组对应不同前缀的2500个真实文件，要求实际结果包含对应文件、100个可用结果且输入值正确，避免只量输入框变字或把旧列表当成新结果。

- 页面内起点：真实键盘 keydown 的捕获监听（⌘P为p，筛选为本次新增字符），使用 performance.now。
- DOM终点：MutationObserver首次看到本次期望列表内容；绘制近似终点：其后两个 requestAnimationFrame。该值用来核对首开≤200ms、每字≤100ms。
- 外层时钟：Node performance.now 在自动化派发之前开始，等待页面测量回传后结束；包含驱动/协议往返开销，作为保守上界单独保存。若仅外层超阈值而页面内满足，分开报告，不把自动化开销直接归因产品。
- 两帧是画面提交的近似，不是屏幕扫描硬件时刻；原始DOM与两帧值都保留。

## TERMINAL-24

真实PTY中的Node生产器按单调时钟追踪30000行/秒目标，持续至少10秒。实际完成stdout写回调的每秒行数、字节数、写入等待时间以及返回false的背压次数写到JSON。目标速率不是实测速率；若实际桶没有达到“每秒几万行”，先报告场景负载未满足，不以目标常量宣称通过。

界面只订阅已有terminal.data事件统计实际收到的编号行、字节数和最后编号，不改变产品流控或回执。约每30000行进度时进行一次实际文件标签点击和编辑器输入，共九组；记录输入事件到对应编辑器DOM、两帧以及自动化外层时钟，同时记录页面长任务和requestAnimationFrame最大间隔。TERMINAL-24没有规定具体响应毫秒数，报告全部数值与真实交互结果，不另造一个宽松阈值。

结束时核对生产行数与界面收到行数相等、可见终端末尾有最终标记。后端与xterm按现有策略只保留最近10000行；DOM只绘制可视区域，不声称所有输出行均同时渲染。JSON分别记录生产量、接收量、后端保留行数及可视DOM行数。探针自身有解析事件和观察DOM开销，不把它当成零成本。

## 执行

由协调人确认机器空闲后，在Node24环境下运行：

```sh
RUNYARD_E2E_APP="<e2e包>/Runyard.app/Contents/MacOS/Runyard" \
RUNYARD_PERF_OUTPUT="<新建且存在的独立目录>" \
pnpm --filter @runyard/desktop exec playwright test \
  --config e2e/playwright.measure.config.ts \
  quick-open-performance.measure.ts terminal-performance.measure.ts
```

## 2026-10-20 实测与未完成项

数值证据归档在同名子目录：`editor-first-failure.json`、`editor-diagnostic.json`、`terminal-1.json` 至 `terminal-3.json`。终端文件只移除了可见尾部全文中的本机用户名和主机名，保留完成标记断言及全部数值。完整本机日志分别在 tmp.vDYdZ43vV0、tmp.p69wxX9ed0、tmp.nYTFuV5SOU、tmp.JQzs2fmMm5；截图不进仓库。

### 快速打开：尚未达成最终验收

| 样本 | 首开DOM / 两帧 ms | z DOM / 两帧 ms | ze 两帧 ms | zet 两帧 ms | zeta 两帧 ms |
| --- | --- | --- | --- | --- | --- |
| 首次（失败，#531） | 5.1 / 13.0 | 10.4 / **187.1** | 17.4 | 15.4 | 15.2 |
| 一次定向诊断 | 1.0 / 9.0 | 11.0 / 17.1 | 18.0 | 16.7 | 15.7 |

首次的 z 超过100ms，按首次失败停止其余样本；没有改门槛。诊断是在增加可见性、焦点、每次rAF时间和动画快照后，经协调人批准只执行一次，不是跑满三轮直到通过。两次结果并列保留，#531仍未解决，不把第二次通过替代首次失败。

首次未采集各帧时间，故不能回答177ms的DOM后间隔具体落在哪一帧，也不能倒推其窗口当时可见或聚焦。诊断的 z 在输入、DOM和两帧结束时均为visible/focused：DOM→首rAF回调约1.0ms，首→次rAF回调约5.1ms。诊断记录存在其它动画，但只记录state/time，不能据此确定动画属于结果行或认定因果。

探针在计时区间读取querySelector/textContent/input.value，不读取几何或computed style；MutationObserver观察范围是document.body，可能增加观察开销。getAnimations在paintedMs已经记下之后执行，不包含在该次页面内时长，但可能改变下一次测量前的状态。readUiProbe只等待页面内Promise，不以page.evaluate轮询间隔计时。首次版本没有takeRecords，不能将空longTasks数组解释为完全排除了所有主线程/样式任务；诊断已保留待交付记录。

随后经协调人批准完成一次trace诊断，结果见下节。定位后仍须预先约定新实例首字与同实例热查询的固定次数，保留全部分布及失败，不挑最好结果。产品门槛仍是200/100ms；两rAF是提交近似，不是硬件呈现时刻。

### #531 的一次全进程trace诊断

`quick-open-trace.measure.ts`复用相同万文件夹具，只做一次首开与首字。使用Electron本地类型及[官方contentTracing接口](https://www.electronjs.org/docs/latest/api/content-tracing/)，记录main/renderer、devtools.timeline、blink.user_timing、cc、viz、gpu；页面以input/dom/raf1/raf2用户标记对齐trace时间，附每帧visibility/focus和动画名称、属性、目标。它明确是诊断，不能代替保留200/100ms断言的普通测量文件。

该次首字DOM11.3ms、两回调18.0ms，未复现187.1ms。trace标记相对输入为DOM11.215、rAF1 12.335、rAF2 17.902ms，即DOM到首回调1.120ms、首到次回调5.567ms。主窗口及每帧均可见、聚焦。实际动画目标是FileTabs选中指示器的transform/width与Monaco滚动条opacity，没有观察到Palette结果行进入动画。

同一区间renderer主线程Layout4次（单次最大1.048ms）、UpdateLayoutTree6次（最大1.208ms）、Paint5次（最大0.585ms），最长RunTask11.379ms。这些事件含嵌套时间，不可跨名称相加当CPU总耗时。代码里的选中行scrollIntoView、Base UI ScrollArea读取scroll/client尺寸和ResizeObserver、玻璃backdrop-filter仍是后续分布诊断可对照的路径；本次低时延trace不能证明它们导致或排除了最初的停顿。

startRecording等待61.4ms已单列，采样本身的持续开销未能从单次运行分离，不从实测里擅自减去。原trace在tmp.39ksxLgBZB/quick-open-chromium-trace.json（6639事件、1372254字节，SHA-256 `e3452a8a7016c6d1397dd5b772f9fc09fb60325e6f9970d8b85de68c03f06a0b`）；原trace可能含本机路径，不提交。去除路径参数的数值摘要及页面观测保存在`editor-trace-summary.json`与`editor-trace-observations.json`。

本次完整pnpm verify及e2e专用类型检查通过，trace诊断1/1完成并正常退出。#531仍开放：原失败没有逐帧/trace证据，无法将本次状态反推到它。下一步是预先固定新应用首字和同应用热查询的样本分布，并对慢样本抓取对应trace；尚未执行，不继续裸重跑以求通过。

### 终端：三份有效负载均达到实际每秒几万行

| 样本 | 实际时长 ms | 实际行数 | 每秒桶范围 | 切文件两帧 ms | 输入两帧 ms | 最大rAF间隔 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 10001.0 | 299987 | 29970–30033 | 20.3–23.4 | 27.5–42.4 | 10.4 |
| 2 | 10000.2 | 299999 | 29969–30035 | 19.8–23.2 | 28.7–43.5 | 10.5 |
| 3 | 10000.1 | 299997 | 29964–30031 | 19.7–29.4 | 26.8–43.6 | 10.4 |

三轮界面收到的编号行数均等于生产器实际完成写入数，末尾标记可见；每轮九次切文件与九次输入都更新了真实编辑器内容。生产字节约16.09MB/轮；终端转换换行及shell提示使接收字节数略大，不能要求两种字节口径相等。stdout返回false次数均为0，实际写回调累计等待分别776.7、798.9、773.7ms。后端分别保留9999、9999、9998条编号行（剩余行用于完成标记/提示），可视DOM均7行。三轮探针没有记录长任务，不将此表述为所有系统线程绝无停顿。

首次尝试只等xterm出现，shell未就绪导致长命令前段丢失，生产器没有运行，已引用#528登记；它不计有效性能样本。有效样本1完成测量后因autoSave=off的编辑未保存而在退出时等待，已登记#534，不能说整条测试通过。修复仅在测量结束、JSON落盘后真实保存两份文件；有效样本2、3及退出均通过（2/2，总25.6秒）。有效样本1的数值保留，清理失败没有从报告中删除。
