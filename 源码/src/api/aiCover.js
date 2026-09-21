// AI 记忆封面生成
// 首选: 由服务端 AI 真出图 —— DeepSeek 把「标题+正文」扩写成画面描述, 再由智谱文生图,
//       服务端把图转存到 /uploads/covers/ 后返回地址(避免临时 URL 过期)。
// 降级: 未配置密钥 / 未登录 / 调用失败 / 超时, 回落为本地 Canvas 配色封面(不依赖网络)。
// 全程不抛错, 保证返回一个非空字符串, 可直接用于 <img src>。
import { refreshAiStatus, imageReady } from '@/api/deepseek'
import { cloudApi, getToken } from '@/api/cloud'

// 预设柔和色板 (暖色/冷色 hex 三元组)
const PALETTES = [
  ['#ffd6a5', '#ffadad', '#fdffb6'],
  ['#ffc9de', '#c9a7eb', '#a0c4ff'],
  ['#bde0fe', '#a2d2ff', '#cdb4db'],
  ['#ffe5b4', '#ffb88c', '#ff9aa2'],
  ['#caffbf', '#9bf6ff', '#a0c4ff'],
  ['#fbc4ab', '#f8ad9d', '#f4978e'],
  ['#d0f4de', '#a9def9', '#e4c1f9'],
  ['#fcf6bd', '#d0f4de', '#a9def9'],
  ['#f9c6c9', '#f9e0bb', '#fef9ef'],
  ['#b8bedd', '#98a8d8', '#c2a8d8'],
  ['#fde2e4', '#fad2e1', '#e2ece9'],
  ['#bee1e6', '#f0efeb', '#dfe7fd'],
]

// emoji 池
const EMOJIS = ['🌸', '🌊', '🍜', '📚', '🎵', '⛰️', '☕', '🐱', '🌙', '🍂', '🌈', '✨', '🌻', '🍃', '🏔️', '🎈', '🍰', '🚲']

// 氛围词
const MOODS = ['温暖', '宁静', '怀旧', '明快', '治愈', '梦幻', '慵懒', '清冷', '恬淡', '热烈']

// FNV-1a 字符串哈希, 用于确定性选取
function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h >>> 0)
}

// 从内容抽取 2-4 个短词, 无有效词时返回默认词
function extractKeywords(content) {
  const defaults = ['记忆', '时光', '瞬间']
  if (!content) return defaults.slice(0, 2)
  const tokens = String(content)
    .replace(/[\s，。！？、,.!?;；:：""''「」『』（）()【】\[\]…—-]+/g, ' ')
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 6)
  const picked = []
  for (const t of tokens) {
    if (picked.length >= 3) break
    if (!picked.includes(t)) picked.push(t)
  }
  return picked.length ? picked : defaults.slice(0, 2)
}

// 基于哈希的确定性配色方案 (降级用)
export function specFromHash(title, content) {
  const seed = hashString(`${title || ''}|${content || ''}`)
  const palette = PALETTES[seed % PALETTES.length]
  const emoji = EMOJIS[(seed >> 3) % EMOJIS.length]
  const mood = MOODS[(seed >> 6) % MOODS.length]
  const keywords = extractKeywords(content)
  return { palette, emoji, keywords, mood }
}

// 是否为「权限类」失败: 管理员关了总开关/用户级开关, 或未登录。
// 这类失败不能降级画假封面(否则看起来像权限没生效), 且要被永久记为「未使用 AI」。
export function isPermissionDenied(msg) {
  return /管理员限制|未登录|请先登录/.test(String(msg || ''))
}

