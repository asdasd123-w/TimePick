// 构建期预压缩：给静态资源生成 .br 旁挂文件，请求时零 CPU。
//
// 为什么必须预压缩：
//   运行期用 zlib.brotliCompressSync 是**同步**的，会整块卡住 Node 事件循环。
//   本地桌面 CPU 感觉不到，但部署沙箱的 CPU 很弱，压缩一个 4.5MB 的 mesh 要几百毫秒，
//   33 个 mesh 串行下来就是十几秒——期间所有其它请求（包括 API）全部排队。
//   预压缩后请求路径只剩「读文件 + 发出去」。
//
// 等级用 q11（最高）：构建期跑一次，慢点无所谓，比 q5 还能再省约 6%。
// 只生成 .br：现代浏览器全都支持，gzip 兜底留给运行期动态压（那种请求极少）。
//
// 用法：node scripts/precompress-static.mjs [目录...]
//   默认处理 webroot 与 dist。已存在且比源文件新的 .br 会跳过（增量）。

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const COMPRESSIBLE = /\.(js|mjs|cjs|json|css|html?|svg|xml|txt|wasm|bin|gltf|fbx|obj|mtl|glsl|vert|frag|map)$/i
// 图片/音视频本身已是压缩格式，再压几乎没收益，只会白占磁盘
const SKIP_DIR = /(^|[\\/])(node_modules|\.git)([\\/]|$)/

const MIN_BYTES = 8 * 1024 // 小于 8KB 的文件压缩收益不抵一次 stat 开销

let made = 0
let skipped = 0
let savedRaw = 0
let savedBr = 0

function* walk(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIR.test(p)) continue
      yield* walk(p)
    } else if (e.isFile()) {
      yield p
    }
  }
}

function compressOne(file) {
  if (!COMPRESSIBLE.test(file)) return
  if (file.endsWith('.br')) return
  const st = fs.statSync(file)
  if (st.size < MIN_BYTES) return
  const br = file + '.br'
  const bst = fs.existsSync(br) ? fs.statSync(br) : null
  if (bst && bst.mtimeMs >= st.mtimeMs) {
    skipped++
    return
  }
  const raw = fs.readFileSync(file)
  const out = zlib.brotliCompressSync(raw, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
    },
  })
  // 压完反而更大（极少见）就别留旁挂文件
  if (out.length >= raw.length) return
  fs.writeFileSync(br, out)
  made++
  savedRaw += raw.length
  savedBr += out.length
}

const roots = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['webroot', 'dist'].filter((d) => fs.existsSync(d))

const t0 = Date.now()
for (const root of roots) {
  if (!fs.existsSync(root)) {
    console.log(`  跳过（不存在）: ${root}`)
    continue
  }
  for (const f of walk(root)) compressOne(f)
}

const mb = (n) => (n / 1048576).toFixed(1) + 'MB'
console.log(
  `预压缩完成: 新建 ${made} 个 .br，跳过(已是最新) ${skipped} 个，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`,
)
if (made) console.log(`  原始 ${mb(savedRaw)} → brotli ${mb(savedBr)}（传输量再降到 ${((savedBr / savedRaw) * 100).toFixed(1)}%）`)
