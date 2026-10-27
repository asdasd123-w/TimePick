// copy-room3d.mjs —— 把 Cocos 构建产物搬到 TimePick 里，让「点岛进 3D 房间」能跑起来
// ---------------------------------------------------------------------------
// 用法（在 TimePick 目录下）：
//   npm run copy-room3d
//   或  node scripts/copy-room3d.mjs
//   产物目录不在默认位置时：node scripts/copy-room3d.mjs "D:\xxx\build\web-mobile"
//
// 它做的事：
//   sg3d/build/web-mobile/*   →   TimePick/public/room3d/
// 拷完 TimePick 的 /room3d/ 就能被访问到，room3d.vue 的 iframe 直接加载它。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripSplash, describe as describeSplash } from './patch-room3d-splash.mjs'
import { injectLoader } from './inject-room3d-loader.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const timepickRoot = path.resolve(here, '..')

// Cocos 工程与 TimePick 同级：E:\传智杯\TimePick  ←→  E:\传智杯\3d日记房间\sg3d
const DEFAULT_SRC = path.resolve(timepickRoot, '..', '3d日记房间', 'sg3d', 'build', 'web-mobile')
const SRC = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SRC
const DST = path.resolve(timepickRoot, 'public', 'room3d')

const CLEAN_GUARD = path.join('public', 'room3d')

function sizeOf(p) {
  let n = 0
  const st = fs.statSync(p)
  if (st.isFile()) return st.size
  for (const e of fs.readdirSync(p)) n += sizeOf(path.join(p, e))
  return n
}

function copyDir(from, to, counter) {
  // 目录可能已经存在，也可能是个被锁住、连 mkdir 都会 EPERM 的残留目录 ——
  // 这里不抛错，让后面的 copyFileSync 逐个收集失败原因，最后统一报告。
  try {
    fs.mkdirSync(to, { recursive: true })
  } catch (err) {
    /* 忽略：真正的失败会在写文件时被记录 */
  }
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name)
    const d = path.join(to, e.name)
    if (e.isDirectory()) copyDir(s, d, counter)
    else {
      try {
        fs.copyFileSync(s, d)
        counter.files++
        counter.bytes += fs.statSync(d).size
      } catch (err) {
        counter.failed.push(`${d}  (${err.code || err.message})`)
      }
    }
  }
}

// 清掉一项旧产物。清不掉就先改名挪开；都不行就警告并继续（直接覆盖）。
// 有些环境（比如被安全策略加了拒绝访问 ACL 的目录）是删不掉的，不能因此中断整个拷贝。
function removeEntry(p, counter) {
  try {
    fs.rmSync(p, { recursive: true, force: true })
    return
  } catch (e1) {
    // 继续尝试改名挪开
  }
  try {
    fs.renameSync(p, `${p}.stale-${Date.now()}`)
    counter.renamed.push(p)
    return
  } catch (e2) {
    counter.unremovable.push(p)
  }
}

console.log('=== 拷贝 Cocos 3D 房间产物 ===')
console.log('源  :', SRC)
console.log('目标:', DST)
console.log()

if (!fs.existsSync(SRC)) {
  console.error('✗ 找不到构建产物目录。请先在 Cocos Creator 里构建一次：')
  console.error('   1) 打开工程  E:\\传智杯\\3d日记房间\\sg3d')
  console.error('   2) 菜单栏  项目 → 构建发布  (或 Ctrl+Shift+B)')
  console.error('   3) 发布平台选 Web Mobile，点击「构建」')
  console.error('   4) 构建完成后再跑一次本命令')
  console.error()
  console.error('   如果构建到了别的目录，把目录传给本脚本：')
  console.error('     node scripts/copy-room3d.mjs "你的\\build\\web-mobile"')
  process.exit(1)
}

const indexHtml = path.join(SRC, 'index.html')
if (!fs.existsSync(indexHtml)) {
  console.error(`✗ 源目录里没有 index.html，看起来不是 Cocos 的构建产物：${SRC}`)
  process.exit(1)
}

if (!DST.endsWith(CLEAN_GUARD)) {
  console.error(`✗ 拒绝清理非目标目录：${DST}`)
  process.exit(1)
}

const counter = { files: 0, bytes: 0, failed: [], unremovable: [], renamed: [] }

console.log('目标:', DST)

