# 我家食堂：设计说明 v2（居酒屋手写季节菜单风）

> 2026-11-04 起取代 `design-spec-pixel-seaside.md` 的视觉部分。**只换皮**：页面结构、断点、组件、弹层、手机托盘、焦点行为全部沿用 v1；像素字体、`image-rendering: pixelated`、像素描边/切角、像素字体子集任务全部作废。
> 2026-11-04 补：对照参考图实测取色，shu 调为 #C83028、sumi 调为 #1C1613、新增装饰色 shu-orange，插画描述按海报加粗墨线。
> 状态：只是设计稿，还没有任何实现。界面文字全部中文。素材全部自己画或自己生成，字体只用 OFL 等免费可商用协议。

## 1. 设计原则
- 参考：日式居酒屋手写季节菜单（毛笔字标题、水彩菜品插画、红色圆形「推荐」印章、粗手绘墨框、和纸底）。
- 菜品图一律用**水彩插画**（不用真实照片），风格比已通过的样图更松、墨线更粗。
- 毛笔字只用于菜名和大标题；正文、数字、表单一律 Noto Sans SC，保证可读。
- 文字永远放在不透明的纸色底上，不直接压在水彩或纹理上。
- 不做金币、人气这类游戏数值。

## 2. 配色（Tailwind theme tokens）
| token | hex | 用途 |
|---|---|---|
| `washi` | #F4ECDC | 页面底色（叠一层很淡的噪点纹理） |
| `paper` | #FBF6EA | 卡片、面板、弹层底色（不透明） |
| `paper-shade` | #E8DCC4 | 表头底、悬停底、骨架屏 |
| `rule` | #D8C9AE | 手绘格线、浅分隔线 |
| `sumi` | #1C1613 | 墨：正文、菜名、墨框、焦点外框 |
| `sumi-soft` | #5E544A | 次要文字、手写小注、空格提示（取代 driftwood） |
| `shu` | #C83028 | 朱印红（取自参考图「おすすめ」印章实测 #C83028–#D03028）：按钮底、「推荐」印章、今天标记、错误文字 |
| `shu-deep` | #962818 | 按钮悬停/按下 |
| `ai` | #3F5F7A | 蓝染：链接、选中分类的小记号 |
| `matcha` | #4F6B43 | 成功提示文字 |
| `shu-orange` | #D05828 | 橙朱（参考图えん屋手写标题色），只做装饰性标题点缀和印章变体，不放正文 |
| `kaki` | #D98A4E | 装饰色（水彩晕染、角标底），不放文字 |
| `sakura` | #E8B4B0 | 装饰色（季节点缀），不放文字 |

对比度（WCAG 2.x，已计算）：
- sumi / washi 15.2:1，sumi / paper 16.6:1 → 正文、菜名 AAA。
- sumi-soft / washi 6.3:1，/ paper 6.9:1 → 次要文字 AA。
- 白字 / shu 5.37:1，paper 字 / shu 4.98:1（印章里的字），白字 / shu-deep 8.0:1 → 按钮 AA。
- shu / washi 4.57:1，/ paper 4.98:1 → 红色错误文字、印章字 AA。
- ai / paper 6.2:1，matcha / paper 5.5:1 → AA。
- shu-orange（/paper 3.81:1）、kaki、sakura 对比不足，只作装饰，不承载文字或唯一信息。

纸纹理（不用大图）：`body` 背景 = `washi` + 内联 SVG `feTurbulence` 噪点（baseFrequency≈0.8，numOctaves 2，透明度 0.06–0.08），做成 data URI 平铺 256×256，总体积 <2KB。可再叠一层极淡的纵向纤维（`repeating-linear-gradient`，透明度 ≤0.03）。`paper` 卡片上不加纹理或只加一半强度。

焦点环（全站统一，替代 v1 的 sun 环）：`outline: 2px solid sumi; outline-offset: 2px; box-shadow: 0 0 0 5px rgba(200,48,40,.45)`（外圈 shu 环）。只在 `:focus-visible` 时出现。

