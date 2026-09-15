// SQLite 数据库初始化: 打开 server/data/timepick.db 并执行建表脚本
// 驱动选择见 server/db-driver.js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from './db-driver.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
fs.mkdirSync(dataDir, { recursive: true })

// 可用 DB_PATH 指向其它库文件(测试/备份时避免污染正式数据)
// 驱动: 本机走原生 better-sqlite3; 部署环境没有编译工具时自动落回 WASM 版
const db = await openDatabase(process.env.DB_PATH || path.join(dataDir, 'timepick.db'))
// WAL 需要额外的 -wal / -shm 文件: 某些环境(只读挂载、网络盘、被安全软件锁住)建不了,
// 这时整站会起不来 —— 所以失败就退回 SQLite 默认的 delete 日志模式, 功能不受影响。
try {
  db.pragma('journal_mode = WAL')
} catch {
  console.warn('[db] WAL 不可用, 已退回默认日志模式')
}
db.pragma('foreign_keys = ON')
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))

// 轻量迁移: 旧库补列 / 补表
const userCols = db.prepare('PRAGMA table_info(user)').all().map((c) => c.name)
if (!userCols.includes('role')) {
  db.exec("ALTER TABLE user ADD COLUMN role INTEGER NOT NULL DEFAULT 0")
}
// 旧库补列 user.token_epoch(改密/禁用时自增, 用于让旧 token 失效)
if (!userCols.includes('token_epoch')) {
  db.exec('ALTER TABLE user ADD COLUMN token_epoch INTEGER NOT NULL DEFAULT 0')
}
const postCols = db.prepare('PRAGMA table_info(square_post)').all().map((c) => c.name)
if (!postCols.includes('tags')) {
  db.exec("ALTER TABLE square_post ADD COLUMN tags TEXT NOT NULL DEFAULT ''")
}
// 旧库补列 square_post.video / audio(广场帖子附带的单个视频与音频, 空串 = 未添加)
if (!postCols.includes('video')) {
  db.exec("ALTER TABLE square_post ADD COLUMN video TEXT NOT NULL DEFAULT ''")
}
if (!postCols.includes('audio')) {
  db.exec("ALTER TABLE square_post ADD COLUMN audio TEXT NOT NULL DEFAULT ''")
}
// 旧库补列 square_post.memory_id(0 = 这条广场动态还没对应的记忆库条目)。
// 2026-10-21 起「在广场发布」= 先在记忆库里建一条公开记忆, 再把这条记忆投影成广场动态,
// 两处内容共用同一条记忆(id 存在这里), 改一处不会出现两边不一致。
if (!postCols.includes('memory_id')) {
  db.exec('ALTER TABLE square_post ADD COLUMN memory_id INTEGER NOT NULL DEFAULT 0')
}
// 旧库补列 room_prop.support(这件家具被撑在哪件家具上: ''=地面 / desk=桌面 / bookcase=书架隔板)
// 加它是为了让「柜子里放书、桌上放电脑台灯」这类承托关系可查、可展示、可排查。
const roomPropCols = db.prepare('PRAGMA table_info(room_prop)').all().map((c) => c.name)
if (!roomPropCols.includes('support')) {
  db.exec("ALTER TABLE room_prop ADD COLUMN support TEXT NOT NULL DEFAULT ''")
}
// 一次性迁移: 把旧库里的管理员账号「优乐美」统一成手机号 SUPER_ADMIN_USERNAME
// (部署时线上 server/data 不会被覆盖, 只能靠启动时迁移同步; 只改用户名+管理员标记, 不动密码与其它数据)
const SUPER_ADMIN_USERNAME = process.env.SUPER_ADMIN_USERNAME || '18801314366'
try {
  const taken = db.prepare('SELECT id FROM user WHERE username = ?').get(SUPER_ADMIN_USERNAME)
  const legacy = db.prepare("SELECT id FROM user WHERE username = '优乐美'").get()
  if (!taken && legacy) {
    db.prepare('UPDATE user SET username = ?, role = 1, updated_at = ? WHERE id = ?').run(
      SUPER_ADMIN_USERNAME,
      Date.now(),
      legacy.id,
    )
    console.log('[db] 管理员账号已迁移为', SUPER_ADMIN_USERNAME)
  } else if (taken && !db.prepare('SELECT id FROM user WHERE username = ? AND role = 1').get(SUPER_ADMIN_USERNAME)) {
    db.prepare('UPDATE user SET role = 1, updated_at = ? WHERE id = ?').run(Date.now(), taken.id)
    console.log('[db] 已补回管理员标记:', SUPER_ADMIN_USERNAME)
  }
} catch (e) {
  console.warn('[db] 管理员账号迁移跳过:', e.message)
}
// 旧库补列 feedback.user_reply
const fbCols = db.prepare('PRAGMA table_info(feedback)').all().map((c) => c.name)
if (!fbCols.includes('user_reply')) {
  db.exec("ALTER TABLE feedback ADD COLUMN user_reply TEXT NOT NULL DEFAULT ''")
}
// 旧库补建 report / activity / user_settings / share 表( CREATE TABLE IF NOT EXISTS 天然幂等)
db.exec(`
  CREATE TABLE IF NOT EXISTS report (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    target_type INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status INTEGER NOT NULL DEFAULT 0,
    handle_note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    cover TEXT NOT NULL DEFAULT '',
    type INTEGER NOT NULL DEFAULT 1,
    is_public INTEGER NOT NULL DEFAULT 1,
    is_major INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES user (id) ON DELETE CASCADE,
    default_vis TEXT NOT NULL DEFAULT 'self',
    ai_read_memory INTEGER NOT NULL DEFAULT 1,
    ai_cross_space INTEGER NOT NULL DEFAULT 1,
    ai_summary INTEGER NOT NULL DEFAULT 1,
    ai_no_training INTEGER NOT NULL DEFAULT 1,
    bgm INTEGER NOT NULL DEFAULT 1,
    ambient INTEGER NOT NULL DEFAULT 1,
    ambient_type TEXT NOT NULL DEFAULT '雨声',
    motion TEXT NOT NULL DEFAULT '适中',
    tone TEXT NOT NULL DEFAULT '暖色',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS share (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    space_id INTEGER DEFAULT NULL REFERENCES memory_space (id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    meta TEXT NOT NULL DEFAULT '',
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'valid',
    expires_at INTEGER DEFAULT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS private_message (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    content     TEXT    NOT NULL,
    is_read     INTEGER NOT NULL DEFAULT 0,
    is_deleted  INTEGER NOT NULL DEFAULT 0,
    deleted_by  INTEGER DEFAULT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_private_message_receiver ON private_message (receiver_id);
  CREATE INDEX IF NOT EXISTS idx_private_message_sender ON private_message (sender_id);
`)

