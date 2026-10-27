// 从设计稿参考图里抠出「拾光」二字(纯白 + 透明), 生成 src/assets/title-shiguang.png
//
// 背景: 欢迎页左上角的主标题原先是手绘 SVG 细线字, 与设计稿字形差距较大。
// 这里直接把设计稿预览图里的手写「拾光」(含右侧甩尾)抠出来: 该处笔画是照片中
// 最亮的区域(亮度 176-223), 背景书架暗部集中在 32-63, 用亮度 smoothstep 就能
// 干净分离; 再剔掉背景噪点与标题右上角那颗 ✦(它在页面上是独立的 .wk-spark 元素)。
//
// 用法: node scripts/extract-title.mjs [参考图路径]
// 默认参考图: 设计稿预览照片(见下), 若不存在请传参指定。
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_REF =
  'C:/Users/23395/.workbuddy/clipboard-images/clipboard-2026-09-23T15-51-23-250Z-f887387b.jpg'
const REF = process.argv[2] || DEFAULT_REF
if (!fs.existsSync(REF)) {
  console.error(`找不到参考图: ${REF}\n用法: node scripts/extract-title.mjs <参考图路径>`)
  process.exit(1)
}

// 参考图为 1080x2400 的屏幕照片, 「拾光」+甩尾 落在下面这块区域(绝对坐标)
const LEFT = 90
const TOP = 634
const WIDTH = 475
const HEIGHT = 228

// 亮度 -> alpha 的映射区间: 低于 LO 全透明, 高于 HI 全不透明, 中间线性过渡(保住边缘柔化)
const ALPHA_LO = 140
const ALPHA_HI = 196
// 连通域面积下限(去噪): 小于它的孤立小块直接丢弃
const MIN_BLOB = 14
// ✦ 星星所在区域(ROI 坐标, 含其光晕): 整体清零, 不烘进字形图
const STAR_BOX = { x0: 300, x1: 380, y0: 0, y1: 60 }

const { data, info } = await sharp(REF)
  .extract({ left: LEFT, top: TOP, width: WIDTH, height: HEIGHT })
  .removeAlpha()
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true })
const W = info.width
const H = info.height

const AL = new Float32Array(W * H)
for (let i = 0; i < W * H; i++) {
  const t = (data[i] - ALPHA_LO) / (ALPHA_HI - ALPHA_LO)
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t
  // 轻微 S 曲线: 笔画更实, 边缘仍保留过渡
  AL[i] = c * c * (3 - 2 * c)
}

for (let y = STAR_BOX.y0; y < STAR_BOX.y1; y++)
  for (let x = STAR_BOX.x0; x < STAR_BOX.x1; x++) AL[y * W + x] = 0

// 连通域去噪
const seen = new Uint8Array(W * H)
const FLOOR = 0.22
let removed = 0
for (let i = 0; i < W * H; i++) {
  if (AL[i] < FLOOR || seen[i]) continue
  const st = [i]
  seen[i] = 1
  const cells = []
  while (st.length) {
    const q = st.pop()
    cells.push(q)
    const qx = q % W
    const qy = (q - qx) / W
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nx = qx + dx
      const ny = qy + dy
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
      const p = ny * W + nx
      if (seen[p] || AL[p] < FLOOR) continue
      seen[p] = 1
      st.push(p)
    }
  }
  if (cells.length < MIN_BLOB) {
    for (const q of cells) AL[q] = 0
    removed++
  }
}

// 按内容包围盒裁紧(留 0 边距, 页面用 CSS 定宽)
let bx0 = W
let bx1 = -1
let by0 = H
let by1 = -1
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (AL[y * W + x] > 0) {
      if (x < bx0) bx0 = x
      if (x > bx1) bx1 = x
      if (y < by0) by0 = y
      if (y > by1) by1 = y
    }

const OW = bx1 - bx0 + 1
const OH = by1 - by0 + 1
const out = Buffer.alloc(OW * OH * 4)
for (let y = 0; y < OH; y++)
  for (let x = 0; x < OW; x++) {
    const p = (y + by0) * W + (x + bx0)
    const o = (y * OW + x) * 4
    out[o] = 255
    out[o + 1] = 255
    out[o + 2] = 255
    out[o + 3] = Math.round(AL[p] * 255)
  }

const OUT = path.resolve('src/assets/title-shiguang.png')
await sharp(out, { raw: { width: OW, height: OH, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT)

console.log(`已写 ${OUT}`)
console.log(`尺寸 ${OW}x${OH} (比例 ${(OW / OH).toFixed(3)}), 剔除噪点块 ${removed}`)
