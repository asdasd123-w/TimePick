# TimePick 部署指南

> 日常操作（改代码上线 / 管数据库 / 命令速查）看 **[HOWTO.md](./HOWTO.md)** 就够了，
> 这份文档记的是「为什么这么做」和踩过的坑。

## 〇、一键发布到公网（当前线上线路，推荐先看这段）

线上地址走的是「Express 单端口同时托管前端 + API」这条路，不是 uniCloud。要点：

1. **单端口**：`server/index.js` 生产环境下会顺带托管前端产物，并对 history 路由做 SPA 兜底
   （`/index/memory` 这类地址刷新不会 404）。查找目录顺序是 `dist` → `webroot`。
2. **`webroot` 是刻意的副本**：发布工具压缩上传时会排除「构建产物」目录，`dist` 有被丢掉的
   风险，所以 `npm run build` 末尾会用 `scripts/copy-webroot.mjs` 再产出一份 `webroot`。
   两份只要有一份在，服务就能起来。
3. **原生依赖必须可选**：`better-sqlite3` / `sharp` 是原生模块（要 node-gyp 编译）。
   部署沙箱里编译不了、也拉不到 Node headers（实测 node-gyp 报
   `request to https://nodejs.org/download/.../node-v22.13.1-headers.tar.gz failed`），
   它们**放在 `optionalDependencies`**，装失败 npm 只警告不中断。
   运行时的驱动选择见 `server/db-driver.js`：`better-sqlite3` → Node 内置 `node:sqlite`
   → `node-sqlite3-wasm`（纯 WASM），对外统一成 `exec / prepare().get|all|run / pragma`。
4. **启动命令**：`node --experimental-sqlite server/index.js`
   （带上 flag 是为了让 Node 内置 sqlite 可用，作为最稳的兜底驱动）。
   安装命令：`npm install --omit=optional --no-audit --no-fund --loglevel=error`。
5. **生产同源 API**：`.env.production` 里 `VITE_CLOUD_API_BASE=/api`。
   `.env.local` 里的 `localhost:8787` 不会影响生产构建（vite 加载顺序里 `.env.production`
   晚于 `.env.local`，会覆盖它）。
6. **上线前把数据库 WAL 落盘**：`timepick.db-wal` 里可能有还没 checkpoint 的数据，
   直接带着半个 WAL 上线会丢数据。用
   `db.pragma('wal_checkpoint(TRUNCATE)')` 收尾，然后删掉 `-wal` / `-shm` 文件。
7. **`.env.local` 会跟着上传**：`.gitignore` 里只有 `*.local` 这一条把它排除了，
   而发布工具只排除 `node_modules/.git/构建产物`，所以密钥是带上去的
   （线上 `system/health` 返回 `ai:true, aiImage:true` 即为密钥生效）。
   不想要这个行为，就把密钥只留在平台环境变量里。

线上体检：`npm run verify:online -- https://<你的域名>`（本地也可跑，默认 8787）。

## 一、后期改代码怎么重新上线（重要，先看这段）

一键发布是**整个项目目录打包上传**，`server/data/timepick.db` 也在包里，
所以「重新发布 = 线上库被本地库覆盖」。线上后来注册的用户、写的记忆会丢。
按下面这套顺序走就不会丢数据：

### A. 只改了后端（`server/*.js`）

```bash
npm run data:pull                     # 1 先把线上数据拉成快照(要管理员密码)
npm run data:merge -- online-xxx.json # 2 合并进本地库(只补本地没有的行)
npm run data:checkpoint               # 3 WAL 落盘
```
然后执行发布（参数见第〇节）。**前端没动就不用 `npm run build`**。

### B. 改了前端（`src/**`）

在上面 1~3 之后加一步构建：

```bash
npm run build                         # 会同时产出 dist/ 和 webroot/
```
再执行发布。**不 build 的话线上还是旧页面**（因为线上吃的是 `webroot`/`dist` 里的产物）。

### C. 每次发布后

```bash
npm run verify:online -- https://timepick-memory.app.workbuddy.host
```

### 数据搬运的几个命令

| 命令 | 作用 |
| --- | --- |
| `npm run data:stat` | 查看本地库现状（各表行数 / 用户 / 最近记忆），只读 |
| `npm run data:backup` | 备份本地库到 `server/data/backups/timepick-<时间>.db`（先自动 checkpoint） |
| `npm run data:pull` | 线上 → 本地快照 `server/data/snapshots/online-*.json`（需管理员密码：`--pass xxx` 或环境变量 `TP_ADMIN_PASS`） |
| `npm run data:merge -- <快照>` | 快照 → 本地库，`INSERT OR IGNORE`，**不会覆盖本地已有数据** |
| `npm run data:push -- <快照> --force` | 快照 → 线上，`replace` 会先清空线上同名表，危险 |
| `npm run data:checkpoint` | 把 WAL 落盘并清掉 `-wal`/`-shm`，发布前必做；顺带提醒未清理的快照 |

两个坑：
- **快照含 `user.password` 哈希**，`data:checkpoint` 会警告，发布前把
  `server/data/snapshots/` 删掉，别让它跟着上传。
- `data:pull` 依赖服务端的 `admin/data/export` 接口（本次新增），
  **当前线上还没有**，得等下一次发布带上后端改动后才能对线上用；
  在那之前对本地 `http://127.0.0.1:8787` 验证过是通的。

### 演示账号之外的提醒

