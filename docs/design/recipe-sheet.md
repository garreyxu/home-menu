# v1.1 站内做法弹层 —— 设计说明（PR16 之后的小改）

> UI设计师 2026-11-09。PR16 现状（（未入库））：只有菜名 + 「做法」+ 正文/「暂无做法」，像一张白条。功能不改，只补版式。

## 尺寸（PR16 已对，不动）
- <640 全屏 Sheet；≥640 居中弹层，宽 `min(576px, 92vw)`，高 `max-height: 86dvh`，正文区内部滚动，头部固定。

## 头部
- 顶部水彩插画（1x webp），宽满弹层、4:3 裁成 16:9（object-position center 60%），`mix-blend-mode: multiply` 叠在 paper 底上；无插画时整块换成 washi 底 + 居中毛笔大字菜名首字（72px，sumi 20% 透明度）。
- 插画下：菜名 Ma Shan Zheng 32px（手机 28px）；右侧红色「＋添加」StampButton（与卡片同款），点了走 §4 选格流程。
- 菜名下一行小木牌（Noto 12px，sumi 1px 描边，paper 底，gap 6）：⏱ 料理时间、主要食材种类、「做过」（有则显示）。没有的字段不显示，整行都没有就不渲染。
- 关闭：右上角 40×40 圆形 paper 底 sumi 描边「×」浮在插画上（替换现在的方块「关闭」按钮），aria-label「关闭」。
- 去掉现在菜名下的「做法」两个字。

## 正文（Notion 块渲染）
- 字体 Noto Sans SC 15px / 1.75，sumi；段距 10px。
- heading_1/2/3 → 毛笔 22/20/18px，前面一个 6×6 shu 小方印点，上距 20。
- 「需要食材」若是 bulleted list：两列（≥640）/ 一列（手机）的格子纸清单，每项前 shu 小圆点。
- numbered list（步骤）：序号用 shu 圆印（24px 圆，paper 字，Noto 700 13px），文字左对齐在印右侧；步骤间 1px dashed rule 分隔。
- 图片块：圆角 3，最大宽 100%，下方灰色说明字；链接块/notion 内链：**纯文字渲染，不做可点链接**（规格禁跳 Notion）。
- callout/quote：washi 底，左侧 3px shu 竖线。
- 「暂无做法」空态：插画头照常显示，正文区居中一个淡墨毛笔字「待补」+ 一行小字「这道菜还没写做法」，不要只放一行灰字。

## 卡片入口
- 卡片上的「做法」改成 sumi 色 Noto 13px，前面一个 12px 内联 SVG 小本子图标（不用 emoji）（sumi 描线），hover 下划线 shu。不要浏览器默认蓝。
