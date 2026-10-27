import crypto from 'node:crypto'
import Database from 'better-sqlite3'

const db = new Database('server/data/timepick.db')
db.pragma('foreign_keys = ON')

// 清理测试用户 + 已存在的优乐美
db.prepare("DELETE FROM user WHERE username LIKE 'tp_test%'").run()
db.prepare("DELETE FROM user WHERE username = '优乐美' AND id != 7").run()

const salt = crypto.randomBytes(8).toString('hex')
const hash = crypto.createHash('sha256').update(salt + ':002529').digest('hex')

// 把 linjian 改为 优乐美
db.prepare("UPDATE user SET username = ?, password = ? WHERE username = 'linjian'").run('优乐美', salt + '$' + hash)

console.log('管理员已改为: 优乐美 / 002529')
