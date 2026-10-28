// 环境变量加载：依次读取 .env.local、.env（不引入 dotenv 依赖，已存在的环境变量优先）
//
// ★ 为什么单独成一个文件：
//   ES 模块的 import 会在模块体执行**之前**完成求值。如果加载逻辑写在 index.js 里，
//   db.js 顶层的 `process.env.DB_PATH` / `process.env.SUPER_ADMIN_USERNAME`
//   会在它之前被读取，永远是 undefined —— 表现是「.env.local 里明明写了却不生效」，
//   而且不报错，非常难查。
//   把加载放进独立模块，由 db.js / index.js 各自 import 一次，
//   模块只求值一次，谁先 import 谁就先拿到环境变量。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

for (const name of ['.env.local', '.env']) {
  const file = path.join(__dirname, '..', name)
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const eq = s.indexOf('=')
    if (eq <= 0) continue
    const key = s.slice(0, eq).trim()
    let val = s.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}
