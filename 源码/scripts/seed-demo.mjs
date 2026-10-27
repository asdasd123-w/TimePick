// 演示数据种子: 8 位演示用户 + 5 条广场帖子 + 评论, 幂等(已存在则跳过)
// 用法: npm run seed:demo   演示账号密码统一: demo123456 (如 linjian / demo123456)
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '..', 'server', 'data', 'timepick.db'))
db.pragma('foreign_keys = ON')

// 轻量迁移: 旧库补列(与 server/db.js 保持一致)
const userCols = db.prepare('PRAGMA table_info(user)').all().map((c) => c.name)
if (!userCols.includes('role')) {
  db.exec("ALTER TABLE user ADD COLUMN role INTEGER NOT NULL DEFAULT 0")
}
const postCols = db.prepare('PRAGMA table_info(square_post)').all().map((c) => c.name)
if (!postCols.includes('tags')) {
  db.exec("ALTER TABLE square_post ADD COLUMN tags TEXT NOT NULL DEFAULT ''")
}
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
  CREATE TABLE IF NOT EXISTS activity_comment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity_join (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    UNIQUE(activity_id, user_id)
  );
`)

const now = Date.now()
const H = 3600 * 1000

// 清理冒烟测试遗留数据(外键级联删除其帖子/评论/点赞)
db.prepare("DELETE FROM user WHERE username LIKE 'tp_test%'").run()

if (db.prepare("SELECT id FROM user WHERE username = '优乐美'").get()) {
  console.log('演示数据已存在, 跳过种子。')
  process.exit(0)
}

function hash(password, salt) {
  return crypto.createHash('sha256').update(salt + ':' + password).digest('hex')
}

const addUser = db.prepare(
  `INSERT INTO user (username, password, nickname, avatar, email, role, status, created_at, updated_at)
   VALUES (?, ?, ?, '', NULL, ?, 1, ?, ?)`
)
const users = {}
const adminUsers = new Set(['优乐美'])
for (const [username, nickname] of [
  ['优乐美', '优乐美'],
  ['xiaohe', '小禾'],
  ['momo', 'momo'],
  ['azhe', '阿哲'],
  ['xiaoman', '小满不满'],
  ['ayu', '阿芋'],
  ['tangyuan', '汤圆不糖'],
  ['laozhou', '老周的胶片机'],
]) {
  const salt = crypto.randomBytes(8).toString('hex')
  const role = adminUsers.has(username) ? 1 : 0
  const pwd = adminUsers.has(username) ? '002529' : 'demo123456'
  const r = addUser.run(username, salt + '$' + hash(pwd, salt), nickname, role, now - 90 * 24 * H, now)
  users[nickname] = r.lastInsertRowid
}

const addPost = db.prepare(
  `INSERT INTO square_post (user_id, space_id, content, images, tags, likes_count, comments_count, is_public, created_at, updated_at)
   VALUES (?, NULL, ?, '', ?, ?, 0, 1, ?, ?)`
)
const addComment = db.prepare(
  `INSERT INTO post_comment (post_id, user_id, parent_id, content, likes_count, created_at, updated_at)
   VALUES (?, ?, NULL, ?, 0, ?, ?)`
)
const setCommentsCount = db.prepare('UPDATE square_post SET comments_count = ? WHERE id = ?')

const POSTS = [
  {
    by: '林间',
    hours: 2,
    likes: 245,
    text: '今天的晚霞真的好美,\n走在回宿舍的路上, 突然觉得一切都柔软了。',
    tags: '日常,晚霞,大学生活',
    comments: [
      ['阿芋', '这个瞬间也太温柔了, 偷偷收藏了!'],
      ['汤圆不糖', '看到最后一句鼻子一酸…'],
      ['老周的胶片机', '光影和文字都刚刚好, 学到了。'],
    ],
  },
  {
    by: '小禾',
    hours: 5,
    likes: 189,
    text: '最近读完了《也许你该找个人聊聊》,\n很多话好像被唤醒了。\n生活虽然会有很多乱七八糟的时刻,\n但依然值得期待。',
    tags: '书籍,阅读,自我成长',
    comments: [
      ['阿芋', '好喜欢这种慢慢记录的感觉。'],
      ['林间', '同款经历! 那天的风我也记得。'],
    ],
  },
  {
    by: 'momo',
    hours: 24,
    likes: 132,
    text: '学校的小花园开花了 🌷\n熟悉的味道又回来了,\n好像每年闻到这个味道,\n才真正意识到秋天来了。',
    tags: '花卉,校园,秋天',
    comments: [
      ['汤圆不糖', '被安利了, 这就去翻自己的旧记忆。'],
      ['小禾', '文字里有味道, 好像真的闻到了。'],
      ['阿芋', '希望我的秋天也这样温柔。'],
    ],
  },
  {
    by: '阿哲',
    hours: 48,
    likes: 98,
    text: '把上个月的胶卷洗出来了,\n巷子里的光影, 像时间给的礼物。',
    tags: '自拍,风景,日常',
    comments: [
      ['老周的胶片机', '同好! 这卷是什么片子?'],
      ['林间', '巷子的光影最耐看了。'],
    ],
  },
  {
    by: '小满不满',
    hours: 72,
    likes: 76,
    text: '在山里录了一整晚的雨声,\n现在回放, 还能闻到草木的味道。',
    tags: '音乐,雨天,旅行',
    comments: [['汤圆不糖', '雨声是最白的白噪音。']],
  },
]

for (const p of POSTS) {
  const created = now - p.hours * H
  const r = addPost.run(users[p.by], p.text, p.tags, p.likes, created, created)
  p.comments.forEach(([name, text], i) => {
    const ct = created + (i + 1) * 10 * 60 * 1000
    addComment.run(r.lastInsertRowid, users[name], text, ct, ct)
  })
  setCommentsCount.run(p.comments.length, r.lastInsertRowid)
}

// ---------- 演示反馈 ----------
const addFeedback = db.prepare(
  `INSERT INTO feedback (user_id, type, content, contact, status, reply, created_at, updated_at)
   VALUES (?, ?, ?, '', ?, ?, ?, ?)`
)
addFeedback.run(users['林间'], 3, '希望宠物小猫的动作可以更丰富一点, 比如会打滚!', 0, '', now - 3 * 24 * H, now - 3 * 24 * H)
addFeedback.run(users['小禾'], 1, '希望记忆库可以按类型筛选, 找起来更方便。', 1, '新版本已上线类型筛选, 感谢你的建议!', now - 15 * 24 * H, now - 14 * 24 * H)
addFeedback.run(users['momo'], 2, '首页日历切换月份时偶尔会没有响应。', 2, '已修复, 更新到最新版本即可体验。', now - 28 * 24 * H, now - 27 * 24 * H)

// ---------- 演示举报 ----------
const addReport = db.prepare(
  `INSERT INTO report (reporter_id, target_type, target_id, reason, status, handle_note, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
)
addReport.run(users['阿芋'], 1, 1, '该帖子包含不当内容', 0, '', now - 2 * 24 * H, now - 2 * 24 * H)
addReport.run(users['汤圆不糖'], 2, 3, '评论有攻击性言论', 1, '已删除违规评论, 对评论者进行警告', now - 5 * 24 * H, now - 4 * 24 * H)

