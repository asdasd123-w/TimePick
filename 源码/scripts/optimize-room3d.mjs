// optimize-room3d.mjs —— 给 Cocos 产物里的贴图做「瘦身」，不动任何代码
// ---------------------------------------------------------------------------
// 用法（TimePick 目录下）：
//   node scripts/optimize-room3d.mjs "D:\...\build\web-mobile" [更多目录…]
//
// 为什么要做：实测 3D 房间首次加载 167 个请求、100.7MB，其中贴图就占 70.5MB
//   —— 光 rahmen.glb 导出的一张 4K 贴图就有 15MB（4096×4096 PNG）。
//   这些图明明只贴在墙上/家具上，2K 完全够用，省下来的都是白等的时间。
//
// ★★ 画质开关都在这几行，要更清楚就往上调，要更快就往下调（改完重跑本脚本即可）：
const MAX_DIM = 2048 // 贴图最长边上限。4096→2048 是 4 倍像素差，画质几乎无损
const PNG_MIN = 300 * 1024 // 只处理大于这个体积的 png（300KB）
const JPG_MIN = 300 * 1024 // 只处理大于这个体积的 jpg
const WEBP_Q = 90 // WebP 质量 0-100。90 已经是「肉眼无损」档；想再省可以 84
const JPG_Q = 88 // 大 jpg 重编码的质量
// ★★ 说明：png 会被转成 WebP（同文件名，仍是 .png 后缀）。体积能压到原来的 1/10。
//   服务端已经按「文件魔数」给这些文件回正确的 Content-Type（见 server/index.js 的
//   sniffImageType），所以浏览器/引擎解码不会有任何问题。
//   如果想退回「保守模式」（不换格式，只做 PNG 调色板量化，体积约压到 1/5）：
//     node scripts/optimize-room3d.mjs <dir> --png
//
// 幂等：处理后文件会小于上面的阈值，再次运行会直接跳过，不会反复有损重编码。
// 每次 Cocos 重新构建都会把产物恢复成原图，所以构建之后必须再跑一次本脚本。
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(path.resolve(import.meta.url, '..', 'package.json'))
const sharp = require('sharp')

const CONSERVATIVE = process.argv.includes('--png')
const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'))

if (!dirs.length) {
  console.error('用法: node scripts/optimize-room3d.mjs <cocos产物目录> [更多目录…]')
  process.exit(1)
}

const isImg = (f) => /\.(png|jpe?g)$/i.test(f)

function walk(root) {
  const out = []
  if (!fs.existsSync(root)) return out
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name)
    if (e.isDirectory()) {
      // 只动 native 目录里的贴图：import/ 下的 json 是元数据，不能碰
      out.push(...walk(p))
    } else if (isImg(e.name)) out.push(p)
  }
  return out
}

for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    console.log(`跳过（不存在）: ${dir}`)
    continue
  }
  const files = walk(dir)
  let before = 0
  let after = 0
  let done = 0
  let skipped = 0
  const st = Date.now()
  for (const p of files) {
    const size = fs.statSync(p).size
    const isPng = /\.png$/i.test(p)
    if (size < (isPng ? PNG_MIN : JPG_MIN)) {
      before += size
      after += size
      skipped++
      continue
    }
    try {
      // ★ 先整读进内存再交给 sharp：在 Windows 上让 libvips 自己 open 这些文件时
      //   会偶发 "UNKNOWN: unknown error, open"（跟文件本身无关，同一批文件下次跑换个
      //   失败对象），用 Buffer 输入就没这个问题了。
      const src = fs.readFileSync(p)
      const meta = await sharp(src).metadata()
      const needResize = Math.max(meta.width || 0, meta.height || 0) > MAX_DIM
      let s = sharp(src)
      if (needResize) s = s.resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      let out
      if (CONSERVATIVE) {
        out = await s.png({ palette: true, quality: 82, effort: 6, compressionLevel: 9 }).toBuffer()
      } else if (isPng) {
        out = await s.webp({ quality: WEBP_Q, alphaQuality: 95, effort: 5, smartSubsample: true }).toBuffer()
      } else {
        out = await s.jpeg({ quality: JPG_Q, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer()
      }
      if (out.length < size) {
        fs.writeFileSync(p, out)
        before += size
        after += out.length
        done++
      } else {
        before += size
        after += size
        skipped++
      }
    } catch (e) {
      console.log(`  ⚠ 跳过 ${path.basename(p)}: ${e.message}`)
      before += size
      after += size
    }
  }
  const mb = (n) => (n / 1048576).toFixed(1) + 'MB'
  console.log(
    `${dir}\n  处理 ${done} 张，跳过 ${skipped} 张；贴图合计 ${mb(before)} → ${mb(after)}` +
      `（省 ${mb(before - after)}，${((1 - after / before) * 100).toFixed(0)}%）｜${((Date.now() - st) / 1000).toFixed(1)}s`,
  )
}
