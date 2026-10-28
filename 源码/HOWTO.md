# TimePick（拾光）操作手册

三件事：① 改代码后怎么重新上线 ② 数据库怎么管 ③ 这个网站到底是怎么跑起来的。

---

## 零、30 秒速查

| 想干什么 | 命令 |
| --- | --- |
| 本地开发 | `npm run dev`（前端 5173）＋ `npm run server`（后端 8787） |
| 看库里有什么 | `npm run data:stat` |
| 改库前留个备份 | `npm run data:backup` |
| 改完前端检查语法 | `npm run check:undef` |
| 打包前端 | `npm run build` |
| 把线上数据拉下来 | `npm run data:pull`（在线上支持后可用） |
| 线上数据合进本地 | `npm run data:merge -- online-xxx.json` |
| 发布前整理数据库 | `npm run data:checkpoint` |
| 上线后体检 | 打开线上地址点几个页面，看后端终端有没有报错（原 `verify:online` 自检脚本已移出项目） |

---

## 一、改代码的步骤

### 1.1 平时开发（不出网）

```bash
npm run dev       # 前端热更新 http://localhost:5173
npm run server    # 后端 http://localhost:8787
```

改完前端先过一遍静态检查，能抓出「build 通过但运行报错」的问题：

```bash
npm run check:undef
```

### 1.2 改完要重新上线

**一句话原则：先保数据，再打包，最后发布。**

```bash
# ① 留后路
npm run data:backup

# ② 把线上新增的数据拉回来（避免下一步被本地库冲掉）
npm run data:pull                       # 需要管理员密码：--pass 你的密码
npm run data:merge -- online-xxx.json   # 合并进本地库

# ③ 只在改了前端时才需要
npm run build

# ④ 整理数据库
npm run data:checkpoint

# ⑤ 发布（跟我说一句"重新发布"，我来执行）
```

> **为什么第 ② 步不能省**：发布是**整个目录打包上传**，`server/data/timepick.db` 也在包里，
> 所以「重新发布 = 线上库被本地库覆盖」。线上之后注册的用户、写的记忆会没。

### 1.3 发布后

打开线上地址，确认首页、记忆库、广场、3D 房间都能正常打开，再看后端终端有没有 5xx。
（原来这里有个 `npm run verify:online` 自检脚本，已移出项目，不再随包提供。）

### 1.4 判断该不该 `npm run build`

| 你改了什么 | 要不要 build |
| --- | --- |
| `src/**`（Vue 组件、样式、JS） | **要**，否则线上还是旧页面 |
| `server/**`（后端接口） | 不用 |
| 只改文档 | 不用 |

---

## 二、管理数据库的步骤

数据库就一个文件：`server/data/timepick.db`（SQLite，560 KB 左右）。

### 2.1 查看现状

```bash
npm run data:stat
```

会列出：各表行数、所有用户（id / 账号 / 昵称 / 是否管理员 / 状态 / 注册日期）、最近 5 条记忆。

### 2.2 备份与恢复（最常用）

```bash
npm run data:backup     # → server/data/backups/timepick-20260923-122950.db
```

**恢复**（改坏了想回退）：
1. 停掉后端（关掉那个跑 `npm run server` 的窗口）
2. 把备份文件复制回 `server/data/timepick.db`
3. 重启 `npm run server`

> 建议：**每次动数据库结构、每次发布前，先 backup 一次**。备份是 560 KB 的小文件，不占地方。

### 2.3 线上 ↔ 本地 搬数据

| 命令 | 方向 | 说明 |
| --- | --- | --- |
| `npm run data:pull` | 线上 → 本地快照 | 存到 `server/data/snapshots/online-*.json`，需管理员密码 |
| `npm run data:merge -- <快照>` | 快照 → 本地库 | `INSERT OR IGNORE`，**只补本地没有的行，不覆盖已有数据** |
| `npm run data:push -- <快照> --force` | 快照 → 线上 | `replace`，**会先清空线上同名表**，慎用 |
| `npm run data:checkpoint` | 原地整理 | 把 WAL 日志落盘、删掉 `-wal`/`-shm`，发布前必做 |