线上库目前是发布那一刻的快照。如果之后线上有了真实用户数据，
每次重新发布前一定先 `pull` + `merge`，否则会被本地库冲掉。

## 二~七、uniCloud 全栈方案（历史线路，当前未使用）

## 架构说明
- **前端**: Vue 3 + Vite → uniCloud 网页托管
- **后端**: uniCloud 云函数 (URL 化) + uniCloud 数据库 (MongoDB)
## 一、创建 uniCloud 服务空间

1. 访问 https://unicloud.dcloud.net.cn 并登录
2. 点击「云开发」→「新建服务空间」
3. 选择「阿里云」，填写空间名称（如 timepick）
4. 创建完成后，在 HBuilderX 中关联此空间

## 二、上传云函数和数据库

### 使用 HBuilderX 上传
1. 用 HBuilderX 打开项目根目录
2. 右键 `uniCloud-aliyun` 目录 →「关联云服务空间或项目」→ 选择刚创建的空间
3. 右键 `uniCloud-aliyun/cloudfunctions/timepick-api` →「上传部署」
4. 右键 `uniCloud-aliyun/database` →「上传 DB Schema」

### 云函数 URL 化
1. 在 uniCloud 控制台 → 云函数 → 找到 `timepick-api`
2. 点击「URL 化」→ 获取访问地址（类似 `https://xxx.bspapp.com/http/timepick-api`）
3. 记录此地址，后续配置前端 API 地址时需要

## 三、配置前端 API 地址

编辑 `.env.local`，将后端地址改为云函数 URL：
```
VITE_CLOUD_API_BASE=https://你的云函数 URL.bspapp.com/http/timepick-api
```

## 四、构建并上传前端

### 1. 重新构建
```bash
npm run build
```

### 2. 上传到 uniCloud 网页托管
**重要：只上传 dist/ 目录的内容，不要上传整个项目！**

使用 HBuilderX：
1. 右键项目 → 发行 → 网站-PC Web 或手机 H5
2. 选择 uniCloud 空间 → 上传

或手动上传：
1. 登录 uniCloud 控制台 → 网页托管
2. 上传 `dist/index.html` 和 `dist/assets/` 文件夹到根目录

## 五、初始化演示数据

在 uniCloud 控制台 → 云数据库 中手动添加演示数据，或通过云函数控制台执行初始化脚本。

演示账号：
- 管理员：优乐美 / 002529
- 普通用户：xiaohe, momo, azhe... / demo123456

## 六、验证部署

1. 访问 uniCloud 网页托管提供的域名
2. 测试注册、登录功能
3. 测试记忆空间、广场、活动等功能
4. 检查云函数日志排查问题

## 常见问题

### Q: 前端请求失败
A: 检查 `.env.local` 中的 `VITE_CLOUD_API_BASE` 是否正确，确保是云函数 URL 化地址

### Q: 云函数调用失败
A: 在 uniCloud 控制台查看云函数日志，检查错误信息

### Q: 数据库权限错误
A: 确保 DB Schema 已正确上传，云函数有数据库访问权限

## 快速命令

```bash
# 本地开发
npm run dev          # 启动前端开发服务器
npm run server       # 启动本地 Express 后端（调试用）

# 构建部署
npm run build        # 构建前端到 dist/
# 然后通过 HBuilderX 上传云函数和 dist/ 到 uniCloud
```

## 附录：自建 Express 后端的环境变量

后端（`server/index.js`）启动时依次读取项目根目录的 `.env.local`、`.env`，
**已存在的系统环境变量优先**（容器/平台注入的不会被文件覆盖）。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `JWT_SECRET` | `timepick@2026#api-secret` | token 签名密钥，**生产必须更换** |
| `DEEPSEEK_API_KEY` | 空 | DeepSeek 密钥，**只在服务端**，切勿加 `VITE_` 前缀 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | 可换兼容 OpenAI 协议的中转 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 模型名 |
| `ZHIPU_API_KEY` | 空 | 智谱密钥（文生图），**只在服务端**，切勿加 `VITE_` 前缀 |
| `ZHIPU_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` | 智谱 API 地址 |
| `ZHIPU_IMAGE_MODEL` | `cogview-3-flash` | 生图模型：`cogview-3-flash`（免费）/ `cogview-4`（约 0.06 元/张） |
| `ZHIPU_IMAGE_SIZE` | `1344x768` | 出图尺寸（横构图，适合封面） |
| `REGISTER_PASSPHRASE` | `优乐美` | 注册口令 |
| `SUPER_ADMIN_USERNAME` | `优乐美` | 超级管理员用户名（唯一可设置/取消管理员） |
| `CORS_ORIGIN` | 空（不限制） | 允许的跨域来源，逗号分隔，如 `https://a.com,https://b.com` |
| `DB_PATH` | `server/data/timepick.db` | 数据库文件路径（测试/备份时可指向其它库） |

> ⚠️ 安全提示
> - 前端 `.env.*` 里带 `VITE_` 前缀的变量会被**打包进 dist 的 JS**，任何访问者都能提取，
>   因此**绝不能**用它存放密钥；DeepSeek 密钥一律放 `DEEPSEEK_API_KEY`。
> - AI 能力由后端 action `ai/chat` 代理，前端只调用 `/api`，不直接接触大模型厂商。
> - 用户改密或账号被禁用后，`user.token_epoch` 自增，此前签发的所有 token 立即失效。
