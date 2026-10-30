# Git 提交记录

本文件由仓库的 `git log` 直接导出，内容与 GitHub 上的提交历史一一对应，未做人工改写。

## 概览

| 项目 | 内容 |
| --- | --- |
| 仓库 | <https://github.com/asdasd123-w/TimePick> |
| 分支 | `main` |
| 提交数 | **30 次**（下表逐条列出；本文件自身的统计更新为第 31 次，内容无变化） |
| 时间跨度 | 2026-09-14 ~ 2026-10-30 |
| 跟踪文件 | 568 个（源码 450 · 3D 工程 109 · 文档 9） |
| 代码变更 | +67,468 / −961 行（图片、模型等二进制文件不计行数，故为 0 属正常） |
| 作者 | 蒋辉 |

提交顺序按功能模块推进：先把工程骨架、数据库、接口层立起来，再做前端页面，
最后补 3D 构建产物、静态资源与文档。每一次提交只做一件事，提交说明写清「做了什么、为什么这么做」，
不使用 `update`、`fix bug` 这类无法回溯的措辞。

## 提交规范

采用 Angular 风格的约定式提交：`类型(范围): 说明`。

| 类型 | 含义 | 本仓库用途 |
| --- | --- | --- |
| `feat` | 新增功能 | 数据库层、接口层、各页面、3D 房间、AI 能力 |
| `fix` | 修正缺陷 | 文档中的密钥清理等 |
| `docs` | 文档 | README、运行说明、数据库说明、作品文档 |
| `chore` | 工程杂项 | 构建配置、脚本、早期方案留档 |
| `build` | 构建产物 | 3D 房间 web-mobile 产物 |

## 提交一览

| # | 日期 | 类型 | 模块 | 说明 | 文件 | 增 | 删 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | 09-14 | 工程杂项 | — | 初始化工程骨架与构建配置 | 12 | +4,798 | −0 |
| 02 | 09-15 | 新功能 | 后端 | 数据库访问层与建表脚本（28 张表） | 4 | +1,165 | −0 |
| 03 | 09-16 | 新功能 | 后端 | 统一接口层——120+ action、鉴权、限流与静态托管 | 1 | +3,922 | −0 |
| 04 | 09-17 | 新功能 | 后端 | 3D 房间数据——家具、布局、访客与摆件修复 | 1 | +1,274 | −0 |
| 05 | 09-18 | 新功能 | 后端 | 微信扫码登录（网站应用授权） | 1 | +399 | −0 |
| 06 | 09-19 | 新功能 | 前端 | 应用入口、路由守卫与 Pinia 状态管理 | 10 | +1,764 | −0 |
| 07 | 09-21 | 新功能 | 前端 | API 客户端与静态数据配置 | 13 | +1,719 | −0 |
| 08 | 09-23 | 新功能 | 前端 | 视觉素材——岛屿切图、背景、宠物精灵图与手写字体 | 72 | +0 | −0 |
| 09 | 09-25 | 新功能 | 前端 | 欢迎页、登录注册与找回密码 | 4 | +2,433 | −0 |
| 10 | 09-27 | 新功能 | 前端 | 主框架——左侧图标栏与记忆岛云海 | 2 | +2,920 | −0 |
| 11 | 10-08 | 新功能 | 前端 | 记忆库与记忆详情 | 3 | +4,959 | −0 |
| 12 | 10-13 | 新功能 | 前端 | 拾光广场——信息流、关注、热门/最新筛选 | 2 | +3,826 | −0 |
| 13 | 10-18 | 新功能 | 前端 | 3D 房间宿主、加载页与交互覆盖层 | 3 | +2,864 | −0 |
| 14 | 10-21 | 新功能 | 前端 | 2D 陪伴宠物与 AI 伙伴 | 3 | +2,093 | −0 |
| 15 | 10-23 | 新功能 | 前端 | 个人中心、隐私可见性、反馈与公告 | 6 | +5,382 | −0 |
| 16 | 10-25 | 新功能 | 管理中心 | 管理中心——用户、内容、活动与 AI 密钥 | 1 | +2,490 | −0 |
| 17 | 10-26 | 构建产物 | 3D 房间 | 3D 房间构建产物（web-mobile） | 258 | +588 | −0 |
| 18 | 10-27 | 新功能 | 前端 | 音频、背景图与辅助静态页 | 6 | +48 | −0 |
| 19 | 10-27 | 工程杂项 | — | 构建、图片优化、进度注入与运维脚本 | 19 | +2,938 | −0 |
| 20 | 10-28 | 文档 | — | 补充项目 README、部署与开发说明 | 3 | +733 | −0 |
| 21 | 10-28 | 工程杂项 | — | 保留早期 uniCloud 方案（未启用） | 22 | +1,743 | −0 |
| 22 | 10-28 | 新功能 | 3D 房间 | Cocos Creator 3D 房间工程源码 | 109 | +15,194 | −0 |
| 23 | 10-28 | 文档 | — | 运行说明、环境变量模板、数据库说明与作品文档 | 5 | +710 | −0 |
| 24 | 10-28 | 修复 | 文档 | 清理环境变量示例里的真实密钥，并同步目录改名 | 4 | +586 | −586 |
| 25 | 10-28 | 文档 | — | 补充 Git 提交记录文档，修正 README 的路径说明 | 2 | +617 | −37 |
| 26 | 10-28 | 文档 | — | 提交记录改用不随提交数变化的表述 | 1 | +3 | −3 |
| 27 | 10-28 | 重构 | 后端 | 超管手机号改由环境变量提供，环境变量加载提到模块最前 | 6 | +145 | −45 |
| 28 | 10-30 | 新功能 | AI | 摆件语义检索、记忆语义搜索、语音问答，补匿名私信与手机端适配 | 26 | +2,016 | −276 |
| 29 | 10-30 | 文档 | — | Git 提交记录补到第 28 次，统计数字按当前仓库重算 | 1 | +85 | −4 |
| 30 | 10-30 | 修复 | 后端 | 占位符兜底区分密钥与普通变量，注册口令不再把中文模板当口令 | 2 | +54 | −10 |

