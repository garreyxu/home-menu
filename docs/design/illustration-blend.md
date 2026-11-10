# v1.1 插图与纸色融合（第二批）

问题：水彩原图底色 #FDF7EB，比卡片 paper #FBF6EA 略亮，卡片上能看出一块浅色矩形，像贴了张便利贴。

做法（对比图 [对比图](images/illus-blend-compare.png)，第三列）：
- 菜卡、菜谱页头图、chip 缩略图的 <img> 统一加：
  - `mix-blend-mode: multiply;`（原图白底吃进纸色）
  - `mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, #000 72%, transparent 100%);`（加 -webkit- 前缀）四边晕开
- 父容器必须有实底 `background: var(--paper)`，并加 `isolation: isolate`，避免 multiply 透到卡片外的 washi 底或阴影。
- chip 缩略图（≤40px）只用 multiply，不加 mask，太小晕开会糊。
- 无图圆牌不受影响。
- 不改原图文件，不重新导出。

验收：1440 / 3440 菜墙截图里看不出图片矩形边；浅色菜（蒜香生菜、豆腐类）盘子边缘不被 mask 切掉；深色模式不在范围内。
