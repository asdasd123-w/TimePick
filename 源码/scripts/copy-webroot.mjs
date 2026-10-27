// 部署用的产物副本: dist -> webroot
//
// 原因: 一键发布在压缩上传时会把「构建产物」目录(dist/build 这类)排除掉,
// 而我们的 Express 单端口服务是直接托管前端产物的 —— dist 被丢掉后线上就只剩 API,
// 打开是空的。这里额外产出一份非约定目录名 `webroot` 作为保险,
// server/index.js 的查找顺序是 dist -> webroot(及备选名), 只要有一个在就能正常托管。
//
// ⚠ 为什么有一串候选目录名(webroot / webroot2 / ...):
//   Windows 上删除一个很大的目录时, 安全层有时会把该路径做成「永久拒绝访问」状态
//   (readdir / mkdir / write / rename / takeown / icacls 全部 EPERM), 目录名就废了。
//   与其让 npm run build 卡死在这里, 不如自动换一个没被污染的名字继续。
//   服务端(server/index.js)用同一份候选清单查找, 两边始终对得上。
//
// 注: 本机 fs.cpSync 在 Windows 上对这份 100MB 的 3D 房间产物会直接崩进程,
// 所以用手写递归代替。
import fs from 'node:fs'
import path from 'node:path'

// ⚠ 改这里要同步改 server/index.js 里的 webRoot 候选清单
const CANDIDATES = ['webroot', 'webroot2', 'webroot3', 'webroot4', 'webroot5']

const root = path.resolve(import.meta.dirname, '..')
const src = path.join(root, 'dist')

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('[copy-webroot] dist/index.html 不存在, 请先执行 vite build')
  process.exit(1)
}

/** 这个目录能不能当输出目标: 不存在就试着建, 建完还要真写一个探针文件才算数 */
function usable(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, '.write-probe')
    fs.writeFileSync(probe, '1')
    fs.rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

// 明确排除的目录：public 里那个历史遗留的空壳 room3d-live 已经被系统安全策略锁住
// （子目录 readdir 直接 EPERM，删不掉也拷不动），它没有任何页面资源，
// 拷它只会让本脚本误判"目标目录不可写"而去换下一个候选名。与 copy-public.mjs 保持一致。
const SKIP_DIRS = new Set(['room3d-live'])

/** 递归拷贝；返回失败文件数（读不动的目录/写不进的文件会跳过并计数） */
function makeCopier() {
  const stat = { files: 0, bytes: 0, failed: 0 }
  function copyDir(from, to) {
    if (SKIP_DIRS.has(path.basename(from))) return
    try {
      fs.mkdirSync(to, { recursive: true })
    } catch {
      /* 已存在或被锁, 让下面的写文件去暴露问题 */
    }
    let entries
    try {
      entries = fs.readdirSync(from, { withFileTypes: true })
    } catch (e) {
      stat.failed++
      console.warn(`[copy-webroot] 跳过读不动的目录: ${from}(${e.code})`)
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
          stat.files++
          stat.bytes += fs.statSync(d).size
        } catch (err) {
          stat.failed++
          if (stat.failed <= 5) console.warn(`[copy-webroot] 跳过: ${s}(${err.code})`)
        }
      }
    }
  }
  return { copyDir, stat }
}

// ---- 挑一个真正可用的输出目录 ----
const skipped = []
let dst = null
for (const name of CANDIDATES) {
  const dir = path.join(root, name)
  // 清理旧内容: 删不掉也不能中断(可能是被锁的残留), 交给下面的 usable() 去淘汰
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* 忽略 */
  }
  if (usable(dir)) {
    dst = dir
    break
  }
  skipped.push(name)
}

if (!dst) {
  // 不是致命错误: 服务端首选 dist, dist 已经构建好了, 只是少了这份额外的保险副本
  console.warn('[copy-webroot] ⚠ 所有候选目录都不可写, 跳过副本产出(dist 仍可正常托管):', CANDIDATES.join(', '))
  console.warn('[copy-webroot]   如要修复: 用管理员终端执行 takeown /F "<目录>" /R /D Y 再 rd /S /Q "<目录>"')
  process.exit(0)
}

// 「根目录能写」不等于整个目录都能写 —— 被锁过的残留子目录会让我们漏拷文件
// （实测漏掉过 bullet/spine 的 wasm）。所以拷完若有失败项，就换下一个候选重来。
let last = null
for (let attempt = 0; attempt < CANDIDATES.length; attempt++) {
  const { copyDir, stat } = makeCopier()
  copyDir(src, dst)
  last = stat
  if (!stat.failed) break

  const bad = path.basename(dst)
  skipped.push(bad)
  const next = CANDIDATES.find((n) => !skipped.includes(n))
  if (!next) break
  console.warn(`[copy-webroot] ${bad} 里有写不进去的子目录(漏拷 ${stat.failed} 个), 改用 ${next} 重来`)
  dst = path.join(root, next)
  try {
    fs.rmSync(dst, { recursive: true, force: true })
  } catch {
    /* 忽略 */
  }
}

if (skipped.length) {
  console.warn(`[copy-webroot] 不可用的候选: ${skipped.join(', ')} -> 最终用 ${path.basename(dst)}`)
}
console.log(
  `[copy-webroot] dist -> ${path.basename(dst)} 完成: ${last.files} 个文件, ${(last.bytes / 1024 / 1024).toFixed(2)} MB` +
    (last.failed ? ` (仍漏拷 ${last.failed} 个)` : '')
)