说明：图片、字体、glTF 模型等二进制文件在 Git 中不统计行数，因此表中出现 `+0 / −0` 的提交
（例如第 08 次「视觉素材」72 个文件）属于正常现象，并非提交为空。

## 逐条详情

### 01 · 2026-09-14 · chore: 初始化工程骨架与构建配置

提交 `9c5873e` · 12 个文件 · +4,798 / −0 行

> - vite: outDir=dist，别名 @ -> src
> - 前端构建后用 scripts/copy-public、copy-webroot 同步静态资源到 webroot/（部署目录）
> - .env.production 只放 VITE_ 前缀变量，任何密钥都不进前端产物

涉及文件：

- `.gitignore`
- `README.md`
- `源码/.env.production`
- `源码/.gitignore`
- `源码/.oxfmtrc.json`
- `源码/Procfile`
- `源码/index.html`
- `源码/jsconfig.json`
- …连同其余 4 个文件

### 02 · 2026-09-15 · feat(server): 数据库访问层与建表脚本（28 张表）

提交 `cb3246c` · 4 个文件 · +1,165 / −0 行

> 原生模块需要 node-gyp 编译，部分部署沙箱拉不到 Node headers，所以前两个放在
> optionalDependencies，装失败只警告不中断，运行时自动降级到 WASM 版。
> util.js 提供密码加盐哈希、JWT 签发校验（带 token_epoch）、字段脱敏。

涉及文件：

- `源码/server/db-driver.js`
- `源码/server/db.js`
- `源码/server/schema.sql`
- `源码/server/util.js`

### 03 · 2026-09-16 · feat(server): 统一接口层——120+ action、鉴权、限流与静态托管

提交 `1a0ff0b` · 1 个文件 · +3,922 / −0 行