## 3. 字体
- **Ma Shan Zheng**（Google Fonts，OFL）：菜名、页面大标题、分类名、星期表头、空状态大字、无图兜底菜名。用 `next/font/google` 引入：`Ma_Shan_Zheng({ weight: '400', subsets: ['latin'], display: 'swap', preload: false })`；Google Fonts 对中文自动按 unicode-range 切片，按需加载。回退栈：`'Ma Shan Zheng', 'Noto Serif SC', serif`。
- **Noto Sans SC**：正文、数字（份数、+N、日期）、按钮文字、表单控件、toast。`next/font/google`，weight 400/500/700，`display: 'swap'`。
- 按钮文字用 Noto Sans SC 700（毛笔字小字号可读性差）。

| 用途 | 手机 <640 | 平板/桌面 640–1919 | 大屏 ≥1920 | 带鱼屏 ≥2560 |
|---|---|---|---|---|
| 页面大标题（毛笔） | 32 | 40 | 44 | 52 |
| 区块标题/星期表头（毛笔） | 20 | 22 | 24 | 26 |
| 卡片菜名（毛笔） | 20 | 22 | 22 | 26 |
| 周菜单格子菜名（Noto 500） | 13 | 13 | 14 | 15 |
| 正文（Noto 400） | 14 | 15 | 15 | 16 |
| 手写小注（Noto 400，sumi-soft；参考图里的手写旁注感靠斜放/竖排实现，不换字体） | 12 | 13 | 13 | 14 |
| 按钮（Noto 700） | 14 | 15 | 15 | 16 |
行高：毛笔 1.2，正文 1.6。毛笔字不小于 18px。

## 4. 手绘墨框（全站统一）
- 做法：准备 3 张 SVG 边框（手绘、线宽不均、四角略有出头和飞白），用 `border-image: url(frame-*.svg) 24 / 12px / 0 round`；需要随主题变色时改用 `mask-image` + `background: sumi`。SVG 内联或放 `public/frames/`，每张 <4KB。
- 不规则感：每种框准备 2–3 个变体（`-a/-b/-c`），按卡片 id 取模选用，避免整屏一模一样。
- 变体：
  - **card**：线宽 2.5–4px，四角轻微出头，内边距 12（带鱼屏 16）。
  - **panel**（周菜单、详情抽屉、登录卡）：线宽 4–6px，粗墨，可做双线（外粗内细）。
  - **tag**（分类小签、角标）：线宽 1.5–2px，圆角木牌形。
- 阴影：不用模糊阴影。可选一层 `sumi` 6% 的偏移 3px 淡墨晕（像墨渗到纸背）。
- 间距基准 4px；卡片间距 16，带鱼屏 20。

## 5. 组件（结构同 v1，只换皮）
### 5.1 顶部标题 SceneHeader
- 去掉码头场景。改为 washi 底 + 毛笔大标题「我家食堂」+ 右侧竖排小字季节（如「秋のおすすめ」改中文「秋季推荐」）+ 一枚朱印。左右两端可放小水彩点缀（柿子、枫叶），中间纯纸纹，多宽都不拉伸。
- 高度：手机 120，桌面 160，带鱼屏 180。

### 5.2 「推荐」朱印 SealBadge
- 圆形，直径 手机 40 / 桌面 48 / 带鱼屏 56；`shu` 底、`paper` 色毛笔字「推荐」（竖排两字或横排）。边缘用 SVG mask 做出印泥不均、缺口和轻微旋转（-8°~+6°，按 id 固定）。
- 放在卡片插画右上角，压出框外 1/4。纯装饰时 `aria-hidden`，同时卡片里有可读文本「推荐」给读屏。
- 「已点×N」角标：小号 tag 框，`kaki` 浅晕底 + sumi 数字（Noto 700）。

### 5.3 「＋加到哪天」按钮 StampButton（基于 shadcn Button）
- 形状：横向朱印条，`shu` 底、白字（Noto 700）「＋加到哪天」，边缘用 mask 做印泥不规则边，高 40（手机 44）。
- 悬停：底色变 `shu-deep`，轻微放大 1.02。
- 按下（active）：盖章效果 —— `scale(.96)`，透明度 0.92，印泥边略扩散（mask 换成 `-pressed` 变体），120ms。
- 焦点：全站焦点环（2px sumi 外框 + shu 外圈）。
- 禁用：底色 `rule`，字 `sumi-soft`，无动画，`cursor: not-allowed`，仍保持 ≥4.5:1（sumi-soft/rule 实测 4.53:1，刚过线，实现时不要再调浅）。
- 已加入状态：变成空心朱印框（`shu` 描边、`shu` 字「已加 N 次」）。

