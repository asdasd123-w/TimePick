// 图片瘦身: 把 src/assets 下的大图重新编码为体积更小的 webp
//
// 背景: 当前 16 张素材共 21.9MB, 而它们本身已经是 webp —— 大是因为
// 原图分辨率高(最高 2880px)且编码质量过高(近乎无损)。这些图在页面里
// 多用作背景/插画, 肉眼对轻微压缩不敏感, 实测可压到 1.6MB(-93%)。
//
// 用法:
//   node scripts/optimize-images.mjs            # 演练: 只报告, 不写文件
//   node scripts/optimize-images.mjs --write    # 真正替换, 原图备份到 .backup/assets-original/
//
// 可调参数(环境变量): MAX_WIDTH(默认 1600) QUALITY(默认 72)
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src', 'assets')
const BACKUP = path.join(ROOT, '.backup', 'assets-original')
const MAX_WIDTH = Number(process.env.MAX_WIDTH || 1600)
const QUALITY = Number(process.env.QUALITY || 72)
const WRITE = process.argv.includes('--write')

if (!fs.existsSync(SRC)) {
  console.error('找不到 src/assets')
  process.exit(1)
}

const files = fs.readdirSync(SRC).filter((f) => /\.(webp|png|jpe?g)$/i.test(f))
let before = 0
let after = 0
const rows = []

for (const f of files) {
  const p = path.join(SRC, f)
  const meta = await sharp(p).metadata()
  const src = fs.statSync(p).size
  // 缩放只对超过上限的图生效; 精灵图(spritesheet)不缩放, 否则帧坐标会错位
  const isSprite = /sprite/i.test(f)
  const pipe = !isSprite && meta.width > MAX_WIDTH ? sharp(p).resize({ width: MAX_WIDTH }) : sharp(p)
  const out = await pipe.webp({ quality: QUALITY, effort: 5 }).toBuffer()
  before += src
  after += out.length
  rows.push({ f, size: `${meta.width}x${meta.height}`, src, out: out.length })

  if (WRITE && out.length < src) {
    fs.mkdirSync(BACKUP, { recursive: true })
    if (!fs.existsSync(path.join(BACKUP, f))) fs.copyFileSync(p, path.join(BACKUP, f))
    fs.writeFileSync(p, out)
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)}KB`.padStart(7)
for (const r of rows.sort((a, b) => b.src - a.src)) {
  const cut = ((1 - r.out / r.src) * 100).toFixed(0)
  console.log(`${r.f.padEnd(34)} ${r.size.padEnd(11)} ${kb(r.src)} -> ${kb(r.out)}  省 ${cut}%`)
}
const cut = ((1 - after / before) * 100).toFixed(0)
console.log('-'.repeat(76))
console.log(`合计 ${(before / 1048576).toFixed(1)}MB -> ${(after / 1048576).toFixed(1)}MB  省 ${cut}%`)
console.log(
  WRITE
    ? `已替换; 原图备份在 ${path.relative(ROOT, BACKUP)}`
    : '这是演练结果。确认无误后加 --write 才会真正替换(自动备份原图)。',
)