function hexToRgba(hex, alpha) {
  let h = String(hex || '#000000').replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const num = parseInt(h, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r},${g},${b},${alpha})`
}

function truncate(str, max) {
  const s = String(str || '')
  return s.length > max ? s.slice(0, max) + '…' : s
}

// 用离屏 Canvas(640x400) 绘制封面, 返回 dataURL (降级方案)
function drawCover(spec, title) {
  const W = 640
  const H = 400
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const palette = spec.palette && spec.palette.length === 3 ? spec.palette : ['#ffd6a5', '#ffadad', '#a0c4ff']
  const [c1, c2, c3] = palette

  // 线性渐变背景
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, c1)
  grad.addColorStop(0.5, c2)
  grad.addColorStop(1, c3)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // 半透明柔光圆形色块
  const circles = [
    { x: W * 0.18, y: H * 0.24, r: 150, color: c3, a: 0.45 },
    { x: W * 0.82, y: H * 0.28, r: 170, color: c1, a: 0.4 },
    { x: W * 0.5, y: H * 0.88, r: 190, color: c2, a: 0.4 },
    { x: W * 0.74, y: H * 0.78, r: 110, color: c3, a: 0.35 },
    { x: W * 0.28, y: H * 0.72, r: 90, color: c1, a: 0.3 },
  ]
  ctx.globalCompositeOperation = 'lighter'
  for (const cir of circles) {
    const rg = ctx.createRadialGradient(cir.x, cir.y, 0, cir.x, cir.y, cir.r)
    rg.addColorStop(0, hexToRgba(cir.color, cir.a))
    rg.addColorStop(1, hexToRgba(cir.color, 0))
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.arc(cir.x, cir.y, cir.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 居中大 emoji
  ctx.font = '120px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif'
  ctx.fillText(spec.emoji || '✨', W / 2, H / 2 - 30)

  // 标题文字 (截断过长)
  ctx.font = '600 34px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = 'rgba(45,32,22,0.88)'
  ctx.shadowColor = 'rgba(255,255,255,0.55)'
  ctx.shadowBlur = 10
  ctx.fillText(truncate(title, 12), W / 2, H / 2 + 74)
  ctx.shadowBlur = 0

  // 底部关键词点缀
  const kw = (spec.keywords || []).slice(0, 4).join(' · ')
  if (kw) {
    ctx.font = '400 20px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = 'rgba(60,45,35,0.7)'
    ctx.fillText(kw, W / 2, H - 34)
  }

  // 四周暗角
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.9)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, W, H)

  return canvas.toDataURL('image/jpeg', 0.85)
}

// 最近一次生成失败的原因(AI 出图不可用时才会有值), 供 UI 如实提示用户,
// 避免「静默降级」让人以为功能根本没生效。
let lastError = ''
export function getLastCoverError() {
  return lastError
}

// ---------------- 防重复提交: 单飞 + 节流 + 结果缓存 ----------------
// 生图一次要 10-15s, 期间用户很容易连点: 这里做三层保护
// 1) 单飞: 同一时刻只放行一个生图请求, 后来的排队等前一个结束(并发会触发智谱限流 429)
// 2) 节流: 相邻两次真实请求至少间隔 MIN_INTERVAL, 快速连点只会打出一张
// 3) 缓存: 相同标题+正文在 CACHE_TTL 内直接复用上一张, 重复提交不会重复出图
const MIN_INTERVAL = 3000 // 相邻生图最小间隔
const CACHE_TTL = 5 * 60_000 // 同内容结果复用时长
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const coverCache = new Map()
let coverQueue = Promise.resolve()
let lastRequestAt = 0
const cacheKey = (title, content) => `${title || ''}||${content || ''}`

// 生图的实际执行体(被 generateMemoryCover 串行调用, 不要直接调它)
async function runGenerate(title, content, force) {
  lastError = ''
  // 节流: 距离上次请求不足最小间隔时先等一会儿, 保证不会短时间内连打多张
  const wait = MIN_INTERVAL - (Date.now() - lastRequestAt)
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
  // ---- 首选: 服务端 AI 真出图(DeepSeek 扩写画面描述 + 智谱文生图) ----
  try {
    await refreshAiStatus()
    if (!imageReady()) {
      lastError = getToken() ? '服务端未启用文生图' : '未登录'
    } else {
      // 服务端会串行排队并重试, 但排队可能较久(每个请求约 10-15s), 超时放宽到 120s
      const data = await Promise.race([
        cloudApi.aiCover({ title, content, force: force ? 1 : 0 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('封面生成超时')), 120_000)),
      ])
      if (data && typeof data.cover === 'string' && data.cover) return data.cover
      lastError = '生图服务未返回图片'
    }
  } catch (e) {
    const msg = e?.message || 'AI 出图失败'
    lastError = msg
    // 权限类失败(管理员限制/未登录)不做本地 Canvas 降级:
    // 降级会画一张"假封面"存进库, 看起来就像 AI 控制没生效 —— 这时保持无封面,
    // 由详情页标注「未使用 AI 权限」如实呈现。
    if (isPermissionDenied(msg)) return ''
  }

  // ---- 降级: 本地 Canvas 确定性配色封面, 不依赖网络 ----
  try {
    return drawCover(specFromHash(title, content), title)
  } catch {
    return ''
  }
}

// 生成记忆封面; 绝不抛错, 任何异常降级为本地哈希配色绘制
// 返回可直接用于 <img src> 的地址: AI 出图时是 /uploads/covers/xxx.png 的完整 URL,
// 降级时是 dataURL —— 两种形式都能直接被 <img> 加载, 调用方无需区分。
// opts.force = true 表示「我要换一张」(重新生成按钮), 跳过结果缓存; 节流与单飞仍然生效。
export async function generateMemoryCover(title, content, opts = {}) {
  const key = cacheKey(title, content)
  if (!opts.force) {
    const hit = coverCache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value
  }
  // 串行排队: 前一个生图彻底结束(含排队等待)后才开始下一个, 避免并发撞限流
  const task = coverQueue.then(() => runGenerate(title, content, opts.force))
  coverQueue = task.then(
    () => undefined,
    () => undefined,
  )
  const value = await task
  if (value) coverCache.set(key, { at: Date.now(), value })
  return value
}
