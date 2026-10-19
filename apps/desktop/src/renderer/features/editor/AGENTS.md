# 编辑器功能

## 用途
遵守根与apps/desktop的AGENTS。文件会话、Monaco、标签、自动保存分别维护，不把业务输入行为写进通用UI包。

## 对外暴露什么
`FileTabs`沿用共享水平ScrollArea，仅此处隐藏滑块外观；滚动与激活可见性由本模块负责。

## 本包特有的规则
- `use-file-tab-scroll.ts`只改变本视口：初次/激活/实际宽度变化显示整个标签；键盘focus后补全关闭钮，手动wheel取消待执行定位。
- 原生deltaX及Ctrl/Meta缩放保留；deltaY按像素/行/页换算，边界取消默认纵向滚动；不订阅scroll或同宽ResizeObserver来强制定位。
- 超长名称截断但关闭钮可达，Tooltip使用现有tab按钮触发，键盘和悬停均能查看完整路径。
- 不把普通重绘、dirty标记变化、关闭非当前文件当作重新定位条件。

## 子目录地图
`FileTabs.tsx`是标签条，`use-file-tab-scroll.ts`负责输入与可见性，`FileTabs.test.tsx`验证对应行为。

## 测试
真实验证在apps/desktop/e2e/file-tabs.e2e.ts；设计对照脚本file-tabs-design.measure.ts输出中英浅深及两种宽度图片，不将固定数据当扫描或运行证明。
