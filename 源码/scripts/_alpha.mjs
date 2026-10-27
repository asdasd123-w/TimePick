// 一次性: 看 isle.webp 有没有 alpha 通道, 以及四角像素值
import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs'

const ROOT = path.resolve(import.meta.dirname, '..')
const p = path.join(ROOT, 'src', 'assets', 'isle.webp')
const m = await sharp(p).metadata()
const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const px = (x, y) => {
  const i = (y * info.width + x) * info.channels
  return [data[i], data[i + 1], data[i + 2], data[i + 3]].join(',')
}
const lines = [
  `hasAlpha=${m.hasAlpha} channels=${m.channels} space=${m.space} ${info.width}x${info.height}`,
  `corner(0,0)=${px(0, 0)}`,
  `corner(w-1,0)=${px(info.width - 1, 0)}`,
  `corner(0,h-1)=${px(0, info.height - 1)}`,
  `mid(256,30)=${px(256, 30)}`,
  `cell2start(512,0)=${px(512, 0)}`,
]
fs.rmSync(path.join(ROOT, 'scripts', '_alpha.mjs'), { force: true })
fs.writeFileSync(path.join(ROOT, '.workbuddy', 'alpha.txt'), lines.join('\n'), 'utf8')
