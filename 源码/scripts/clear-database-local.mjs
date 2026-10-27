// 清空 SQLite 数据库所有数据（保留管理员用户）
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '..', 'server', 'data', 'timepick.db'))
db.pragma('foreign_keys = ON')

console.log('开始清空数据库...')

// 获取管理员用户ID（优乐美）
const adminUser = db.prepare('SELECT id FROM user WHERE username = ?').get('优乐美')
let adminId = null
if (adminUser) {
  adminId = adminUser.id
  console.log('找到管理员 ID:', adminId)
} else {
  console.warn('未找到管理员用户，将清空所有用户')
}

// 清空各表（按依赖顺序，先清空子表）
const tables = [
  'activity_comment',      // 活动评论
  'activity_join',         // 活动参与
  'post_comment',          // 帖子评论
  'post_like',             // 帖子点赞
  'favorite',              // 收藏
  'user_follow',           // 关注关系
  'memory_media',          // 记忆媒体
  'memory_item',           // 记忆条目
  'ai_message',            // AI 消息
  'ai_conversation',       // AI 对话
  'feedback',              // 反馈
  'report',                // 举报
  'activity',              // 活动
  'square_post',           // 广场帖子
  'pet_config',            // 宠物配置
  'user_profile',          // 用户资料
  'user_settings',         // 用户设置
  'share',                 // 分享记录
]

for (const tableName of tables) {
  try {
    const stmt = db.prepare(`DELETE FROM ${tableName}`)
    const result = stmt.run()
    console.log(`清空 ${tableName}: 删除了 ${result.changes} 条记录`)
  } catch (err) {
    console.error(`清空 ${tableName} 失败:`, err.message)
  }
}

// 清空用户表（排除管理员）
if (adminId) {
  const stmt = db.prepare('DELETE FROM user WHERE id != ?')
  const result = stmt.run(adminId)
  console.log(`清空 user: 删除了 ${result.changes} 条非管理员记录`)
} else {
  const stmt = db.prepare('DELETE FROM user')
  const result = stmt.run()
  console.log(`清空 user: 删除了 ${result.changes} 条记录`)
}

console.log('\n✅ 数据库清空完成！')
console.log('\n提示：运行 seed-demo 脚本重新填充演示数据')

db.close()