// 旧库补列 share.memory_id(支持分享单条记忆, 与 space_id 二选一)
const shareCols = db.prepare('PRAGMA table_info(share)').all().map((c) => c.name)
if (!shareCols.includes('memory_id')) {
  db.exec('ALTER TABLE share ADD COLUMN memory_id INTEGER DEFAULT NULL')
}

// 旧库补列 user_settings.ambient_type(环境音类型: 雨声/风声/咖啡馆)
const usCols = db.prepare('PRAGMA table_info(user_settings)').all().map((c) => c.name)
if (!usCols.includes('ambient_type')) {
  db.exec("ALTER TABLE user_settings ADD COLUMN ambient_type TEXT NOT NULL DEFAULT '雨声'")
}

// 旧库补列 user_settings.bgm_track(背景音乐选中的曲目: 预置 id 或上传曲目 url)
if (!usCols.includes('bgm_track')) {
  db.exec("ALTER TABLE user_settings ADD COLUMN bgm_track TEXT NOT NULL DEFAULT ''")
}

// 用户上传的背景音乐(预置四首打包在前端 public/music, 这里只存自传的)
db.exec(`CREATE TABLE IF NOT EXISTS bgm_track (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  artist      TEXT    NOT NULL DEFAULT '',
  url         TEXT    NOT NULL,
  size        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
)`)
db.exec('CREATE INDEX IF NOT EXISTS idx_bgm_track_user ON bgm_track (user_id)')

// 旧库补列 private_message.is_deleted / deleted_by
const pmCols = db.prepare('PRAGMA table_info(private_message)').all().map((c) => c.name)
if (!pmCols.includes('is_deleted')) {
  db.exec("ALTER TABLE private_message ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0")
}
if (!pmCols.includes('deleted_by')) {
  db.exec("ALTER TABLE private_message ADD COLUMN deleted_by INTEGER DEFAULT NULL")
}

