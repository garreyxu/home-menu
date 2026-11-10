# 设计说明

御膳房家用电子菜单的设计文档，交给编码 agent 照着实现用。界面文字全部中文。

| 文件 | 内容 |
|---|---|
| [visual-izakaya.md](visual-izakaya.md) | 视觉主规格：居酒屋手写菜单风的配色、字体、墨框、印章、卡片版式、断点（手机 / 1440 / 带鱼屏 3440） |
| [ia-and-flows.md](ia-and-flows.md) | 信息架构和页面流程 |
| [week-board.md](week-board.md) | 一周菜单板：格子、chip、选格放菜、自定义项、拖拽和「移到…」、验收标准 |
| [recipe-sheet.md](recipe-sheet.md) | 做法页版式 |
| [illustration-blend.md](illustration-blend.md) | 水彩插画和纸色底的融合（multiply 加椭圆羽化遮罩） |

核心 token：shu #C83028、sumi #1C1613、washi #F4ECDC、paper #FBF6EA；毛笔字 Ma Shan Zheng，正文 Noto Sans SC（都是 OFL 免费可商用）。

想换成别的风格的话，页面结构、断点、组件状态都可以留着不动，只改 visual-izakaya.md 里的 token、字体和边框。
