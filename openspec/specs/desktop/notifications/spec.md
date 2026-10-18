# desktop/notifications Specification

## Purpose
约定桌面应用内的通知：有新版本、项目明天会被自动清理、智能体创建并运行了项目、一次性的提醒和操作结果，都从顶栏的“通知”按钮下方出现，收起后进通知列表，随时可以再看；资源库列表上方不再插提示条。

## Requirements

### Requirement: 通知从“通知”按钮下方出现
主窗口顶栏 MUST 有一个“通知”按钮，在“N 个运行中”和“新建”之间；资源库页和项目标签页 MUST 都有，位置相同，侧栏收起时 MUST NOT 移动。有通知要显示时，卡片 MUST 出现在这个按钮下方、窗口右上角，从上往下排，同时 MUST NOT 超过三张；更多的 MUST 直接进通知列表，不弹卡片。卡片分两类：需要处理的（有新版本、项目明天会被自动清理）MUST 一直留着，直到点了卡片上的按钮或关闭；其余的（智能体创建并运行了项目、一次性的提醒）MUST 在出现 8 秒后自动收起，指针停在卡片上时 MUST NOT 计时。卡片 MUST NOT 把窗口提到前面，MUST NOT 切换标签页或抢走键盘焦点；读屏软件 MUST 能读到新出现的卡片。资源库页标题和表格之间 MUST NOT 再插任何提示条。
来源：PRD #prd-notifications

#### Scenario: [DESKTOP-NOTIFICATIONS-01] 启动时有两条需要处理的通知
- 前提：发布页上有新版本，`node-ts-1` 明天会被自动清理
- **WHEN** 打开应用到资源库页
- **THEN** “通知”按钮下方出现两张卡片：新版本、`node-ts-1` 明天清理；按钮上的数字是 2；资源库标题和表格之间没有提示条
- 验证：test

#### Scenario: [DESKTOP-NOTIFICATIONS-02] 其余的通知 8 秒后收起
- 前提：智能体创建并运行了 `react19-5`，卡片刚出现
- **WHEN** 等 8 秒，期间指针不在卡片上
- **THEN** 卡片收起，通知列表“最近”里有这一条；按钮上的数字不变
- 验证：test

#### Scenario: [DESKTOP-NOTIFICATIONS-03] 最多三张卡片
- 前提：已有三张卡片
- **WHEN** 又来了一条通知
- **THEN** 不出现第四张卡片，这一条直接在通知列表里
- 验证：test

#### Scenario: [DESKTOP-NOTIFICATIONS-04] 关闭需要处理的卡片
- 前提：新版本的卡片显示着
- **WHEN** 点卡片上的关闭或“以后再说”
- **THEN** 卡片收起；通知列表“需要处理”里仍有这一条，按钮数字不变；这次打开应用期间不再弹出这张卡片
- 验证：test

#### Scenario: [DESKTOP-NOTIFICATIONS-10] 项目标签页里位置不变
- 前提：当前是 `react-counter` 的标签页，侧栏收起
- **WHEN** 智能体创建并运行了一个项目
- **THEN** 卡片出现在“通知”按钮下方、窗口右上角；当前标签页和焦点不变
- 验证：test

#### Scenario: [DESKTOP-NOTIFICATIONS-11] 卡片不抢焦点
- 前提：焦点在搜索框里
- **WHEN** 出现一张通知卡片
- **THEN** 焦点仍在搜索框里，窗口没有被提到前面；读屏软件读出卡片标题
- 验证：test

### Requirement: 通知列表
点“通知”按钮 MUST 打开通知列表，分两组：“需要处理”和“最近”。按钮上的数字 MUST 只算“需要处理”的条数，为 0 时 MUST NOT 显示数字。“需要处理”里的一条 MUST 在点了它的处理按钮（如“下载”“关闭自动清理”“现在清理”）或情况不再成立后消失，在此之前 MUST 一直留着；下次打开应用时仍未处理的 MUST 再弹一次卡片。“最近”MUST 保留 7 天内的通知，“全部清除”MUST 清空“最近”，MUST NOT 清除“需要处理”。
来源：PRD #prd-notifications

#### Scenario: [DESKTOP-NOTIFICATIONS-05] 打开通知列表
- 前提：有新版本、`node-ts-1` 明天清理，1 小时前 Codex 创建了 `node-ts-1`
- **WHEN** 点“通知”按钮
- **THEN** 列表“需要处理”有两条，“最近”有一条；按钮数字是 2
- 验证：test

#### Scenario: [DESKTOP-NOTIFICATIONS-06] 处理之后从“需要处理”消失
- 前提：列表里“需要处理”有 `node-ts-1` 明天清理
- **WHEN** 点它的“关闭自动清理”
- **THEN** 这一条从“需要处理”消失，按钮数字减 1；该行的“明天清理”标签和 Dock 角标随之消失
- 验证：test

#### Scenario: [DESKTOP-NOTIFICATIONS-07] 全部清除只清“最近”
- **WHEN** 在通知列表里点“全部清除”
- **THEN** “最近”变空，“需要处理”不变
- 验证：test

### Requirement: 操作结果的提示
操作成功的结果（如“已复制链接”“已移到废纸篓”）MUST 只在窗口底部居中显示一个小提示，约 2 秒后消失，MUST NOT 进通知列表。不需要用户确认的一次性提醒（如链接里的项目不存在、项目路径接近长度上限）MUST 作为通知出现，收起后进“最近”。
来源：PRD #prd-notifications

#### Scenario: [DESKTOP-NOTIFICATIONS-08] 复制链接
- **WHEN** 在行菜单里点“复制链接”
- **THEN** 窗口底部居中出现“已复制链接”，约 2 秒后消失；通知列表里没有这一条
- 验证：test

#### Scenario: [DESKTOP-NOTIFICATIONS-09] 链接里的项目不存在
- **WHEN** 打开 `runyard://open/nope`，没有名为 `nope` 的项目
- **THEN** “通知”按钮下方出现一张卡片说明没有这个项目；收起后在“最近”里
- 验证：test

### Requirement: 减弱动态效果时的通知
系统开启“减弱动态效果”时，卡片的出现和收起 MUST 只淡入淡出，MUST NOT 有位移或缩放。
来源：PRD #prd-notifications；PRD #prd-quality

#### Scenario: [DESKTOP-NOTIFICATIONS-12] 减弱动态效果
- 前提：系统开启了“减弱动态效果”
- **WHEN** 出现一张卡片，随后收起
- **THEN** 卡片只淡入、淡出，没有滑动或缩放
- 验证：test
