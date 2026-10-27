#!/usr/bin/env node
/**
 * 数据搬运工具 —— 重新发布前后用它保住线上数据。
 *
 * 背景: 一键发布会把本地整个目录(含 server/data/timepick.db)传上去覆盖线上,
 * 所以「线上后来注册的用户 / 写的记忆」在每次重新发布时都有被冲掉的风险。
 *
 * 子命令:
 *   checkpoint                 把本地库的 WAL 落盘并清掉 -wal/-shm(发布前必做)
 *   pull                       从线上导出全库 JSON 快照到 server/data/snapshots/
 *   merge <快照.json>          把快照合并进本地库(只补本地没有的行, 不覆盖已有数据)
 *   push  <快照.json> --force  把快照灌回线上(replace, 会清空线上同名表)
 *
 * 常用组合(改完代码准备重新发布):
 *   npm run data:pull                      # 1. 先把线上数据拉下来
 *   npm run data:merge -- online-xxx.json  # 2. 合并进本地库
 *   npm run data:checkpoint                # 3. WAL 落盘
 *   npm run build                          # 4. 重新构建
 *   # 5. 再执行发布
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from '../server/db-driver.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_DB = path.join(root, 'server', 'data', 'timepick.db')
const SNAP_DIR = path.join(root, 'server', 'data', 'snapshots')
const DEFAULT_BASE = 'https://timepick-memory.app.workbuddy.host'

const argv = process.argv.slice(2)
const cmd = (argv[0] || 'help').toLowerCase()
const flag = (name) => {
  const i = argv.indexOf('--' + name)
  if (i < 0) return null
  const next = argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}
const die = (msg) => {
  console.error('✗ ' + msg)
  process.exit(1)
}
const stamp = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function api(base, action, params = {}, token = '') {
  const res = await fetch(base.replace(/\/+$/, '') + '/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params, token }),
  })
  const json = await res.json().catch(() => ({ code: -1, msg: '响应不是 JSON' }))
  if (json.code !== 0) die(`${action} 失败: ${json.msg || json.code}`)
  return json.data
}

async function login(base) {
  const user = flag('user') || process.env.TP_ADMIN_USER || '优乐美'
  const pass = flag('pass') || process.env.TP_ADMIN_PASS
  if (!pass) die('需要管理员密码: --pass <密码> 或环境变量 TP_ADMIN_PASS')
  const d = await api(base, 'auth/login', { username: user, password: pass })
  if (!d?.token) die('登录没拿到 token')
  return d.token
}

// ---------------- checkpoint ----------------
async function cmdCheckpoint() {
  const file = flag('db') || DEFAULT_DB
  if (!fs.existsSync(file)) die(`数据库不存在: ${file}`)
  const db = await openDatabase(file)
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.log('· WAL checkpoint 未执行(驱动不支持): ' + (e?.message || e))
  }
  db.close()
  let removed = 0
  for (const suffix of ['-wal', '-shm']) {
    const f = file + suffix
    if (fs.existsSync(f)) {
      try {
        fs.rmSync(f)
        removed++
      } catch (e) {
        console.log(`· 删不掉 ${path.basename(f)}: ${e?.message || e}（后端仍在跑时正常, 停掉再试）`)
      }
    }
  }
  const size = fs.existsSync(file) ? fs.statSync(file).size : 0
  console.log(`✓ 已把 WAL 落盘: ${path.relative(root, file)} (${(size / 1024).toFixed(0)} KB), 清理附属文件 ${removed} 个`)

  // 快照含 user.password 哈希, 不能跟着发布一起上传
  const snaps = fs.existsSync(SNAP_DIR) ? fs.readdirSync(SNAP_DIR).filter((f) => f.endsWith('.json')) : []
  if (snaps.length) {
    console.log(`⚠ server/data/snapshots/ 里还有 ${snaps.length} 个快照(含密码哈希), 发布前请删掉:`)
    console.log('  ' + snaps.join('  '))
  }
}

// ---------------- stat: 看看库里现在有什么 ----------------
async function cmdStat() {
  const file = flag('db') || DEFAULT_DB
  if (!fs.existsSync(file)) die(`数据库不存在: ${file}`)
  const db = await openDatabase(file)
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name)
  const lines = [`数据库: ${path.relative(root, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB, 驱动 ${db.name})`, '', '各表行数:']
  let total = 0
  for (const t of tables) {
    const c = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c
    total += c
    if (c > 0) lines.push(`  ${t.padEnd(20)} ${c}`)
  }
  lines.push(`  ${'（合计）'.padEnd(18)} ${total}`)
  const users = db.prepare('SELECT id, username, nickname, role, status, created_at FROM user ORDER BY id').all()
  lines.push('', `用户 (${users.length}):`)
  for (const u of users) {
    const d = new Date(u.created_at).toISOString().slice(0, 10)
    lines.push(`  #${u.id} ${u.username} (${u.nickname || '-'}) role=${u.role || 0} status=${u.status ?? 1} 注册于 ${d}`)
  }
  // memory_item 只挂在 space_id 上, 要拿归属用户得 join 空间表
  const items = db
    .prepare(
      `SELECT m.id, s.user_id AS uid, m.title, m.created_at
       FROM memory_item m LEFT JOIN memory_space s ON s.id = m.space_id
       ORDER BY m.id DESC LIMIT 5`
    )
    .all()
  lines.push('', `最近记忆 (${items.length}):`)
  for (const it of items) lines.push(`  #${it.id} user=${it.uid} ${it.title || '(无标题)'}`)
  db.close()
  console.log(lines.join('\n'))
}

// ---------------- backup: 改动前先留一份 ----------------
async function cmdBackup() {
  const file = flag('db') || DEFAULT_DB
  if (!fs.existsSync(file)) die(`数据库不存在: ${file}`)
  const db = await openDatabase(file)
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* 驱动不支持就跳过 */
  }
  db.close()
  const dir = path.join(root, 'server', 'data', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `timepick-${stamp()}.db`)
  fs.copyFileSync(file, dest)
  console.log(`✓ 已备份: ${path.relative(root, dest)} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`)
  console.log('  恢复: 停掉后端 → 把它复制回 server/data/timepick.db → 重启后端')
}