// 旧库补列 is_major
const actCols = db.prepare('PRAGMA table_info(activity)').all().map((c) => c.name)
if (!actCols.includes('is_major')) {
  db.exec("ALTER TABLE activity ADD COLUMN is_major INTEGER NOT NULL DEFAULT 0")
}
if (!actCols.includes('start_time')) {
  db.exec("ALTER TABLE activity ADD COLUMN start_time INTEGER DEFAULT NULL")
}
if (!actCols.includes('end_time')) {
  db.exec("ALTER TABLE activity ADD COLUMN end_time INTEGER DEFAULT NULL")
}

// 旧库补列: 记忆条目扩展字段(内容种类/作者/日期/类型), 与前端记忆库表单对应
const itemCols = db.prepare('PRAGMA table_info(memory_item)').all().map((c) => c.name)
if (!itemCols.includes('is_public')) {
  db.exec("ALTER TABLE memory_item ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0")
}
if (!itemCols.includes('kind')) {
  db.exec("ALTER TABLE memory_item ADD COLUMN kind TEXT NOT NULL DEFAULT 'memory'")
}
if (!itemCols.includes('author')) {
  db.exec("ALTER TABLE memory_item ADD COLUMN author TEXT NOT NULL DEFAULT ''")
}
if (!itemCols.includes('entry_date')) {
  db.exec("ALTER TABLE memory_item ADD COLUMN entry_date TEXT NOT NULL DEFAULT ''")
}
if (!itemCols.includes('type')) {
  db.exec("ALTER TABLE memory_item ADD COLUMN type TEXT NOT NULL DEFAULT '其他'")
}
// 旧库补列 memory_item.ai_cover(前端生成的 AI 封面图 dataURL)
if (!itemCols.includes('ai_cover')) {
  db.exec("ALTER TABLE memory_item ADD COLUMN ai_cover TEXT NOT NULL DEFAULT ''")
}
// 旧库补列 memory_item.shared_at(分享到拾光广场的时间, 0 表示未分享/已取消)
if (!itemCols.includes('shared_at')) {
  db.exec('ALTER TABLE memory_item ADD COLUMN shared_at INTEGER NOT NULL DEFAULT 0')
}
// 旧库补列 memory_item.ai_denied(1 = 当时无 AI 出图权限, 之后不再自动补生成封面)
if (!itemCols.includes('ai_denied')) {
  db.exec('ALTER TABLE memory_item ADD COLUMN ai_denied INTEGER NOT NULL DEFAULT 0')
}
// 旧库补列 memory_item.ai_video(AI 生成视频的地址, 每条记忆仅一个, 永久保存)
if (!itemCols.includes('ai_video')) {
  db.exec("ALTER TABLE memory_item ADD COLUMN ai_video TEXT NOT NULL DEFAULT ''")
}
// 旧库补列 memory_item.ai_video_task(异步生成中的 DashScope 任务号)
if (!itemCols.includes('ai_video_task')) {
  db.exec("ALTER TABLE memory_item ADD COLUMN ai_video_task TEXT NOT NULL DEFAULT ''")
}

// 旧库补列 user.password_enc(密码明文的 AES-256-GCM 密文, 仅供管理中心显示真实密码)
const userColsAll = db.prepare('PRAGMA table_info(user)').all().map((c) => c.name)
if (!userColsAll.includes('password_enc')) {
  db.exec("ALTER TABLE user ADD COLUMN password_enc TEXT NOT NULL DEFAULT ''")
}
// 旧库补列 user.wechat_uid(微信扫码登录绑定的云端身份 wx:<openid>; NULL = 没用微信登录)
if (!userColsAll.includes('wechat_uid')) {
  db.exec('ALTER TABLE user ADD COLUMN wechat_uid TEXT DEFAULT NULL')
}
// 旧库补列 user.phone(微信扫码时云端带回来的手机号; 拿不到就是 NULL)。
// 注意它**不是**登录用户名: 微信网页授权通常不返回手机号, 账号不能因此变成"没有用户名"。
// 老数据里没有这一列时, 顺手用 username 回填手机号形态的账号(历史账号的 username 就是手机号)。
if (!userColsAll.includes('phone')) {
  db.exec('ALTER TABLE user ADD COLUMN phone TEXT DEFAULT NULL')
  db.exec("UPDATE user SET phone = username WHERE username GLOB '1[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'")
}
// 一个微信身份只能绑一个本地账号。用部分索引: 允许大量 NULL, 只对已绑定的行做唯一约束。
// (SQLite 本来就把 NULL 视作互不相等, 部分索引只是把意图写明白并省掉无用的索引项)
db.exec(
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wechat_uid ON user (wechat_uid) WHERE wechat_uid IS NOT NULL',
)
// 历史上「已公开但没有分享时间」的条目按创建时间回填, 否则广场共享流排序会塌到最底(幂等)
db.exec('UPDATE memory_item SET shared_at = created_at WHERE is_public = 1 AND shared_at = 0')

