# 拾光 TimePick

> 把一段段记忆，放进一座座会呼吸的岛。

拾光是一个「记忆可视化」的个人空间。你写下的东西不会堆成一条列表，而是变成一座座漂浮在云海里的**记忆岛**；
点进去是一座可以走动的 **3D 房间**——家具、窗前的光、脚边跟着你的小猫，都是你自己放进去的。

桌面和手机是同一套代码，手机浏览器打开即用，不需要装 App。

- **在线演示**：https://timepick-memory.app.workbuddy.host/
- **运行环境**：Node.js ≥ 20.11，单进程单端口，无需数据库服务

---

## 目录

- [一、这个项目解决什么问题](#一这个项目解决什么问题)
- [二、功能清单](#二功能清单)
- [三、技术架构](#三技术架构)
- [四、安装与运行](#四安装与运行)
- [五、环境变量](#五环境变量)
- [六、目录结构](#六目录结构)
- [七、常用命令](#七常用命令)
- [八、部署](#八部署)
- [九、团队信息](#九团队信息)

---

## 一、这个项目解决什么问题

日记类产品普遍有个矛盾：**记录很容易，回看不发生**。

用户写了几百条，全变成一个越来越长的列表，翻两次就不想再翻。拾光的做法是把「时间线」换成「空间」：

| 传统日记 | 拾光 |
|---|---|
| 一条条列表，靠日期找 | 一座座岛，靠「那是哪段日子」找 |
| 纯文字 + 图片 | 文字 + 图片 + 可以走进去的 3D 房间 |
| 只给自己看 | 可以分享到广场，也可以只给自己看 |
| 宠物是装饰 | 小猫记得你多久没回来，会说不同的话 |

**核心流程**：注册 → 选一座岛 → 写一条记忆（AI 帮忙取标题、生成封面）→ 在记忆库里翻 → 分享到广场 → 进 3D 房间摆家具、和宠物互动。

**目标用户**：大学生与初入职场的人——有记录习惯，但讨厌「归档感」的整理工作。

---

## 二、功能清单

| 模块 | 能力 |
|---|---|
| 账号 | 手机号注册/登录、找回密码、微信扫码登录、JWT 鉴权（改密后旧令牌立即失效） |
| 记忆库 | 记忆岛（容量上限）、记忆条目增删改查、搜索、按岛/日期筛选、媒体上传（图/视频） |
| AI | 生成标题（≤4 字）、正文润色、生成封面（智谱 CogView）、图生视频（万相）、录音转文字（ASR） |
| 广场 | 信息流、点赞/评论、关注、私信、举报；筛选：全部 / 关注 / 热门（≥5 赞或≥3 评论）/ 最新（3 天内） |
| 活动 | 发布活动、报名、参与人数、活动详情 |
| 3D 房间 | 五个机位（小屋/室内/花园/书桌/岛体）、家具摆放与旋转、访客、宠物互动、首屏加载小游戏 |
| 我的 | 资料、头像、陪伴宠物（5 种花色）、隐私可见性、数据导出 |
| 管理中心 | 用户管理、记忆/广场内容管理、活动管理、AI 密钥管理、数据备份与恢复 |
| 移动端 | 360 / 390 / 768 三档断点，全部按钮 ≥32px（主操作 44px） |

**权限设计**：超级管理员不可被删除、不可被禁用、不可被取消管理员、密码不可被重置，且其密码对任何管理员都不下发——防止管理员之间互相夺权。

---

## 三、技术架构

### 3.1 整体结构

```
浏览器（Vue 3 SPA）
   │
   ├─ 页面 / 组件 ──── Pinia store ──── api/cloud.js
   │                                      │
   │                              统一 RPC：POST /api {action, params, token}
   │                                      │
   └─ iframe（3D 房间）              Express 5（单进程）
        │  postMessage 双向                ├─ 接口层 index.js（120+ action）
        └─ Cocos 3.8.8 构建产物            ├─ room.js（3D 房间数据 / 家具 / 访客）
                                          ├─ 业务模块（记忆 / 广场 / 活动 / AI / 管理）
                                          └─ SQLite（28 张表，三级驱动兜底）
```

关键决定：**没有为 3D 单独起服务**。Cocos 的构建产物是纯静态文件，放在 `public/room3d/`，
宿主页面用 `iframe` 加载，进度通过 `postMessage` 回传；房间数据仍走同一套 `/api`。

### 3.2 技术选型

| 层 | 选型 | 为什么 |
|---|---|---|
| 前端 | Vue 3（`<script setup>`）+ Vite + Pinia + vue-router | 组合式 API 适合这种页面状态多的项目；Vite 构建快 |
| 后端 | Express 5 + better-sqlite3 | 单进程单端口，一台最小规格云主机就能跑，不依赖外部数据库服务 |
| 数据库 | SQLite（28 张表） | 作品级并发足够；备份就是一个文件，`admin/data/export` 可整库导出导入 |
| 3D | Cocos Creator 3.8.8 | 场景编辑器成熟，导出 web-mobile 产物体积可控，脚本用 TypeScript |
| AI | DeepSeek（文本）/ 智谱 CogView（图）/ 万相（视频、ASR） | 全部走后端代理，密钥不进前端产物 |

### 3.3 三个关键设计

**① 单入口 RPC，不用 REST**

所有接口都是 `POST /api {action, params, token}`，服务端一张 action 表分发。
好处：鉴权、限流、错误码、日志只写一次；新增接口不需要动路由。

**② SQLite 三级驱动兜底**

`better-sqlite3` 需要 node-gyp 编译，部分部署沙箱拉不到 Node headers。所以运行时按
`better-sqlite3` → `node:sqlite`（Node 内置）→ `node-sqlite3-wasm`（纯 WASM）**依次尝试**，
对外接口完全一致。前两个放进 `optionalDependencies`，装失败只警告不中断。

**③ 广场动态与记忆是同一份数据**

发布先落 `memory_item`，再用 `square_post.memory_id` 单向绑定投影。改一处两处同步；
删除动态只把 `is_public` 置 0、不删记忆——避免「发到广场后记忆库里找不到」的割裂感。

### 3.4 工程质量

| 项 | 数据 |
|---|---|
| 前端 | 24 个 Vue 组件、5 个 Pinia store、23 个 JS 模块 |
| 后端 | `index.js` 3900+ 行、`room.js` 1270+ 行、`schema.sql` 386 行（28 张表） |
| 接口 | 120+ 个 action |
| 3D | 12 个 TypeScript 脚本、1 个主场景、23 个 glTF 模型 |
| 自检 | 自研 `check-undef` 静态检查（53 个文件，抓「构建通过但运行报错」的问题） |

---

## 四、安装与运行

### 4.1 环境要求

| 项 | 版本 |
|---|---|
| Node.js | **≥ 20.11**（需要 `node:sqlite` 作为兜底驱动） |
| npm | ≥ 10 |
| 操作系统 | Windows / macOS / Linux 均可（原生依赖装不上会自动落到 WASM 版 SQLite） |
| 浏览器 | Chrome / Edge / Safari 近两年版本（3D 房间需要 WebGL 2.0） |

### 4.2 四步跑起来

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（至少填 JWT_SECRET）
cp 环境变量示例.env .env.local    # Windows: copy 环境变量示例.env .env.local

# 3. 构建前端
npm run build

# 4. 启动
node server/index.js
```

浏览器打开 **http://localhost:8787** —— 前端页面、`/api` 接口、上传文件全部由这一个进程提供。

> `环境变量示例.env` 在 `03-运行与部署说明/` 目录里（若只拿到源码目录，可参考第五节的表格自己建）。

### 4.3 创建第一个管理员

注册接口不写 `role`，新库里第一个管理员要手动创建：

```bash
npm run admin:grant -- 13800138000     # 换成你刚注册的手机号
```

重新登录后左侧会出现「管理中心」。超管账号由 `SUPER_ADMIN_USERNAME` 决定，同样在 `.env.local` 里改。

### 4.4 开发模式（改代码时用）

```bash
npm run dev      # 前端热更新，http://localhost:5173
npm run server   # 后端，http://localhost:8787
```

两边都开着。此时 `.env.local` 里要写 `VITE_CLOUD_API_BASE=http://localhost:8787/api`（跨端口）。

改完前端建议跑一次静态检查，能抓出「构建通过但运行时 undefined」这类问题：

```bash
npm run check:undef     # ✓ 未发现未定义标识符 (已扫描 53 个文件)
```

### 4.5 手机上访问（局域网自测）

后端是 `app.listen(PORT, '0.0.0.0')`，默认监听所有网卡，不用改代码：

1. 查本机 IP：Windows `ipconfig`（找「无线局域网适配器 WLAN」的 IPv4）/ macOS `ifconfig | grep "inet "`
2. 手机连**同一个 Wi-Fi**
3. 手机浏览器打开 `http://<那个IP>:8787`（**必须带 `http://`**）

打不开的常见原因：IP 变了（DHCP 每次重连可能换），或该 Wi-Fi 开了**客户端隔离（AP isolation）**
（校园网、酒店网常见）——用手机开热点、电脑连热点最稳。完整排查见 `03-运行与部署说明/运行说明.md` 第六节。

---

## 五、环境变量

在项目根目录新建 `.env.local`（已被 `.gitignore` 忽略，不会进仓库）。完整模板见
`03-运行与部署说明/环境变量示例.env`，下面是逐项说明。

| 变量 | 必填 | 说明 |
|---|---|---|
| `JWT_SECRET` | **是** | 登录令牌签名密钥，建议 32 位以上随机串。不配也能启动，但重启后所有人都要重新登录 |
| `PORT` | 否 | 后端端口，默认 `8787` |
| `VITE_CLOUD_API_BASE` | 否 | 前端请求地址。单端口模式写 `/api`；开发模式写 `http://localhost:8787/api` |
| `DEEPSEEK_API_KEY` | 否 | DeepSeek 密钥：生成标题、正文润色、AI 对话、封面画面描述 |
| `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | 否 | 默认 `https://api.deepseek.com` / `deepseek-chat` |
| `ZHIPU_API_KEY` | 否 | 智谱密钥：AI 生成记忆封面（CogView） |
| `ZHIPU_IMAGE_MODEL` / `ZHIPU_IMAGE_SIZE` | 否 | 默认 `cogview-3-flash` / `1344x768` |
| `DASHSCOPE_API_KEY` | 否 | 阿里云百炼（万相）密钥：图生视频、录音转文字 |
| `DASHSCOPE_I2V_MODEL` | 否 | 默认 `wan2.2-i2v-flash` |
| `SUPER_ADMIN_USERNAME` | 否 | 超级管理员的注册手机号 |
| `REGISTER_PASSPHRASE` | 否 | 注册口令，默认「优乐美」 |
| `AI_DAILY_VIDEO_LIMIT` | 否 | 每用户每天 AI 视频生成上限，默认 `10` |

**AI 相关密钥全部留空也不影响主流程**：标题、封面、视频这些入口会自动隐藏，其余功能照常。

所有 AI 调用都走**后端代理**（`ai/chat`、`ai/cover` 等 action），密钥不会打进前端产物；
运行时还可以在「管理中心 → AI 密钥」里改（存库、只在内存缓存、改完立即生效，只有超管能改）。

### 依赖清单

| 类型 | 包 |
|---|---|
| 运行时 | `express` `better-sqlite3`(可选) `node-sqlite3-wasm` `sharp`(可选) |
| 前端 | `vue` `vue-router` `pinia` |
| 构建 | `vite` `@vitejs/plugin-vue` `oxfmt` |

> `better-sqlite3` 与 `sharp` 刻意放在 `optionalDependencies`：它们需要 node-gyp 编译，
> 装失败时 npm 只警告不中断，运行时由 `server/db-driver.js` 自动落到 WASM 版 SQLite。

---

## 六、目录结构

```
.
├─ index.html                SPA 入口
├─ vite.config.js            构建配置（outDir: dist，别名 @ → src）
├─ src/
│  ├─ main.js                应用入口
│  ├─ App.vue                根组件（全局样式基座 + 移动端安全区）
│  ├─ router/                路由与登录守卫
│  ├─ stores/                Pinia：cloudAuth / memories / companion / island / ui
│  ├─ api/cloud.js           统一 API 客户端：call(action, params)
│  ├─ components/            23 个页面与组件
│  │   ├─ welcome.vue        欢迎页（海报 + 拍立得墙）
│  │   ├─ index.vue          主框架（左侧图标栏）
│  │   ├─ islandIndex.vue    记忆岛云海
│  │   ├─ memory.vue         记忆库
│  │   ├─ square.vue         拾光广场
│  │   ├─ room3d.vue         3D 房间宿主（iframe + 加载页 + 覆盖层 UI）
│  │   ├─ petCompanion.vue   2D 陪伴宠物
│  │   ├─ profile.vue / privacy.vue / admin.vue
│  │   └─ ...
│  ├─ data/                  精灵图帧表、岛屿配置、BGM 清单、头像映射
│  ├─ composables/           录音转文字等可复用逻辑
│  └─ assets/                71 张 webp 素材（pet/ 与 opt/ 是运行时用的降采样版本）
├─ server/
│  ├─ index.js               统一接口层（120+ action）+ 静态托管 + SPA 兜底
│  ├─ room.js                3D 房间：家具、布局、访客、摆件修复
│  ├─ db.js / db-driver.js   数据库访问层与三级驱动兜底
│  ├─ schema.sql             28 张表
│  ├─ wechat-auth.js         微信扫码登录
│  └─ util.js                密码哈希、JWT、脱敏
├─ public/
│  ├─ room3d/                3D 房间构建产物（可直接运行，不需要 Cocos 编辑器）
│  ├─ bg/  music/
│  └─ ...
├─ scripts/                  构建、图片优化、进度注入、数据同步、自检
└─ package.json
```

**3D 工程源码**是独立目录（Cocos Creator 3.8.8 工程），与网站并列提交：

```
02-3D房间工程/
├─ assets/
│  ├─ scene/main.scene       主场景
│  ├─ scripts/               12 个 TypeScript（房间控制器、家具、宠物、宿主通信）
│  └─ resources/models/      23 个 glTF 模型
├─ settings/ profiles/       工程与构建配置
└─ package.json              creator.version = 3.8.8
```

> 打开方式：用 Cocos Creator 3.8.8 打开该目录；`library/` `temp/` `build/` 会自动重建，未提供。
> 网站实际加载的是 `public/room3d/` 里的构建产物，评审不需要装 Cocos 也能跑。

---

## 七、常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 前端开发服务器（端口 5173） |
| `npm run server` | 只启动后端（端口 8787） |
| `npm run build` | 构建前端 → `dist/`，再同步到 `webroot/` |
| `node server/index.js` | 生产模式启动（单端口 8787） |
| `npm run check:undef` | 静态检查未定义标识符 |
| `npm run format` | 用 oxfmt 格式化 `src/` |
| `npm run admin:grant -- <手机号>` | 把某个账号设为管理员 |
| `npm run seed:demo` | 灌入演示数据，方便快速看到"有内容"的效果 |
| `npm run preview` | 预览构建产物 |

---

## 八、部署

生产环境就是**一个 Node 进程 + 一个端口**：

```bash
npm ci
npm run build
node server/index.js          # 监听 0.0.0.0:$PORT
```

`server/index.js` 按 `dist → webroot` 顺序找静态目录，同时托管 `/api`，并对 SPA 路由做兜底
（刷新 `/index/memory` 不会 404）。

需要注意的两点：

1. **数据在 `server/data/`**（SQLite 文件 + 上传的媒体），部署时要单独保留/挂载，不要被发版覆盖；
   已在 `.gitignore` 里排除。
2. **备份用内置接口**：`admin/data/export` 导出整库（含密码哈希），`admin/data/import` 以 replace 模式回灌。
   这是为了避免"发版把线上数据冲掉"——本项目真实踩过这个坑，所以流程固定为
   **导出 → 发版 → 回灌**。

更细的部署说明见 `DEPLOY.md`，常见问题见 `HOWTO.md`。

---

## 九、团队信息

| 角色 | 姓名 | 负责内容 |
|---|---|---|
| 队长 / 全栈 | 【请填写】 | 产品设计、前端页面与 3D 房间、后端接口 |
| 队员 | 【请填写】 | 【请填写】 |

- **参赛赛事**：【请填写】
- **院校 / 班级**：【请填写】
- **联系方式**：【请填写】

---

## 十、说明

项目在开发过程中经历过一次架构迁移——早期尝试过 uniCloud 云函数方案，源码中保留的
`uniCloud-aliyun/` 目录是那套方案的数据库 schema 与云函数，**当前未启用**，
实际运行的是 Express + SQLite 方案。保留它只为保持历史完整。

`src/components/home.vue`（原「首页」）已于 2026-10-27 按需求整页下线，路由与导航已同步移除。