// ---------------- pull ----------------
async function cmdPull() {
  const base = flag('base') || process.env.TP_BASE || DEFAULT_BASE
  const token = await login(base)
  console.log(`· 正在从 ${base} 导出…`)
  const d = await api(base, 'admin/data/export', {}, token)
  fs.mkdirSync(SNAP_DIR, { recursive: true })
  const file = path.join(SNAP_DIR, `online-${stamp()}.json`)
  fs.writeFileSync(file, JSON.stringify(d))
  const kb = (fs.statSync(file).size / 1024).toFixed(0)
  const names = Object.keys(d.tables || {})
  console.log(`✓ 线上快照已保存: ${path.relative(root, file)} (${kb} KB, ${d.rows} 行 / ${names.length} 表)`)
  console.log('  下一步: npm run data:merge -- ' + path.basename(file))
}

// ---------------- merge ----------------
async function cmdMerge() {
  const snap = argv[1]
  if (!snap) die('用法: node scripts/data-sync.mjs merge <快照.json>')
  const file = path.isAbsolute(snap) ? snap : path.join(SNAP_DIR, snap)
  if (!fs.existsSync(file)) die(`快照不存在: ${file}`)
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  const tables = payload.tables || payload
  const dbFile = flag('db') || DEFAULT_DB
  const db = await openDatabase(dbFile)
  const known = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name)

  const applied = {}
  let added = 0
  db.exec('PRAGMA foreign_keys = OFF')
  for (const [t, rows] of Object.entries(tables)) {
    if (!known.includes(t) || !Array.isArray(rows) || !rows.length) {
      applied[t] = 0
      continue
    }
    const cols = Object.keys(rows[0]).filter((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c))
    const sql = `INSERT OR IGNORE INTO "${t}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
    const stmt = db.prepare(sql)
    let n = 0
    for (const r of rows) {
      try {
        const info = stmt.run(...cols.map((c) => (r[c] === undefined ? null : r[c])))
        // better-sqlite3 给 changes, WASM/内置驱动给的是 changes 或 lastInsertRowid
        if (info && (info.changes === undefined || info.changes > 0)) n++
      } catch {
        /* 冲突/外键不满足就跳过 */
      }
    }
    applied[t] = n
    added += n
  }
  db.exec('PRAGMA foreign_keys = ON')
  db.close()
  const detail = Object.entries(applied)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${t}+${n}`)
    .join(' ')
  console.log(`✓ 已合并进本地库 ${path.relative(root, dbFile)}: 新增 ${added} 行${detail ? ' (' + detail + ')' : ''}`)
  if (!added) console.log('  （本地已有这些数据，无需合并）')
}

// ---------------- push ----------------
async function cmdPush() {
  const snap = argv[1]
  if (!snap) die('用法: node scripts/data-sync.mjs push <快照.json> --force')
  if (!flag('force')) die('push 会清空线上同名表, 确认请加 --force')
  const file = path.isAbsolute(snap) ? snap : path.join(SNAP_DIR, snap)
  if (!fs.existsSync(file)) die(`快照不存在: ${file}`)
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  const tables = payload.tables || payload
  const body = JSON.stringify({ tables })
  if (Buffer.byteLength(body) > 6 * 1024 * 1024) {
    die(`快照 ${(Buffer.byteLength(body) / 1024 / 1024).toFixed(1)}MB 超过服务端 8MB 请求上限, 请先清理历史数据`)
  }
  const base = flag('base') || process.env.TP_BASE || DEFAULT_BASE
  const token = await login(base)
  console.log(`· 正在灌回 ${base} (replace 模式)…`)
  const d = await api(base, 'admin/data/import', { tables, mode: 'replace', confirm: 'REPLACE' }, token)
  const detail = Object.entries(d.applied || {})
    .map(([t, n]) => `${t}:${n}`)
    .join(' ')
  console.log('✓ 已写入线上: ' + detail)
  if (d.failures?.length) console.log('  部分行失败: ' + d.failures.join(' | '))
}

const commands = {
  stat: cmdStat,
  backup: cmdBackup,
  checkpoint: cmdCheckpoint,
  pull: cmdPull,
  merge: cmdMerge,
  push: cmdPush,
}

if (!commands[cmd]) {
  console.log(
    [
      '用法: node scripts/data-sync.mjs <子命令> [参数] [--base 线上地址] [--user 管理员] [--pass 密码]',
      '',
      '  stat                    查看本地库现状(各表行数 / 用户 / 最近记忆)',
      '  backup                  备份本地库到 server/data/backups/',
      '  checkpoint              WAL 落盘并清理 -wal/-shm(发布前必做)',
      '  pull                    线上 → 本地快照 server/data/snapshots/',
      '  merge <快照.json>        快照 → 本地库(只补不覆盖)',
      '  push  <快照.json> --force 快照 → 线上(replace, 会清空线上同名表)',
    ].join('\n')
  )
  process.exit(0)
}
commands[cmd]().catch((e) => die(e?.message || String(e)))