// ---------- 演示活动 ----------
const addActivity = db.prepare(
  `INSERT INTO activity (title, content, cover, type, is_public, is_major, sort, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
)
addActivity.run('拾光一周年 · 记忆展览', '我们一岁了! 回顾这一年的温暖瞬间, 分享你的拾光故事, 有机会获得限定宠物装扮。', '', 2, 1, 1, 100, now - 7 * 24 * H, now - 7 * 24 * H)
addActivity.run('v2.0 版本更新公告', '新增记忆空间协作功能、AI 陪伴升级、宠物互动动作扩充。', '', 3, 1, 0, 50, now - 14 * 24 * H, now - 14 * 24 * H)
addActivity.run('秋季摄影大赛', '用镜头记录秋天, 上传你的秋日记忆, 点赞最多的作品将获得「秋日拾光者」称号。', '', 2, 1, 0, 30, now - 21 * 24 * H, now - 21 * 24 * H)

console.log(`种子完成: ${Object.keys(users).length} 位演示用户(优乐美为管理员), ${POSTS.length} 条帖子, 3条反馈, 2条举报, 3条活动(含1个大型活动)。`)
console.log('演示登录: 优乐美 / 002529 (管理员) 或 xiaohe, momo, azhe ... / demo123456 (普通用户)')
