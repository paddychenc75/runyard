# ScrollArea

## 用途
遵守根和packages/ui的AGENTS。只负责通用滚动区域，不加入产品专属滚轮映射。

## 对外暴露什么
`scrollbarVisibility`默认`auto`，保留现有外观；显式`hidden`仅隐藏滑块外观和指针命中。

## 本包特有的规则
仍挂载底层Scrollbar并保留尺寸及方向登记。不要通过移除Scrollbar或把viewport改为overflow:hidden实现隐藏。

## 子目录地图
组件、样式、测试和工作台样例各自维护在同名文件中。

## 测试
隐藏变体须在真实溢出视口验证横向输入仍可滚动；默认区域不能受影响。通用组件不负责激活标签可见性。
