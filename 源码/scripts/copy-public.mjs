// public -> dist 的静态资源拷贝（替代 vite 自带的 copyPublicDir）
//
// 为什么不用 vite 自带的：
//   vite 在 prepare-out-dir 阶段会无条件递归拷贝整个 public/，**只要里面有一个
//   读不了或删不掉的目录（比如被系统安全策略加了"拒绝访问"的残留目录），
//   整个 `vite build` 就直接失败**（EPERM scandir / SAFE_DELETE_BULK_*）。
//   这里自己拷：遇到读不动的条目就跳过并给出警告，绝不因为一个垃圾目录把构建搞挂。
//
// 配套：vite.config.js 里设了 build.copyPublicDir = false。
// 顺序：vite build && node scripts/copy-public.mjs && node scripts/copy-webroot.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const SRC = path.join(root, 'public')
const DST = path.join(root, 'dist')

if (!fs.existsSync(path.join(DST, 'index.html'))) {
  console.error('[copy-public] dist/index.html 不存在，请先执行 vite build')
  process.exit(1)
}
if (!fs.existsSync(SRC)) {
  console.log('[copy-public] 没有 public/ 目录，跳过')
  process.exit(0)
}

const stats = { files: 0, bytes: 0, failed: [] }

// 明确排除的目录：这些是历史遗留的空壳目录，里面的子目录被系统安全策略锁住
// （readdir 直接 EPERM），既删不掉也拷不动，每次构建都会刷 3 条警告。
// 它们不参与任何页面资源，跳过即可。
const SKIP_DIRS = new Set(['room3d-live'])

function copyDir(from, to) {
  if (SKIP_DIRS.has(path.basename(from))) return
  let entries
  try {
    entries = fs.readdirSync(from, { withFileTypes: true })
  } catch (e) {
    stats.failed.push(`${from}  (${e.code || e.message})`)
    return
  }
  try {
    fs.mkdirSync(to, { recursive: true })
  } catch (e) {
    stats.failed.push(`${to}  (${e.code || e.message})`)
    return
  }
  for (const e of entries) {
    const s = path.join(from, e.name)
    const d = path.join(to, e.name)
    if (e.isDirectory()) {
      copyDir(s, d)
    } else {
      try {
        fs.copyFileSync(s, d)
        stats.files++
        stats.bytes += fs.statSync(d).size
      } catch (err) {
        stats.failed.push(`${s}  (${err.code || err.message})`)
      }
    }
  }
}

copyDir(SRC, DST)

console.log(
  `[copy-public] 拷贝 ${stats.files} 个文件 (${(stats.bytes / 1024 / 1024).toFixed(2)} MB)`,
)
if (stats.failed.length) {
  console.log(`[copy-public] ⚠ 有 ${stats.failed.length} 项读不了/写不动，已跳过（不影响构建）:`)
  for (const f of stats.failed.slice(0, 8)) console.log('    ' + f)
  if (stats.failed.length > 8) console.log(`    ……还有 ${stats.failed.length - 8} 项`)
}