// ⚠ 默认【不清理】，直接覆盖写。
// 原因：在某些 Windows 环境里，批量删除大目录会被系统安全层拦成"拒绝访问"，
// 反而把目标目录搞成不可写的状态 —— 清理带来的风险远大于收益。
// Cocos 构建产物文件名带 MD5、入口文件固定，覆盖写就足够；残留的旧文件无害。
// 确实想清干净时：npm run copy-room3d -- --clean
const WANT_CLEAN = process.argv.includes('--clean')
if (WANT_CLEAN && fs.existsSync(DST)) {
  const old = fs.readdirSync(DST)
  for (const e of old) removeEntry(path.join(DST, e), counter)
  console.log(`  已清理旧产物 ${old.length - counter.unremovable.length}/${old.length} 项`)
  for (const p of counter.unremovable) console.log(`  ⚠ 删不掉也挪不开，将直接覆盖：${p}`)
}
try {
  fs.mkdirSync(DST, { recursive: true })
} catch (e) {
  /* 目录已存在或被锁：真正的成败由下面写文件的结果决定 */
}

copyDir(SRC, DST, counter)

const mb = (counter.bytes / 1024 / 1024).toFixed(2)
console.log(`  ${counter.failed.length ? '⚠' : '✓'} 拷贝了 ${counter.files} 个文件，${mb} MB`)

// 关掉 Cocos 自带的启动插屏（那个 "Created with Cocos" 标志页）。
// 必须放在拷贝之后 —— 每次从 Cocos 的 build 目录拷过来都会把旧配置覆盖回去。
// 源目录也一起处理，这样直接在 sg3d/build/web-mobile 里预览时也没有插屏。
console.log()
console.log(describeSplash(stripSplash(DST)))
console.log(describeSplash(stripSplash(SRC)))
console.log()

// 首开加速：贴图瘦身（png/jpg → 更小）+ 加载进度层（引擎起来之前不再是一片空白）。
// 和插屏补丁同理，必须放在拷贝之后 —— 每次 Cocos 重新构建都会把产物恢复成原样。
console.log(injectLoader(DST))
console.log(injectLoader(SRC))
for (const d of [DST, SRC]) {
  try {
    const { execFileSync } = await import('node:child_process')
    const out = execFileSync(process.execPath, [path.join(here, 'optimize-room3d.mjs'), d], {
      encoding: 'utf8',
      timeout: 600000,
    })
    console.log(out.trim())
  } catch (e) {
    console.log(`⚠ 贴图优化没跑成功（不影响打开，只是会慢）: ${d} ${e.message}`)
  }
}
console.log()

// 自检：确认拷过去的是真正的 Cocos 页面，而不是别的东西
const entry = path.join(DST, 'index.html')
let looksCocos = false
if (fs.existsSync(entry)) {
  looksCocos = /GameCanvas|GameDiv|application\.js|cocos/i.test(fs.readFileSync(entry, 'utf8'))
  console.log(looksCocos ? '✓ 自检通过：index.html 确认为 Cocos 页面' : '⚠ 自检未通过：index.html 里没找到 Cocos 标记')
} else {
  console.log('⚠ 自检未通过：目标目录里没有 index.html')
}
console.log('  产物顶层内容:', fs.readdirSync(DST).join('  '))

if (counter.failed.length || !looksCocos) {
  console.log()
  console.log('⚠ 没能完整写入，3D 房间可能打不开：')
  for (const f of counter.failed.slice(0, 10)) console.log('  拷贝失败的文件:', f)
  if (counter.failed.length > 10) console.log(`  ……还有 ${counter.failed.length - 10} 个`)
  console.log()
  console.log('  处理办法：用「管理员」身份打开 cmd，删掉目标目录后重跑本命令：')
  console.log('    takeown /F "E:\\传智杯\\TimePick\\public\\room3d" /R /D Y')
  console.log('    icacls "E:\\传智杯\\TimePick\\public\\room3d" /reset /T /C')
  console.log('    rmdir /S /Q "E:\\传智杯\\TimePick\\public\\room3d"')
  process.exit(2)
}

console.log()
console.log('下一步：重启前端开发服务器（vite 才会看到 public/ 的新文件）')
console.log('  npm run dev')
console.log('然后再点岛就能进 3D 房间了。')