> 这样鉴权、限流、错误码、日志只写一次，新增接口不用动路由。
> 同进程托管 dist/webroot 并对 SPA 路由兜底（刷新 /index/memory 不会 404）。
> AI 调用全部走服务端代理，密钥不进前端产物；密钥可存库、运行时热改，仅超管可操作。

涉及文件：

- `源码/server/index.js`

### 04 · 2026-09-17 · feat(server): 3D 房间数据——家具、布局、访客与摆件修复

提交 `5aefb1a` · 1 个文件 · +1,274 / −0 行

> 改判家具类型、归位/转向越界摆件、补齐缺失条目。访客与宠物状态也走这里。

涉及文件：

- `源码/server/room.js`

### 05 · 2026-09-18 · feat(server): 微信扫码登录（网站应用授权）

提交 `b31b6b9` · 1 个文件 · +399 / −0 行

> 失败时降级为普通账号登录，不影响主流程可用性。

涉及文件：

- `源码/server/wechat-auth.js`

### 06 · 2026-09-19 · feat(web): 应用入口、路由守卫与 Pinia 状态管理

提交 `979ae88` · 10 个文件 · +1,764 / −0 行

> 五个 store：cloudAuth（登录态）、memories（记忆岛与条目）、companion（宠物）、
> island（云海导航）、ui（弹层与提示）。
> 路由守卫按登录态重定向，未登录只能到欢迎页。

涉及文件：

- `源码/src/App.vue`
- `源码/src/fontSize.js`
- `源码/src/main.js`
- `源码/src/perf.js`
- `源码/src/router/index.js`
- `源码/src/stores/cloudAuth.js`
- `源码/src/stores/companion.js`
- `源码/src/stores/memories.js`
- …连同其余 2 个文件

### 07 · 2026-09-21 · feat(web): API 客户端与静态数据配置

提交 `24d59ef` · 13 个文件 · +1,719 / −0 行

> data/ 放精灵图帧表、岛屿配置、BGM 清单、头像映射这些纯配置。
> composables/ 抽录音转文字的复用逻辑。

涉及文件：

- `源码/src/api/aiCover.js`
- `源码/src/api/cloud.js`
- `源码/src/api/deepseek.js`
- `源码/src/cloud/backup.js`
- `源码/src/cloud/client.js`
- `源码/src/cloud/localLogin.js`
- `源码/src/composables/usePersistentState.js`
- `源码/src/composables/useRateLimit.js`
- …连同其余 5 个文件

### 08 · 2026-09-23 · feat(web): 视觉素材——岛屿切图、背景、宠物精灵图与手写字体

提交 `f98e30a` · 72 个文件 · +0 / −0 行

> （宠物精灵图 1536x2288 -> 512x763，体积 4.1MB -> 523KB，逻辑帧坐标不变）。

涉及文件：

- `源码/src/assets/cat-calico.webp`
- `源码/src/assets/cat-tabby.webp`
- `源码/src/assets/cat-tuxedo.webp`
- `源码/src/assets/cat-white.webp`
- `源码/src/assets/diaryOrMnemonicBackground.webp`
- `源码/src/assets/feedbackBackground.webp`
- `源码/src/assets/hand-writing-subset.woff2`
- `源码/src/assets/indexBackground.webp`
- …连同其余 64 个文件

### 09 · 2026-09-25 · feat(web): 欢迎页、登录注册与找回密码

提交 `e5a8a1c` · 4 个文件 · +2,433 / −0 行

> 容器用 contain 盒保证任何窗口比例都不裁切。
> 登录弹窗支持手机号 + 口令注册，找回密码走同一套校验。小屏下滑隐藏拍立得墙。

涉及文件：

- `源码/src/components/authModal.vue`
- `源码/src/components/forgotPassword.vue`
- `源码/src/components/welcome.vue`
- `源码/src/components/welcomeAuth.vue`

### 10 · 2026-09-27 · feat(web): 主框架——左侧图标栏与记忆岛云海

提交 `5d30d2b` · 2 个文件 · +2,920 / −0 行