### 5.4 分类栏 CategoryNav（手写木牌）
- 桌面/带鱼屏：左侧竖排，宽 200（带鱼屏 220）。每项是一块挂着的小木牌：`paper-shade` 底，tag 墨框，顶部一个小绳孔，分类名毛笔字。
- 手机：顶部横滑一排木牌，sticky。
- 状态：默认如上；悬停木牌轻微摆动（rotate ±1.5°）；选中时木牌底变 `paper`，左侧加 `ai` 小竖墨线 + 毛笔字下一道朱红手绘下划线；焦点用全站焦点环。

### 5.5 菜品卡片 DishCard（基于 shadcn Card）
- 结构：水彩插画（4:3，`object-contain`，paper 底）→ 毛笔菜名（最多 2 行，超出省略）→ 一行手写小注（如「酸甜下饭」「孩子爱吃」，来自 Notion 备注，最多 1 行省略，sumi-soft）→ 分类小签 → 「＋加到哪天」。
- card 墨框。悬停：向上 2px + 插画轻微 1.02 放大。
- 无插画：见 §6.4 兜底。加载中：paper-shade 骨架 + 很淡的墨晕闪动（reduced-motion 时静止）。
- 点插画打开详情抽屉（Sheet），panel 墨框，显示大图和 Notion 说明。

### 5.6 「加到哪天」弹层 AddToDayPopover
- 交互完全沿用 v1：7×3 小网格（周日→周六 × 早/中/晚），点格子加入、再点取消；手机改底部 Drawer，格子 ≥44×44。
- 皮：paper 底 + panel 墨框；格线用 `rule` 手绘线；已选格子里盖一个小朱印圆点；表头毛笔字「日 一 二 三 四 五 六」。

### 5.7 一周菜单 WeekBoard（手绘方格纸表）
- paper 底，panel 墨框，内部用手绘格线（SVG 线条带轻微抖动，`rule` 色，表头下方一道 sumi 粗线）。
- 结构沿用 v1：周日到周六 7 行，早、中、晚 3 列；顶部切换上一周 / 本周 / 下一周；格子里每道菜带 × 移除；放不下显示 +N；桌面可拖拽（dnd-kit），拖动时目标格子变 `paper-shade` + shu 虚线框。
- 星期表头毛笔字；今天那一行左侧一枚小朱印「今」或 shu 竖墨线。
- **菜名绝不能一字一格**：
  - 格子最小宽度：380 面板时每列 ≥96px；手机“本周”页每列 ≥ (屏宽-星期列 48)/3。
  - 菜名用 Noto 500（不用毛笔），中文按字自然换行（`word-break: normal; overflow-wrap: anywhere;`；main 上 #10 用的 `break-all` 对纯中文效果相同，可保留），不能用 `keep-all`（纯中文会整串不换行溢出）。真正要保证的是**名字区宽度 ≥ 4 个汉字**：缩略图和 × 叠放在菜名左侧一列，不和菜名抢横向空间。
  - 每道菜最多 2 行，超出 `-webkit-line-clamp: 2` 省略，`title` 属性给全名。
  - 格子内菜品纵向堆叠（flex-col），不横排；超过 3 道显示「+N」。
  - 禁止把菜名放进 CSS grid 的字符级单元或给每个字单独 span。
  - 缩略图 32px（带鱼屏 40）小水彩圆图，可选；宽度不足 96 时隐藏缩略图保菜名。
- 空格子：淡淡的铅笔虚线框 + sumi-soft 小字「空着呢」。

### 5.8 手机底部栏和托盘
- 底部栏：菜单 / 本周 / 设置，`paper` 底 + 顶部一道粗墨线；选中 Tab 文字 sumi + 下方小朱印点。
- 悬浮托盘「本周已点 N 道」：小朱印条样式（同 StampButton 皮），点一下去本周页。

### 5.9 登录页
- washi 全屏，中间一张 paper 卡（panel 墨框），毛笔标题「我家食堂」+ 朱印；用户名、密码（shadcn Input，底部手绘下划线样式，焦点用全站焦点环），按钮 StampButton「开门」。
- 密码错误：卡片轻晃（reduced-motion 时不晃），shu 文字提示；限流时「歇会儿再试」+ 倒计时。

