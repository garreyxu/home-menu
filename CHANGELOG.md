# Changelog

本文件记录本项目的显著变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Internal / Tests

- Add a sticky PR status comment for checks, preview-e2e, and Vercel preview, with stale-head labeling and manual refresh; skip fork PRs.

- Prepare reusable open-source setup and contribution docs; require explicit Neon and Notion project configuration.

- E2E tests seed run-owned dishes and reserved future weeks, isolate parallel tests, and verify cleanup through a guarded test-only API. Await persisted mutations before reload/teardown, delete scoped children before parents, and use short fixture dish names.

### Changed

- 周菜单空餐位补全星期与完整餐次的无障碍名称，可选餐位增加点按加菜提示，保持可见内容不变。

- 做法正文中的英文时间单位和可选标记以中文显示；桌面周菜单删除按钮常显，增大点击范围并增加朱红悬停与键盘焦点样式。

- 周菜单长按菜单适配 iOS 安全区域与动态视口，桌面小牌与长按菜单共用操作定义。

- 周菜单表头、长按菜单、移动选餐及无障碍标签的午餐显示统一为「午」。

- 做法隐藏空值、N/A 与默认 option 标签；无插画菜卡仅显示菜名前两个完整字符，避免遮挡已点标记。

- 周菜单菜名最多显示两行并保留完整提示，移动通知统一早餐／午餐／晚餐，做法时间以中文显示。

- 做法章节标题统一常用中文，食材清单改为朱红圆点并隐藏无地址的图片占位。

- 做法面板新增水彩封面、食材标签与添加入口，优化食材和步骤排版；插画边缘融入纸色。

- 修复同餐自定义名称重复：新增去重与唯一索引修复迁移、服务端检查和只读索引报告；手机印章小牌支持两行，弹层防碰撞并固定提交按钮，修正长按、拖拽提示及通知位置。

- 周菜单支持拖拽、键盘移动与手机长按「移到…」，重复餐次提示并回弹；手机长按菜单统一改名与删除，自定义测试改为串行。

- 修复窄屏选餐位测试被展开托盘遮挡的问题，隔离自定义条目测试的同周计数，并增加「寿司外卖」印章小牌截图；名称字数显示去除首尾空白。

- 「＋添加」改为宽桌面周菜单选餐位、窄屏底部餐次表，禁用重复餐次，新增菜品闪烁朱红光晕；无缩略图圆改为宣纸底、朱红边和毛笔字。

- 站名改为御膳房
- 按钮改为「＋添加」
- 周菜单板加宽并撑满视口高度：1440 宽 560、1920 宽 640、3440 宽 760；菜名改为 13px 小牌，× 只在悬停时出现
- 手机（<640）周菜单小牌隐藏缩略图，菜名 12px 最多两行，圆角 6px；星期列 36px
- 周菜单小牌没有插画时（平板及以上），显示同尺寸纸色圆和菜名首字
- 带鱼屏周菜单小牌字号 15px、缩略图 30px
- 「做法」改为朱色
- 手机分类栏隐藏横向滚动条，右侧 24px 渐隐到宣纸底

### Added

- 支持自定义周菜单条目（外卖、聚餐等）：共用选餐表格，桌面弹层、手机底部面板可添加、改名、移餐及删除；同餐名称忽略大小写去重。

- 新 favicon

## [1.0.0] - 2026-11-08

### Added

- Notion 导入同步
- 菜单墙+分类
- 本周菜单
- 家庭账号登录
- 居酒屋换皮
- 53 张水彩插画

### Changed

- Neon 预览分支清理