> islandIndex.vue 是云海页，记忆岛按 26vw 档位绝对定位，带视差与漂浮动画。
> 小屏下图标栏保留、按钮抬到 44x44，云海改为纵向排布。

涉及文件：

- `源码/src/components/index.vue`
- `源码/src/components/islandIndex.vue`

### 11 · 2026-10-08 · feat(web): 记忆库与记忆详情

提交 `daa0bd1` · 3 个文件 · +4,959 / −0 行

> 控件按 % 定位，桌面端像素级还原设计稿。
> 记忆详情支持封面、正文、媒体混排、点赞与评论；分享出去的是只读视图。
> 小屏下解除容器查询、卡片回到文档流单列整宽，海报退成顶部装饰条。

涉及文件：

- `源码/src/components/memory.vue`
- `源码/src/components/memoryDetail.vue`
- `源码/src/components/shareView.vue`

### 12 · 2026-10-13 · feat(web): 拾光广场——信息流、关注、热门/最新筛选

提交 `84adf8b` · 2 个文件 · +3,826 / −0 行

> 单向绑定投影，改一处两处同步；删除动态只把 is_public 置 0、不删记忆。
> 筛选在服务端做：热门 >=5 赞或 >=3 评论，最新为 3 天内，不够线时退回全部并告知前端。

涉及文件：

- `源码/src/components/authorCard.vue`
- `源码/src/components/square.vue`

### 13 · 2026-10-18 · feat(web): 3D 房间宿主、加载页与交互覆盖层

提交 `87d3c7a` · 3 个文件 · +2,864 / −0 行

> 不用为 3D 单独起服务。
> 首屏要下 ~130MB 资源，加载页做成可玩的跑酷小游戏 + 真实字节进度
> （RT 按 URL 累加 + 拦截 XHR progress，再叠一条平滑曲线兜底，封顶 92%）。
> 覆盖层：返回、五个机位、操作提示卡。小屏隐藏桌面键鼠说明、换触屏手势文案。

涉及文件：

- `源码/src/components/idleThought.vue`
- `源码/src/components/room3d.vue`
- `源码/src/room/warmup.js`

### 14 · 2026-10-21 · feat(web): 2D 陪伴宠物与 AI 伙伴

提交 `fa226c0` · 3 个文件 · +2,093 / −0 行

> 位置和帧不在同一个循环里：坐标由 rAF 直写 transform（不走响应式），
> 换帧用 setTimeout 自排、静止时睡够再醒，移动结束就停 rAF——避免 15fps 一跳一跳。
> 小屏按屏宽自动缩到 88~132px。

涉及文件：

- `源码/src/components/aiCompanion.vue`
- `源码/src/components/petCompanion.vue`
- `源码/src/components/petSprite.vue`

### 15 · 2026-10-23 · feat(web): 个人中心、隐私可见性、反馈与公告

提交 `128471d` · 6 个文件 · +5,382 / −0 行

> 隐私页控制每条记忆的可见范围；反馈页收集问题与联系方式。
> 公告条做成可关闭，关闭状态本地记住。

涉及文件：

- `源码/src/components/cloudNotice.vue`
- `源码/src/components/cloudPanel.vue`
- `源码/src/components/feedback.vue`
- `源码/src/components/privacy.vue`
- `源码/src/components/profile.vue`
- `源码/src/components/videoNotice.vue`

### 16 · 2026-10-25 · feat(admin): 管理中心——用户、内容、活动与 AI 密钥

提交 `3aa0ac9` · 1 个文件 · +2,490 / −0 行

> 且超管行的密码对任何管理员都不下发。
> AI 密钥存 app_secret 表、只在内存缓存、改完立即生效，接口只回掩码，仅超管可改。
> 数据可整库导出/回灌（含密码哈希），用来避免发版冲掉线上数据。

涉及文件：

- `源码/src/components/admin.vue`

### 17 · 2026-10-26 · build(3d): 3D 房间构建产物（web-mobile）

提交 `09344e0` · 258 个文件 · +588 / −0 行