## 6. 菜品水彩插画
### 6.1 规格
- 数量：每道菜一张，约 53 张。
- 比例 **4:3**，主体居中，四周留 8% 空白，背景为纯 `paper` 色 #FBF6EA（不用透明，省体积，和卡片融为一体）；边缘水彩自然晕开、不画方框。
- 母版：2048×1536 PNG（自存，不上线）。
- 上线：WebP，质量 80。
  - thumb：240×180（≤15KB）——周菜单格子。
  - 1x：480×360（≤50KB）——手机、普通桌面卡片。
  - 2x：960×720（≤130KB）——带鱼屏和高 DPI（用 srcset 选）。
- 原图：`/workspace/menu-design/illustrations/raw/<菜名>.png`，4:3，1152×864（生图工具的输出尺寸，够 2x 960 宽），由导入脚本按「菜名→Notion 页面 id」清单对应，对不上直接报错。
- `<Image>` 用 `sizes` 按断点选择；带鱼屏卡片 ≥280px 宽时用 2x。
### 6.2 存储与访问（沿用 v1 规则，不变）
- 插画是我们自己生成的通用菜品图，不含家里任何信息，放仓库 `public/illustrations/<菜品id>-<thumb|1x|2x>.webp`，文件名只用 id 不带菜名，长缓存，换图更新 `?v=` 版本号。页面本身仍需登录、`no-store`；插画文件不加门。
- 数据表加 `illustrationId`（可空）；有就用插画，没有走兜底。
### 6.3 生成提示词模板（统一风格，换菜名即可）
```
Japanese izakaya hand-written seasonal menu style watercolor illustration of {菜名英文描述，如 "Chinese tomato and scrambled eggs in a shallow white ceramic plate"}, 
loose expressive watercolor washes, very bold thick black sumi ink outlines (like hand-painted izakaya menu posters), visible dry-brush streaks and broken strokes, flat loose color washes that spill slightly over the lines, simple rustic tableware (dark ceramic plate, wooden board or blue-white bowl),
three-quarter top view, single dish centered, generous empty margin, soft color bleeding at the edges,
muted warm palette (persimmon orange, matcha green, indigo, soft red), 
plain warm off-white washi paper background #FBF6EA, no frame, no text, no letters, no logo, no hands, no people, no table props,
4:3 aspect ratio
```
- 参考图核对结论（2026-11-04 实看）：海报的菜是粗黑墨勾边（线宽明显、有飞白和断笔），色块平涂、只有少量晕染，器皿常是深色陶盘/木板/竹笼，构图常出框、斜放；已通过的样图更干净、线更细、更写实。上线插画取两者之间：保留样图的配色和单盘居中（便于卡片统一裁切），但墨线加粗到海报那种程度、颜色更松更平、允许笔触溢出轮廓。
- 样图里画在图上的菜名和「推荐」印章不进插画，统一由页面用 Ma Shan Zheng 和 SealBadge 渲染。
- 负面要求：不要文字、不要照片质感、不要 3D、不要阴影投影、不要多盘。
- 一致性：同一批用同一模型、同一种子范围、同一参考图（已通过的样图）做风格参考；比样图更松、墨线更粗。
- 菜名英文描述必须写准主体和形态（例如番茄炒蛋 ≠ 面条），生成后人工逐张核对是不是这道菜，不对就重画。
### 6.4 无插画兜底 DishFallback
- 同 4:3 区域，paper 底 + 纸纹；中央一个淡墨圆（手绘 ensō，sumi 15% 透明度，直径约区域高度 70%）；圆中毛笔大字菜名（≤4 字单行，5–8 字两行，字号随容器 `clamp(24px, 12cqw, 56px)`）；右下角可选一枚小朱印。
- 纯 CSS/SVG 实现，不需要图片请求。

## 7. 动效
- 盖章：StampButton 按下、AddToDayPopover 选格子、加入成功时角标 —— `scale(1.15→0.96→1)` + 透明度 0.8→1，160ms，`cubic-bezier(.3,1.4,.5,1)`。
- 木牌悬停轻摆 ±1.5°，200ms。
- 加入成功 toast「已加到 周三·晚」，paper 底 + tag 墨框，左侧小朱印。
- `@media (prefers-reduced-motion: reduce)`：取消缩放/摆动/晃动/闪动，只保留颜色变化，过渡 ≤80ms。

