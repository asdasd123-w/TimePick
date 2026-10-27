// patch-room3d-splash.mjs —— 关掉 Cocos 产物里的启动插屏（那个 "Created with Cocos" 标志页）
// ---------------------------------------------------------------------------
// 用法（TimePick 目录下）：
//   npm run patch-room3d            # 默认处理 public/room3d 和 sg3d/build/web-mobile
//   node scripts/patch-room3d-splash.mjs "D:\other\build\web-mobile"
//
// 原理（读 Cocos 3.8.8 引擎源码 cocos/game/splash-screen.ts 确认过）：
//   引擎启动时会从 <产物>/src/settings.json 的 splashScreen 段读插屏配置，
//     logo      = querySettings('splashScreen', 'logo')
//     background= querySettings('splashScreen', 'background')
//   然后：
//     if (totalTime <= 0 || logo === undefined || background === undefined) { totalTime = 0 }
//   totalTime 一旦是 0，isFinished 恒为 true，插屏既不做初始化也不渲染，等于彻底关闭。
//
//   所以只要把 settings.json 里的 splashScreen 整段删掉，插屏就没了。
//   querySettings 在整段缺失时返回 null（不抛错），删掉是安全的。
//
// ⚠ 这一步必须在【拷贝产物之后】做，因为 copy-room3d 会从 Cocos 的 build 目录重新覆盖。
//   copy-room3d.mjs 已经自动调用本模块，正常不用手动跑。
//
// 想保留插屏、只是换成自己的图？不用本脚本，改 Cocos 里：
//   项目 → 构建发布 → 找到「启用插屏 / Splash Screen」→ Logo 选“自定义”上传自己的图。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** settings.json 在产物里的相对位置 */
const SETTINGS_REL = path.join('src', 'settings.json')

/**
 * 把某个 Cocos 产物目录里的启动插屏关掉（幂等）。
 * @param {string} dir 产物目录（里面应有 index.html 和 src/settings.json）
 * @returns {{file: string, status: string}}
 *   status: stripped 已删掉 / already-off 本来就是关的 / missing 没找到文件 /
 *           unparsable JSON 坏了 / bad-shape 结构不对 / write-failed 写不进去
 */
export function stripSplash(dir) {
  const file = path.join(dir, SETTINGS_REL)
  if (!fs.existsSync(file)) return { file, status: 'missing' }

  let data
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    return { file, status: 'unparsable', error: e.message }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { file, status: 'bad-shape' }
  }
  if (!('splashScreen' in data)) return { file, status: 'already-off' }

  delete data.splashScreen
  try {
    // 保持 Cocos 自己的 4 空格缩进，方便 diff
    fs.writeFileSync(file, `${JSON.stringify(data, null, 4)}\n`)
  } catch (e) {
    return { file, status: 'write-failed', error: e.message }
  }
  return { file, status: 'stripped' }
}

/** 把结果打成一行日志，供 copy-room3d 复用 */
export function describe(result) {
  const name = path.basename(path.dirname(path.dirname(result.file))) || result.file
  switch (result.status) {
    case 'stripped':
      return `✓ 已关闭启动插屏（Cocos 标志）：${name}/src/settings.json`
    case 'already-off':
      return `✓ 启动插屏本来就是关的：${name}/src/settings.json`
    case 'missing':
      return `⚠ 没找到 src/settings.json，跳过：${name}`
    case 'unparsable':
      return `⚠ settings.json 解析失败，未改动：${result.file}（${result.error}）`
    case 'bad-shape':
      return `⚠ settings.json 结构异常，未改动：${result.file}`
    default:
      return `⚠ 写入失败：${result.file}（${result.error}）`
  }
}

// ---- 直接运行时：批量处理目录 ----
const selfUrl = fileURLToPath(import.meta.url)
const invoked = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === selfUrl.toLowerCase()

if (invoked) {
  const here = path.dirname(selfUrl)
  const root = path.resolve(here, '..')
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const dirs = args.length
    ? args.map((a) => path.resolve(a))
    : [
        path.resolve(root, 'public', 'room3d'),
        path.resolve(root, '..', '3d日记房间', 'sg3d', 'build', 'web-mobile'),
      ]

  console.log('=== 关闭 Cocos 启动插屏 ===')
  let bad = 0
  for (const d of dirs) {
    const r = stripSplash(d)
    console.log(' ', describe(r))
    if (r.status === 'missing' || r.status === 'write-failed') bad++
  }
  console.log()
  console.log(bad ? '⚠ 有目录没处理成功（见上面日志）' : '✓ 处理完毕')
  process.exit(bad ? 1 : 0)
}