> 评审不需要安装 Cocos 编辑器就能看到完整房间效果。
> 产物里注入了一小段进度上报脚本（不画界面，界面统一由宿主渲染）。

涉及文件：

- `源码/public/room3d/application.js`
- `源码/public/room3d/assets/internal/config.json`
- `源码/public/room3d/assets/internal/import/07/07d3aae9f.json`
- `源码/public/room3d/assets/internal/index.js`
- `源码/public/room3d/assets/main/config.json`
- `源码/public/room3d/assets/main/import/06/0699aaa4c.json`
- `源码/public/room3d/assets/main/import/0f/0f79389f7.json`
- `源码/public/room3d/assets/main/import/fd/fd8ec536-a354-4a17-9c74-4f3883c378c8.json`
- …连同其余 250 个文件

### 18 · 2026-10-27 · feat(web): 音频、背景图与辅助静态页

提交 `34becbb` · 6 个文件 · +48 / −0 行

> 背景图同时提供 -sm 降采样版本，小屏按需加载。

涉及文件：

- `源码/public/bg/welcome-sm.webp`
- `源码/public/bg/welcome.webp`
- `源码/public/clear-storage.html`
- `源码/public/favicon.svg`
- `源码/public/music/bgm-default.mp3`
- `源码/public/music/zuixiangshuo.ogg`

### 19 · 2026-10-27 · chore: 构建、图片优化、进度注入与运维脚本

提交 `de3247d` · 19 个文件 · +2,938 / −0 行

> - check-undef：自研静态检查，抓「构建通过但运行时 undefined」
> - pet-frames-gen：精灵图帧表生成
> - data-sync：数据库备份/比对/拉取
> - make-admin：把账号设为管理员（注册接口不写 role，新库第一个管理员要手动建）
> - 部署同步：多份 webroot 副本之间保持一致

涉及文件：

- `源码/scripts/_alpha.mjs`
- `源码/scripts/check-undef.mjs`
- `源码/scripts/clear-database-local.mjs`
- `源码/scripts/clear-database.mjs`
- `源码/scripts/copy-public.mjs`
- `源码/scripts/copy-room3d.mjs`
- `源码/scripts/copy-webroot.mjs`
- `源码/scripts/data-sync.mjs`
- …连同其余 11 个文件

### 20 · 2026-10-28 · docs: 补充项目 README、部署与开发说明

提交 `e871ed2` · 3 个文件 · +733 / −0 行

> 常用命令、部署要点与团队信息。
> DEPLOY.md 记录线上部署与数据导出回灌流程；HOWTO.md 是开发期踩坑记录。

涉及文件：

- `源码/DEPLOY.md`
- `源码/HOWTO.md`
- `源码/README.md`

### 21 · 2026-10-28 · chore: 保留早期 uniCloud 方案（未启用）

提交 `fdd527b` · 22 个文件 · +1,743 / −0 行

> 当前运行的是 Express + SQLite，这套不参与构建。
> 保留它只为保持历史完整。

涉及文件：

- `源码/uniCloud-aliyun/cloudfunctions/seed-demo/index.js`
- `源码/uniCloud-aliyun/cloudfunctions/seed-demo/package.json`
- `源码/uniCloud-aliyun/cloudfunctions/timepick-api/index.js`
- `源码/uniCloud-aliyun/cloudfunctions/timepick-api/package.json`
- `源码/uniCloud-aliyun/database/activity.schema.json`
- `源码/uniCloud-aliyun/database/activity_comment.schema.json`
- `源码/uniCloud-aliyun/database/activity_join.schema.json`
- `源码/uniCloud-aliyun/database/ai_conversation.schema.json`
- …连同其余 14 个文件

### 22 · 2026-10-28 · feat(3d): Cocos Creator 3D 房间工程源码

提交 `e5e4b2e` · 109 个文件 · +15,194 / −0 行

> library/temp/build 是编辑器缓存，打开工程会自动重建，未纳入版本库。
> 用 Cocos Creator 3.8.8 打开本目录即可编辑。

