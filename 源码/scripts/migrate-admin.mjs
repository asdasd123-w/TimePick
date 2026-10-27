// 迁移脚本: 补 role 列 + report/activity 表 + 演示数据
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '..', 'server', 'data', 'timepick.db'))
db.pragma('foreign_keys = ON')

// 补 role 列
const userCols = db.prepare('PRAGMA table_info(user)').all().map((c) => c.name)
if (!userCols.includes('role')) {
  db.exec("ALTER TABLE user ADD COLUMN role INTEGER NOT NULL DEFAULT 0")
  console.log('已添加 user.role 列')
}

// 补建表
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
    sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)
console.log('report/activity 表已就绪')

// 设 linjian 为管理员
db.prepare("UPDATE user SET role = 1 WHERE username = 'linjian'").run()
console.log('linjian 已设为管理员')

const now = Date.now()
const H = 3600 * 1000
const getId = (username) => db.prepare('SELECT id FROM user WHERE username = ?').get(username)?.id

// 演示反馈
if (!db.prepare('SELECT id FROM feedback LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO feedback (user_id,type,content,contact,status,reply,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
  ins.run(getId('linjian'), 3, '希望宠物小猫的动作可以更丰富一点, 比如会打滚!', '', 0, '', now - 3 * 24 * H, now - 3 * 24 * H)
  ins.run(getId('xiaohe'), 1, '希望记忆库可以按类型筛选, 找起来更方便。', '', 1, '新版本已上线类型筛选, 感谢你的建议!', now - 15 * 24 * H, now - 14 * 24 * H)
  ins.run(getId('momo'), 2, '首页日历切换月份时偶尔会没有响应。', '', 2, '已修复, 更新到最新版本即可体验。', now - 28 * 24 * H, now - 27 * 24 * H)
  console.log('已添加 3 条演示反馈')
}

// 演示举报
if (!db.prepare('SELECT id FROM report LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO report (reporter_id,target_type,target_id,reason,status,handle_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
  ins.run(getId('ayu'), 1, 1, '该帖子包含不当内容', 0, '', now - 2 * 24 * H, now - 2 * 24 * H)
  ins.run(getId('tangyuan'), 2, 3, '评论有攻击性言论', 1, '已删除违规评论, 对评论者进行警告', now - 5 * 24 * H, now - 4 * 24 * H)
  console.log('已添加 2 条演示举报')
}

// 演示活动
if (!db.prepare('SELECT id FROM activity LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO activity (title,content,cover,type,is_public,sort,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
  ins.run('拾光一周年 · 记忆展览', '我们一岁了! 回顾这一年的温暖瞬间, 分享你的拾光故事, 有机会获得限定宠物装扮。', '', 2, 1, 100, now - 7 * 24 * H, now - 7 * 24 * H)
  ins.run('v2.0 版本更新公告', '新增记忆空间协作功能、AI 陪伴升级、宠物互动动作扩充。', '', 3, 1, 50, now - 14 * 24 * H, now - 14 * 24 * H)
  ins.run('秋季摄影大赛', '用镜头记录秋天, 上传你的秋日记忆, 点赞最多的作品将获得「秋日拾光者」称号。', '', 2, 1, 30, now - 21 * 24 * H, now - 21 * 24 * H)
  console.log('已添加 3 条演示活动')
}

console.log('迁移完成!')