// 旧库补列: 记忆空间岛屿三件套(总览页展示名称 / 悬停文案 / 外观 key)
const spaceCols = db.prepare('PRAGMA table_info(memory_space)').all().map((c) => c.name)
if (!spaceCols.includes('island_name')) {
  db.exec("ALTER TABLE memory_space ADD COLUMN island_name TEXT NOT NULL DEFAULT ''")
}
if (!spaceCols.includes('island_tip')) {
  db.exec("ALTER TABLE memory_space ADD COLUMN island_tip TEXT NOT NULL DEFAULT ''")
}
if (!spaceCols.includes('island_art')) {
  db.exec("ALTER TABLE memory_space ADD COLUMN island_art TEXT NOT NULL DEFAULT ''")
}
// 旧库补列: 每条记忆自身就是一座岛(总览页), 各自的悬停文案与外观 key 存条目上
if (!itemCols.includes('island_tip')) {
  db.exec("ALTER TABLE memory_item ADD COLUMN island_tip TEXT NOT NULL DEFAULT ''")
}
if (!itemCols.includes('island_art')) {
  db.exec("ALTER TABLE memory_item ADD COLUMN island_art TEXT NOT NULL DEFAULT ''")
}
// 历史空间回填(幂等): 展示名默认用空间名; 命中五个主题屿的补默认外观 key,
// 与前端 src/data/islands.js 的 ISLAND_OPTIONS / DEFAULT_ART 保持一致。
db.exec("UPDATE memory_space SET island_name = name WHERE island_name = ''")
db.exec(`
  UPDATE memory_space SET island_art = CASE name
    WHEN '花信屿' THEN 'blossom'
    WHEN '长昼屿' THEN 'lagoon'
    WHEN '拾穗屿' THEN 'amber'
    WHEN '眠雪屿' THEN 'snow'
    WHEN '暮光屿' THEN 'dusk'
    ELSE CASE (id % 6)
      WHEN 0 THEN 'blossom'
      WHEN 1 THEN 'lagoon'
      WHEN 2 THEN 'forest'
      WHEN 3 THEN 'snow'
      WHEN 4 THEN 'amber'
      ELSE 'dusk'
    END
  END
  WHERE island_art = ''
`)

// 旧库补列: 用户级 AI 权限(管理中心可单独控制每个用户能否用 AI 回复/生图, 默认允许)
const userAiCols = db.prepare('PRAGMA table_info(user)').all().map((c) => c.name)
if (!userAiCols.includes('ai_chat')) {
  db.exec('ALTER TABLE user ADD COLUMN ai_chat INTEGER NOT NULL DEFAULT 1')
}
if (!userAiCols.includes('ai_image')) {
  db.exec('ALTER TABLE user ADD COLUMN ai_image INTEGER NOT NULL DEFAULT 1')
}
if (!userAiCols.includes('ai_video')) {
  db.exec('ALTER TABLE user ADD COLUMN ai_video INTEGER NOT NULL DEFAULT 1')
}