涉及文件：

- `02-3D房间工程/.gitignore`
- `02-3D房间工程/assets/resources.meta`
- `02-3D房间工程/assets/resources/models.meta`
- `02-3D房间工程/assets/resources/models/furniture.meta`
- `02-3D房间工程/assets/resources/models/furniture/camera_my.glb`
- `02-3D房间工程/assets/resources/models/furniture/camera_my.glb.meta`
- `02-3D房间工程/assets/resources/models/furniture/computer.glb`
- `02-3D房间工程/assets/resources/models/furniture/computer.glb.meta`
- …连同其余 101 个文件

### 23 · 2026-10-28 · docs: 运行说明、环境变量模板、数据库说明与作品文档

提交 `6ea3896` · 5 个文件 · +710 / −0 行

> 环境变量模板逐项注释（全部用占位符，不含任何真实密钥）。
> 数据库说明列 28 张表的职责与关键字段。
> 作品文档是提交用的作品介绍（项目说明、AI 能力、创新点、技术实现）。

涉及文件：

- `03-运行与部署说明/数据库说明.md`
- `03-运行与部署说明/环境变量示例.env`
- `03-运行与部署说明/运行说明.md`
- `04-作品文档/作品介绍.md`
- `05-演示视频/说明-视频要求与录制脚本.txt`

### 24 · 2026-10-28 · fix(docs): 清理环境变量示例里的真实密钥，并同步目录改名

提交 `6e64ba1` · 4 个文件 · +586 / −586 行

> 以及超管手机号，全部换成占位符（手机号用 13800138000）。
> 这类文件会随仓库和提交包一起外泄，必须用占位符。
> - 目录 01-网站源码-前端与后端 已改名为 源码，五份文档里的路径引用同步更新。

涉及文件：

- `03-运行与部署说明/数据库说明.md`
- `03-运行与部署说明/环境变量示例.env`
- `03-运行与部署说明/运行说明.md`
- `04-作品文档/作品介绍.md`

### 25 · 2026-10-28 · docs: 补充 Git 提交记录文档，修正 README 的路径说明

提交 `4d90ade` · 2 个文件 · +617 / −37 行

> 把仓库的提交历史导出成一份可离线阅读的文档，逐条列出日期、类型、模块、
> 涉及文件数与增删行数，方便评审不依赖网络也能看到开发节奏。
> README 里 `01-网站源码-前端与后端` 改名后的路径引用同步更新。

涉及文件：

- `Git提交记录.md`
- `README.md`

### 26 · 2026-10-28 · docs: 提交记录改用不随提交数变化的表述

提交 `92d736e` · 1 个文件 · +3 / −3 行

> 提交数是会变的，写死在文档里每提交一次就要改一处。
> 改成「按功能模块推进」这类描述，只保留可从 `git log` 直接数出来的硬指标。

涉及文件：

- `Git提交记录.md`

### 27 · 2026-10-28 · refactor(server): 超管手机号改由环境变量提供，环境变量加载提到模块最前

提交 `72d02ba` · 6 个文件 · +145 / −45 行

> 超管账号原来在代码里写了默认手机号，等于把某个人固定成超管，
> 换成 `SUPER_ADMIN_USERNAME` 环境变量：不填则超管功能整体关闭并打日志，不会误开。
> 另外 `.env.local` 原来加载得比 `util.js` 读 `JWT_SECRET` 更晚，
> 线上一直落到公开的默认密钥上（意味着谁都能伪造 token）——
> 把 `load-env.js` 提到所有模块最前，一并修掉。

涉及文件：

- `03-运行与部署说明/环境变量示例.env`
- `README.md`
- `源码/.env.example`
- `源码/server/db.js`
- `源码/server/index.js`
- `源码/server/load-env.js`

### 28 · 2026-10-30 · feat(ai): 摆件语义检索、记忆语义搜索与小橘语音问答，补匿名私信与手机端适配

提交 `edaa88b` · 26 个文件 · +2,016 / −276 行