## 8. 响应式布局（沿用 v1，不变）
| 断点 | 宽度 | 分类栏 | 一周菜单 | 菜品网格 |
|---|---|---|---|---|
| 手机 | < 640 | 顶部横滑木牌 | 单独“本周”页 | 2 列 |
| 平板 | 640–1023 | 顶部横滑木牌 | 单独页 / 右侧抽屉 | 3 列 |
| 桌面 | 1024–1439 | 200 | 抽屉（不常驻） | minmax(200px, 1fr) |
| 宽桌面 | ≥ 1440 | 200 | 常驻 380 | minmax(200px, 1fr) |
| 大屏 | ≥ 1920 | 200 | 常驻 420 | minmax(220px, 1fr) |
| 带鱼屏 | ≥ 2560（目标 3440×1440） | 220 | 常驻 480 | minmax(280px, 1fr)，gap 20 |
- 网格统一 `repeat(auto-fill, minmax(<最小宽>, 1fr))`。
- **带鱼屏规则：3440 宽时内容区 ≥3200px，左右留白各 ≤120px。**留白只放少量水彩小点缀（枫叶、柿子），纸纹不算填满宽度。

## 9. 其他状态（沿用 v1 逻辑）
- 并发：以服务器为准，冲突 toast「菜单刚被家人改过，已更新」。
- 空状态：淡墨圆 + 毛笔字「这周还没点菜」+ StampButton「去菜单挑挑」。
- 出错：paper 小卡 + tag 墨框 + shu 文字 +「重试」按钮。

## 10. 素材清单
纸纹 SVG（内联）、墨框 SVG（card/panel/tag 各 2–3 变体）、朱印 mask（圆印、印条、按下变体）、手绘格线 SVG、ensō 圆 SVG、季节小点缀水彩 3–5 张（WebP ≤60KB）、53 张菜品水彩插画（§6）。

## 11. 迁移清单（给编码 agent）
**要改：**
- `tailwind`/CSS 变量：删除 `sea, sea-deep, sand, cream, coral, coral-deep, sun, ink, driftwood, sand-line, kelp`，换成 §2 的 `washi, paper, paper-shade, rule, sumi, sumi-soft, shu, shu-deep, ai, matcha, kaki, sakura`（对应：cream→paper，sand→washi，ink→sumi，driftwood→sumi-soft，sand-line→rule，coral-deep→shu，kelp→matcha）。
- 焦点环：sun 外圈 → shu 外圈。
- 字体：移除 Fusion Pixel 及构建时像素字子集脚本；加 Ma Shan Zheng + Noto Sans SC（next/font）。
- 删除所有 `image-rendering: pixelated`、像素切角 `clip-path`、9-slice 像素框和偏移实色阴影，换 §4 墨框工具类（如 `.frame-card/.frame-panel/.frame-tag`）。
- 组件换皮：SceneHeader、CategoryNav（木牌）、DishCard（4:3 插画 + 毛笔菜名 + 小注 + SealBadge）、StampButton（新）、AddToDayPopover、WeekBoard（方格纸 + 菜名换行规则）、底部栏/托盘、登录页、toast、空/错状态。
- 图片：DishCard 比例 1:1 → 4:3；插画走 `public/illustrations/<id>-<档位>.webp` + srcset（不经 `/api/photos`）；新增 DishFallback 组件；数据加 `illustrationId`。
**不变：**
- 页面结构、路由、断点与网格规则、带鱼屏规则、AddToDay 交互（7×3，手机 Drawer，≥44px）、拖拽、周切换、+N、并发与 toast 文案逻辑、手机托盘、单一家庭账号与私密访问、页面 `no-store`、密钥不进 Git。

## 附：「做过」小标记（2026-11-04 产品经理定）
- Notion 勾了「已尝试?」的菜，卡片上加一个「做过」小标记；只做区分，不做筛选。
- 样式：墨色细线手写小木牌（sumi 1.5px 不规则描边 + paper 底），文字「做过」用 Noto Sans SC 12px（≥1440 为 13px），放在卡片图左下角，与右上角朱红「推荐」圆印错开，两者可同时出现。
- 不用朱红，避免和「推荐」抢；周菜单格子里不显示。