管理员密码两种给法：`--pass 密码`，或环境变量 `TP_ADMIN_PASS`。

### 2.4 两个必须知道的坑

- **快照含 `user.password` 哈希**。发布工具不看 `.gitignore`，会把它一起传上去。
  `data:checkpoint` 会提醒你，**发布前删掉 `server/data/snapshots/`**。
- **`npm run data:pull` 现在还不能用在线上**：它依赖新加的 `admin/data/export` 接口，
  要等下一次发布把后端改动带上去。在那之前只能对本地 `http://127.0.0.1:8787` 用
  （已实测通过）。

### 2.5 直接看/改数据

没有装 sqlite 命令行的话，用现成的接口就行：
- `npm run data:stat` 看概览
- 想细查就写个临时脚本 `node -e "..."`（Windows 上引号容易被吃掉，建议写成 `.mjs` 文件再跑）
- 项目里所有表都有 `id INTEGER PRIMARY KEY AUTOINCREMENT`，靠主键就能唯一定位一行

---

## 三、这个网站是怎么做成"人人可访问"的

### 3.1 它本来长什么样

- 前端：Vue 3 + Vite，`npm run dev` 跑在 **5173**
- 后端：Express + SQLite，`npm run server` 跑在 **8787**
- 两个端口、两个进程，只在你自己电脑上能打开

### 3.2 为了上线改了什么

| 问题 | 解法 |
| --- | --- |
| 线上只有一个端口 | 让 Express 顺带把前端产物 `dist` 托管出来，API 走同源 `/api` |
| 刷新子页面 404 | 加 SPA 兜底：非 `/api`、`/uploads` 的路径一律回落到 `index.html` |
| `dist` 可能被发布工具丢掉 | `npm run build` 末尾再复制一份 `webroot/` 当备份 |
| 沙箱装不上 `better-sqlite3`（要编译） | 把它和 `sharp` 挪到 `optionalDependencies`，安装用 `--omit=optional` |
| 那 SQLite 谁来驱动 | 新增 `server/db-driver.js`：原生 → Node 内置 `node:sqlite` → 纯 WASM，三级兜底 |
| 发布时前端还在请求 `localhost:8787` | `.env.production` 里写 `VITE_CLOUD_API_BASE=/api`，生产构建自动走同源 |
| 写死在代码里的 JWT 密钥等于公开 | 换成随机值 |

### 3.3 现在的结构

```
浏览器 → https://timepick-memory.app.workbuddy.host/
             ├── /            → 前端页面（index.html + JS/CSS）
             ├── /index/memory→ 同上（SPA 兜底，刷新不 404）
             ├── /api         → Express 接口（读写 SQLite）
             └── /uploads     → 用户上传的图片
```

一个 Node 进程、一个端口、一个 `timepick.db` 文件，全在上面。

### 3.4 关于数据安全，你心里要有数

- 线上库是**发布那一刻的快照**。之后你在本机新增的记忆不会自动同步上去。
- 平台沙箱不保证永久持久化，极端情况下可能回到发布时的状态。
- 所以：**每次发布前 `data:pull` + `data:backup`，线上真有了重要数据就定期 pull 下来存着**。
- 想彻底稳定（能绑域名、配 HTTPS、数据在自己云盘上），走轻量云主机那条路，约 25-60 元/月。

---

## 四、出问题先查这几处

| 现象 | 先看 |
| --- | --- |
| 页面白屏 | 浏览器控制台；本地 `npm run check:undef` |
| 接口报错 | 后端那个终端窗口的日志 |
| 改了代码线上没变 | 是不是忘了 `npm run build`（前端）/ 忘了重新发布 |
| 线上数据没了 | 是不是发布前没 `data:pull`；用 `data:backup` 的备份恢复 |
| 本地库出问题 | 先 `npm run data:stat` 看现状，再决定要不要回退备份 |