// 旧库补建 system_config(系统级键值配置: 管理中心 AI 使用总开关)
db.exec(`
  CREATE TABLE IF NOT EXISTS system_config (
    key        TEXT    PRIMARY KEY,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

// 白名单外的花色(历史脏值、已下线的名字)归一到橘猫 —— 否则前端拿不到精灵图。
// 必须与 server/index.js 的 PET_TYPES、前端 src/stores/companion.js 的 PET_SHEETS
// 保持一致; 幂等, 每次启动跑一次, 不依赖前端读取时再纠正。
db.exec(
  "UPDATE pet_config SET pet_type = '橘猫' WHERE pet_type IS NULL OR pet_type NOT IN ('橘猫', '三花猫', '虎斑猫', '黑白猫', '白猫')"
)

// 旧库补列 user_profile.avatar(个人中心照片) / quote(格言, 旧表缺失导致资料保存失败)
const profileCols = db.prepare('PRAGMA table_info(user_profile)').all().map((c) => c.name)
if (!profileCols.includes('avatar')) {
  db.exec("ALTER TABLE user_profile ADD COLUMN avatar TEXT NOT NULL DEFAULT ''")
}
if (!profileCols.includes('quote')) {
  db.exec("ALTER TABLE user_profile ADD COLUMN quote TEXT NOT NULL DEFAULT ''")
}

// 旧库补建共享记忆评论表
db.exec(`
  CREATE TABLE IF NOT EXISTS memory_comment (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id  INTEGER NOT NULL REFERENCES memory_item (id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    content    TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS memory_item_like (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id  INTEGER NOT NULL REFERENCES memory_item (id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    UNIQUE(memory_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_memory_comment_memory ON memory_comment (memory_id);
`)

// 旧库补建 activity_comment / activity_join / activity_like 表
db.exec(`
  CREATE TABLE IF NOT EXISTS activity_comment (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    content     TEXT    NOT NULL,
    image       TEXT    NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity_join (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    UNIQUE(activity_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS activity_like (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    UNIQUE(activity_id, user_id)
  );
`)

// URL 归一化迁移: 早期版本把媒体存成绝对地址(http://部署时域名/uploads/...),
// 换域名/换沙箱部署后这些地址全部失效(图片 500)。统一改写为相对路径 /uploads/...,
// 与部署域名彻底解耦。幂等: 只处理含 /uploads/ 的 http(s) 字符串, 已是相对路径的行不动。
{
  const ABS_UPLOAD_RE = /https?:\/\/[^/"'\\\s,]+\/uploads\//g
  const URL_TARGETS = [
    ['user', ['avatar']],
    ['user_profile', ['avatar']],
    ['memory_space', ['cover']],
    ['memory_item', ['ai_cover', 'ai_video']],
    ['memory_media', ['url', 'thumb']],
    ['square_post', ['images', 'video', 'audio']],
    ['activity', ['cover']],
    ['activity_comment', ['image']],
    ['bgm_track', ['url']],
  ]
  let fixed = 0
  for (const [table, cols] of URL_TARGETS) {
    try {
      const rows = db.prepare(`SELECT id, ${cols.map((c) => '"' + c + '"').join(', ')} FROM ${table}`).all()
      const upd = db.prepare(`UPDATE ${table} SET ${cols.map((c) => c + ' = ?').join(', ')} WHERE id = ?`)
      for (const row of rows) {
        const vals = cols.map((c) => {
          const v = row[c]
          if (typeof v === 'string' && v.startsWith('http') && v.includes('/uploads/')) {
            const nv = v.replace(ABS_UPLOAD_RE, '/uploads/')
            if (nv !== v) fixed++
            return nv
          }
          return v
        })
        if (vals.some((v, i) => v !== row[cols[i]])) upd.run(...vals, row.id)
      }
    } catch (e) {
      console.warn('[db] URL 迁移跳过 ' + table + ': ' + e.message)
    }
  }
  if (fixed) console.log('[db] 已把 ' + fixed + ' 条旧绝对 URL 改写为相对路径 /uploads/...')
}

// 一次性迁移(2026-10-20): 把历史记忆标题统一截到 4 个汉字。
// 背景: 标题改由 AI 读正文生成后上限是 4 个字(见 index.js 的 TITLE_MAX_CHARS)，
// 但老数据里还留着 10~16 字的长标题，木牌/卡片上会被截成省略号、看不出是什么。
// ★ 只动 memory_item —— activity / notice 的标题是人工填的，本来就该长，不能碰。
// ★ 天然幂等: 跑过一次之后就不再有 length(title) > 4 的行，重启再跑是空操作；
//   所以故意不加「已迁移」标记位，免得标记位本身又变成一处要维护的状态。
const MEMORY_TITLE_MAX = 4 // 与 server/index.js 的 TITLE_MAX_CHARS 保持一致
try {
  const has = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_item'").get()
  if (has) {
    const r = db
      .prepare(`UPDATE memory_item SET title = substr(title, 1, ${MEMORY_TITLE_MAX}) WHERE length(title) > ${MEMORY_TITLE_MAX}`)
      .run()
    if (r?.changes) console.log(`[db] 历史记忆标题已截到 ${MEMORY_TITLE_MAX} 个字: ${r.changes} 条`)
  }
} catch (e) {
  console.warn('[db] 历史记忆标题截断跳过:', e.message)
}

export default db
