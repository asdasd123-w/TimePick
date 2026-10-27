// 首次部署用: 把指定手机号提升为管理员(role = 1)。
// 用法: npm run admin:grant -- 18801314366
//      或 node scripts/make-admin.mjs 18801314366
//
// 为什么需要这一步:
//   注册接口(auth/register)不写 role, 新库里所有账号都是普通用户(role = 0);
//   而管理中心的所有接口都要求 role = 1, 所以「第一个管理员」必须手动创建。
//   有了第一个管理员后, 就能在「管理中心 → 用户管理」里给其他人设置管理员,
//   不需要再跑这个脚本。
//
// 这个脚本只做一件事: 把 user.role 改成 1。不改密码、不建账号、不碰其他表。
import db from '../server/db.js'

const username = String(process.argv[2] || '').trim()
if (!username) {
  console.error('用法: node scripts/make-admin.mjs <注册时用的手机号>')
  process.exit(1)
}

const user = db.prepare('SELECT id, username, nickname, role FROM user WHERE username = ?').get(username)
if (!user) {
  console.error(`没找到账号「${username}」。请先在网页上注册这个手机号，再执行本命令。`)
  process.exit(1)
}

db.prepare('UPDATE user SET role = 1 WHERE id = ?').run(user.id)
// 顺手把 WAL 落盘: 刚写入的角色如果还在 -wal 里, 进程直接退出有可能丢
try {
  db.pragma('wal_checkpoint(TRUNCATE)')
} catch {
  /* 驱动不支持 pragma 时忽略, 正常启动时也会自己合并 */
}

console.log(`已把「${user.nickname}」（${user.username}）设为管理员。`)
console.log('现在用它登录，左侧就能看到「管理中心」了。')
process.exit(0)