> 3D 房间的摆件原来是关键词命中，用户写「外婆煮面」不会摆出一只杯子。
> 改成双通道：字面 TF-IDF（中文单字 + bigram）+ 文本向量（`text-embedding-v3`），
> 按 0.55 / 0.45 融合；两边都不确定且配了 DeepSeek 时，再把候选清单交给模型挑。
> 检索结果落到 `memory_item.prop_furniture`，`planSpace` 保持纯同步，
> 重排和重启都不会漂移。
>
> 记忆搜索同理，但只在字面 0 命中时才请求语义接口，常规搜索零延迟。
>
> 语音是这次耗时最长的一处：整段一次性合成要等 19 秒才出声。
> 拆成「首句 6~26 字 + 长尾」两段并发，首句 1.8 秒就能播，长尾在播放间隙补上。
> 音频转存到 `/uploads/tts/`，官方链接 24 小时就失效，直接引用会变成死链。
>
> 举报处置原来只下架广场动态，启动时补投影会把它复活；
> 改成落到记忆本体（`is_public=0`、`shared_at=0` 并 `unprojectMemory`）。
> 管理员通知改用匿名署名，举报人和被举报人互相看不到对方身份。

涉及文件（节选）：

- `源码/server/propSearch.js`（新增）
- `源码/server/propEmbed.js`（新增）
- `源码/server/memorySearch.js`（新增）
- `源码/server/room.js`
- `源码/server/index.js`
- `源码/src/components/aiCompanion.vue`
- `源码/src/components/memory.vue`
- `源码/src/components/room3d.vue`
- `源码/src/components/admin.vue`
- `源码/src/components/privacy.vue`
- `拾光系统部署与三维房间验证报告_提交版.docx`（新增）

### 29 · 2026-10-30 · docs: Git 提交记录补到第 28 次，统计数字按当前仓库重算

提交 `046a48c` · 1 个文件 · +85 / −4 行

> 提交数、时间跨度、跟踪文件数、代码增删行数都按当前仓库重算了一遍，
> 逐条详情补上第 25~28 条。这类统计手工维护容易过期，所以只保留 `git log` 能直接数出来的硬指标。

涉及文件：

- `Git提交记录.md`

### 30 · 2026-10-30 · fix(server): 占位符兜底区分密钥与普通变量，注册口令不再把中文模板当口令

提交 `63b6eeb` · 2 个文件 · +54 / −10 行

> 这是「别人拿到包自己部署」这条链路上最后一个会卡住人的地方。
> 照抄 `.env.example` 不改就启动，注册口令是「请设置一个只有你知道的口令」这句中文，
> 注册页根本没法输入。
>
> 上一版只清除了 `*_KEY` 结尾的变量，其余只打警告。现在按变量语义分两套判据：
> 密钥类含非 ASCII 一定占位符（合法凭证都是 ASCII）；
> 手机号、注册口令这类只认模板里的固定话术，避免把用户自己填的中文口令误判掉。
>
> `JWT_SECRET` 是占位符时改成每次启动随机生成 —— 占位符是写在公开仓库里的字符串，
> 拿它签 token 等于谁都能伪造；代价是重启后重新登录，写在启动日志和运行说明里。

涉及文件：

- `源码/server/load-env.js`
- `03-运行与部署说明/运行说明.md`

## 如何查看这些记录

**在 GitHub 上**：仓库首页文件列表右上角点提交数（显示为 `N Commits`），或直接访问

```
https://github.com/asdasd123-w/TimePick/commits/main
```

点任意一条提交，能看到改动文件列表与逐行差异。单条提交的地址形如
`https://github.com/asdasd123-w/TimePick/commit/<提交哈希>`。

**在本地**（进入仓库根目录后）：

```bash
git log --oneline            # 一行一条，看整体节奏
git log --stat               # 带每个提交改了哪些文件
git log --pretty=format:"%ad %s" --date=short
git show <提交哈希>          # 看某一次提交的完整改动
```
