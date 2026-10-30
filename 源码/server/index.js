// TimePick 自建后端: Express + SQLite
// 协议与云函数版一致: POST /api  body={ action, params, token } -> { code, msg, data }
// code: 0 成功 / 1 业务失败 / 401 未登录 / 404 未知 action / 500 异常
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import express from 'express'
// 环境变量必须在任何模块读取 process.env 之前就位（见 load-env.js 里的说明）
import './load-env.js'
import db from './db.js'
// 3D 房间摆件模块（sg3d 打通）：记忆 -> 房间家具摆放方案
import {
  ensureRoomProp,
  removeRoomProp,
  getRoomLayout,
  replanSpace,
  repairLegacyRoomProps,
  backfillPropFurniture,
  MAX_ITEMS_PER_SPACE,
  remainingCapacity,
} from './room.js'
// 3D 摆件的「数据检索」（向量 + 字面）：决定一条记忆在房间里变成哪件物品
import { setEmbeddingKeyGetter, warmupProps, decideProp } from './propEmbed.js'
import { semanticSearchMemory } from './memorySearch.js'
import { searchProps } from './propSearch.js'
import {
  now,
  hashPassword,
  verifyPassword,
  needsRehash,
  signToken,
  verifyToken,
  encryptPassword,
} from './util.js'
// 微信扫码登录: 服务端拿云服务的 accessToken 向云端核实身份, 再映射到本地账号
import { attestedCloudUid, ensureWechatUser, resolveCloudUid } from './wechat-auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT) || 8787
// 注册口令: 只有输入正确口令才能注册(可用环境变量 REGISTER_PASSPHRASE 覆盖)
const REGISTER_PASSPHRASE = process.env.REGISTER_PASSPHRASE || '优乐美'
// 超级管理员用户名(即管理员手机号): 只有它可以设置/取消其他管理员
// ★ 必须由环境变量 SUPER_ADMIN_USERNAME 提供, 不要在这里写死手机号 ——
//   源码是公开的, 写死等于把管理员账号一起公开。模板见项目根目录 .env.example。
const SUPER_ADMIN = (process.env.SUPER_ADMIN_USERNAME || '').trim()
// 陪伴宠物可选花色(白名单)。必须与前端 src/stores/companion.js 的 PET_SHEETS 保持一致,
// 否则前端会因为拿不到对应精灵图而渲染失败。
const PET_TYPES = ['橘猫', '三花猫', '虎斑猫', '黑白猫', '白猫']
const DEFAULT_PET_TYPE = '橘猫'
// DeepSeek: 密钥只保存在服务端, 前端一律经 ai/chat 代理访问
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
// 智谱 AI 文生图: 同样只在服务端持有密钥, 前端经 ai/cover 代理
// 分工: DeepSeek 负责把记忆扩写成画面描述(文本), 智谱负责出图
const ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
const ZHIPU_IMAGE_MODEL = process.env.ZHIPU_IMAGE_MODEL || 'cogview-3-flash'
const ZHIPU_IMAGE_SIZE = process.env.ZHIPU_IMAGE_SIZE || '1344x768'

// 阿里云百炼(DashScope)Wan 图生视频: server/.env 里配 DASHSCOPE_API_KEY 即可启用
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com'
const DASHSCOPE_I2V_MODEL = process.env.DASHSCOPE_I2V_MODEL || 'wan2.2-i2v-flash'

// ---------------- AI 密钥(超级管理员可在后台改, 不用重新部署) ----------------
// 读取顺序: app_secret 表(后台设置) > .env。值只存在服务端, 前端只拿到掩码。
// 之所以要这一层: 线上每次发布会覆盖 .env, 想换密钥就得重新打包上传;
// 存数据库后点一下保存就生效, 且只有超级管理员能看能改。
const AI_KEY_META = {
  deepseek: {
    env: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek · 文字',
    desc: '控制：记忆标题生成、AI 润色（活动/通知/记忆正文）、小橘 AI 对话、封面画面描述',
  },
  zhipu: {
    env: 'ZHIPU_API_KEY',
    label: '智谱 · 生图',
    desc: '控制：AI 记忆封面出图（CogView），没有它「AI 生图」整条链路不可用',
  },
  dashscope: {
    env: 'DASHSCOPE_API_KEY',
    label: '万相 · 生视频 / 语音',
    desc: '控制：AI 图生视频（万相 Wan）、录音转文字（ASR）',
  },
}
const aiKeyCache = new Map() // kind -> 后台设置的值
function reloadAiKeys() {
  aiKeyCache.clear()
  try {
    for (const r of db.prepare('SELECT k, v FROM app_secret').all()) aiKeyCache.set(r.k, r.v || '')
  } catch (e) {
    console.warn('[ai] 读取后台密钥失败(先用 .env):', e.message)
  }
}
reloadAiKeys()
// 取某个 AI 厂商的密钥: 后台设置优先, 没有再回落 .env
function aiKey(kind) {
  const set = (aiKeyCache.get(kind) || '').trim()
  if (set) return set
  const meta = AI_KEY_META[kind]
  return meta ? String(process.env[meta.env] || '').trim() : ''
}
// 掩码: 只露前 4 位和后 4 位, 前端永远拿不到完整密钥
function maskKey(v) {
  const s = String(v || '')
  if (!s) return ''
  if (s.length <= 10) return s.slice(0, 2) + '****'
  return `${s.slice(0, 4)}••••••${s.slice(-4)}`
}
// 各处实际取密钥的入口(统一走这里, 后台改完立刻生效, 不用重启)
const keyDeepseek = () => aiKey('deepseek')
const keyZhipu = () => aiKey('zhipu')
const keyDashscope = () => aiKey('dashscope')
// 3D 摆件检索用的向量模型跟 DashScope 共用一个密钥（后台改了立即生效）
setEmbeddingKeyGetter(() => keyDashscope())
// 只有超级管理员能管理密钥: 其他管理员连"有没有配"都不给看完整信息
function mustSuperAdmin(uid) {
  const u = isAdmin(uid)
  if (u.username !== SUPER_ADMIN) throw err('只有超级管理员可以管理 AI 密钥')
  return u
}
// 视频比生图贵一个数量级, 单独按人按天限流
const AI_DAILY_VIDEO_LIMIT = Number(process.env.AI_DAILY_VIDEO_LIMIT ?? 10)
// 小猫说话（TTS）按字数计费，一天一个人的上限；一次最多念这么长
const AI_DAILY_TTS_LIMIT = Number(process.env.AI_DAILY_TTS_LIMIT ?? 400)
const TTS_MODEL = process.env.DASHSCOPE_TTS_MODEL || 'qwen3-tts-flash'
// Cherry 是偏甜的女声，抬高一点音调就像小猫；换嗓子改环境变量即可
const TTS_VOICE = process.env.DASHSCOPE_TTS_VOICE || 'Cherry'
const TTS_MAX_LEN = 300
// 把记忆转成「画面描述」的系统提示词: DeepSeek 负责这一步, 输出直接喂给文生图模型
const COVER_PROMPT_SYSTEM =
  '你是记忆封面的画面描述专家。根据用户提供的记忆标题与正文, 写一句用于文生图模型的英文画面描述。' +
  '要求: 只输出英文描述本身, 不要任何解释、引号或前后缀; ' +
  '描述一个具体可画的场景(主体 + 环境 + 光线 + 氛围), 能唤起这段记忆; ' +
  '风格固定为柔和的水彩插画; 横构图; 描述里绝对不能出现文字、字母、标志; 长度 40-70 个英文单词。'
// 记忆标题的系统提示词: 「添加记忆」弹窗里已经没有标题栏了, 标题由 AI 读正文生成
// ★ 标题最长 4 个汉字（2026-10-20 改成）：木牌/卡片上的展示位就那么宽，长标题会被截断成
//   省略号，反而看不出是什么。宁可短到像一枚胶带标签，也不要一整句话。
const TITLE_PROMPT_SYSTEM =
  '你是「拾光」这款记忆手账 App 的标题助手。用户会给你一段记忆的正文, 你要为它提炼一个中文标题。' +
  '要求: 只输出标题本身, 不要引号、不要序号、不要解释、不要换行, 也不要任何前后缀; ' +
  '最多 4 个汉字(可以更短, 2~4 个字最好), 绝对不要超过 4 个字, 也不要任何标点符号; ' +
  '优先直接取正文里最具体、最有画面感的那个词或短语, 像贴在手账本上的胶带短标签; ' +
  '紧扣正文里真正发生的事或当时的情绪, 不要写成「美好的一天」这类空话; ' +
  '正文太短或主题不清时, 就提炼里面最具体的一个名词或场景。'
// 视频结尾画面: 与封面「完全不同」的时刻/视角/构图, 但仍是同一段记忆的世界
const VIDEO_TAIL_PROMPT_SYSTEM =
  '你将为一段记忆视频生成「结尾画面」的文生图描述。根据用户提供的记忆标题与正文, 写一句英文画面描述。' +
  '要求: 只输出英文描述本身, 不要任何解释、引号或前后缀; ' +
  '画面必须与常见的第一眼封面完全不同 —— 换一个视角、时刻与构图(例如白天变黄昏、远景变特写、室外变室内), 但仍是同一段记忆的世界; ' +
  '风格固定为柔和的水彩插画; 横构图; 描述里绝对不能出现文字、字母、标志; 长度 40-70 个英文单词。'
// 允许的跨域来源, 逗号分隔; 留空表示不限制
const CORS_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const uploadsDir = path.join(__dirname, 'data', 'uploads')
fs.mkdirSync(uploadsDir, { recursive: true })
// AI 生成的封面单独存放, 经 /uploads/covers/xxx 静态访问
const coversDir = path.join(uploadsDir, 'covers')
fs.mkdirSync(coversDir, { recursive: true })
// AI 生成的视频单独存放, 经 /uploads/videos/xxx 静态访问(与封面共用 /uploads 静态目录)
const videosDir = path.join(uploadsDir, 'videos')
fs.mkdirSync(videosDir, { recursive: true })
// 用户上传的背景音乐, 经 /uploads/bgm/xxx 静态访问
const bgmDir = path.join(uploadsDir, 'bgm')
fs.mkdirSync(bgmDir, { recursive: true })
// ★ 小猫语音（TTS）合成结果, 经 /uploads/tts/xxx.wav 静态访问。
//   必须转存到本地：DashScope 返回的 OSS 链接带签名、24 小时后失效，
//   直接存那个 URL 的话，用户第二天翻聊天记录就听不到声音了。
const ttsDir = path.join(uploadsDir, 'tts')
fs.mkdirSync(ttsDir, { recursive: true })
const app = express()
// 上传背景音乐走 base64 dataUrl, 音频限 10MB -> base64 约 13.4MB, 留余量
// 64mb: 视频以 dataURL(base64) 上传, 40MB 视频编码后约 53MB, 原 16mb 会被 413 拒掉
app.use(express.json({ limit: '64mb' }))
app.use('/uploads', express.static(uploadsDir))
app.use((req, res, next) => {
  const origin = req.get('origin')
  // 未配置白名单时不限制; 配置了则只回显命中白名单的来源
  if (!CORS_ORIGINS.length) {
    res.set('Access-Control-Allow-Origin', '*')
  } else if (origin && CORS_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Vary', 'Origin')
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

// ---------------- 简易限流 ----------------
// 按 key(如 ip + action) 统计窗口内请求数, 超限直接拒绝
const rateBuckets = new Map()
function rateLimit(key, limit, windowMs) {
  const t = now()
  const bucket = rateBuckets.get(key)
  if (!bucket || bucket.resetAt <= t) {
    rateBuckets.set(key, { count: 1, resetAt: t + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count += 1
  return true
}
// 定期清理过期桶, 避免内存无限增长
setInterval(() => {
  const t = now()
  for (const [k, v] of rateBuckets) if (v.resetAt <= t) rateBuckets.delete(k)
}, 60_000).unref()

const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown'
function guard(req, action, limit, windowMs, msg) {
  if (!rateLimit(`${clientIp(req)}|${action}`, limit, windowMs)) throw err(msg)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------- 封面水印去除 ----------------
// 智谱 CogView 会在每张生成图的右下角强制叠加「AI生成」水印(开放平台合规要求, 接口参数关不掉)。
// 实测水印位于: 距右边缘约 2%~7.6% 宽、距底边约 3%~7% 高,
// 因此裁掉右侧 10% / 底部 8% 即可完全去掉, 裁后宽高比变化不到 1%, 构图基本无感。
// sharp 是可选的: 没装就原样落盘, 由前端样式兜底遮挡, 不影响服务启动。
let sharp = null
try {
  sharp = (await import('sharp')).default
} catch {
  sharp = null
}
const WM_CUT_RIGHT = 0.1
const WM_CUT_BOTTOM = 0.08

async function stripWatermark(buf) {
  if (!sharp) return { buf, cropped: false, ext: 'png' }
  try {
    const meta = await sharp(buf).metadata()
    const width = meta.width || 0
    const height = meta.height || 0
    if (width < 64 || height < 64) return { buf, cropped: false, ext: 'png' }
    const region = sharp(buf).extract({
      left: 0,
      top: 0,
      width: Math.round(width * (1 - WM_CUT_RIGHT)),
      height: Math.round(height * (1 - WM_CUT_BOTTOM)),
    })
    // 按原始格式输出: 智谱返回的其实是 JPEG(扩展名不可信), 转成 PNG 会让体积涨近十倍
    const fmt = meta.format === 'jpeg' ? 'jpeg' : meta.format === 'webp' ? 'webp' : 'png'
    const out =
      fmt === 'jpeg'
        ? await region.jpeg({ quality: 90 }).toBuffer()
        : fmt === 'webp'
          ? await region.webp({ quality: 90 }).toBuffer()
          : await region.png({ compressionLevel: 9 }).toBuffer()
    return out?.length
      ? { buf: out, cropped: true, ext: fmt === 'jpeg' ? 'jpg' : fmt }
      : { buf, cropped: false, ext: 'png' }
  } catch {
    // 任何解码/裁剪异常都退回原图, 不能因为去水印把生图整条链路弄挂
    return { buf, cropped: false, ext: 'png' }
  }
}

// ---------------- AI 调用配额(按用户/按天) ----------------
// IP 限流只能挡「同一个 IP 短时间狂刷」; 但任何人注册个账号就能合法地持续调用
// ai/chat 与 ai/cover, 而这两条链路都要真金白银消耗 DeepSeek / 智谱额度。
// 因此再叠一层按 uid 的每日上限, 超限直接拒绝(不扣费)。
// 设为 0 或负数表示不限; 可用环境变量覆盖。
const AI_DAILY_CHAT_LIMIT = Number(process.env.AI_DAILY_CHAT_LIMIT ?? 200)
const AI_DAILY_COVER_LIMIT = Number(process.env.AI_DAILY_COVER_LIMIT ?? 30)

// 私信: 单条长度上限 + 按用户每分钟条数上限。
// 只靠 IP 限流挡不住"登录后换个姿势持续刷"的场景, 因此这里按 uid 再限一层。
const PM_MAX_LEN = Number(process.env.PM_MAX_LEN ?? 500)
const PM_RATE_PER_MIN = Number(process.env.PM_RATE_PER_MIN ?? 20)
// 单次会话拉取的历史条数上限(从最新往回取), 避免老对话把响应撑大
const PM_THREAD_LIMIT = 200

/**
 * 系统私信的匿名化（2026-10-29）。
 *
 * 管理员处理举报后要私信举报人和被举报人，但**不能暴露是哪个管理员**：
 * 库里记真实 sender_id（便于审计），出网前统一改名 + 把 id 抹成 0。
 * ★ 只抹 id 不抹名字是不够的 —— 隐私设置页/广场都能看到用户 id 与昵称的对应关系，
 *   留着 sender_id 等于把管理员身份直接告诉被举报人。
 */
function maskSystemPm(rows) {
  for (const m of Array.isArray(rows) ? rows : [rows]) {
    if (!m || !m.sender_label) continue
    m.sender_nickname = m.sender_label
    m.sender_username = ''
    m.sender_id = 0
    m.is_system = 1
  }
  return rows
}

/** 以「拾光管理员」名义发一条私信（真实发信人只留在库里做审计，出网即匿名） */
function sendSystemPm(adminUid, receiverId, content) {
  const to = Number(receiverId) || 0
  if (!to || to === Number(adminUid)) return false
  const text = String(content || '').trim()
  if (!text) return false
  db.prepare(
    `INSERT INTO private_message (sender_id, receiver_id, content, sender_label, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(Number(adminUid), to, text.slice(0, PM_MAX_LEN), '拾光管理员', now())
  return true
}


const quotaUsed = new Map()
// 按「本地日期」分桶, 跨天自动失效
function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function takeQuota(kind, uid, limit) {
  if (!(limit > 0)) return true
  const key = `${todayKey()}|${kind}|${uid}`
  const n = (quotaUsed.get(key) || 0) + 1
  if (n > limit) return false
  quotaUsed.set(key, n)
  return true
}
function quotaLeft(kind, uid, limit) {
  if (!(limit > 0)) return Infinity
  return Math.max(0, limit - (quotaUsed.get(`${todayKey()}|${kind}|${uid}`) || 0))
}
// 每天清理一次过期桶(只保留当天), 避免 Map 无限增长
setInterval(
  () => {
    const tk = todayKey()
    for (const k of quotaUsed.keys()) if (!k.startsWith(tk)) quotaUsed.delete(k)
  },
  6 * 3600_000,
).unref()

// ---------------- 封面去重缓存 ----------------
// 同一用户 + 同一标题正文在窗口期内只出一张图, 前端重复提交/重试不会真的再调生图接口。
// 仅缓存「最近一次」的少量条目, 定期清理避免内存增长。
const COVER_DEDUPE_WINDOW = 60_000
const coverDedupe = new Map()
setInterval(() => {
  const t = now()
  for (const [k, v] of coverDedupe) if (t - v.at >= COVER_DEDUPE_WINDOW) coverDedupe.delete(k)
}, 60_000).unref()

// ---------------- 文生图串行队列 ----------------
// 智谱免费档对生图接口有速率限制: 多个请求并发时, 后到的会直接被拒
// (429 / code 1302 "您的账户已达到速率限制")。这里用进程内队列把生图请求排队,
// 前一个完成/失败后再发起下一个, 配合 429 指数退避重试, 避免「连点两下只成功一张」。
let imageQueue = Promise.resolve()
function runImageTask(task) {
  const run = imageQueue.then(task, task)
  // 队列本身不能因为单个任务失败而中断
  imageQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

// 调用智谱生图, 对 429 / 5xx 自动退避重试; 其余错误(如密钥无效)立即抛出
async function requestImage(prompt) {
  let lastErr = null
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(1200 * attempt)
    let res
    try {
      res = await fetch(`${ZHIPU_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keyZhipu()}`,
        },
        body: JSON.stringify({
          model: ZHIPU_IMAGE_MODEL,
          prompt,
          size: ZHIPU_IMAGE_SIZE,
        }),
        signal: AbortSignal.timeout(120_000),
      })
    } catch (e) {
      lastErr = e
      continue // 网络超时也重试
    }
    if (res.ok) return await res.json()
    const detail = await res.text().catch(() => '')
    lastErr = new Error(`生图服务异常(${res.status})${detail ? ': ' + detail.slice(0, 120) : ''}`)
    // 仅对限流与服务端错误重试, 参数/密钥问题重试无意义
    if (res.status !== 429 && res.status < 500) throw lastErr
  }
  throw lastErr
}

// 业务错误: 带 isBiz 标记, 其 message 可以安全回显给前端
const err = (msg) => Object.assign(new Error(msg), { isBiz: true })

// 音频魔数嗅探: 识别 ogg/mp3/wav/flac/m4a, 加密音乐文件(QQ .mgg / 网易云 .ncm 等)直接判假
function sniffAudio(buf) {
  if (buf.length < 12) return false
  const s = buf.subarray(0, 12)
  const ascii = s.toString('latin1')
  if (ascii.startsWith('OggS')) return true // ogg (vorbis/opus)
  if (ascii.startsWith('ID3')) return true // mp3 (带 ID3 头)
  if (ascii.startsWith('RIFF') && ascii.substr(8, 4) === 'WAVE') return true // wav
  if (ascii.startsWith('fLaC')) return true // flac
  if (ascii.substr(4, 4) === 'ftyp') return true // m4a / mp4 / aac
  // 裸 mp3 帧同步: 0xFF + (0xE0 掩码)
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true
  return false
}
function audioExt(buf, mime) {
  const ascii = buf.subarray(0, 12).toString('latin1')
  if (ascii.startsWith('OggS')) return 'ogg'
  if (ascii.startsWith('fLaC')) return 'flac'
  if (ascii.startsWith('RIFF')) return 'wav'
  if (ascii.substr(4, 4) === 'ftyp') return 'm4a'
  if (ascii.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('wav')) return 'wav'
  return 'bin'
}
const publicUser = (u) =>
  u
    ? {
        id: u.id,
        username: u.username,
        nickname: u.nickname,
        avatar: u.avatar,
        email: u.email,
        role: u.role || 0,
        // 微信扫码账号: username 是 wx_<hash> 内部标识, 前端据此换显示文案;
        // phone 是扫码时云端带回来的手机号(可能为空 —— 微信网页授权本来就不保证给手机号)
        wechat: !!u.wechat_uid,
        phone: u.phone || '',
        created_at: u.created_at,
      }
    : null

function isAdmin(uid) {
  const u = getUser(uid)
  if (!u) throw err('用户不存在')
  if (!u.role) throw err('无权操作(需要管理员权限)')
  return u
}

// ---------------- AI 使用总开关(管理中心「AI 使用」) ----------------
// 总开关存 system_config; 用户级开关存 user.ai_chat / user.ai_image。
// 级联规则: 开生图 -> 自动开自动回复; 开生视频 -> 自动开自动回复 + 生图;
//           关自动回复 -> 生图/生视频一并关; 关生图 -> 生视频一并关。
function sysCfg(key, def) {
  const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get(key)
  if (!row) return def
  const v = Number(row.value)
  return Number.isFinite(v) ? v : def
}
function setSysCfg(key, value) {
  db.prepare(
    'INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run(key, value ? '1' : '0', now())
}
const aiGlobal = () => ({
  reply: Boolean(sysCfg('ai_reply', 1)),
  image: Boolean(sysCfg('ai_image', 1)),
  video: Boolean(sysCfg('ai_video', 1)), // 生视频总开关: 默认开启(管理员可在管理中心关闭)
})
// 某用户能否用某项 AI 能力: 总开关拥有最高优先级 —— 总开关关闭时,
// 任何人(包括超管)都不能用; 总开关开着才轮到用户级开关。
function aiAllowed(uid, kind) {
  const g = aiGlobal()
  if (kind === 'reply' && !g.reply) return false
  if (kind === 'image' && (!g.reply || !g.image)) return false
  // 生视频要一路开到底: 总控回复 + 总控生图 + 总控生视频
  if (kind === 'video' && (!g.reply || !g.image || !g.video)) return false
  const u = getUser(uid)
  if (!u) return false
  if (kind === 'reply' && !Number(u.ai_chat ?? 1)) return false
  if (kind === 'image' && !Number(u.ai_image ?? 1)) return false
  if (kind === 'video' && !Number(u.ai_video ?? 1)) return false
  return true
}

// ---------------- AI 图生视频(阿里云百炼 DashScope / Wan) ----------------
// 异步三拍: 提交任务 -> 前端轮询 ai/video/sync -> 成功再下载转存本地,
// 只把 /uploads/videos/xxx 的完整地址写进 memory_item.ai_video(第三方 URL 有效期很短, 必须转存)。
async function dashscopePost(pathname, body, { async: isAsync = false } = {}) {
  const res = await fetch(`${DASHSCOPE_BASE_URL}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${keyDashscope()}`,
      'Content-Type': 'application/json',
      ...(isAsync ? { 'X-DashScope-Async': 'enable' } : {}),
    },
    body: JSON.stringify(body || {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.message || json?.error?.message || json?.code || `HTTP ${res.status}`
    throw err(`百炼接口报错: ${msg}`)
  }
  return json
}

async function dashscopeFetchTask(taskId) {
  const res = await fetch(`${DASHSCOPE_BASE_URL}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${keyDashscope()}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 404) throw err('视频任务不存在或已过期, 请重新生成')
    const msg = json?.message || json?.error?.message || `HTTP ${res.status}`
    throw err(`查询视频任务失败: ${msg}`)
  }
  const out = json?.output || {}
  return {
    status: String(out.task_status || json?.task_status || '').toUpperCase(),
    videoUrl: out.video_url || '',
    message: out.message || json?.message || '',
  }
}

// 把记忆封面转成百炼能直接吃的 base64 data URL:
// /uploads 路径读磁盘, http(s) 由服务端代拉; data: 是本地降级假图, 不能拿去生视频
// 用户上传的照片(优先) / AI 封面(兜底)都可以作为视频生成的首帧参考:
// 用户传了真实照片就按真照片来, 没传才用 AI 画的封面
async function userPhotoToDataUrl(itemId) {
  const row = db
    .prepare(
      "SELECT url FROM memory_media WHERE memory_id = ? AND type = 1 AND url LIKE '/uploads/%' ORDER BY sort ASC LIMIT 1"
    )
    .get(itemId)
  if (!row) return ''
  // 去 /uploads/ 前缀与查询串, 拼磁盘绝对路径
  const rel = String(row.url).slice(9).split('?')[0].split('#')[0]
  const abs = path.join(uploadsDir, rel)
  if (!fs.existsSync(abs)) return ''
  const buf = fs.readFileSync(abs)
  if (buf.length > 8 * 1024 * 1024) return '' // 参考帧过大直接放弃, 防止请求体超限
  const mime = /.jpe?g$/i.test(rel) ? 'image/jpeg' : /.webp$/i.test(rel) ? 'image/webp' : /.gif$/i.test(rel) ? 'image/gif' : 'image/png'
  return 'data:' + mime + ';base64,' + buf.toString('base64')
}

async function coverToDataUrl(item) {
  const cover = String(item.ai_cover || '').trim()
  if (!cover || cover.startsWith('data:')) {
    throw err('这条记忆还没有可参考的图片, 请先上传一张照片或生成 AI 封面')
  }
  let buf
  let mime = 'image/png'
  if (cover.startsWith('/uploads/')) {
    // 去掉 ?wm=0 之类的查询串, 否则带着问号去读磁盘必然 ENOENT
    const rel = cover.slice(9).split('?')[0].split('#')[0] // slice(9)=去掉 /uploads/ 前缀; 再去掉 ?wm=0 查询串, 否则带问号读磁盘必然 ENOENT
    buf = fs.readFileSync(path.join(uploadsDir, rel))
    if (/\.jpe?g$/i.test(rel)) mime = 'image/jpeg'
    if (/\.webp$/i.test(rel)) mime = 'image/webp'
  } else if (/^https?:\/\//.test(cover)) {
    const r = await fetch(cover)
    if (!r.ok) throw err('封面下载失败, 请稍后重试')
    buf = Buffer.from(await r.arrayBuffer())
    mime = (r.headers.get('content-type') || '').split(';')[0] || 'image/png'
  } else {
    throw err('封面格式无法识别, 请重新生成封面后重试')
  }
  return `data:${mime};base64,${buf.toString('base64')}`
}

// 下载成品视频转存本地: 保证「生成即永久保存」, 不受第三方 URL 有效期影响
async function saveVideoToDisk(videoUrl, itemId, req) {
  if (!videoUrl) throw err('视频地址为空, 请重新生成')
  const r = await fetch(videoUrl)
  if (!r.ok) throw err('视频下载失败, 请稍后重试')
  const buf = Buffer.from(await r.arrayBuffer())
  if (!buf.length) throw err('视频下载为空, 请重新生成')
  const name = `item-${itemId}-${Date.now()}.mp4`
  fs.writeFileSync(path.join(videosDir, name), buf)
  // 只存相对路径(同上), 前端同源访问 / 同源部署都直接可用
  return `/uploads/videos/${name}`
}

// ---------------------------------------------------------------------------
// 记忆标题：由 AI 读正文生成
//
// 「添加记忆」弹窗里已经把「标题」那一栏删掉了（用户只写内容），标题完全由这里生成。
//
// ⚠ 设计上刻意做成**永不抛错**：没配密钥 / 超时 / 模型返回乱码，一律降级成
//   「正文开头几个字」。宁可标题平一点，也不能让保存按钮转半天最后弹一个红字错误 ——
//   这条路径在「保存记忆」的主流程上，任何抖动都会直接变成"存不进去"。
//   超时也特意压到 12 秒（比封面那两个 30 秒短很多）：标题只是几个字，
//   等太久不值得，宁可走兜底。
// ---------------------------------------------------------------------------
/** 标题最长几个汉字：改这一个常量即可，提示词与下面两处截断都以它为准 */
const TITLE_MAX_CHARS = 4
function normalizeTitle(s) {
  return String(s || '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/^[\s"'“”‘’《》〈〉【】\[\]()（）·、,，.。!！?？:：;；~～\-—]+/, '')
    .replace(/[\s"'“”‘’]+$/g, '')
    .trim()
    // 模型偶尔还是会多吐几个字，这里硬截到 TITLE_MAX_CHARS，不再补省略号
    // （补了就又超过 4 个字了，而且短标签本来也不需要省略号）
    .slice(0, TITLE_MAX_CHARS)
}
/** 兜底标题：正文开头几个字（没配密钥 / 超时 / 模型出错时走这里） */
function fallbackTitle(text) {
  const t = String(text || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
  if (!t) return '未命名的记忆'
  return t.slice(0, TITLE_MAX_CHARS)
}
/** 依据正文生成标题；任何异常都退回 fallbackTitle */
async function generateTitle(content, entryDate) {
  const text = String(content || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return '未命名的记忆'
  if (!keyDeepseek()) return fallbackTitle(text)
  try {
    const r = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keyDeepseek()}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: TITLE_PROMPT_SYSTEM },
          { role: 'user', content: `日期：${entryDate || '未知'}\n正文：${text.slice(0, 800)}` },
        ],
        temperature: 0.7,
        // 标题最多 4 个汉字，给 32 个 token 已经很宽裕，顺手挡掉模型啰嗦一大段
        max_tokens: 32,
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) return fallbackTitle(text)
    const d = await r.json()
    const raw = String(d.choices?.[0]?.message?.content ?? '')
    return normalizeTitle(raw) || fallbackTitle(text)
  } catch {
    return fallbackTitle(text)
  }
}

// 用智谱按标题+正文再生成一张「完全不同」的画面, 作为视频的结尾帧(与封面组成首尾帧)。
// 任何一步失败都返回空串: 上层退回「只用封面单帧」生成, 不能让用户卡死在这一步。
async function makeTailFrame(title, content) {
  if (!keyZhipu()) return ''
  let scene = ''
  if (keyDeepseek()) {
    try {
      const r = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keyDeepseek()}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            { role: 'system', content: VIDEO_TAIL_PROMPT_SYSTEM },
            { role: 'user', content: `标题：${title}\n内容：${content}` },
          ],
          temperature: 1.0,
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (r.ok) {
        const d = await r.json()
        scene = String(d.choices?.[0]?.message?.content ?? '').trim()
      }
    } catch {}
  }
  scene = scene
    .replace(/^["'“”\s]+|["'“”\s]+$/g, '')
    .replace(/\s*\n+\s*/g, ' ')
    .slice(0, 600)
  if (!scene) {
    scene = `a completely different moment of the same memory "${title || content.slice(0, 40)}": different camera angle, different time of day, different lighting and composition`
  }
  const gen = await runImageTask(() =>
    requestImage(
      `${scene}, soft watercolor illustration, hand-painted texture, warm and gentle atmosphere, wide landscape composition, no text, no letters, no words, no watermark, no signature`,
    )
  )
  const remoteUrl = gen?.data?.[0]?.url
  if (!remoteUrl) return ''
  const r = await fetch(remoteUrl, { signal: AbortSignal.timeout(60_000) })
  if (!r.ok) return ''
  const buf = Buffer.from(await r.arrayBuffer())
  if (!buf.length || buf.length > 8 * 1024 * 1024) return ''
  return `data:image/png;base64,${buf.toString('base64')}`
}
// 所有业务表(排除 SQLite 内部表)。表名只从这里取, 杜绝 SQL 注入
const listTables = () =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name)

// ---------------- 查询助手 ----------------
const getUser = (id) => db.prepare('SELECT * FROM user WHERE id = ?').get(id)
const getSpace = (id) => db.prepare('SELECT * FROM memory_space WHERE id = ?').get(id)

function mustSpaceOwner(spaceId, uid) {
  const space = getSpace(spaceId)
  if (!space) throw err('记忆空间不存在')
  if (space.user_id !== uid) throw err('无权操作该空间')
  return space
}
// 按名称查找用户的记忆空间, 不存在则自动创建(记忆库表单自由输入空间名)
// 岛屿外观 key 与前端 src/data/islands.js 的 ISLAND_ARTS 保持一致;
// 五个主题屿按名称落默认外观, 其余空间默认 blossom(总览页照常成岛)。
const ISLAND_DEFAULT_ART = {
  花信屿: 'blossom',
  长昼屿: 'lagoon',
  拾穗屿: 'amber',
  眠雪屿: 'snow',
  暮光屿: 'dusk',
}
const ISLAND_ART_KEYS = new Set(['blossom', 'lagoon', 'forest', 'snow', 'amber', 'dusk'])
const ISLAND_NAME_MAX = 24
const ISLAND_TIP_MAX = 60

// 给新空间挑一座岛: 五个主题屿按名字固定对应(花信=樱花…),
// 其余自定义名字**随机**从 6 种外观里挑 —— 优先挑这个用户还没用过的样子,
// 这样每新建一座岛就多一种新风景; 6 种都用过了就允许重复(在全部 6 种里纯随机)。
// 不要再改回"顺序轮转": 轮转会让删过岛的人新建出来的岛永远撞上同一款。
function nextIslandArt(uid) {
  // 只统计"岛上真有记忆"的外观：老数据里残留的空空间不该占用随机名额
  const used = db
    .prepare(
      `SELECT s.island_art FROM memory_space s WHERE s.user_id = ?
         AND (SELECT COUNT(*) FROM memory_item i WHERE i.space_id = s.id) > 0`
    )
    .all(uid)
    .map((r) => r.island_art)
  const ALL = ['blossom', 'lagoon', 'forest', 'snow', 'amber', 'dusk']
  const free = ALL.filter((a) => !used.includes(a))
  const pool = free.length ? free : ALL
  return pool[Math.floor(Math.random() * pool.length)]
}

// 岛 = 记忆空间。岛里一条记忆都不剩时, 这座岛就该消失 ——
// 否则「我的记忆空间」看不到它, 而添加记忆的「已有岛屿」下拉里还列着它(空岛残留, 曾经的真 bug)。
// 删空间会按外键 CASCADE 连带清掉 room_prop(3D 房间摆件), 所以整座岛是"干净消失"。
// @returns {boolean} 是否真的删掉了一座空岛
function pruneSpaceIfEmpty(spaceId) {
  if (!spaceId) return false
  const left = db.prepare('SELECT COUNT(*) AS c FROM memory_item WHERE space_id = ?').get(spaceId).c
  if (left > 0) return false
  db.prepare('DELETE FROM memory_space WHERE id = ?').run(spaceId)
  return true
}

// 每条记忆自己是一座岛: 新条目按该用户已有的条目数轮流分配外观, 相邻条目不长一样
function nextItemIslandArt(uid) {
  const n = db
    .prepare('SELECT COUNT(*) AS c FROM memory_item i JOIN memory_space s ON s.id = i.space_id WHERE s.user_id = ?')
    .get(uid).c
  const ALL = ['blossom', 'lagoon', 'forest', 'snow', 'amber', 'dusk']
  return ALL[n % ALL.length]
}

// 校验条目岛屿操作归属: 条目 -> 所属空间 -> 用户
function mustItemOwner(itemId, uid) {
  const item = db.prepare('SELECT i.*, s.user_id AS owner_id FROM memory_item i JOIN memory_space s ON s.id = i.space_id WHERE i.id = ?').get(itemId)
  if (!item) throw err('记忆不存在')
  if (item.owner_id !== uid) throw err('只能操作自己的记忆')
  return item
}

function ensureSpace(uid, name) {
  // 岛名 = 空间名，超长会在岛卡片/悬停文案里溢出，这里拦一道（常量见 ISLAND_NAME_MAX）
  if (name && String(name).length > ISLAND_NAME_MAX)
    throw err(`岛屿名称最长 ${ISLAND_NAME_MAX} 字`)
  const exist = db.prepare('SELECT * FROM memory_space WHERE user_id = ? AND name = ?').get(uid, name)
  if (exist) return exist
  const r = db
    .prepare(
      `INSERT INTO memory_space (user_id, name, description, cover, theme, is_public, island_name, island_tip, island_art, created_at, updated_at)
       VALUES (?, ?, '', '', '', 0, ?, '', ?, ?, ?)`
    )
    .run(uid, name, name, ISLAND_DEFAULT_ART[name] || nextIslandArt(uid), now(), now())
  return getSpace(r.lastInsertRowid)
}
// 记忆条目 + 所属空间信息 + 媒体列表
function itemWithMeta(id) {
  const row = db
    .prepare(
      `SELECT i.*, s.name AS space_name, s.user_id AS owner_id, s.is_public AS space_public
       FROM memory_item i LEFT JOIN memory_space s ON s.id = i.space_id WHERE i.id = ?`
    )
    .get(id)
  if (!row) return null
  return {
    ...row,
    media: db.prepare('SELECT * FROM memory_media WHERE memory_id = ? ORDER BY sort ASC').all(id),
  }
}
const mediaOf = (memoryId) =>
  db.prepare('SELECT * FROM memory_media WHERE memory_id = ? ORDER BY sort ASC').all(memoryId)

/**
 * 批量版 mediaOf：一次查询取回多条记忆的媒体，按 memory_id 分组。
 *
 * ★ 为什么要有这个：列表接口原来是「每条记忆各查一次」(N+1)，
 *   共享流 100 条就是 100 次 SQL，广场首屏能明显感到顿。
 *   换成 `WHERE memory_id IN (...)` 后不管多少条都只有 1 次查询。
 *   结果与逐条查询完全等价（同样按 sort 升序，没有媒体时给空数组）。
 *   SQLite 的 IN 参数上限是 999，列表接口都有限额（共享流 100），不会超。
 */
const mediaOfMany = (ids) => {
  const map = new Map()
  const list = (ids || []).filter((id) => id != null)
  if (!list.length) return map
  const ph = list.map(() => '?').join(',')
  for (const r of db
    .prepare(`SELECT * FROM memory_media WHERE memory_id IN (${ph}) ORDER BY memory_id, sort ASC`)
    .all(...list)) {
    if (!map.has(r.memory_id)) map.set(r.memory_id, [])
    map.get(r.memory_id).push(r)
  }
  return map
}

/** 批量查「这些记忆里该用户点过赞的」id 集合（同样是避免 N+1） */
const likedIdsOf = (ids, uid) => {
  const set = new Set()
  if (!uid) return set
  const list = (ids || []).filter((id) => id != null)
  if (!list.length) return set
  const ph = list.map(() => '?').join(',')
  for (const r of db
    .prepare(`SELECT memory_id FROM memory_item_like WHERE user_id = ? AND memory_id IN (${ph})`)
    .all(uid, ...list)) {
    set.add(r.memory_id)
  }
  return set
}

/* ============ 记忆 → 广场投影（2026-10-27 起「共享记忆」页并入广场） ============
 * 用户的要求：删掉独立的「共享记忆」页，记忆库里点「分享到广场」，内容就直接进广场。
 * 做法不是让广场同时渲染两张表（那样关注/热门/最新、评论、点赞都得写两套），
 * 而是把公开的记忆**投影**成一条 square_post（memory_id 指回原记忆）：
 *   - 广场只有一条信息流，筛选/分页/评论/点赞/举报全部沿用原有逻辑；
 *   - 两处内容同源（正文、媒体都来自记忆），改哪边都是同一条；
 *   - 取消分享 = 把这条动态置为不公开（评论点赞留在库里，重新分享还在）。
 * 全部幂等：重复调用只会更新同一条动态，不会堆出一堆重复卡片。
 */
function projectionOf(memoryId) {
  return (
    db.prepare('SELECT * FROM square_post WHERE memory_id = ? ORDER BY id DESC LIMIT 1').get(memoryId) || null
  )
}

// 把存量的「共享记忆」互动（memory_comment / memory_item_like）搬进广场的评论点赞表。
// 只在**第一次**建投影时搬一次；搬完把计数对齐，卡片上不至于显示 0 条评论。
function adoptMemoryInteractions(memoryId, postId) {
  if (!postId) return
  const comments = db
    .prepare('SELECT user_id, content, created_at FROM memory_comment WHERE memory_id = ? ORDER BY id ASC')
    .all(memoryId)
  const insC = db.prepare(
    'INSERT INTO post_comment (post_id, user_id, parent_id, content, likes_count, created_at, updated_at) VALUES (?, ?, NULL, ?, 0, ?, ?)'
  )
  for (const c of comments) insC.run(postId, c.user_id, c.content, c.created_at || now(), c.created_at || now())
  const likes = db.prepare('SELECT user_id, created_at FROM memory_item_like WHERE memory_id = ?').all(memoryId)
  const insL = db.prepare('INSERT OR IGNORE INTO post_like (post_id, user_id, created_at) VALUES (?, ?, ?)')
  for (const l of likes) insL.run(postId, l.user_id, l.created_at || now())
  db.prepare('UPDATE square_post SET comments_count = ?, likes_count = ? WHERE id = ?').run(
    comments.length,
    likes.length,
    postId
  )
}

/**
 * 把一条记忆投影成广场动态（幂等）。
 * 记忆不公开时直接返回 null —— 调用方不用自己判状态。
 */
function projectMemory(memoryId) {
  const item = itemWithMeta(memoryId)
  if (!item || Number(item.is_public) !== 1) return null
  const media = item.media || []
  const images = media
    .filter((m) => Number(m.type) === 1)
    .map((m) => m.url)
    .join(',')
  const video = (media.find((m) => Number(m.type) === 3) || {}).url || ''
  const audio = (media.find((m) => Number(m.type) === 2) || {}).url || ''
  // 卡片/详情沿用「首行当标题」的老约定：标题 + 正文
  const title = String(item.title || '').trim()
  const body = String(item.content || '').trim()
  const content = (title && body && !body.startsWith(title) ? `${title}\n${body}` : body || title) || ''
  const tags = normalizeTags([item.type && item.type !== '其他' ? item.type : '', '我的分享'])
  const sharedAt = Number(item.shared_at) > 0 ? Number(item.shared_at) : Number(item.created_at) || now()
  const exist = projectionOf(memoryId)
  if (exist) {
    // 已经取消过分享（is_public = 0）的话，重新分享要回到信息流顶部
    const createdAt = Number(exist.is_public) === 1 ? exist.created_at : sharedAt
    db.prepare(
      `UPDATE square_post
          SET space_id = ?, content = ?, images = ?, video = ?, audio = ?, tags = ?, is_public = 1, created_at = ?, updated_at = ?
        WHERE id = ?`
    ).run(item.space_id, content, images, video, audio, tags, createdAt, now(), exist.id)
    return projectionOf(memoryId)
  }
  const r = db
    .prepare(
      `INSERT INTO square_post (user_id, space_id, memory_id, content, images, video, audio, tags, likes_count, comments_count, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)`
    )
    .run(item.owner_id || item.ownerId, item.space_id, memoryId, content, images, video, audio, tags, sharedAt, now())
  adoptMemoryInteractions(memoryId, Number(r.lastInsertRowid))
  return projectionOf(memoryId)
}

// 取消分享：动态下架但**不删**（评论、点赞、重新分享后的时间都还在）
function unprojectMemory(memoryId) {
  db.prepare('UPDATE square_post SET is_public = 0, updated_at = ? WHERE memory_id = ?').run(now(), memoryId)
}

// 删除记忆时连带删掉投影，避免广场上留一条点进去 404 的孤儿动态
function dropProjection(memoryId) {
  const row = projectionOf(memoryId)
  if (!row) return
  db.prepare('DELETE FROM post_like WHERE post_id = ?').run(row.id)
  db.prepare('DELETE FROM post_comment WHERE post_id = ?').run(row.id)
  db.prepare('DELETE FROM square_post WHERE id = ?').run(row.id)
}

// 启动补投影：老库里 is_public = 1 的记忆还没有对应动态的，补一条（幂等）
function backfillSquareProjections() {
  const rows = db
    .prepare(
      `SELECT i.id FROM memory_item i
        WHERE i.is_public = 1
          AND NOT EXISTS (SELECT 1 FROM square_post p WHERE p.memory_id = i.id)`
    )
    .all()
  let made = 0
  for (const r of rows) {
    try {
      if (projectMemory(r.id)) made += 1
    } catch (e) {
      console.warn('[square/backfill] 记忆', r.id, '投影失败（已跳过）:', e.message)
    }
  }
  return made
}

function updateCols(table, allowed, p, id, extra = {}) {
  const sets = []
  const vals = []
  for (const k of allowed) {
    if (p[k] !== undefined) {
      sets.push(`${k} = ?`)
      vals.push(p[k])
    }
  }
  for (const [k, v] of Object.entries(extra)) {
    sets.push(`${k} = ?`)
    vals.push(v)
  }
  if (!sets.length) return false
  vals.push(id)
  db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  return true
}
function postRow(id) {
  return db
    .prepare(
      `SELECT p.*, u.username AS u_username, u.nickname AS u_nickname, u.avatar AS u_avatar
       FROM square_post p LEFT JOIN user u ON u.id = p.user_id WHERE p.id = ?`
    )
    .get(id)
}
function attachAuthors(rows, uid) {
  if (!rows.length) return rows
  const postIds = rows.map((r) => r.id)
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
  const phPost = postIds.map(() => '?').join(',')
  const phUser = userIds.map(() => '?').join(',')
  const users = phUser
    ? db.prepare(`SELECT id, username, nickname, avatar FROM user WHERE id IN (${phUser})`).all(...userIds)
    : []
  const map = new Map(users.map((u) => [u.id, publicUser(u)]))
  const likedSet = new Set()
  const favSet = new Set()
  const followSet = new Set()
  if (uid) {
    db.prepare(`SELECT post_id FROM post_like WHERE user_id = ? AND post_id IN (${phPost})`)
      .all(uid, ...postIds)
      .forEach((r) => likedSet.add(r.post_id))
    db.prepare(`SELECT target_id FROM favorite WHERE user_id = ? AND target_type = 2 AND target_id IN (${phPost})`)
      .all(uid, ...postIds)
      .forEach((r) => favSet.add(r.target_id))
    // 关注状态随帖子一起返回, 前端无需再按作者逐个查询(消除 N+1)
    if (phUser) {
      db.prepare(`SELECT following_id FROM user_follow WHERE follower_id = ? AND following_id IN (${phUser})`)
        .all(uid, ...userIds)
        .forEach((r) => followSet.add(r.following_id))
    }
  }
  return rows.map(({ u_username, u_nickname, u_avatar, ...r }) => ({
    ...r,
    author: map.get(r.user_id) || null,
    liked_by_me: likedSet.has(r.id),
    favorited_by_me: favSet.has(r.id),
    followed_by_me: followSet.has(r.user_id),
  }))
}

// 这条记忆是不是自己的(广场发布时用来校验 memory_id 归属, 防止拿别人的记忆发动态)
function ownMemory(id, uid) {
  if (!id) return null
  return (
    db
      .prepare(
        `SELECT i.id, i.title, i.content, i.space_id, s.user_id AS owner_id
         FROM memory_item i JOIN memory_space s ON s.id = i.space_id
         WHERE i.id = ? AND s.user_id = ?`
      )
      .get(id, uid) || null
  )
}

// 标签统一存成 "a,b,c" 纯文本(前端按逗号切分); 兼容数组与字符串两种入参
function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean).join(',')
  return String(tags ?? '').trim()
}

// ---------------- 业务处理 ----------------
// 活动状态: 0=未开始, 1=进行中, 2=已结束
function actStatus(row, t) {
  if (row.end_time && row.end_time <= t) return 2
  if (row.start_time && row.start_time > t) return 0
  return 1
}
const handlers = {
  'system/health': (_p, uid) => ({
    service: 'timepick-api',
    engine: 'express+sqlite',
    time: now(),
    // 前端据此判断是否展示 AI 能力(不返回密钥本身)
    ai: Boolean(keyDeepseek()),
    // 文生图需要 DeepSeek 扩写描述 + 智谱出图, 两者齐备才算可用
    aiImage: Boolean(keyDeepseek() && keyZhipu()),
    // 当前用户(带 token 时)的 AI 生效权限: 总开关 && 用户级开关的综合结果,
    // 前端据此决定要不要展示「添加 AI 生图」等入口
    // 图生视频是否可用(只暴露「配了没配」, 不返回密钥)
    aiVideo: Boolean(keyDashscope()),
    // 当前用户的 AI 生效权限: 总开关 && 用户级开关
    aiPerm: uid
      ? { reply: aiAllowed(uid, 'reply'), image: aiAllowed(uid, 'image'), video: aiAllowed(uid, 'video') }
      : null,
    // 已登录时顺便告知今日剩余额度, 前端可在快用完时提前提示(Infinity 无法 JSON 化, 转成 null)
    quota: uid
      ? {
          chat: Number.isFinite(quotaLeft('chat', uid, AI_DAILY_CHAT_LIMIT))
            ? quotaLeft('chat', uid, AI_DAILY_CHAT_LIMIT)
            : null,
          cover: Number.isFinite(quotaLeft('cover', uid, AI_DAILY_COVER_LIMIT))
            ? quotaLeft('cover', uid, AI_DAILY_COVER_LIMIT)
            : null,
        }
      : null,
  }),

  // ---------- AI 代理(密钥只在服务端) ----------
  'ai/chat': async (p, uid, req) => {
    guard(req, 'ai/chat', 30, 60_000, 'AI 请求过于频繁, 请稍后再试')
    if (!uid) throw err('请先登录后再使用 AI 对话')
    // 管理员总开关 + 用户级权限双重闸门(不通过时不消耗当日额度)
    if (!aiAllowed(uid, 'reply')) throw err('AI 对话功能已被管理员限制, 如有疑问请联系管理员')
    // 按用户限每日额度: 防止注册即用, 无限消耗服务端 AI 预算
    if (!takeQuota('chat', uid, AI_DAILY_CHAT_LIMIT)) {
      throw err('今日 AI 对话额度已用完, 明天再来吧')
    }
    if (!keyDeepseek()) throw err('服务端未配置 DEEPSEEK_API_KEY')
    if (!Array.isArray(p.messages) || !p.messages.length) throw err('消息不能为空')
    if (p.messages.length > 40) throw err('上下文过长')
    const messages = p.messages
      .slice(-40)
      .filter((m) => m && (m.role === 'system' || m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, 8000) }))
    if (!messages.length) throw err('消息格式不正确')
    // 模型本身不知道当前时间, 不注入就会把周几/日期答错。
    // 每次请求都在最前面塞一条系统消息, 由服务端取真实时间, 前端伪造不了。
    {
      const d = new Date()
      const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
      const pad = (n) => String(n).padStart(2, '0')
      const timeStr = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${week} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      messages.unshift({
        role: 'system',
        content: `当前真实时间是: ${timeStr}(以服务器时区为准)。回答任何涉及今天几号、星期几、时间计算的问题时, 一律以这条时间信息为准。`,
      })
    }
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keyDeepseek()}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        temperature: Number.isFinite(p.temperature) ? p.temperature : 0.7,
        max_tokens: Number.isFinite(p.max_tokens) ? Math.min(p.max_tokens, 2048) : 1024,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw err(`AI 服务异常(${res.status})`)
    const data = await res.json()
    return { content: data.choices?.[0]?.message?.content ?? '' }
  },

  // ---------------------------------------------------------------------------
  // AI 润色: 管理中心「新建活动 / 发送通知」表单里的 ✨ 按钮
  //
  // 为什么单独开一个接口而不是复用 ai/chat:
  //   1) 它只给管理员用(ai/chat 是给所有用户的, 额度/开关都不一样);
  //   2) 输出必须是**结构化**的 { title, content }, ai/chat 只回一段自由文本,
  //      前端还得自己猜哪句是标题;
  //   3) 提示词要强调"详细化"和"不许编造", 这是业务规则, 不该散落在前端。
  // ---------------------------------------------------------------------------
  'ai/polish': async (p, uid) => {
    isAdmin(uid)
    if (!keyDeepseek()) throw err('服务端未配置 DEEPSEEK_API_KEY')
    const kind = p.kind === 'notice' ? 'notice' : 'activity'
    const title = String(p.title ?? '').trim()
    const content = String(p.content ?? '').trim()
    if (!title && !content) throw err('先写点内容再润色')
    const system =
      kind === 'notice'
        ? '你是「拾光」App 的公告编辑。管理员会给你一则通知的标题和草稿正文, 你把它润色成正式通知。' +
          '要求: 只输出 JSON, 形如 {"title":"...","content":"..."}, 不要 markdown 代码块、不要任何解释; ' +
          'content 用中文, 分 2~4 个小节(如「说明」「影响」「需要做什么」), 每节一两句话, 条理清楚; ' +
          '把草稿里已有的信息写详细、写完整, 但**绝对不能编造**原文没有的时间、地点、人数、奖品、规则、链接; ' +
          '语气正式但亲切, 不要营销腔, 不要用感叹号堆情绪; title 不超过 12 个字。'
        : '你是「拾光」App 的活动编辑。管理员会给你一个活动的标题和草稿详情, 你把它润色成活动详情。' +
          '要求: 只输出 JSON, 形如 {"title":"...","content":"..."}, 不要 markdown 代码块、不要任何解释; ' +
          'content 用中文, 分 2~4 个小节(如「活动介绍」「怎么参与」「时间说明」), 每节一两句话, 条理清楚; ' +
          '把草稿里已有的信息扩写详细、有画面感, 但**绝对不能编造**原文没有的时间、地点、人数、奖品、规则、链接; ' +
          '语气温暖真诚, 像朋友邀请而不是广告; title 不超过 12 个字。'
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keyDeepseek()}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `标题：${title || '（未填）'}\n正文：${content || '（未填）'}` },
        ],
        temperature: 0.6,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) throw err(`AI 服务异常(${res.status})`)
    const data = await res.json()
    const raw = String(data.choices?.[0]?.message?.content ?? '')
    // 模型偶尔还是会裹一层 ```json 围栏, 或者前后带废话, 这里只认第一段能解析的 JSON
    const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start < 0 || end <= start) throw err('AI 返回格式异常, 请重试')
    let parsed
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      throw err('AI 返回格式异常, 请重试')
    }
    return {
      title: String(parsed.title ?? '').trim().slice(0, 20),
      content: String(parsed.content ?? '').trim().slice(0, 4000),
    }
  },

  // ---------- AI 语音识别(语音输入): 浏览器录好的 WAV(dataURL) 交给 DashScope qwen3-asr-flash 转文字 ----------
  'ai/asr': async (p, uid, req) => {
    guard(req, 'ai/asr', 20, 60_000, '语音识别太频繁, 请稍后再试')
    if (!uid) throw err('请先登录后再使用语音输入')
    if (!keyDashscope()) throw err('服务端未配置语音识别密钥(DASHSCOPE_API_KEY)')
    const dataUrl = String(p.dataUrl || '')
    const m = /^data:audio\/wav;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
    if (!m) throw err('仅支持 wav 格式录音')
    // 录音前端限制 60s / 16kHz 单声道, base64 后不会超过 4MB, 这里留出余量
    if (Buffer.from(m[1], 'base64').length > 8 * 1024 * 1024) throw err('录音过长, 请说短一点')
    // qwen3-asr-flash 走 OpenAI 兼容端点, 音频用 dataURL 塞进 input_audio
    const res = await fetch(`${DASHSCOPE_BASE_URL}/compatible-mode/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keyDashscope()}`,
      },
      body: JSON.stringify({
        model: 'qwen3-asr-flash',
        messages: [
          {
            role: 'user',
            content: [{ type: 'input_audio', input_audio: { data: dataUrl } }],
          },
        ],
        stream: false,
        asr_options: { language: 'zh', enable_itn: true },
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j) throw err(`语音识别服务异常(${res.status})`)
    const text = j?.choices?.[0]?.message?.content || ''
    if (!text) throw err(j?.error?.message || '没有听清, 请再试一次')
    return { text }
  },

  // ---------- AI 语音合成：小橘开口说话 ----------
  // 前端把要念的文字发过来，这里调 DashScope qwen3-tts 合成 wav，**转存到本地**后
  // 回一个 /uploads/tts/xxx.wav。不直接回第三方 URL 的原因：
  //   ① 那个链接带签名，24h 后失效，聊天记录里的小猫第二天就哑了；
  //   ② 外面域名在部分网络下加载很慢，语音要「立刻出声」才有对话感。
  // 同一句话（同一把嗓子）只合成一次，命中缓存直接回 —— 反复回放不花钱。
  'ai/tts': async (p, uid, req) => {
    // ★ 2026-10-29：一句回答会拆成「首句 + 长尾」两次合成（首句先出声，见 aiCompanion 的
    //   splitSpeak），每次对话的调用数翻倍，所以窗口内允许次数从 20 提到 60。
    guard(req, 'ai/tts', 60, 60_000, '小猫说话太快了，让它喘口气')
    if (!uid) throw err('请先登录后再和小橘说话')
    // 和 ai/chat 同一道闸门：能聊才该能听（管理员关了 AI 的用户不该还在烧语音额度）
    if (!aiAllowed(uid, 'reply')) throw err('AI 对话功能已被管理员限制, 如有疑问请联系管理员')
    if (!keyDashscope()) throw err('服务端未配置语音合成密钥(DASHSCOPE_API_KEY)')
    if (!takeQuota('tts', uid, AI_DAILY_TTS_LIMIT)) throw err('今天和小橘说话说得够多啦，明天再聊')
    // 念出来的内容要短：三五百字的回复念起来像听书，不像聊天
    const text = String(p.text ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, TTS_MAX_LEN)
    if (!text) throw err('没有要说的内容')
    const voice = String(p.voice || '').trim() || TTS_VOICE
    const file = crypto.createHash('sha1').update(`${TTS_MODEL}|${voice}|${text}`).digest('hex').slice(0, 24)
    const abs = path.join(ttsDir, `${file}.wav`)
    const url = `/uploads/tts/${file}.wav`
    if (fs.existsSync(abs) && fs.statSync(abs).size > 1024) return { url, voice, cached: true }

    const res = await fetch(`${DASHSCOPE_BASE_URL}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyDashscope()}` },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: { text, voice, language_type: 'Chinese' },
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j) throw err(`语音合成服务异常(${res.status})`)
    const src = j?.output?.audio?.url
    if (!src) throw err(j?.message || j?.output?.audio?.data || '语音合成失败，稍后再试')
    // 下载到本地（限制体积，防止异常大文件写满磁盘）
    const bin = await fetch(src, { signal: AbortSignal.timeout(30_000) })
    if (!bin.ok) throw err(`语音下载失败(${bin.status})`)
    const buf = Buffer.from(await bin.arrayBuffer())
    if (!buf.length || buf.length > 6 * 1024 * 1024) throw err('语音文件异常，稍后再试')
    fs.writeFileSync(abs, buf)
    return { url, voice, cached: false }
  },

  // ---------- AI 记忆封面: DeepSeek 扩写画面描述 -> 智谱文生图 -> 转存到本地 ----------
  'ai/cover': async (p, uid, req) => {
    guard(req, 'ai/cover', 10, 60_000, '封面生成过于频繁, 请稍后再试')
    if (!uid) throw err('请先登录后再生成封面')
    // 生图依赖自动回复(开生图会自动带上回复), 两道闸门一起查
    if (!aiAllowed(uid, 'image')) throw err('AI 生图功能已被管理员限制, 如有疑问请联系管理员')
    // 生图按张计费, 配额比对话严得多
    if (!takeQuota('cover', uid, AI_DAILY_COVER_LIMIT)) {
      throw err('今日封面生成额度已用完, 明天再来吧')
    }
    if (!keyZhipu()) throw err('服务端未配置 ZHIPU_API_KEY')
    const title = String(p.title ?? '').slice(0, 200).trim()
    const content = String(p.content ?? '').slice(0, 2000).trim()
    if (!title && !content) throw err('标题和内容不能都为空')

    // 防重复出图: 同一用户 + 同一标题正文, DEDUPE_WINDOW 内直接复用上一张
    // (前端重复提交 / 网络重试时不会真的再调一次生图接口; force=1 表示「我要换一张」)
    const dedupeKey = `${uid}|${title}|${content}`
    if (!p.force) {
      const hit = coverDedupe.get(dedupeKey)
      if (hit && now() - hit.at < COVER_DEDUPE_WINDOW && fs.existsSync(hit.file)) {
        return { cover: hit.url, scene: hit.scene, model: ZHIPU_IMAGE_MODEL, deduped: true }
      }
    }

    // 1) DeepSeek 把「标题 + 正文」扩写成一句英文画面描述
    //    这一步失败不致命: 降级为用标题拼描述, 保证生图仍能继续
    let scene = ''
    if (keyDeepseek()) {
      try {
        const r = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${keyDeepseek()}`,
          },
          body: JSON.stringify({
            model: DEEPSEEK_MODEL,
            messages: [
              { role: 'system', content: COVER_PROMPT_SYSTEM },
              { role: 'user', content: `标题：${title}\n内容：${content}` },
            ],
            temperature: 0.8,
            max_tokens: 300,
          }),
          signal: AbortSignal.timeout(30_000),
        })
        if (r.ok) {
          const d = await r.json()
          scene = String(d.choices?.[0]?.message?.content ?? '').trim()
        }
      } catch {
        scene = ''
      }
    }
    // 清掉模型可能带上的引号与换行
    scene = scene
      .replace(/^["'“”\s]+|["'“”\s]+$/g, '')
      .replace(/\s*\n+\s*/g, ' ')
      .slice(0, 600)
    if (!scene) scene = `a warm and gentle scene inspired by "${title || content.slice(0, 40)}"`

    // 2) 智谱文生图(经进程内队列串行 + 429 退避重试, 见 requestImage)
    const genData = await runImageTask(() =>
      requestImage(
        `${scene}, soft watercolor illustration, hand-painted texture, warm and gentle atmosphere, wide landscape composition, no text, no letters, no words, no watermark, no signature`,
      ),
    )
    const remoteUrl = genData?.data?.[0]?.url
    if (!remoteUrl) throw err('生图服务未返回图片')

    // 3) 转存到自己的存储: 智谱返回的是带签名的临时 URL(约 7 天过期), 不能直接入库
    const imgRes = await fetch(remoteUrl, { signal: AbortSignal.timeout(60_000) })
    if (!imgRes.ok) throw err(`封面下载失败(${imgRes.status})`)
    const raw = Buffer.from(await imgRes.arrayBuffer())
    if (!raw.length) throw err('封面下载为空')
    if (raw.length > 8 * 1024 * 1024) throw err('封面图片过大')

    // 去掉右下角「AI生成」水印后再落盘(sharp 缺失或失败时原样保存)
    const { buf, cropped, ext } = await stripWatermark(raw)
    const name = `cover_${now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`
    fs.writeFileSync(path.join(coversDir, name), buf)

    // 已去水印的图在地址上带 wm=0 标记: 前端据此不再叠加遮挡样式;
    // 静态目录忽略 query, 所以带标记的地址照样能正常访问。
    // 只存相对路径: 绝对地址把部署时域名写死进库, 换域名/换沙箱部署后图片全部失效
    const url = `/uploads/covers/${name}${cropped ? '?wm=0' : ''}`
    const data = {
      cover: url,
      scene,
      model: ZHIPU_IMAGE_MODEL,
      watermarkRemoved: cropped,
    }
    coverDedupe.set(dedupeKey, { at: now(), url: data.cover, scene, file: path.join(coversDir, name) })
    return data
  },

  // ---------- 认证 ----------
  'auth/register': (p, _uid, req) => {
    const { username, password, nickname, passphrase } = p
    guard(req, 'auth/register', 10, 10 * 60_000, '注册尝试过于频繁, 请稍后再试')
    if (!username || username.length < 3 || username.length > 50) throw err('用户名需 3-50 个字符')
    // 手机号注册: 1 开头第二位 3-9 共 11 位(与前端正则一致); 登录不校验, 老账号不受影响
    if (!/^1[3-9]\d{9}$/.test(username)) throw err('请输入正确的11位手机号')
    // 只禁空白与控制字符; 用户名走预编译 SQL, 无需额外转义(中文用户名需放行)
    if (/\s|[\u0000-\u001f]/.test(username)) throw err('用户名不能包含空格或控制字符')
    if (!password || password.length < 6) throw err('密码至少 6 位')
    if ((passphrase || '').trim() !== REGISTER_PASSPHRASE) throw err('注册口令不正确')
    if (db.prepare('SELECT id FROM user WHERE username = ?').get(username)) throw err('用户名已被注册')
    // ★ 昵称改成**必填且唯一**（2026-10-27 用户要求）。
    //   以前留空会回落成手机号，结果一堆账号长得一模一样、也没法 @ 到具体的人。
    const nick = String(nickname || '').trim()
    if (!nick) throw err('请输入昵称')
    if (nick.length > 20) throw err('昵称最长 20 个字符')
    if (/\s|[\u0000-\u001f]/.test(nick)) throw err('昵称不能包含空格或控制字符')
    if (db.prepare('SELECT id FROM user WHERE nickname = ?').get(nick)) throw err('昵称已被使用')
    const t = now()
    const r = db
      .prepare(
        `INSERT INTO user (username, password, password_enc, nickname, avatar, email, status, token_epoch, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
      )
      .run(username, hashPassword(password), encryptPassword(password), nick, '', null, t, t)
    const user = getUser(r.lastInsertRowid)
    return { token: signToken(user.id, user.token_epoch), user: publicUser(user) }
  },
  'auth/login': (p, _uid, req) => {
    const { username, password } = p
    guard(req, 'auth/login', 10, 5 * 60_000, '登录尝试过于频繁, 请 5 分钟后再试')
    const user = db.prepare('SELECT * FROM user WHERE username = ?').get(username)
    // 用户不存在时也走一次哈希校验, 避免通过响应时间枚举用户名
    const stored = user ? user.password : 'x$y'
    if (!user || !verifyPassword(password || '', stored)) throw err('手机号或密码不正确, 请重新输入')
    if (user.status !== 1) throw err('账号已被禁用')
    // 旧格式(sha256)密码: 登录成功后静默升级为 scrypt, 并顺手补存可逆密文
    if (needsRehash(user.password) || !user.password_enc) {
      db.prepare('UPDATE user SET password = ?, password_enc = ?, updated_at = ? WHERE id = ?').run(
        hashPassword(password),
        encryptPassword(password),
        now(),
        user.id
      )
    }
    return { token: signToken(user.id, user.token_epoch), user: publicUser(user) }
  },
  // 微信扫码登录 / 注册（同一个入口）:
  //   前端交上来的是云服务的 accessToken, 不是 uid —— 服务端自己去云端问「这是谁」,
  //   假 token 在云端就 401 了, 拿不到任何身份, 所以这里无法被伪造成别人的账号。
  //   第一次扫码自动建号, 之后扫码就是登录。
  // 回声探针: 只回报「请求里有没带认证头、尾号是什么」, 不回内容。
  // 用途是让服务端自己验证「带 Authorization 的出口请求」有没有在中间层被剥掉
  // （微信登录时服务端认不出用户, 就是靠它定位的）。不含任何敏感信息。
  'debug/echo-header': (p, _uid, req) => {
    const auth = String(req.headers.authorization || '')
    return {
      hasAuth: !!auth,
      authTail: auth ? auth.slice(-6) : '',
      hasKey: !!req.headers['x-wb-webapp-access-key'],
      ua: String(req.headers['user-agent'] || '').slice(0, 40),
    }
  },
  'auth/wechat-login': async (p, _uid, req) => {
    guard(req, 'auth/wechat-login', 20, 5 * 60_000, '微信登录尝试过于频繁, 请稍后再试')
    let cloudUid
    try {
      cloudUid = await resolveCloudUid(p.accessToken)
    } catch (e) {
      // 前端用同一个 token 也去云端问了一次「我是谁」，把它的结果拼进错误文案：
      // 它成功=只有服务端这条路被拒（出口链路问题）；它也失败=token 本身不行。
      // 这个字段完全不可信，只参与提示文案，绝不参与身份判定。
      const probe = typeof p.probe === 'string' ? p.probe.replace(/\s+/g, ' ').slice(0, 90) : ''
      // 服务端这条路彻底走不通时（云端只认浏览器那条路），退回浏览器已核实的身份。
      // 见 wechat-auth.js 里 attestedCloudUid 的说明：形状严格、可一键关掉。
      const attested = attestedCloudUid(p.uidHint)
      if (!attested) {
        if (e && e.isBiz && probe) e.message = `${e.message}｜${probe}`
        throw e
      }
      console.warn('[wechat] 云端校验不可用, 改用浏览器已核实的身份:', attested, '|', e && e.message)
      cloudUid = attested
      p.attested = true
    }
    // 微信昵称 / 头像 / 手机号由前端从云会话里取来 —— 它们不可信，ensureWechatUser
    // 内部会逐项清洗校验；就算被篡改，也只能改到"自己长什么样"，换不来任何身份。
    const { user, created } = ensureWechatUser(db, cloudUid, {
      nickname: p.nickname,
      avatar: p.avatar,
      phone: p.phone,
    })
    if (user.status !== 1) throw err('账号已被禁用')
    return { token: signToken(user.id, user.token_epoch), user: publicUser(user), created }
  },
  // 会话校验: 进入主页前的「门禁」。
  // 前端不能只凭 localStorage 里有没有 token 判断登录(伪造/过期 token 一样"算登录"),
  // 必须让服务端用签名 + 有效期 + token_epoch 验一次。签名校验由入口的 authUid 完成,
  // 走到这里时 uid 必然有效; 因此只需回用户资料即可。带上限流, 避免被拿来刷。
  'auth/session': (p, uid, req) => {
    guard(req, 'auth/session', 60, 60_000, '会话校验过于频繁, 请稍后再试')
    if (!uid) throw err('未登录')
    const u = getUser(uid)
    if (!u) throw err('用户不存在')
    return {
      user: publicUser(u),
      profile: db.prepare('SELECT * FROM user_profile WHERE user_id = ?').get(uid) || null,
    }
  },
  'auth/me': (_p, uid, req) => {
    guard(req, 'auth/me', 60, 60_000, '资料刷新过于频繁, 请稍后再试')
    const u = getUser(uid)
    if (!u) throw err('用户不存在')
    return {
      user: publicUser(u),
      profile: db.prepare('SELECT * FROM user_profile WHERE user_id = ?').get(uid) || null,
    }
  },
  'auth/profile/update': (p, uid) => {
    // 更新 user 表的 nickname(昵称全局唯一: 与他人重复时拒绝并提示)
    if (p.nickname !== undefined) {
      const nick = String(p.nickname).trim()
      if (!nick) throw err('昵称不能为空')
      if (nick.length > 30) throw err('昵称最长 30 个字符')
      const clash = db.prepare('SELECT id FROM user WHERE nickname = ? AND id != ?').get(nick, uid)
      if (clash) throw err('这个昵称已经有人在用了, 换一个吧')
      db.prepare('UPDATE user SET nickname = ?, updated_at = ? WHERE id = ?').run(nick, now(), uid)
    }
    const patch = {}
    for (const k of ['gender', 'birthday', 'bio', 'quote', 'hobbies', 'occupation', 'location', 'avatar']) {
      if (p[k] !== undefined) patch[k] = p[k]
    }
    const exist = db.prepare('SELECT id FROM user_profile WHERE user_id = ?').get(uid)
    if (exist) {
      updateCols('user_profile', Object.keys(patch), patch, exist.id, { updated_at: now() })
    } else {
      db.prepare(
        `INSERT INTO user_profile (user_id, gender, birthday, bio, quote, hobbies, occupation, location, avatar, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uid,
        patch.gender ?? 0,
        patch.birthday ?? null,
        patch.bio ?? '',
        patch.quote ?? '',
        patch.hobbies ?? '',
        patch.occupation ?? '',
        patch.location ?? '',
        patch.avatar ?? '',
        now(),
        now()
      )
    }
    return db.prepare('SELECT * FROM user_profile WHERE user_id = ?').get(uid)
  },
  // 3D 房间「后台预热」清单：只回启动必需的小文件（引擎 + 主包 + 元数据），
  // 不含几十 MB 的贴图/模型 —— 那些不该在用户逛别的页面时偷偷下载。
  // 只读、无敏感信息，所以免登录；清单按目录扫描，10 分钟缓存一次。
  'room3d/warmup-list': () => {
    return room3dWarmupList()
  },
  'auth/password/change': (p, uid) => {
    if (!p.newPassword) throw err('请输入新密码')
    if (p.newPassword.length < 6) throw err('新密码至少 6 位')
    const user = db.prepare('SELECT password, wechat_uid FROM user WHERE id = ?').get(uid)
    if (!user) throw err('用户不存在')
    // ★ 微信扫码注册的账号不知道自己的密码(建号时存的是随机串), 让他输原密码就永远设不了。
    //   这类账号的"我是谁"已经由微信扫码认证过(登录态就是这么来的), 所以允许直接设新密码。
    //   有原密码的普通账号仍然必须验证, 否则被拿到 token 的人可以直接改密。
    const wechatAccount = !!user.wechat_uid
    if (!wechatAccount) {
      if (!p.oldPassword) throw err('请输入原密码')
      if (!verifyPassword(p.oldPassword, user.password)) throw err('原密码错误')
    }
    // token_epoch 自增: 使此前签发的所有 token 立即失效(其他设备需重新登录)
    db.prepare('UPDATE user SET password = ?, password_enc = ?, token_epoch = token_epoch + 1, updated_at = ? WHERE id = ?').run(
      hashPassword(p.newPassword),
      encryptPassword(p.newPassword),
      now(),
      uid
    )
    const fresh = db.prepare('SELECT id, token_epoch FROM user WHERE id = ?').get(uid)
    return { changed: true, token: signToken(fresh.id, fresh.token_epoch) }
  },

  // 绑定 / 换绑手机号。
  // 为什么需要它：微信网页扫码授权**不返回手机号**（微信官方限制），所以微信注册的账号
  // 可能一直没有手机号。这里让用户自己补一个，补完就能用「手机号 + 密码」登录。
  'auth/bind-phone': (p, uid) => {
    const phone = String(p.phone || '').replace(/\D/g, '')
    if (!/^1\d{10}$/.test(phone)) throw err('请输入正确的 11 位手机号')
    const me = getUser(uid)
    if (!me) throw err('用户不存在')

    // 手机号在 user 表里有两处可能冲突: phone 列(别的账号绑过) 与 username(别的账号拿它当登录名)
    const byPhone = db.prepare('SELECT id FROM user WHERE phone = ? AND id <> ?').get(phone, uid)
    if (byPhone) throw err('这个手机号已经绑定到其他账号了')
    const byName = db.prepare('SELECT id FROM user WHERE username = ? AND id <> ?').get(phone, uid)
    if (byName) throw err('这个手机号已经有人用作登录名了')

    // ★ 微信账号的 username 是 wx_<hash> 这种内部标识，光写 phone 还是没法用手机号登录。
    //   所以顺手把登录名也换成手机号（换绑时同样跟着走，前提是登录名确实是"上一部手机号"）。
    //   普通账号的 username 早就是它自己的手机号，不动它（免得用户以为改了登录名）。
    const canRename = !!me.wechat_uid && (me.username.startsWith('wx_') || me.username === me.phone)
    if (canRename) {
      db.prepare('UPDATE user SET phone = ?, username = ?, updated_at = ? WHERE id = ?').run(phone, phone, now(), uid)
    } else {
      db.prepare('UPDATE user SET phone = ?, updated_at = ? WHERE id = ?').run(phone, now(), uid)
    }
    return { phone, login_name_changed: canRename }
  },

  // 用户统计: 赞数/公开记忆数/关注数/粉丝数
  // 对未登录也开放(广场本身免登录可看, 侧栏与作者卡要用它);
  // 但登录名(username)属于登录凭证, 只有已登录的人能看到。
  'user/stats': (p, uid) => {
    const targetId = p.user_id
    if (!targetId) throw err('用户 ID 不能为空')
    const user = db.prepare('SELECT id, username, nickname FROM user WHERE id = ?').get(targetId)
    if (!user) throw err('用户不存在')
    // 赞数: 该用户所有帖子收到的点赞总数
    const likes = db.prepare(
      'SELECT COALESCE(SUM(pl.likes_count), 0) as cnt FROM square_post pl WHERE pl.user_id = ?'
    ).get(targetId).cnt
    // 公开记忆数: 该用户公开的帖子数
    const publicMemories = db.prepare(
      'SELECT COUNT(*) as cnt FROM square_post WHERE user_id = ? AND is_public = 1'
    ).get(targetId).cnt
    // 关注数: 该用户关注的人数
    const following = db.prepare(
      'SELECT COUNT(*) as cnt FROM user_follow WHERE follower_id = ?'
    ).get(targetId).cnt
    // 粉丝数: 关注该用户的人数(公开数字, 名单不在这里返回)
    const followers = db.prepare(
      'SELECT COUNT(*) as cnt FROM user_follow WHERE following_id = ?'
    ).get(targetId).cnt
    return { id: user.id, nickname: user.nickname, ...(uid ? { username: user.username } : {}), likes, publicMemories, following, followers }
  },

  // 推荐记忆空间: 推荐「人」(点进去看 TA 的公开记忆)。
  // ★ 以前是 `HAVING mem_count > 0`, 即必须发过广场动态才会被推荐 —— 站里一条动态都没有时
  //   侧栏整块是空的(2026-10-21 用户反馈「只要有用户就推荐呀别空着」)。
  //   现在分两档: 优先有公开内容的(广场动态或公开记忆); 一个都没有时, 把站里其他用户
  //   随机推荐出来, 至少让人有地方可去。
  'space/recommend': (_p, uid) => {
    const rows = db
      .prepare(
        `SELECT u.id AS user_id, u.nickname AS name,
                (SELECT COUNT(*) FROM square_post p WHERE p.user_id = u.id AND p.is_public = 1) AS post_count,
                (SELECT COUNT(*) FROM memory_item i JOIN memory_space s ON s.id = i.space_id
                   WHERE s.user_id = u.id AND i.is_public = 1) AS mem_count,
                (SELECT COALESCE(SUM(p.likes_count), 0) FROM square_post p WHERE p.user_id = u.id) AS likes,
                (SELECT COUNT(*) FROM user_follow f WHERE f.following_id = u.id) AS followers,
                (SELECT COUNT(*) FROM user_follow f WHERE f.follower_id = ? AND f.following_id = u.id) AS following
         FROM user u
         WHERE u.id != ?
         ORDER BY RANDOM()`
      )
      .all(uid || 0, uid || 0)
    const withContent = rows.filter((r) => r.post_count > 0 || r.mem_count > 0)
    const pool = withContent.length ? withContent : rows
    return pool.slice(0, 3).map((r) => {
      // 广场动态与公开记忆现在共用同一条内容, 取较大值避免同一条被数两次
      const cnt = Math.max(r.mem_count || 0, r.post_count || 0)
      return {
        user_id: r.user_id,
        name: r.name,
        likes: r.likes,
        followers: r.followers,
        // 当前用户是否已关注 TA(未登录时恒为 false)
        following: !!r.following,
        // 「粉丝」= 该用户收到的关注数(following 才是他关注了谁), 措辞不能含糊。
        // 粉丝数放最前: 右侧栏很窄, 太长会被省略号截掉, 关键信息不能排在后面。
        sub: cnt ? `${r.followers} 粉丝 · ${cnt} 条 · ${r.likes} 赞` : `${r.followers} 粉丝 · 新加入拾光`,
      }
    })
  },

  // 可能认识的人: 随机返回 3 个其他用户(换一换时重新请求即真随机)
  'user/random': (_p, uid) =>
    db
      .prepare(
        `SELECT u.id, u.nickname AS name,
                (SELECT COUNT(*) FROM memory_item i JOIN memory_space s ON s.id = i.space_id WHERE s.user_id = u.id AND i.is_public = 1) AS mem_count,
                (SELECT COUNT(*) FROM user_follow f WHERE f.follower_id = ? AND f.following_id = u.id) AS following
         FROM user u
         WHERE u.id != ?
         ORDER BY RANDOM()
         LIMIT 3`
      )
      .all(uid || 0, uid || 0)
      .map((r) => ({
        id: r.id,
        name: r.name,
        // 关注状态由服务端给, 前端不许再默认 false —— 否则刷新就丢
        following: !!r.following,
        sub: r.mem_count ? `${r.mem_count} 条公开记忆` : '新加入拾光',
      })),

  // 指定用户的公开记忆: 进入他人记忆空间时拉取
  'memory/user/public': (p) => {
    const targetId = p.user_id
    if (!targetId) throw err('用户 ID 不能为空')
    return db
      .prepare(
        `SELECT i.*, s.name AS space_name, s.user_id AS owner_id,
                u.nickname AS author_nickname, u.avatar AS author_avatar,
                (SELECT COUNT(*) FROM memory_comment c WHERE c.memory_id = i.id) AS comments_count,
                (SELECT COUNT(*) FROM memory_item_like l WHERE l.memory_id = i.id) AS likes_count
         FROM memory_item i
         JOIN memory_space s ON s.id = i.space_id
         LEFT JOIN user u ON u.id = s.user_id
         WHERE i.is_public = 1 AND s.user_id = ?
         ORDER BY i.created_at DESC, i.id DESC`
      )
      .all(targetId)
      .map((r) => ({ ...r, media: mediaOf(r.id) })) // 单人公开记忆，量小，逐条查即可
  },

  // ---------- 用户设置 ----------
  'settings/get': (_p, uid) => {
    let s = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(uid)
    if (!s) {
      db.prepare(
        `INSERT INTO user_settings (user_id, default_vis, ai_read_memory, ai_cross_space, ai_summary, ai_no_training, bgm, ambient, ambient_type, motion, tone, created_at, updated_at)
         VALUES (?, 'self', 1, 1, 1, 1, 1, 1, '雨声', '适中', '暖色', ?, ?)`
      ).run(uid, now(), now())
      s = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(uid)
    }
    return s
  },
  'settings/update': (p, uid) => {
    const fields = ['default_vis', 'ai_read_memory', 'ai_cross_space', 'ai_summary', 'ai_no_training', 'bgm', 'ambient', 'ambient_type', 'motion', 'tone', 'bgm_track']
    const sets = []
    const vals = []
    for (const k of fields) {
      if (p[k] !== undefined) {
        sets.push(`${k} = ?`)
        vals.push(p[k])
      }
    }
    if (!sets.length) return db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(uid)
    vals.push(now(), uid)
    db.prepare(`UPDATE user_settings SET ${sets.join(', ')}, updated_at = ? WHERE user_id = ?`).run(...vals)
    return db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(uid)
  },

  // ---------- 分享管理 ----------
  'share/list': (_p, uid) =>
    db.prepare('SELECT * FROM share WHERE user_id = ? ORDER BY created_at DESC').all(uid),
  'share/create': (p, uid) => {
    if (!p.name) throw err('分享名称不能为空')
    if (!p.space_id && !p.memory_id) throw err('请指定要分享的切片或记忆')
    const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    const r = db.prepare(
      `INSERT INTO share (user_id, space_id, memory_id, name, meta, token, status, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'valid', ?, ?, ?)`
    ).run(
      uid,
      p.space_id || null,
      p.memory_id || null,
      p.name,
      p.meta || '',
      token,
      p.expires_at || null,
      now(),
      now()
    )
    return db.prepare('SELECT * FROM share WHERE id = ?').get(r.lastInsertRowid)
  },
  'share/update': (p, uid) => {
    const doc = db.prepare('SELECT id FROM share WHERE id = ? AND user_id = ?').get(p.id, uid)
    if (!doc) throw err('分享不存在或无权操作')
    const sets = []
    const vals = []
    if (p.status !== undefined) { sets.push('status = ?'); vals.push(p.status) }
    if (p.name !== undefined) { sets.push('name = ?'); vals.push(p.name) }
    if (!sets.length) return db.prepare('SELECT * FROM share WHERE id = ?').get(p.id)
    vals.push(now(), p.id)
    db.prepare(`UPDATE share SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals)
    return db.prepare('SELECT * FROM share WHERE id = ?').get(p.id)
  },
  'share/remove': (p, uid) => {
    const doc = db.prepare('SELECT id FROM share WHERE id = ? AND user_id = ?').get(p.id, uid)
    if (!doc) throw err('分享不存在或无权删除')
    db.prepare('DELETE FROM share WHERE id = ?').run(p.id)
    return { removed: true }
  },
  // 公开分享页: 免登录按 token 查看分享的切片/单条记忆
  'share/view': (p) => {
    const s = db.prepare('SELECT * FROM share WHERE token = ?').get(p.token || '')
    if (!s) throw err('分享不存在')
    if (s.status !== 'valid') throw err('该分享已被所有者取消')
    if (s.expires_at && s.expires_at <= now()) throw err('该分享已过期')
    let items = []
    if (s.memory_id) {
      const it = itemWithMeta(s.memory_id)
      if (it) items = [it]
    } else if (s.space_id) {
      // 分享整座岛: 岛内条目可能不少, 用批量版避免每条一次 SQL
      const rows = db
        .prepare('SELECT * FROM memory_item WHERE space_id = ? ORDER BY created_at DESC, id DESC')
        .all(s.space_id)
      const media = mediaOfMany(rows.map((r) => r.id))
      items = rows.map((r) => ({ ...r, media: media.get(r.id) || [] }))
    }
    return {
      id: s.id,
      name: s.name,
      meta: s.meta,
      created_at: s.created_at,
      owner: publicUser(getUser(s.user_id)),
      items,
    }
  },

  // ---------- 删除所有数据(危险操作) ----------
  'user/deleteAll': (_p, uid) => {
    // 级联删除：空间->条目->媒体, 帖子->评论/点赞, 收藏, 关注, 反馈, 举报, 分享, 设置, 宠物, 私信, 通知, 评论, 活动, 记忆点赞
    db.prepare('DELETE FROM memory_space WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM square_post WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM favorite WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM user_follow WHERE follower_id = ? OR following_id = ?').run(uid, uid)
    db.prepare('DELETE FROM feedback WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM share WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM pet_config WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM ai_conversation WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM private_message WHERE sender_id = ? OR receiver_id = ?').run(uid, uid)
    db.prepare('DELETE FROM notification WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM report WHERE reporter_id = ?').run(uid)
    db.prepare('DELETE FROM user_profile WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM activity_comment WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM activity_join WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM activity_like WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM memory_comment WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM memory_item_like WHERE user_id = ?').run(uid)
    return { deleted: true }
  },
  'user/deleteAccount': (p, uid) => {
    // 注销账号：删除所有数据 + 删除用户记录
    if (!p.password) throw err('请输入密码确认')
    const user = db.prepare('SELECT password FROM user WHERE id = ?').get(uid)
    if (!user) throw err('用户不存在')
    if (!verifyPassword(p.password, user.password)) throw err('密码错误')
    // 删除所有关联数据
    db.prepare('DELETE FROM memory_space WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM square_post WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM favorite WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM user_follow WHERE follower_id = ? OR following_id = ?').run(uid, uid)
    db.prepare('DELETE FROM feedback WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM share WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM pet_config WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM ai_conversation WHERE user_id = ?').run(uid)
    db.prepare('DELETE FROM user_profile WHERE user_id = ?').run(uid)
    // 删除用户记录
    db.prepare('DELETE FROM user WHERE id = ?').run(uid)
    return { deleted: true }
  },

  // 导出我的记忆: 聚合空间+条目+媒体为 Markdown 文本, 前端触发浏览器下载
  'user/export': (_p, uid) => {
    const user = getUser(uid)
    const spaces = db.prepare('SELECT * FROM memory_space WHERE user_id = ? ORDER BY created_at ASC').all(uid)
    const lines = [`# ${user?.nickname || user?.username || '拾光'} 的拾光记忆`, '']
    let total = 0
    for (const s of spaces) {
      const items = db.prepare('SELECT * FROM memory_item WHERE space_id = ? ORDER BY created_at ASC').all(s.id)
      lines.push(`## 切片 · ${s.name}`, '')
      if (!items.length) lines.push('（此切片暂无记忆）', '')
      for (const it of items) {
        total += 1
        const kindLabel = it.kind === 'book' ? '书籍' : it.kind === 'music' ? '音乐' : '日记'
        lines.push(`### ${it.title}`)
        lines.push(`- 种类: ${kindLabel}${it.author ? ` / 作者: ${it.author}` : ''}`)
        lines.push(
          `- 类型: ${it.type || '其他'} / 日期: ${it.entry_date || '未填'} / 可见性: ${it.is_public ? '公开' : '仅自己'}`
        )
        if (it.content) lines.push('', it.content)
        const media = mediaOf(it.id)
        if (media.length) {
          lines.push('', '附件:')
          media.forEach((m) => lines.push(`- ${m.type === 2 ? '音频' : '图片'}: ${m.url}`))
        }
        lines.push('')
      }
    }
    if (!spaces.length) lines.push('（还没有任何切片与记忆）', '')
    lines.push('---', `共 ${total} 条记忆 · 导出于 ${new Date().toLocaleString('zh-CN')}`)
    return { markdown: lines.join('\n'), count: total }
  },

  // ---------- 记忆空间 / 条目 ----------
  // 只列「真正装着记忆」的岛: 空岛不该出现在添加记忆的下拉里。
  // (老数据里可能残留"建了但没放记忆"的空空间, 这里连同下面的 pruneSpaceIfEmpty 一起兜住)
  'memory/space/list': (_p, uid) =>
    db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM memory_item i WHERE i.space_id = s.id) AS item_count
         FROM memory_space s WHERE s.user_id = ?
           AND (SELECT COUNT(*) FROM memory_item i WHERE i.space_id = s.id) > 0
         ORDER BY s.created_at DESC`
      )
      .all(uid),
  // 单个空间详情(岛屿内部页按路由 id 取空间信息): 仅限主人
  'memory/space/get': (p, uid) => {
    const space = getSpace(p.id)
    if (!space) throw err('记忆空间不存在')
    if (space.user_id !== uid) throw err('只能查看自己的空间')
    return space
  },
  // 我的全部记忆条目(跨空间), 记忆库主页数据源
  // island_name = 这座岛在「我的记忆空间」里显示的名字（可能被用户改过），
  //   记忆库的第二栏下拉就是按它筛的；space_name 是内部空间名，第一栏用它。
  'memory/item/my': (_p, uid) => {
    const rows = db
      .prepare(
        `SELECT i.*, s.name AS space_name,
                COALESCE(NULLIF(s.island_name, ''), s.name) AS island_name,
                s.user_id AS owner_id
         FROM memory_item i JOIN memory_space s ON s.id = i.space_id
         WHERE s.user_id = ? ORDER BY i.created_at DESC, i.id DESC`
      )
      .all(uid)
    const media = mediaOfMany(rows.map((r) => r.id))
    return rows.map((r) => ({ ...r, media: media.get(r.id) || [] }))
  },
  // 公开记忆列表(保留给脚本/管理端; 广场页面已改成直接读 square/post/list 了)
  'memory/shared/list': (_p, uid) => {
    const rows = db
      .prepare(
        `SELECT i.*, s.name AS space_name, s.user_id AS owner_id,
                u.nickname AS author_nickname, u.avatar AS author_avatar,
                (SELECT COUNT(*) FROM memory_comment c WHERE c.memory_id = i.id) AS comments_count,
                (SELECT COUNT(*) FROM memory_item_like l WHERE l.memory_id = i.id) AS likes_count
         FROM memory_item i
         JOIN memory_space s ON s.id = i.space_id
         LEFT JOIN user u ON u.id = s.user_id
         WHERE i.is_public = 1
         ORDER BY (CASE WHEN i.shared_at > 0 THEN i.shared_at ELSE i.created_at END) DESC, i.id DESC LIMIT 100`
      )
      .all()
    // 媒体与点赞都改成「先按 id 批量查一次，再各自取用」—— 原来是每条记忆各查一次(N+1)
    const media = mediaOfMany(rows.map((r) => r.id))
    const liked = likedIdsOf(rows.map((r) => r.id), uid)
    return rows.map((r) => ({
      ...r,
      media: media.get(r.id) || [],
      is_mine: r.owner_id === uid,
      is_liked: liked.has(r.id),
    }))
  },
  'memory/space/create': (p, uid) => {
    if (!p.name) throw err('空间名称不能为空')
    if (String(p.island_name || p.name).length > ISLAND_NAME_MAX)
      throw err(`岛屿名称最长 ${ISLAND_NAME_MAX} 字`)
    const r = db
      .prepare(
        `INSERT INTO memory_space (user_id, name, description, cover, theme, is_public, island_name, island_tip, island_art, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uid,
        p.name,
        p.description || '',
        p.cover || '',
        p.theme || '',
        p.is_public ? 1 : 0,
        p.island_name || p.name,
        p.island_tip || '',
        p.island_art && ISLAND_ART_KEYS.has(p.island_art)
          ? p.island_art
          : ISLAND_DEFAULT_ART[p.name] || nextIslandArt(uid),
        now(),
        now()
      )
    return getSpace(r.lastInsertRowid)
  },
  'memory/space/update': (p, uid) => {
    mustSpaceOwner(p.id, uid)
    updateCols('memory_space', ['name', 'description', 'cover', 'theme', 'is_public', 'island_name', 'island_tip', 'island_art'], p, p.id, {
      updated_at: now(),
    })
    return getSpace(p.id)
  },
  'memory/space/remove': (p, uid) => {
    mustSpaceOwner(p.id, uid)
    db.prepare('DELETE FROM memory_media WHERE memory_id IN (SELECT id FROM memory_item WHERE space_id = ?)').run(
      p.id
    )
    db.prepare('DELETE FROM memory_item WHERE space_id = ?').run(p.id)
    db.prepare('DELETE FROM memory_space WHERE id = ?').run(p.id)
    return { removed: true }
  },
  // 清除指定切片的数据: 删除空间内全部条目与媒体。
  // 清完岛上就没有记忆了 → 这座岛也跟着消失(与"删空最后一条记忆"保持一致),
  // 否则它会变成一个只在下拉里出现的空岛。
  'memory/space/clear': (p, uid) => {
    mustSpaceOwner(p.id, uid)
    db.prepare('DELETE FROM memory_media WHERE memory_id IN (SELECT id FROM memory_item WHERE space_id = ?)').run(
      p.id
    )
    const r = db.prepare('DELETE FROM memory_item WHERE space_id = ?').run(p.id)
    const islandGone = pruneSpaceIfEmpty(p.id)
    return { cleared: r.changes, island_removed: islandGone }
  },

  // ---------- 岛屿总览(我的记忆空间) ----------
  // 一个「记忆空间」= 一座岛 = 一间 3D 房间(room_prop 也按 space_id 分组), 三者严格一一对应。
  // 所以这里按空间聚合: 岛名/外观/悬停文案都存在空间行上;
  //   title       = 该空间里最新那条记忆的标题(木牌下方的副标题/悬停兜底文案用)
  //   item_count  = 岛上已有多少条记忆
  //   user_video / user_audio / ai_video = 取该空间里最近一条带对应媒体的记忆
  //     (电视/收音机/影像角标是"岛上有一个"的提示, 不必精确到某条记忆)
  'memory/island/list': (_p, uid) =>
    db
      .prepare(
        `SELECT s.id, s.id AS space_id, s.name AS space_name,
                s.island_name, s.island_tip, s.island_art, s.created_at,
                (SELECT COUNT(*) FROM memory_item i WHERE i.space_id = s.id) AS item_count,
                (SELECT i.title FROM memory_item i WHERE i.space_id = s.id
                  ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS title,
                (SELECT CASE WHEN i.ai_video IS NOT NULL AND i.ai_video != '' THEN 1 ELSE 0 END
                  FROM memory_item i WHERE i.space_id = s.id
                  ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS ai_video,
                (SELECT m.url FROM memory_media m JOIN memory_item i ON i.id = m.memory_id
                  WHERE i.space_id = s.id AND m.type = 3
                  ORDER BY m.id DESC LIMIT 1) AS user_video,
                (SELECT m.url FROM memory_media m JOIN memory_item i ON i.id = m.memory_id
                  WHERE i.space_id = s.id AND m.type = 2
                  ORDER BY m.id DESC LIMIT 1) AS user_audio
         FROM memory_space s
         WHERE s.user_id = ?
           -- 只露出真正装过记忆的岛: 老数据里残留着不少"建了但没放记忆"的空空间,
           -- 全部铺到总览页会平白多出一堆空岛(记忆删空后那座岛也跟着收起来)
           AND (SELECT COUNT(*) FROM memory_item i WHERE i.space_id = s.id) > 0
         ORDER BY s.created_at DESC, s.id DESC`
      )
      .all(uid),
  // 编辑一座岛: 悬停文案与外观都写在空间行上(一个空间 = 一座岛, 所以天然整体生效)
  'memory/island/update': (p, uid, req) => {
    guard(req, 'memory/island/update', 30, 60_000, '操作太频繁, 稍后再试')
    mustSpaceOwner(p.id, uid)
    let touched = false
    if (p.island_tip !== undefined) {
      const v = String(p.island_tip).trim()
      if (v.length > ISLAND_TIP_MAX) throw err(`悬停文案最长 ${ISLAND_TIP_MAX} 字`)
      updateCols('memory_space', ['island_tip'], { island_tip: v }, p.id, { updated_at: now() })
      touched = true
    }
    if (p.island_art !== undefined) {
      if (!ISLAND_ART_KEYS.has(p.island_art)) throw err('未知的岛屿外观')
      updateCols('memory_space', ['island_art'], { island_art: p.island_art }, p.id, { updated_at: now() })
      touched = true
    }
    if (!touched) throw err('没有要修改的内容')
    return db
      .prepare(
        `SELECT s.id, s.id AS space_id, s.name AS space_name,
                s.island_name, s.island_tip, s.island_art,
                (SELECT COUNT(*) FROM memory_item i WHERE i.space_id = s.id) AS item_count
         FROM memory_space s WHERE s.id = ?`
      )
      .get(p.id)
  },
  // ---------------------------------------------------------------------------
  // 记忆的语义搜索：给一句话，返回「意思相近」的记忆 id 集合
  //
  // 为什么单独开接口而不是把向量塞进 memory/item/list：
  //   列表接口是页面首屏要用的，必须快；向量检索每条记忆都要算/查向量，
  //   放在列表里等于让所有人打开记忆库都等 1 秒。前端只在**字面搜不到**时才来问这里。
  // 返回 disabled:true = 没配密钥/额度用尽，前端照常显示「没有找到」。
  // ---------------------------------------------------------------------------
  'memory/semantic-search': async (p, uid, req) => {
    guard(req, 'memory/semantic', 40, 60_000, '搜索太频繁了，喘口气再搜')
    if (!uid) throw err('请先登录')
    const q = String(p.q || '').trim()
    if (q.length < 2) return { ids: [], scored: [], disabled: false }
    const r = await semanticSearchMemory(uid, q)
    if (!r) return { ids: [], scored: [], disabled: true }
    return { ...r, disabled: false }
  },

  'memory/item/list': (p, uid) => {
    const space = getSpace(p.space_id)
    if (!space) throw err('记忆空间不存在')
    if (space.user_id !== uid && space.is_public !== 1) throw err('该空间未公开')
    return db.prepare('SELECT * FROM memory_item WHERE space_id = ? ORDER BY created_at DESC').all(p.space_id)
  },
  'memory/item/detail': (p, uid) => {
    const item = itemWithMeta(p.id)
    if (!item) throw err('记忆不存在')
    if (!(item.owner_id === uid || item.is_public === 1 || item.space_public === 1)) throw err('无权查看')
    return item
  },
  'memory/item/create': async (p, uid) => {
    const space = p.space_id
      ? mustSpaceOwner(p.space_id, uid)
      : p.space_name
        ? ensureSpace(uid, String(p.space_name).trim())
        : null
    if (!space) throw err('请指定所属空间')
    // ★ 标题栏已经从弹窗里删掉了：现在是「内容必填，标题由 AI 按内容生成」。
    //   以前这里校验的是 title，前端不再提交 title 之后会直接卡死在"标题不能为空"，
    //   所以校验对象改成 content。
    if (!String(p.content || '').trim()) throw err('内容不能为空')
    // 每个空间最多 13 条记忆（= 13 件 3D 物品）。房间净空只有 2.3×3.0 米，
    // 扣掉自带的床/桌/椅/柜之后，能摆小件的地方就那么多，超了必然重叠或塞到床底下。
    // 前端在「选择已有岛屿」时就会用同样的上限提前拦截并弹窗（见 memory.vue），
    // 这里是服务端的最后一道闸门，防止绕过界面直接调接口。
    if (remainingCapacity(space.id) <= 0) {
      throw err(
        `SPACE_FULL 这座岛屿已经放满 ${MAX_ITEMS_PER_SPACE} 条记忆了，请选择其他岛屿或新建一座岛屿`,
      )
    }
    // 标题：调用方没给才由 AI 读正文生成（失败自动降级为"正文开头几个字"，见 generateTitle）。
    // 留这个口子是为了兼容脚本/老客户端 —— 它们照旧传 title，行为不变；
    // 前端「添加记忆」弹窗已经不带标题栏了，走的就是 AI 生成这条路。
    const title = String(p.title || '').trim() || (await generateTitle(p.content, p.entry_date))
    // ★ 2026-10-27：隐私设置里选「创建时手动选择」的用户，可以在新建时直接勾公开。
    //   这种情况下要和「分享到广场」一致地把 shared_at 记上（广场按它排时间、卡片也显示分享时间），
    //   否则 is_public=1 但 shared_at=0，排序只能兜底用创建时间。
    const ts = now()
    const r = db
      .prepare(
        `INSERT INTO memory_item (space_id, title, content, mood, weather, tags, is_public, kind, author, entry_date, type, position_x, position_y, rotation, ai_cover, ai_denied, island_art, created_at, updated_at, shared_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        space.id,
        title,
        p.content || '',
        p.mood || '',
        p.weather || '',
        p.tags || '',
        p.is_public ? 1 : 0,
        p.kind || 'memory',
        p.author || '',
        p.entry_date || '',
        p.type || '其他',
        Number(p.position_x) || 0,
        Number(p.position_y) || 0,
        Number(p.rotation) || 0,
        p.ai_cover || '',
        p.ai_denied ? 1 : 0,
        ISLAND_ART_KEYS.has(p.island_art) ? p.island_art : nextItemIslandArt(uid),
        ts,
        ts,
        p.is_public ? ts : 0
      )
    if (Array.isArray(p.media) && p.media.length) {
      const ins = db.prepare(
        `INSERT INTO memory_media (memory_id, type, url, thumb, duration, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      p.media.forEach((m, i) =>
        ins.run(r.lastInsertRowid, Number(m.type) || 1, m.url, m.thumb || '', Number(m.duration) || 0, m.sort ?? i, now())
      )
    }
    const item = itemWithMeta(r.lastInsertRowid)
    // 新建时就勾了「公开」= 直接进广场（与记忆库里点「分享到广场」同一结果）
    if (Number(item.is_public) === 1) {
      try {
        projectMemory(item.id)
      } catch (e) {
        console.warn('[square/project] 新记忆投影失败(已忽略):', e.message)
      }
    }
    // 3D 房间摆件：保存记忆后后台算「该放哪件家具」（AI 失败自动规则兜底，不阻断主流程）
    try {
      await ensureRoomProp(uid, item)
    } catch (e) {
      console.warn('[room/plan] 创建记忆后摆件生成失败(已忽略):', e.message)
    }
    return item
  },
  'memory/item/update': async (p, uid) => {
    const item = db.prepare('SELECT * FROM memory_item WHERE id = ?').get(p.id)
    if (!item) throw err('记忆不存在')
    mustSpaceOwner(item.space_id, uid)
    // ★ 正文改了就重新起一个标题（弹窗里没有标题栏了，标题归 AI 管）。
    //   ⚠ 直接改写 p.title 而不是塞进 extra：extra 里的键会追加在白名单列之后，
    //     两边都写 title 会拼出 `title = ?, ..., title = ?` 这种重复赋值。
    //   只在正文**真的变了**时才重新生成，避免"只改个日期/换座岛"就换标题。
    if (p.content !== undefined && String(p.content).trim() !== String(item.content || '').trim()) {
      p.title = await generateTitle(p.content, p.entry_date ?? item.entry_date)
    }
    // 空间名变更: 自动迁移到同名空间(不存在则创建)
    const extra = { updated_at: now() }
    // 分享状态发生变化时同步共享时间, 与「分享到广场」按钮保持同一口径:
    // 公开时记录分享时刻(广场共享流据此排序), 取消分享则清空
    if (p.is_public !== undefined) {
      const nextPublic = p.is_public ? 1 : 0
      if (nextPublic !== (item.is_public ? 1 : 0)) {
        extra.shared_at = nextPublic ? now() : 0
      }
    }
    // 目标空间: 优先用 space_id 精确落位(记忆库「已有岛屿」走这条, 不会因重名/名字差异而新建空间);
    // 只有拿到名字时才退回 ensureSpace 按名建/找。
    if (p.space_id) {
      const target = mustSpaceOwner(p.space_id, uid)
      if (target.id !== item.space_id) extra.space_id = target.id
    } else if (p.space_name) {
      const cur = getSpace(item.space_id)
      if (cur && cur.name !== String(p.space_name).trim()) {
        extra.space_id = ensureSpace(uid, String(p.space_name).trim()).id
      }
    }
    updateCols(
      'memory_item',
      [
        'title',
        'content',
        'mood',
        'weather',
        'tags',
        'position_x',
        'position_y',
        'rotation',
        'is_public',
        'kind',
        'author',
        'entry_date',
        'type',
        'ai_cover',
        'ai_denied',
      ],
      p,
      p.id,
      extra
    )
    if (Array.isArray(p.media)) {
      db.prepare('DELETE FROM memory_media WHERE memory_id = ?').run(p.id)
      const ins = db.prepare(
        `INSERT INTO memory_media (memory_id, type, url, thumb, duration, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      p.media.forEach((m, i) =>
        ins.run(p.id, Number(m.type) || 1, m.url, m.thumb || '', Number(m.duration) || 0, m.sort ?? i, now())
      )
    }
    // 3D 房间摆件：仅当影响「摆什么/摆哪」的字段变化时重算（标题/内容/日期/换空间），
    // 分享开关等无关改动不触发，避免无谓消耗 AI 额度。失败走规则兜底，不阻断主流程。
    //（kind/type 已从弹窗里删掉，不再是触发条件）
    const replanFields = ['title', 'content', 'entry_date', 'space_name']
    if (replanFields.some((k) => p[k] !== undefined) || extra.space_id !== undefined) {
      try {
        await ensureRoomProp(uid, itemWithMeta(p.id))
      } catch (e) {
        console.warn('[room/plan] 更新记忆后摆件生成失败(已忽略):', e.message)
      }
    }
    // ★ 这条记忆被搬去了别的岛: 原来的岛如果就此空了, 也跟着消失
    //   (和"删空最后一条记忆"同一套规则, 免得留下一个只在下拉里存在的空岛)
    if (extra.space_id !== undefined) pruneSpaceIfEmpty(item.space_id)
    // 公开状态/正文/媒体变了都要让广场那条投影跟上（公开→上架并刷新内容，私有→下架）
    try {
      const next = itemWithMeta(p.id)
      if (Number(next?.is_public) === 1) projectMemory(p.id)
      else unprojectMemory(p.id)
    } catch (e) {
      console.warn('[square/project] 更新记忆后同步广场失败(已忽略):', e.message)
    }
    return itemWithMeta(p.id)
  },
  'memory/item/remove': (p, uid) => {
    const item = db.prepare('SELECT * FROM memory_item WHERE id = ?').get(p.id)
    if (!item) throw err('记忆不存在')
    mustSpaceOwner(item.space_id, uid)
    removeRoomProp(p.id) // 连带清掉这件记忆在 3D 房间的摆件（外键 CASCADE 也会兜底）
    db.prepare('DELETE FROM memory_media WHERE memory_id = ?').run(p.id)
    db.prepare('DELETE FROM memory_item WHERE id = ?').run(p.id)
    // 广场上那条投影也一起撤掉, 否则点进去是一条打不开的记忆
    dropProjection(p.id)
    // ★ 删掉的是这座岛的最后一条记忆 → 整座岛一起消失(记忆空间里不再挂一座空岛,
    //   添加记忆的「已有岛屿」下拉也不会再列出它)。
    const islandRemoved = pruneSpaceIfEmpty(item.space_id)
    return { removed: true, island_removed: islandRemoved }
  },

  // ---------- 3D 房间（sg3d）接口 ----------
  // 进入某记忆空间的 3D 房间时，sg3d 拉取本空间所有记忆 + 各自的家具摆放方案。
  // 仅返回「当前用户自己」的空间；缺方案的旧记忆会自动按规则补一条。
  'room/layout': (p, uid) => {
    const space = getSpace(p.space_id)
    if (!space) throw err('记忆空间不存在')
    if (space.user_id !== uid) throw err('只能进入自己的记忆空间')
    return getRoomLayout(p.space_id, uid)
  },
  // 只返回「墙面陈设」的状态：相框该显示哪张 AI 封面 + 电视机要不要亮。
  // 为什么要单独开一个：3D 房间要靠轮询发现"刚生成完的 AI 视频"，
  // 而完整的 room/layout 要算整套摆放方案、体积大得多，几秒一次太浪费。
  'room/gallery': (p, uid) => {
    const space = getSpace(p.space_id)
    if (!space) throw err('记忆空间不存在')
    if (space.user_id !== uid) throw err('只能查看自己的记忆空间')
    return getRoomLayout(p.space_id, uid).gallery
  },
  // 摆件检索调试/解释接口：给一段文字，返回"最像哪件 3D 物品"。
  // 房间里的物品不是随机的 —— 这条接口就是把"为什么是它"摊开给人看（也方便回归测试）。
  'room/prop/search': async (p, uid, req) => {
    guard(req, 'room/prop/search', 30, 60_000, '检索太频繁，请稍后再试')
    if (!uid) throw err('请先登录后再检索')
    const text = String(p.text ?? '').slice(0, 2000)
    if (!text.trim()) throw err('请先写点什么')
    const title = String(p.title ?? '')
    return {
      lexical: searchProps(text, { title, limit: 3 }),
      decision: await decideProp(text, { title }),
    }
  },
  // 手动「重排」本空间摆件（AI 重新识别每条记忆并摆放）；无密钥时退回规则。
  'ai/room/plan': async (p, uid) => {
    const space = getSpace(p.space_id)
    if (!space) throw err('记忆空间不存在')
    if (space.user_id !== uid) throw err('只能重排自己的记忆空间')
    if (p.item_id) {
      const item = db.prepare('SELECT * FROM memory_item WHERE id = ?').get(p.item_id)
      if (!item) throw err('记忆不存在')
      mustSpaceOwner(item.space_id, uid)
      return { prop: await ensureRoomProp(uid, item) }
    }
    return { props: await replanSpace(uid, p.space_id) }
  },

  /**
   * 分享到拾光广场 —— 全站唯一的发布动作。
   * 标记公开 + 生成对应的广场动态(projectMemory)。2026-10-27 起广场删掉了独立的
   * 「共享记忆」页, 分享之后的记忆就是广场信息流里的一条普通人动态, 可点赞可评论,
   * 也能被「关注 / 热门 / 最新」筛到。
   * 幂等: 重复点击不刷新首次分享时间, 只有「取消后再分享」才回到信息流顶部。
   */
  'memory/item/share': (p, uid, req) => {
    guard(req, 'memory/item/share', 30, 60_000, '操作过于频繁, 请稍后再试')
    const item = db.prepare('SELECT * FROM memory_item WHERE id = ?').get(p.id)
    if (!item) throw err('记忆不存在')
    mustSpaceOwner(item.space_id, uid)
    const sharedAt = item.is_public === 1 && item.shared_at > 0 ? item.shared_at : now()
    db.prepare('UPDATE memory_item SET is_public = 1, shared_at = ?, updated_at = ? WHERE id = ?').run(
      sharedAt,
      now(),
      p.id
    )
    // 分享 = 直接进广场信息流（2026-10-27 起没有独立的「共享记忆」页了）
    projectMemory(p.id)
    return itemWithMeta(p.id)
  },
  /**
   * 取消分享: 记忆回到「只存在于记忆空间」, 不再出现在广场共享流。
   * 已有的评论与点赞保留, 重新分享后仍在(避免手滑取消就永久丢互动)。
   */
  'memory/item/unshare': (p, uid, req) => {
    guard(req, 'memory/item/unshare', 30, 60_000, '操作过于频繁, 请稍后再试')
    const item = db.prepare('SELECT * FROM memory_item WHERE id = ?').get(p.id)
    if (!item) throw err('记忆不存在')
    mustSpaceOwner(item.space_id, uid)
    db.prepare('UPDATE memory_item SET is_public = 0, shared_at = 0, updated_at = ? WHERE id = ?').run(now(), p.id)
    unprojectMemory(p.id)
    return itemWithMeta(p.id)
  },

  // ---------- 记忆评论(历史接口: 广场上的评论现在走 square/comment/*) ----------
  'memory/comment/list': (p, uid) => {
    const item = db
      .prepare(
        `SELECT i.id, i.is_public, s.user_id AS owner_id, s.is_public AS space_public
         FROM memory_item i JOIN memory_space s ON s.id = i.space_id WHERE i.id = ?`
      )
      .get(p.memory_id)
    if (!item) throw err('记忆不存在')
    if (!(item.owner_id === uid || item.is_public === 1 || item.space_public === 1))
      throw err('该记忆未公开')
    return db
      .prepare(
        `SELECT c.*, u.nickname AS author_nickname, u.avatar AS author_avatar
         FROM memory_comment c LEFT JOIN user u ON u.id = c.user_id
         WHERE c.memory_id = ? ORDER BY c.created_at ASC, c.id ASC`
      )
      .all(p.memory_id)
  },
  'memory/comment/create': (p, uid) => {
    const item = db
      .prepare(
        `SELECT i.id, i.is_public, s.user_id AS owner_id, s.is_public AS space_public
         FROM memory_item i JOIN memory_space s ON s.id = i.space_id WHERE i.id = ?`
      )
      .get(p.memory_id)
    if (!item) throw err('记忆不存在')
    if (!(item.is_public === 1 || item.space_public === 1)) throw err('只能评论已共享的记忆')
    const content = (p.content || '').trim()
    if (!content) throw err('评论内容不能为空')
    const r = db
      .prepare('INSERT INTO memory_comment (memory_id, user_id, content, created_at) VALUES (?, ?, ?, ?)')
      .run(p.memory_id, uid, content, now())
    return db
      .prepare(
        `SELECT c.*, u.nickname AS author_nickname, u.avatar AS author_avatar
         FROM memory_comment c LEFT JOIN user u ON u.id = c.user_id WHERE c.id = ?`
      )
      .get(r.lastInsertRowid)
  },
  'memory/comment/remove': (p, uid) => {
    const doc = db
      .prepare(
        `SELECT c.*, i.space_id FROM memory_comment c JOIN memory_item i ON i.id = c.memory_id WHERE c.id = ?`
      )
      .get(p.id)
    if (!doc) throw err('评论不存在')
    const space = getSpace(doc.space_id)
    if (doc.user_id !== uid && space?.user_id !== uid) throw err('无权删除')
    db.prepare('DELETE FROM memory_comment WHERE id = ?').run(p.id)
    return { removed: true }
  },

  // 记忆点赞
  'memory/like': (p, uid) => {
    if (!p.memory_id) throw err('记忆ID不能为空')
    try {
      db.prepare('INSERT INTO memory_item_like (memory_id, user_id, created_at) VALUES (?, ?, ?)')
        .run(p.memory_id, uid, now())
    } catch {
      // 已点过赞
    }
    const liked = db.prepare('SELECT COUNT(*) as cnt FROM memory_item_like WHERE memory_id = ?').get(p.memory_id)
    return { liked: liked.cnt, isLiked: true }
  },
  'memory/unlike': (p, uid) => {
    if (!p.memory_id) throw err('记忆ID不能为空')
    db.prepare('DELETE FROM memory_item_like WHERE memory_id = ? AND user_id = ?').run(p.memory_id, uid)
    const liked = db.prepare('SELECT COUNT(*) as cnt FROM memory_item_like WHERE memory_id = ?').get(p.memory_id)
    return { liked: liked.cnt, isLiked: false }
  },
  'memory/checkLike': (p, uid) => {
    if (!uid) return { isLiked: false, liked: 0 }
    const row = db.prepare('SELECT 1 FROM memory_item_like WHERE memory_id = ? AND user_id = ?').get(p.memory_id, uid)
    const liked = db.prepare('SELECT COUNT(*) as cnt FROM memory_item_like WHERE memory_id = ?').get(p.memory_id)
    return { isLiked: !!row, liked: liked.cnt }
  },

  // ---------- 媒体上传 ----------
  'media/upload': (p, uid, req) => {
    const m = /^data:(image\/(png|jpe?g|webp|gif));base64,(.+)$/.exec(p.dataUrl || '')
    if (!m) throw err('仅支持 png/jpg/webp/gif 图片')
    const buf = Buffer.from(m[3], 'base64')
    if (buf.length > 6 * 1024 * 1024) throw err('图片过大(限 6MB)')
    const name = `${now()}_${crypto.randomBytes(6).toString('hex')}.${m[2].replace('jpeg', 'jpg')}`
    fs.writeFileSync(path.join(uploadsDir, name), buf)
    // 只存相对路径(同上): 与部署域名解耦
    return { url: `/uploads/${name}` }
  },

  // 视频/音频上传(记忆与广场帖子附件): dataURL base64 传输, 存 /uploads/ 根目录按扩展名访问
  'media/upload-av': (p, uid, req) => {
    const kind = p.kind === 'video' ? 'video' : 'audio'
    const m =
      kind === 'video'
        ? /^data:(video\/(mp4|webm|quicktime|x-matroska)|application\/octet-stream);base64,(.+)$/.exec(p.dataUrl || '')
        : /^data:(audio\/[a-z0-9.+-]+|application\/octet-stream);base64,(.+)$/.exec(p.dataUrl || '')
    if (!m) throw err(kind === 'video' ? '仅支持 mp4/webm/mov 视频' : '仅支持 mp3/m4a/wav/ogg/flac 音频')
    const buf = Buffer.from(m[3], 'base64')
    const limit = kind === 'video' ? 40 * 1024 * 1024 : 15 * 1024 * 1024
    if (buf.length > limit) throw err(kind === 'video' ? '视频过大(限 40MB)' : '音频过大(限 15MB)')
    if (buf.length < 1024) throw err('文件太小, 不像有效的媒体文件')
    const extMap = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv' }
    const nameExt = (String(p.name || '').match(/\.([a-z0-9]{2,5})$/i) || [])[1]?.toLowerCase()
    const ext =
      kind === 'video'
        ? ['mp4', 'webm', 'mov', 'mkv'].includes(nameExt)
          ? nameExt
          : extMap[m[1]] || 'mp4'
        : audioExt(buf, m[1])
    const name = `${now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`
    fs.writeFileSync(path.join(uploadsDir, name), buf)
    return { url: `/uploads/${name}`, size: buf.length }
  },

  // ---------- 背景音乐(用户自传) ----------
  // 服务端二次校验魔数: 前端校验只是体验, 这里是底线。
  // 支持 ogg / mp3 / wav / flac / m4a; QQ 音乐 .mgg、网易云 .ncm 等加密格式直接拒绝。
  'bgm/upload': (p, uid, req) => {
    const m = /^data:(audio\/[a-z0-9.+-]+|application\/octet-stream);base64,(.+)$/.exec(p.dataUrl || '')
    if (!m) throw err('仅支持音频文件 (mp3 / m4a / wav / ogg / flac)')
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length > 10 * 1024 * 1024) throw err('音频过大(限 10MB)')
    if (buf.length < 4096) throw err('文件太小, 不像有效音频')
    if (!sniffAudio(buf)) {
      throw err('无法识别的音频格式: 可能是 QQ 音乐/网易云的加密文件 (.mgg/.ncm/.kgm 等), 请先转换成 mp3/m4a/wav/ogg 再上传')
    }
    if (!p.name || String(p.name).trim().length > 80) throw err('曲名不能为空且最长 80 字')
    const ext = audioExt(buf, m[1])
    const name = `${now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`
    fs.writeFileSync(path.join(bgmDir, name), buf)
    const url = `/uploads/bgm/${name}`
    const r = db
      .prepare('INSERT INTO bgm_track (user_id, name, artist, url, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uid, String(p.name).trim(), String(p.artist || '').slice(0, 40), url, buf.length, now())
    return {
      id: r.lastInsertRowid,
      custom: 1,
      name: String(p.name).trim(),
      artist: String(p.artist || '').slice(0, 40),
      url,
      size: buf.length,
    }
  },
  'bgm/list': (_p, uid) => {
    return {
      list: db
        .prepare('SELECT id, name, artist, url, size, created_at FROM bgm_track WHERE user_id = ? ORDER BY id DESC')
        .all(uid)
        .map((x) => ({ ...x, custom: 1 })),
    }
  },
  'bgm/remove': (p, uid) => {
    const row = db.prepare('SELECT * FROM bgm_track WHERE id = ? AND user_id = ?').get(p.id, uid)
    if (!row) throw err('曲目不存在')
    db.prepare('DELETE FROM bgm_track WHERE id = ? AND user_id = ?').run(p.id, uid)
    // 顺手清文件; 若该曲正被用户选中, 设置里留空回退默认曲
    try {
      if (row.url.startsWith('/uploads/bgm/')) fs.unlinkSync(path.join(bgmDir, row.url.replace('/uploads/bgm/', '')))
    } catch (e) {
      // 删文件失败不影响接口成功: 曲目行已删, 残留文件成孤儿, 可手动清理
      console.error('[bgm/remove] 清理文件失败:', e.code || '', e.message)
    }
    db.prepare("UPDATE user_settings SET bgm_track = '', updated_at = ? WHERE user_id = ? AND bgm_track = ?").run(now(), uid, row.url)
    return { ok: 1 }
  },

  // ---------- 广场 ----------
  /**
   * 信息流。filter 决定「全部 / 关注 / 热门 / 最新」：
   *   all    全部（按时间倒序）
   *   follow 只看自己关注的人（未登录直接空列表，前端提示去登录）
   *   hot    热门 = 5 个赞或 3 条评论；一条都没够线时退回「按互动多少排」，
   *          并带 fallback=true 让前端说明一句，免得用户以为按钮又坏了
   *   new    最新 = 最近 3 天内；3 天没新内容同样退回全部并在前端说明
   * 焦点一直放在服务端做：前端只拿到这一页，客户端排序会「这页看着变了下一批又乱」。
   */
  'square/post/list': (p, uid) => {
    const page = Number(p.page) || 1
    const pageSize = Math.min(Number(p.pageSize) || 10, 50)
    const filter = ['all', 'follow', 'hot', 'new'].includes(p.filter) ? p.filter : 'all'
    const HOT_LIKES = 5
    const HOT_COMMENTS = 3
    const NEW_WINDOW = 3 * 86_400_000
    const query = (kind) => {
      const where = ['p.is_public = 1']
      const args = []
      let order = 'p.created_at DESC, p.id DESC'
      if (kind === 'follow') {
        if (!uid) return { total: 0, list: [] }
        where.push('p.user_id IN (SELECT following_id FROM user_follow WHERE follower_id = ?)')
        args.push(uid)
      } else if (kind === 'hot') {
        where.push(`(p.likes_count >= ${HOT_LIKES} OR p.comments_count >= ${HOT_COMMENTS})`)
        order = '(p.likes_count * 2 + p.comments_count * 3) DESC, p.created_at DESC, p.id DESC'
      } else if (kind === 'new') {
        where.push('p.created_at >= ?')
        args.push(now() - NEW_WINDOW)
        order = 'p.created_at DESC, p.id DESC'
      }
      const clause = where.join(' AND ')
      const total = db.prepare(`SELECT COUNT(*) AS c FROM square_post p WHERE ${clause}`).get(...args).c
      const rows = db
        .prepare(
          `SELECT p.*, u.username AS u_username, u.nickname AS u_nickname, u.avatar AS u_avatar
           FROM square_post p LEFT JOIN user u ON u.id = p.user_id
           WHERE ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`
        )
        .all(...args, pageSize, (page - 1) * pageSize)
      return { total, list: rows }
    }
    let out = query(filter)
    let fallback = false
    // 热门/最新 一条都没有时退回全部：小站内容少，空页面比"照实为空"更让人迷惑
    if (!out.total && (filter === 'hot' || filter === 'new')) {
      out = query('all')
      fallback = true
    }
    return { total: out.total, page, pageSize, filter, fallback, list: attachAuthors(out.list, uid) }
  },
  'square/post/create': (p, uid) => {
    const content = String(p.content || '').trim()
    if (!content) throw err('帖子内容不能为空')
    // memory_id: 广场发布 = 先在记忆库建一条公开记忆, 再把这条记忆投影成广场动态。
    // 带上它之后两个页面共用同一条内容, 不会再出现「广场有、记忆库没有」。
    const memoryId = Number(p.memory_id) || 0
    const memory = memoryId ? ownMemory(memoryId, uid) : null
    if (memoryId && !memory) throw err('记忆不存在或无权分享')
    const r = db
      .prepare(
        `INSERT INTO square_post (user_id, space_id, memory_id, content, images, video, audio, tags, likes_count, comments_count, is_public, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`
      )
      .run(
        uid,
        (memory && memory.space_id) || p.space_id || null,
        memory ? memoryId : 0,
        content,
        p.images || '',
        p.video || '',
        p.audio || '',
        normalizeTags(p.tags),
        p.is_public === 0 ? 0 : 1,
        now(),
        now()
      )
    // 记忆已经是公开态(记忆库那边要能看到「已分享」), 保证两处状态一致
    if (memory) db.prepare('UPDATE memory_item SET is_public = 1, shared_at = ? WHERE id = ?').run(now(), memoryId)
    return attachAuthors([postRow(r.lastInsertRowid)], uid)[0]
  },
  'square/post/detail': (p, uid) => {
    const doc = postRow(p.id)
    if (!doc) throw err('帖子不存在')
    if (doc.is_public !== 1 && doc.user_id !== uid) throw err('无权查看')
    return attachAuthors([doc], uid)[0]
  },
  'square/post/update': (p, uid) => {
    const doc = db.prepare('SELECT * FROM square_post WHERE id = ?').get(p.id)
    if (!doc) throw err('帖子不存在')
    if (doc.user_id !== uid) throw err('无权修改')
    const content = (p.content || '').trim()
    if (!content) throw err('帖子内容不能为空')
    // 老动态(发布时还没有 memory_id)在编辑时补上关联, 历史内容也一并进记忆库
    let memoryId = Number(doc.memory_id) || 0
    if (p.memory_id !== undefined) {
      const next = Number(p.memory_id) || 0
      if (next && !ownMemory(next, uid)) throw err('记忆不存在或无权分享')
      memoryId = next
    }
    db.prepare(
      'UPDATE square_post SET content = ?, images = ?, video = ?, audio = ?, tags = ?, memory_id = ?, updated_at = ? WHERE id = ?'
    ).run(content, p.images || '', p.video || '', p.audio || '', normalizeTags(p.tags), memoryId, now(), p.id)
    // 与 create/detail 保持一致: 返回带作者与互动状态的视图模型
    return attachAuthors([postRow(p.id)], uid)[0]
  },
  'square/post/remove': (p, uid) => {
    const doc = db.prepare('SELECT * FROM square_post WHERE id = ?').get(p.id)
    if (!doc) throw err('帖子不存在')
    if (doc.user_id !== uid) throw err('无权删除')
    db.prepare('DELETE FROM post_like WHERE post_id = ?').run(p.id)
    db.prepare('DELETE FROM post_comment WHERE post_id = ?').run(p.id)
    db.prepare('DELETE FROM square_post WHERE id = ?').run(p.id)
    // 关联的记忆**不删**(那是用户写在记忆库里的东西), 只取消公开:
    // 广场这条动态没了, 共享记忆里也不该继续挂着, 但记忆库里的那条还在。
    if (doc.memory_id) db.prepare('UPDATE memory_item SET is_public = 0, shared_at = 0 WHERE id = ?').run(doc.memory_id)
    return { removed: true }
  },
  'square/like/toggle': (p, uid) => {
    const post = db.prepare('SELECT * FROM square_post WHERE id = ?').get(p.post_id)
    if (!post) throw err('帖子不存在')
    const exist = db.prepare('SELECT id FROM post_like WHERE post_id = ? AND user_id = ?').get(p.post_id, uid)
    if (exist) {
      db.prepare('DELETE FROM post_like WHERE id = ?').run(exist.id)
      db.prepare('UPDATE square_post SET likes_count = MAX(likes_count - 1, 0) WHERE id = ?').run(p.post_id)
      return { liked: false, likes_count: Math.max(post.likes_count - 1, 0) }
    }
    db.prepare('INSERT INTO post_like (post_id, user_id, created_at) VALUES (?, ?, ?)').run(p.post_id, uid, now())
    db.prepare('UPDATE square_post SET likes_count = likes_count + 1 WHERE id = ?').run(p.post_id)
    return { liked: true, likes_count: post.likes_count + 1 }
  },
  'square/comment/list': (p) => {
    const rows = db
      .prepare(
        `SELECT c.*, u.username AS u_username, u.nickname AS u_nickname, u.avatar AS u_avatar
         FROM post_comment c LEFT JOIN user u ON u.id = c.user_id
         WHERE c.post_id = ? ORDER BY c.created_at ASC LIMIT 200`
      )
      .all(p.post_id)
    return attachAuthors(rows, null)
  },
  'square/comment/create': (p, uid) => {
    const post = db.prepare('SELECT * FROM square_post WHERE id = ?').get(p.post_id)
    if (!post) throw err('帖子不存在')
    if (!p.content) throw err('评论内容不能为空')
    const r = db
      .prepare(
        `INSERT INTO post_comment (post_id, user_id, parent_id, content, likes_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`
      )
      .run(p.post_id, uid, p.parent_id || null, p.content, now(), now())
    db.prepare('UPDATE square_post SET comments_count = comments_count + 1 WHERE id = ?').run(p.post_id)
    const row = db
      .prepare(
        `SELECT c.*, u.username AS u_username, u.nickname AS u_nickname, u.avatar AS u_avatar
         FROM post_comment c LEFT JOIN user u ON u.id = c.user_id WHERE c.id = ?`
      )
      .get(r.lastInsertRowid)
    return attachAuthors([row], uid)[0]
  },
  'square/comment/remove': (p, uid) => {
    const doc = db.prepare('SELECT * FROM post_comment WHERE id = ?').get(p.id)
    if (!doc) throw err('评论不存在')
    if (doc.user_id !== uid) throw err('无权删除')
    const children = db.prepare('SELECT COUNT(*) AS c FROM post_comment WHERE parent_id = ?').get(p.id).c
    db.prepare('DELETE FROM post_comment WHERE parent_id = ?').run(p.id)
    db.prepare('DELETE FROM post_comment WHERE id = ?').run(p.id)
    db
      .prepare('UPDATE square_post SET comments_count = MAX(comments_count - ?, 0) WHERE id = ?')
      .run(children + 1, doc.post_id)
    return { removed: true }
  },

  // ---------- 收藏 / 关注 ----------
  'favorite/toggle': (p, uid) => {
    const type = Number(p.target_type)
    if (![1, 2, 3].includes(type) || !p.target_id) throw err('收藏目标无效')
    const exist = db
      .prepare('SELECT id FROM favorite WHERE user_id = ? AND target_type = ? AND target_id = ?')
      .get(uid, type, p.target_id)
    if (exist) {
      db.prepare('DELETE FROM favorite WHERE id = ?').run(exist.id)
      return { favorited: false }
    }
    db.prepare('INSERT INTO favorite (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)').run(
      uid,
      type,
      p.target_id,
      now()
    )
    return { favorited: true }
  },
  'favorite/list': (p, uid) =>
    p.target_type
      ? db.prepare('SELECT * FROM favorite WHERE user_id = ? AND target_type = ? ORDER BY created_at DESC').all(uid, Number(p.target_type))
      : db.prepare('SELECT * FROM favorite WHERE user_id = ? ORDER BY created_at DESC').all(uid),
  'follow/toggle': (p, uid) => {
    if (!p.following_id || p.following_id === uid) throw err('关注目标无效')
    const exist = db
      .prepare('SELECT id FROM user_follow WHERE follower_id = ? AND following_id = ?')
      .get(uid, p.following_id)
    if (exist) {
      db.prepare('DELETE FROM user_follow WHERE id = ?').run(exist.id)
      return { following: false }
    }
    db.prepare('INSERT INTO user_follow (follower_id, following_id, created_at) VALUES (?, ?, ?)').run(
      uid,
      p.following_id,
      now()
    )
    return { following: true }
  },
  'follow/check': (p, uid) => ({
    following: !!db
      .prepare('SELECT id FROM user_follow WHERE follower_id = ? AND following_id = ?')
      .get(uid, p.following_id),
  }),
  /**
   * 粉丝: 数量对所有人都可见, 但**具体名单只有本人能拿到**。
   * 服务端在这里强制区分视角, 不能靠前端"不显示"来保护隐私 ——
   * 否则任何人改一下请求参数就能把别人的粉丝列表拉走。
   */
  'follow/followers': (p, uid) => {
    const targetId = Number(p.user_id) || uid
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM user_follow WHERE following_id = ?').get(targetId).cnt
    if (targetId !== uid) return { count, list: [], mine: false }
    // 本人视角: 带上"我是否已回关"与"TA 发来但未读的私信数", 前端可直接显示互关/未读红点
    const list = db
      .prepare(
        `SELECT u.id AS user_id, u.nickname AS name, u.avatar,
                EXISTS(SELECT 1 FROM user_follow f2 WHERE f2.follower_id = ? AND f2.following_id = u.id) AS followed,
                (SELECT COUNT(*) FROM private_message m
                  WHERE m.sender_id = u.id AND m.receiver_id = ? AND m.is_read = 0) AS unread
         FROM user_follow f
         JOIN user u ON u.id = f.follower_id
         WHERE f.following_id = ?
         ORDER BY f.created_at DESC
         LIMIT 200`
      )
      .all(uid, uid, targetId)
    return { count, list, mine: true }
  },
  // 我关注了谁(与粉丝分开, 均为本人可见)
  'follow/following': (_p, uid) =>
    db
      .prepare(
        `SELECT u.id AS user_id, u.nickname AS name, u.avatar, f.created_at
         FROM user_follow f
         JOIN user u ON u.id = f.following_id
         WHERE f.follower_id = ?
         ORDER BY f.created_at DESC
         LIMIT 200`
      )
      .all(uid),

  // ---------- AI 会话 ----------
  'ai/conversation/list': (_p, uid) =>
    db.prepare('SELECT * FROM ai_conversation WHERE user_id = ? ORDER BY updated_at DESC').all(uid),
  'ai/conversation/create': (p, uid) => {
    const r = db
      .prepare('INSERT INTO ai_conversation (user_id, title, companion_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(uid, p.title || '新的对话', Number(p.companion_type) || 1, now(), now())
    return db.prepare('SELECT * FROM ai_conversation WHERE id = ?').get(r.lastInsertRowid)
  },
  'ai/conversation/remove': (p, uid) => {
    const doc = db.prepare('SELECT * FROM ai_conversation WHERE id = ?').get(p.id)
    if (!doc || doc.user_id !== uid) throw err('会话不存在')
    db.prepare('DELETE FROM ai_message WHERE conversation_id = ?').run(p.id)
    db.prepare('DELETE FROM ai_conversation WHERE id = ?').run(p.id)
    return { removed: true }
  },
  'ai/message/list': (p, uid) => {
    const doc = db.prepare('SELECT * FROM ai_conversation WHERE id = ?').get(p.conversation_id)
    if (!doc || doc.user_id !== uid) throw err('会话不存在')
    return db.prepare('SELECT * FROM ai_message WHERE conversation_id = ? ORDER BY created_at ASC').all(p.conversation_id)
  },
  'ai/message/add': (p, uid) => {
    const doc = db.prepare('SELECT * FROM ai_conversation WHERE id = ?').get(p.conversation_id)
    if (!doc || doc.user_id !== uid) throw err('会话不存在')
    if (!['user', 'assistant', 'system'].includes(p.role)) throw err('角色无效')
    const r = db
      .prepare('INSERT INTO ai_message (conversation_id, role, content, tokens, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(p.conversation_id, p.role, p.content || '', Number(p.tokens) || 0, now())
    db.prepare('UPDATE ai_conversation SET updated_at = ? WHERE id = ?').run(now(), p.conversation_id)
    return db.prepare('SELECT * FROM ai_message WHERE id = ?').get(r.lastInsertRowid)
  },

  // ---------- 宠物 ----------
  'pet/get': (_p, uid) => {
    let pet = db.prepare('SELECT * FROM pet_config WHERE user_id = ?').get(uid)
    if (!pet) {
      const r = db
        .prepare(
          `INSERT INTO pet_config (user_id, pet_type, pet_name, level, exp, mood, outfit, accessories, last_interact, created_at, updated_at)
           VALUES (?, ?, '拾光兽', 1, 0, 80, '', '', ?, ?, ?)`
        )
        // last_interact 初始为 0: 新宠物必须能立刻互动(否则会被 24 小时冷却直接锁住)
        .run(uid, DEFAULT_PET_TYPE, 0, now(), now())
      pet = db.prepare('SELECT * FROM pet_config WHERE id = ?').get(r.lastInsertRowid)
    } else if (!PET_TYPES.includes(pet.pet_type)) {
      // 历史数据里可能存着 'cat' 或已下线的花色名(布偶猫/黑猫): 原地归一到默认猫,
      // 否则前端拿不到精灵图, 宠物会渲染不出来。
      db.prepare('UPDATE pet_config SET pet_type = ?, updated_at = ? WHERE id = ?').run(
        DEFAULT_PET_TYPE,
        now(),
        pet.id
      )
      pet.pet_type = DEFAULT_PET_TYPE
    }
    return pet
  },
  'pet/update': (p, uid) => {
    const pet = db.prepare('SELECT * FROM pet_config WHERE user_id = ?').get(uid)
    if (!pet) throw err('宠物不存在')
    // 花色只接受白名单内的值, 避免写进没有素材的名字导致前端白屏
    if (p.pet_type !== undefined && !PET_TYPES.includes(String(p.pet_type))) {
      throw err('不支持的宠物类型')
    }
    updateCols('pet_config', ['pet_type', 'pet_name', 'outfit', 'accessories'], p, pet.id, { updated_at: now() })
    return db.prepare('SELECT * FROM pet_config WHERE id = ?').get(pet.id)
  },
  'pet/interact': (_p, uid) => {
    const pet = db.prepare('SELECT * FROM pet_config WHERE user_id = ?').get(uid)
    if (!pet) throw err('宠物不存在')
    // 24 小时冷却
    const COOLDOWN = 24 * 60 * 60 * 1000
    if (pet.last_interact && now() - pet.last_interact < COOLDOWN) {
      const remaining = Math.ceil((COOLDOWN - (now() - pet.last_interact)) / (60 * 60 * 1000))
      throw err(`互动冷却中，还需等待 ${remaining} 小时`)
    }
    const exp = pet.exp + 5
    db.prepare('UPDATE pet_config SET exp = ?, mood = MIN(100, mood + 2), level = ?, last_interact = ?, updated_at = ? WHERE id = ?')
      .run(exp, Math.floor(exp / 100) + 1, now(), now(), pet.id)
    return db.prepare('SELECT * FROM pet_config WHERE id = ?').get(pet.id)
  },

  // ---------- 反馈 ----------
  'feedback/create': (p, uid) => {
    if (![1, 2, 3].includes(Number(p.type))) throw err('反馈类型无效')
    if (!p.content) throw err('反馈内容不能为空')
    const r = db
      .prepare('INSERT INTO feedback (user_id, type, content, contact, status, reply, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)')
      .run(uid, Number(p.type), p.content, p.contact || '', '', now(), now())
    return db.prepare('SELECT * FROM feedback WHERE id = ?').get(r.lastInsertRowid)
  },
  'feedback/list': (_p, uid) =>
    db.prepare('SELECT * FROM feedback WHERE user_id = ? ORDER BY created_at DESC').all(uid),
  'feedback/remove': (p, uid) => {
    const doc = db.prepare('SELECT id FROM feedback WHERE id = ? AND user_id = ?').get(p.id, uid)
    if (!doc) throw err('反馈不存在或无权删除')
    db.prepare('DELETE FROM feedback WHERE id = ?').run(p.id)
    return { removed: true }
  },

  // 用户提交举报(需登录, 非管理员)
  'report/create': (p, uid) => {
    if (![1, 2, 3].includes(Number(p.target_type))) throw err('举报目标类型无效')
    if (!p.target_id) throw err('举报目标ID不能为空')
    if (!p.reason) throw err('举报原因不能为空')
    const r = db
      .prepare(
        `INSERT INTO report (reporter_id, target_type, target_id, reason, status, handle_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, '', ?, ?)`
      )
      .run(uid, Number(p.target_type), p.target_id, p.reason, now(), now())
    return db.prepare('SELECT * FROM report WHERE id = ?').get(r.lastInsertRowid)
  },

  // ---------- 管理员 ----------
  // 反馈管理
  'admin/feedback/list': (p) => {
    isAdmin(p._uid)
    const where = []
    const vals = []
    if (p.status !== undefined && p.status !== '') {
      where.push('status = ?')
      vals.push(Number(p.status))
    }
    if (p.type) {
      where.push('type = ?')
      vals.push(Number(p.type))
    }
    const sql = where.length
      ? `SELECT f.*, u.username AS u_username, u.nickname AS u_nickname
         FROM feedback f LEFT JOIN user u ON u.id = f.user_id
         WHERE ${where.join(' AND ')} ORDER BY f.created_at DESC`
      : `SELECT f.*, u.username AS u_username, u.nickname AS u_nickname
         FROM feedback f LEFT JOIN user u ON u.id = f.user_id
         ORDER BY f.created_at DESC`
    return db.prepare(sql).all(...vals)
  },
  'admin/feedback/update': (p) => {
    isAdmin(p._uid)
    const patch = {}
    if (p.status !== undefined) patch.status = Number(p.status)
    if (p.reply !== undefined) patch.reply = p.reply
    patch.updated_at = now()
    const sets = Object.entries(patch).map(([k]) => `${k} = ?`)
    const vals = Object.values(patch)
    vals.push(p.id)
    db.prepare(`UPDATE feedback SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return db.prepare('SELECT * FROM feedback WHERE id = ?').get(p.id)
  },
  'admin/feedback/remove': (p) => {
    isAdmin(p._uid)
    db.prepare('DELETE FROM feedback WHERE id = ?').run(p.id)
    return { removed: true }
  },
  // 用户回复反馈
  'feedback/reply': (p, uid) => {
    if (!p.id) throw err('反馈ID不能为空')
    if (!p.content || !p.content.trim()) throw err('回复内容不能为空')
    const fb = db.prepare('SELECT * FROM feedback WHERE id = ?').get(p.id)
    if (!fb) throw err('反馈不存在')
    if (fb.user_id !== uid) throw err('无权操作')
    // 追加用户回复
    const userReply = fb.user_reply ? fb.user_reply + '\n---\n' + p.content.trim() : p.content.trim()
    db.prepare('UPDATE feedback SET user_reply = ?, updated_at = ? WHERE id = ?').run(userReply, now(), p.id)
    return { replied: true }
  },

  // 举报管理
  'admin/report/list': (p) => {
    isAdmin(p._uid)
    const where = []
    const vals = []
    if (p.status !== undefined && p.status !== '') {
      where.push('status = ?')
      vals.push(Number(p.status))
    }
    const sql = where.length
      ? `SELECT r.*, u.username AS reporter_name
         FROM report r LEFT JOIN user u ON u.id = r.reporter_id
         WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC`
      : `SELECT r.*, u.username AS reporter_name
         FROM report r LEFT JOIN user u ON u.id = r.reporter_id
         ORDER BY r.created_at DESC`
    return db.prepare(sql).all(...vals)
  },
  // 举报详情: 查看举报对象的内容(帖子/评论/用户)
  'admin/report/detail': (p) => {
    isAdmin(p._uid)
    const r = db.prepare('SELECT * FROM report WHERE id = ?').get(p.id)
    if (!r) throw err('举报不存在')
    // 评论: 先查评论, 查不到回退查帖子(广场举报历史数据把帖子 id 存成了评论类型)
    if (r.target_type === 2) {
      const c = db
        .prepare(
          `SELECT c.content, c.created_at, u.username AS author_name, u.nickname AS author_nickname
           FROM post_comment c LEFT JOIN user u ON u.id = c.user_id WHERE c.id = ?`
        )
        .get(r.target_id)
      if (c) {
        return {
          report: r,
          target: {
            kind: '评论',
            author: c.author_nickname || c.author_name || '匿名用户',
            content: c.content,
            created_at: c.created_at,
          },
        }
      }
    }
    // 帖子 (type 1; type 2 评论查不到时回退到帖子, 即广场举报的实际对象)
    if (r.target_type === 1 || r.target_type === 2) {
      const doc = db
        .prepare(
          `SELECT s.content, s.images, s.tags, s.created_at, u.username AS author_name, u.nickname AS author_nickname
           FROM square_post s LEFT JOIN user u ON u.id = s.user_id WHERE s.id = ?`
        )
        .get(r.target_id)
      if (!doc) return { report: r, target: null }
      return {
        report: r,
        target: {
          kind: '帖子',
          author: doc.author_nickname || doc.author_name || '匿名用户',
          content: doc.content,
          images: doc.images || '',
          tags: doc.tags || '',
          created_at: doc.created_at,
        },
      }
    }
    // 用户
    const u = db.prepare('SELECT username, nickname FROM user WHERE id = ?').get(r.target_id)
    if (!u) return { report: r, target: null }
    return {
      report: r,
      target: {
        kind: '用户',
        author: u.nickname || u.username,
        content: `用户名: ${u.username}　昵称: ${u.nickname || '-'}`,
      },
    }
  },
  'admin/report/update': (p) => {
    isAdmin(p._uid)
    const patch = {}
    if (p.status !== undefined) patch.status = Number(p.status)
    if (p.handle_note !== undefined) patch.handle_note = p.handle_note
    patch.updated_at = now()
    const sets = Object.entries(patch).map(([k]) => `${k} = ?`)
    const vals = Object.values(patch)
    vals.push(p.id)
    db.prepare(`UPDATE report SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return db.prepare('SELECT * FROM report WHERE id = ?').get(p.id)
  },
  'admin/report/remove': (p) => {
    isAdmin(p._uid)
    db.prepare('DELETE FROM report WHERE id = ?').run(p.id)
    return { removed: true }
  },

  /**
   * 处理举报 = 下架被举报内容 + 以「拾光管理员」身份私信通知双方（2026-10-29 新需求）。
   *
   * 为什么"下架"要落到记忆上：广场动态只是记忆的投影（square_post.memory_id），
   * 用户自己点「取消分享」走的也是这条路（is_public=0 + unprojectMemory）。
   * 如果只把 square_post.is_public 置 0，记忆还在"已分享"状态，下次启动
   * backfillSquareProjections() 会把它重新投影回广场 —— 等于下架无效。
   *
   * 通知为什么要私信：用户不一定回来看举报页；私信双方（举报人收到处理结果、
   * 被举报人收到下架理由）才是闭环。发信人匿名成「拾光管理员」。
   */
  'admin/report/takedown': (p) => {
    isAdmin(p._uid)
    const r = db.prepare('SELECT * FROM report WHERE id = ?').get(p.id)
    if (!r) throw err('举报不存在')
    const note = String(p.note ?? '').trim() || '违反社区规范'
    const t = now()
    const type = Number(r.target_type)

    // ① 定位被举报的动态：评论先找所属动态，找不到就按帖子 id 兜底
    //   （历史数据把帖子举报存成评论类型，detail 接口里也有同样的兜底）
    let post = null
    if (type === 2) {
      const c = db.prepare('SELECT post_id FROM post_comment WHERE id = ?').get(r.target_id)
      if (c) post = db.prepare('SELECT * FROM square_post WHERE id = ?').get(c.post_id)
    }
    if (!post) post = db.prepare('SELECT * FROM square_post WHERE id = ?').get(r.target_id) || null

    // ② 下架：有对应记忆就按「取消分享」处理，没有就只把动态本身置为不可见
    let memoryId = 0
    let title = ''
    let authorId = 0
    if (post) {
      memoryId = Number(post.memory_id) || 0
      authorId = Number(post.user_id) || 0
      if (memoryId) {
        const m = db.prepare('SELECT id, title, content, space_id FROM memory_item WHERE id = ?').get(memoryId)
        if (m) {
          title = String(m.title || '').trim()
          if (!title) title = String(m.content || '').trim().split('\n')[0].slice(0, 24)
          db.prepare('UPDATE memory_item SET is_public = 0, shared_at = 0, updated_at = ? WHERE id = ?').run(t, memoryId)
          unprojectMemory(memoryId)
        }
      }
      // 兜底：投影不存在的动态也必须下架（否则还在广场列表里）
      db.prepare('UPDATE square_post SET is_public = 0, updated_at = ? WHERE id = ?').run(t, post.id)
      if (!title) title = String(post.content || '').trim().split('\n')[0].slice(0, 24) || `动态 #${post.id}`
    } else if (type === 3) {
      authorId = Number(r.target_id) || 0
      const u = db.prepare('SELECT username, nickname FROM user WHERE id = ?').get(authorId)
      title = u ? u.nickname || u.username : `用户 #${authorId}`
    }

    if (type === 3) {
      // 用户举报不做自动处置（禁言/封号要人工判断），只记处理意见并发通知
      db.prepare('UPDATE report SET status = 1, handle_note = ?, updated_at = ? WHERE id = ?').run(note, t, p.id)
    } else {
      db.prepare('UPDATE report SET status = 1, handle_note = ?, updated_at = ? WHERE id = ?').run(
        note ? `${note}（内容已下架）` : '内容已下架',
        t,
        p.id,
      )
    }

    // ③ 私信举报人：告诉他处理结果（不透露被举报人信息）
    const notified = []
    if (r.reporter_id) {
      const ok = sendSystemPm(
        p._uid,
        r.reporter_id,
        type === 3
          ? `你举报的用户已核实处理。处理说明：${note}。感谢你一起守护拾光。`
          : `你举报的内容已核实处理：「${title}」已下架。处理说明：${note}。感谢你一起守护拾光。`,
      )
      if (ok) notified.push(Number(r.reporter_id))
    }
    // ④ 私信被举报人：告诉他为什么被下架（匿名管理员署名，可直接回复）
    //    用户举报只做记录、不自动处置，所以不在这里通知当事人
    if (authorId && type !== 3) {
      const ok = sendSystemPm(
        p._uid,
        authorId,
        `你发布的「${title}」被举报后经核实已下架。处理说明：${note}。如果你有不同意见，可以直接回复这条私信说明情况。`,
      )
      if (ok) notified.push(authorId)
    }

    return { taken: true, type, post_id: post?.id || 0, memory_id: memoryId, title, notified }
  },

  // 活动管理
  'admin/activity/list': (p) => {
    isAdmin(p._uid)
    const rows = db.prepare('SELECT * FROM activity ORDER BY sort DESC, created_at DESC').all()
    const t = now()
    return rows.map((r) => {
      const likeCount = db.prepare('SELECT COUNT(*) as cnt FROM activity_like WHERE activity_id = ?').get(r.id).cnt
      const commentCount = db.prepare('SELECT COUNT(*) as cnt FROM activity_comment WHERE activity_id = ?').get(r.id).cnt
      const joinCount = db.prepare('SELECT COUNT(*) as cnt FROM activity_join WHERE activity_id = ?').get(r.id).cnt
      return { ...r, status: actStatus(r, t), likes: likeCount, comments: commentCount, joined: joinCount }
    })
  },
  // 公开活动列表(无需管理员), 返回含状态字段
  // ★ 2026-10-20 用户反馈两件事:
  //   1) 广场卡片一直显示「0 人已加入 / 0 评论」—— 这里原来只返回了 likes, 没返回
  //      comments / joined, 前端只能拿到 undefined 当 0 显示。管理中心那边是有的。
  //   2) 活动到结束时间要自动从广场消失 —— 所以在返回前把 status === 2 的过滤掉。
  //      (管理中心仍看得到, 那边有自己的列表接口)
  'activity/list': (_p, uid) => {
    const rows = db.prepare('SELECT * FROM activity WHERE is_public = 1 ORDER BY sort DESC, created_at DESC').all()
    const t = now()
    return rows
      .map((r) => {
        const likeCount = db.prepare('SELECT COUNT(*) as cnt FROM activity_like WHERE activity_id = ?').get(r.id).cnt
        const isLiked = uid
          ? !!db.prepare('SELECT 1 FROM activity_like WHERE activity_id = ? AND user_id = ?').get(r.id, uid)
          : false
        // 计数必须由服务端算: 前端没有权限也没有必要去逐个数
        const commentCount = db.prepare('SELECT COUNT(*) as cnt FROM activity_comment WHERE activity_id = ?').get(r.id).cnt
        const joinCount = db.prepare('SELECT COUNT(*) as cnt FROM activity_join WHERE activity_id = ?').get(r.id).cnt
        // 我是否已加入: 和 is_liked 一个道理, 不靠前端进弹窗再补问一次
        const isJoined = uid
          ? !!db.prepare('SELECT 1 FROM activity_join WHERE activity_id = ? AND user_id = ?').get(r.id, uid)
          : false
        return {
          ...r,
          status: actStatus(r, t),
          likes: likeCount,
          is_liked: isLiked,
          is_joined: isJoined,
          comments: commentCount,
          joined: joinCount,
        }
      })
      // 到结束时间就从广场消失; 未开始(start_time 在未来)的留着, 用户要能提前看到
      .filter((r) => r.status !== 2)
  },
  'admin/activity/create': (p) => {
    isAdmin(p._uid)
    if (!p.title) throw err('活动标题不能为空')
    if (!p.content) throw err('活动详情不能为空')
    const r = db
      .prepare(
        `INSERT INTO activity (title, content, cover, type, is_public, is_major, sort, start_time, end_time, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(p.title, p.content, p.cover || '', Number(p.type) || 1, p.is_public === 0 ? 0 : 1, p.is_major === 1 || p.is_major === true ? 1 : 0, Number(p.sort) || 0, p.start_time || null, p.end_time || null, now(), now())
    return db.prepare('SELECT * FROM activity WHERE id = ?').get(r.lastInsertRowid)
  },
  'admin/activity/update': (p) => {
    isAdmin(p._uid)
    const patch = {}
    for (const k of ['title', 'content', 'cover', 'type', 'is_public', 'is_major', 'sort', 'start_time', 'end_time']) {
      if (p[k] !== undefined) patch[k] = p[k]
    }
    patch.updated_at = now()
    const sets = Object.entries(patch).map(([k]) => `${k} = ?`)
    const vals = Object.values(patch)
    vals.push(p.id)
    db.prepare(`UPDATE activity SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return db.prepare('SELECT * FROM activity WHERE id = ?').get(p.id)
  },
  'admin/activity/remove': (p) => {
    isAdmin(p._uid)
    db.prepare('DELETE FROM activity WHERE id = ?').run(p.id)
    return { removed: true }
  },

  // 活动评论
  'activity/comment/list': (p) => {
    const rows = db.prepare(
      'SELECT ac.*, u.nickname, u.username FROM activity_comment ac LEFT JOIN user u ON ac.user_id = u.id WHERE ac.activity_id = ? ORDER BY ac.created_at ASC'
    ).all(p.activity_id)
    return rows.map(r => ({
      id: r.id,
      author: r.nickname || r.username || '匿名',
      content: r.content,
      image: r.image || null,
      created_at: r.created_at,
    }))
  },
  'activity/comment/create': (p, uid) => {
    if (!p.activity_id) throw err('活动ID不能为空')
    if (!p.content && !p.image) throw err('评论内容不能为空')
    db.prepare('INSERT INTO activity_comment (activity_id, user_id, content, image, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(p.activity_id, uid, p.content || '', p.image || '', now())
    return { ok: true }
  },

  // 活动加入/退出
  'activity/join': (p, uid) => {
    if (!p.activity_id) throw err('活动ID不能为空')
    const act = db.prepare('SELECT * FROM activity WHERE id = ?').get(p.activity_id)
    if (!act) throw err('活动不存在')
    if (actStatus(act, now()) === 2) throw err('活动已结束，无法加入')
    try {
      db.prepare('INSERT INTO activity_join (activity_id, user_id, created_at) VALUES (?, ?, ?)')
        .run(p.activity_id, uid, now())
    } catch {
      // UNIQUE 约束失败 = 已经加入
    }
    const joined = db.prepare('SELECT COUNT(*) as cnt FROM activity_join WHERE activity_id = ?').get(p.activity_id)
    return { joined: joined.cnt, isJoined: true }
  },
  'activity/unjoin': (p, uid) => {
    if (!p.activity_id) throw err('活动ID不能为空')
    db.prepare('DELETE FROM activity_join WHERE activity_id = ? AND user_id = ?').run(p.activity_id, uid)
    const joined = db.prepare('SELECT COUNT(*) as cnt FROM activity_join WHERE activity_id = ?').get(p.activity_id)
    return { joined: joined.cnt, isJoined: false }
  },
  'activity/checkJoin': (p, uid) => {
    if (!uid) return { isJoined: false, joined: 0 }
    const row = db.prepare('SELECT 1 FROM activity_join WHERE activity_id = ? AND user_id = ?').get(p.activity_id, uid)
    const joined = db.prepare('SELECT COUNT(*) as cnt FROM activity_join WHERE activity_id = ?').get(p.activity_id)
    return { isJoined: !!row, joined: joined.cnt }
  },

  // 活动点赞
  'activity/like': (p, uid) => {
    if (!p.activity_id) throw err('活动ID不能为空')
    try {
      db.prepare('INSERT INTO activity_like (activity_id, user_id, created_at) VALUES (?, ?, ?)')
        .run(p.activity_id, uid, now())
    } catch {
      // 已点过赞
    }
    const liked = db.prepare('SELECT COUNT(*) as cnt FROM activity_like WHERE activity_id = ?').get(p.activity_id)
    return { liked: liked.cnt, isLiked: true }
  },
  'activity/unlike': (p, uid) => {
    if (!p.activity_id) throw err('活动ID不能为空')
    db.prepare('DELETE FROM activity_like WHERE activity_id = ? AND user_id = ?').run(p.activity_id, uid)
    const liked = db.prepare('SELECT COUNT(*) as cnt FROM activity_like WHERE activity_id = ?').get(p.activity_id)
    return { liked: liked.cnt, isLiked: false }
  },
  'activity/checkLike': (p, uid) => {
    if (!uid) return { isLiked: false, liked: 0 }
    const row = db.prepare('SELECT 1 FROM activity_like WHERE activity_id = ? AND user_id = ?').get(p.activity_id, uid)
    const liked = db.prepare('SELECT COUNT(*) as cnt FROM activity_like WHERE activity_id = ?').get(p.activity_id)
    return { isLiked: !!row, liked: liked.cnt }
  },

  // 通知管理
  // ★ 只回最近 10 条: 通知是「发一封多一条」的, 不限制的话广场顶部会被历史通知刷满。
  'notification/list': (_p, uid) => {
    if (!uid) return []
    // 获取发送给当前用户的通知(含 user_id=0 的全局通知)
    return db
      .prepare('SELECT * FROM notification WHERE user_id = ? OR user_id = 0 ORDER BY created_at DESC LIMIT 10')
      .all(uid)
  },
  'notification/send': (p, uid) => {
    isAdmin(uid)
    if (!p.title) throw err('通知标题不能为空')
    if (!p.content) throw err('通知内容不能为空')
    // 获取所有用户
    const users = db.prepare('SELECT id FROM user').all()
    // 为每个用户创建通知记录
    const stmt = db.prepare(
      'INSERT INTO notification (user_id, title, content, created_at) VALUES (?, ?, ?, ?)'
    )
    const nowTs = now()
    for (const user of users) {
      stmt.run(user.id, p.title, p.content, nowTs)
    }
    return { sent: true, count: users.length }
  },
  // 管理端通知列表: 群发是「每个用户插一行」, 直接 SELECT * 会把同一条通知列出 N 份,
  // 所以按 (title, content, created_at) 归并成一条, 附带接收人数。
  'admin/notification/list': (p) => {
    isAdmin(p._uid)
    return db
      .prepare(
        `SELECT MIN(id) AS id, title, content, created_at, COUNT(*) AS recv_count
         FROM notification
         GROUP BY title, content, created_at
         ORDER BY created_at DESC`
      )
      .all()
  },
  // 删除整批(所有用户的那几行), 不然只删掉管理员自己那份, 广场上别人还在看。
  'admin/notification/remove': (p) => {
    isAdmin(p._uid)
    const row = db.prepare('SELECT title, content, created_at FROM notification WHERE id = ?').get(p.id)
    if (!row) return { removed: true, count: 0 }
    const r = db
      .prepare('DELETE FROM notification WHERE title = ? AND content = ? AND created_at = ?')
      .run(row.title, row.content, row.created_at)
    return { removed: true, count: r.changes }
  },

  // 私信操作
  'message/reply': (p, uid) => {
    if (!p.id) throw err('消息 ID 不能为空')
    if (!p.reply) throw err('回复内容不能为空')
    db.prepare('UPDATE notification SET reply = ? WHERE id = ? AND user_id = ?').run(p.reply, p.id, uid)
    return { replied: true }
  },
  'message/save': (p, uid) => {
    if (!p.id) throw err('消息 ID 不能为空')
    db.prepare('UPDATE notification SET saved = ? WHERE id = ? AND user_id = ?').run(p.saved ? 1 : 0, p.id, uid)
    return { saved: p.saved }
  },
  'message/delete': (p, uid) => {
    if (!p.id) throw err('消息 ID 不能为空')
    db.prepare('DELETE FROM notification WHERE id = ? AND user_id = ?').run(p.id, uid)
    return { deleted: true }
  },

  // 私信
  'pm/send': (p, uid) => {
    // ★ receiver_id=0 是「回复拾光管理员」：管理员私信是匿名的，前端拿到的是 0，
    //   这里翻译成最近那条系统私信的真实发信人，用户仍然能回话（但看不到是谁）。
    let receiverId = Number(p.receiver_id)
    if (receiverId === 0) {
      const last = db
        .prepare(
          `SELECT sender_id FROM private_message
            WHERE receiver_id = ? AND sender_label <> '' ORDER BY id DESC LIMIT 1`
        )
        .get(uid)
      if (!last) throw err('接收人不能为空')
      receiverId = last.sender_id
    }
    if (!p.receiver_id && !receiverId) throw err('接收人不能为空')
    if (!Number.isInteger(receiverId) || receiverId <= 0) throw err('接收人不存在')
    if (receiverId === uid) throw err('不能给自己发私信')
    const content = String(p.content ?? '').trim()
    if (!content) throw err('消息内容不能为空')
    if (content.length > PM_MAX_LEN) throw err(`私信不能超过 ${PM_MAX_LEN} 个字`)
    const receiver = getUser(receiverId)
    if (!receiver) throw err('接收人不存在')
    // 按 uid 限流: 比 IP 限流更难绕过, 也顺带挡掉前端防抖失效时的连点
    if (!rateLimit(`pm|${uid}`, PM_RATE_PER_MIN, 60_000)) throw err('发得太快了, 歇一会儿再发吧')
    const createdAt = now()
    const info = db
      .prepare('INSERT INTO private_message (sender_id, receiver_id, content, created_at) VALUES (?, ?, ?, ?)')
      .run(uid, receiverId, content, createdAt)
    // 回传 id/时间, 前端可原地追加气泡, 不必为了看到自己刚发的话再拉一次历史
    return { sent: true, id: Number(info.lastInsertRowid), created_at: createdAt }
  },
  'pm/list': (p, uid) => {
    // 获取与某人的对话记录
    const otherId = Number(p.user_id) || 0
    if (!otherId || otherId === uid) {
      // 获取所有消息（最近 50 条）
      return maskSystemPm(
        db
          .prepare(
            `SELECT pm.*, s.username AS sender_username, s.nickname AS sender_nickname,
                r.username AS receiver_username, r.nickname AS receiver_nickname
         FROM private_message pm
         LEFT JOIN user s ON s.id = pm.sender_id
         LEFT JOIN user r ON r.id = pm.receiver_id
         WHERE pm.sender_id = ? OR pm.receiver_id = ?
         ORDER BY pm.created_at DESC, pm.id DESC LIMIT 50`,
          )
          .all(uid, uid),
      )
    }
    // 获取与特定用户的对话: 取最近 N 条再按时间正序输出, 长对话不会把响应撑大
    return maskSystemPm(
      db
        .prepare(
          `SELECT * FROM (
         SELECT pm.*, s.username AS sender_username, s.nickname AS sender_nickname,
                r.username AS receiver_username, r.nickname AS receiver_nickname
         FROM private_message pm
         LEFT JOIN user s ON s.id = pm.sender_id
         LEFT JOIN user r ON r.id = pm.receiver_id
         WHERE (pm.sender_id = ? AND pm.receiver_id = ?) OR (pm.sender_id = ? AND pm.receiver_id = ?)
         ORDER BY pm.created_at DESC, pm.id DESC
         LIMIT ${PM_THREAD_LIMIT}
       ) ORDER BY created_at ASC, id ASC`,
        )
        .all(uid, otherId, otherId, uid),
    )
  },
  'pm/markRead': (p, uid) => {
    // 标记某人发来的消息为已读，user_id=0 表示标记所有为已读
    if (!p.user_id) {
      db.prepare('UPDATE private_message SET is_read = 1 WHERE receiver_id = ? AND is_read = 0').run(uid)
    } else {
      db.prepare('UPDATE private_message SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0')
        .run(p.user_id, uid)
    }
    return { ok: true }
  },
  'pm/unreadCount': (_p, uid) => {
    const cnt = db.prepare('SELECT COUNT(*) as cnt FROM private_message WHERE receiver_id = ? AND is_read = 0').get(uid).cnt
    return { count: cnt }
  },
  'pm/delete': (p, uid) => {
    // 硬删除：id=0 表示批量删除，direction 指定方向；否则删除指定 id
    if (!p.id) {
      if (p.direction === 'sent') {
        db.prepare('DELETE FROM private_message WHERE sender_id = ?').run(uid)
      } else if (p.direction === 'received') {
        db.prepare('DELETE FROM private_message WHERE receiver_id = ?').run(uid)
      } else {
        db.prepare('DELETE FROM private_message WHERE sender_id = ? OR receiver_id = ?').run(uid, uid)
      }
    } else {
      db.prepare('DELETE FROM private_message WHERE id = ? AND (sender_id = ? OR receiver_id = ?)').run(p.id, uid, uid)
    }
    return { ok: true }
  },


  // 用户管理
  // ★ 2026-10-29 安全修复（对应验证报告 FIND-02，P2）：本接口不再返回任何口令内容。
  //   以前 decryptPassword() 之后把**明文口令**回给前端，任何管理员打开「用户管理」
  //   就能看到所有人的密码、进而登录成任意账号（超管当时是单独豁免的，普通用户全裸）。
  //   现在 SQL 里就不选 password_enc / wechat_uid 这两列，只在库里算成布尔值下发，
  //   密文与 openid 都不进内存、不进 JSON —— 靠 `undefined` 抹字段并不保险
  //   （`'password' in obj` 仍为 true，序列化前被别处展开就会漏）。
  'admin/user/list': (p) => {
    isAdmin(p._uid)
    const cols = `id, username, nickname, avatar, email, phone, role, status, ai_chat, ai_image, ai_video, created_at,
      (password_enc IS NOT NULL) AS has_password, (wechat_uid IS NOT NULL) AS is_wechat`
    const keyword = p.keyword || ''
    const mapPwd = (r) => ({
      ...r,
      // 微信扫码免注册的账号: 管理中心据此打「微信」标签并单独分类
      is_wechat: !!r.is_wechat,
      has_password: !!r.has_password,
    })
    if (keyword) {
      return db
        .prepare(
          `SELECT ${cols}
           FROM user WHERE username LIKE ? OR nickname LIKE ? OR phone LIKE ? ORDER BY created_at DESC`
        )
        .all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
        .map(mapPwd)
    }
    return db
      .prepare(`SELECT ${cols} FROM user ORDER BY created_at DESC`)
      .all()
      .map(mapPwd)
  },
  // 管理员为指定用户设置新密码。新密码是管理员自己定的, 明文回显一次;
  // 同时存可逆密文, 之后管理员列表里也能看到这个密码。
  'admin/user/resetPassword': (p, uid) => {
    const admin = isAdmin(uid)
    const target = getUser(p.id)
    if (!target) throw err('用户不存在')
    // 超级管理员的密码不可重置 —— 连他本人也不行(2026-10-21 用户明确要求)。
    // 这样就不存在「拿到超管账号后改密码锁死原主人」这条路。
    if (target.username === SUPER_ADMIN) throw err('超级管理员的密码不可重置')
    const pwd = String(p.password || '')
    if (pwd.length < 6) throw err('新密码至少 6 位')
    if (pwd.length > 64) throw err('新密码过长')
    const hash = hashPassword(pwd)
    db.prepare('UPDATE user SET password = ?, password_enc = ?, updated_at = ? WHERE id = ?').run(
      hash,
      encryptPassword(pwd),
      now(),
      target.id
    )
    return { ok: true, id: target.id, username: target.username, password: pwd, password_hash: hash }
  },
  'admin/user/update': (p) => {
    const admin = isAdmin(p._uid)
    const target = getUser(p.id)
    if (!target) throw err('用户不存在')
    // 超级管理员账号受保护: 只有它本人能改自己的状态/昵称
    if (target.username === SUPER_ADMIN && admin.username !== SUPER_ADMIN) {
      throw err('无权修改超级管理员')
    }
    // 但「禁用」这条对它彻底封死(本人也不行): 禁用会让最高权限账号直接失效
    if (target.username === SUPER_ADMIN && p.status !== undefined && Number(p.status) === 0) {
      throw err('超级管理员不可被禁用')
    }
    const patch = {}
    if (p.status !== undefined) patch.status = Number(p.status) ? 1 : 0
    if (p.nickname !== undefined) patch.nickname = p.nickname
    patch.updated_at = now()
    const sets = Object.entries(patch).map(([k]) => `${k} = ?`)
    const vals = Object.values(patch)
    // 禁用账号时自增 token_epoch, 让该用户已登录的会话立即失效
    if (patch.status === 0) {
      sets.push('token_epoch = token_epoch + 1')
    }
    vals.push(p.id)
    db.prepare(`UPDATE user SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    return db.prepare('SELECT id, username, nickname, role, status FROM user WHERE id = ?').get(p.id)
  },
  'admin/user/setAdmin': (p) => {
    const admin = isAdmin(p._uid)
    // 只有超级管理员可以设置/取消管理员
    if (admin.username !== SUPER_ADMIN) throw err('只有超级管理员可以设置管理员')
    if (p.id === admin.id) throw err('不能修改自己的管理员状态')
    const target = getUser(p.id)
    if (!target) throw err('用户不存在')
    const role = p.role ? 1 : 0
    // 超级管理员这一行永远保持管理员身份(它的权限不依赖 role, 但界面上不能出现"取消"这种假操作)
    if (target.username === SUPER_ADMIN) throw err('超级管理员不可被取消管理员身份')
    db.prepare('UPDATE user SET role = ?, updated_at = ? WHERE id = ?').run(role, now(), p.id)
    return db.prepare('SELECT id, username, nickname, role FROM user WHERE id = ?').get(p.id)
  },
  'admin/user/remove': (p) => {
    const admin = isAdmin(p._uid)
    if (p.id === admin.id) throw err('不能删除自己')
    const target = getUser(p.id)
    if (target && target.username === SUPER_ADMIN) throw err('不能删除超级管理员')
    // 先删除该用户发送的私信，避免 CASCADE 删除对方的私信
    db.prepare('DELETE FROM private_message WHERE sender_id = ?').run(p.id)
    db.prepare('DELETE FROM user WHERE id = ?').run(p.id)
    return { removed: true }
  },

  // ---- AI 密钥管理(只有超级管理员能看/能改) ----
  // 返回的永远是掩码: 前端拿不到明文密钥, 只能知道"配没配、配的是后台还是 .env"。
  'admin/ai/keys': (p) => {
    mustSuperAdmin(p._uid)
    const keys = Object.keys(AI_KEY_META).map((kind) => {
      const dbVal = String(aiKeyCache.get(kind) || '').trim()
      const envVal = String(process.env[AI_KEY_META[kind].env] || '').trim()
      const active = dbVal || envVal
      return {
        kind,
        label: AI_KEY_META[kind].label,
        desc: AI_KEY_META[kind].desc,
        env: AI_KEY_META[kind].env,
        set: !!active,
        // db = 后台设置优先; env = 当前用的是 .env; '' = 还没配
        source: dbVal ? 'db' : envVal ? 'env' : '',
        masked: maskKey(active),
      }
    })
    return { keys }
  },
  // 保存/清除某个密钥。value 为空 = 清除后台设置, 回落到 .env。
  // 改完立刻写内存缓存, 下一次 AI 调用就用新密钥, 不需要重启服务。
  'admin/ai/keys/set': (p) => {
    mustSuperAdmin(p._uid)
    const kind = String(p.kind || '')
    if (!AI_KEY_META[kind]) throw err('未知的密钥类型')
    const val = String(p.value ?? '').trim()
    if (val && /\s/.test(val)) throw err('密钥里不能有空格或换行')
    if (val && (val.length < 8 || val.length > 400)) throw err('密钥长度看起来不对(8~400 个字符)')
    if (val) {
      db.prepare('INSERT OR REPLACE INTO app_secret (k, v, updated_at) VALUES (?, ?, ?)').run(kind, val, now())
      aiKeyCache.set(kind, val)
    } else {
      db.prepare('DELETE FROM app_secret WHERE k = ?').run(kind)
      aiKeyCache.delete(kind)
    }
    return { ok: true, kind, source: (aiKeyCache.get(kind) || '').trim() ? 'db' : 'env' }
  },

  // ---- AI 使用管理(管理中心「AI 使用」) ----
  // 读总开关。只读不写, 管理员打开标签页时拉一次
  'admin/ai/config': (p) => {
    isAdmin(p._uid)
    return aiGlobal()
  },
  // 改总开关: 只传要改的那一项(如 { reply: false }), 服务端按级联规则算出最终态一并落库
  // 级联分两层: 「显式开启」向上带(开生图带开回复/开生视频带开回复+生图),
  // 「最终态一致性」向下压(回复关则生图/生视频必关, 生图关则生视频必关)。
  // 两层必须分开判断 —— 向上带只看本次请求显式开启了什么, 否则关回复会被旧的开着
  // 的生图状态又翻回去(实测踩过的坑)。
  'admin/ai/setConfig': (p) => {
    isAdmin(p._uid)
    const toBool = (v) => Boolean(Number(v))
    const req = {
      reply: p.reply !== undefined ? toBool(p.reply) : null,
      image: p.image !== undefined ? toBool(p.image) : null,
      video: p.video !== undefined ? toBool(p.video) : null,
    }
    const cur = aiGlobal()
    const next = {
      reply: req.reply ?? cur.reply,
      image: req.image ?? cur.image,
      video: req.video ?? cur.video,
    }
    // 向上带(仅显式开启时)
    if (req.image === true) next.reply = true // 开生图 -> 自动开自动回复
    if (req.video === true) {
      next.reply = true // 开生视频 -> 自动开自动回复 + 生图
      next.image = true
    }
    // 向下压(始终强制, 保证存进库里的组合永远自洽)
    if (!next.reply) {
      next.image = false // 关自动回复 -> 生图/生视频一并关
      next.video = false
    }
    if (!next.image) next.video = false // 关生图 -> 生视频一并关
    setSysCfg('ai_reply', next.reply)
    setSysCfg('ai_image', next.image)
    setSysCfg('ai_video', next.video)
    return next
  },
  // 单个用户的 AI 权限: { id, kind: 'chat' | 'image', value: 0 | 1 }
  // ---------- AI 生成视频: 每条记忆仅一个, 生成即永久保存 ----------
  // 提交任务: 用这条记忆的 AI 封面 + 标题/内容, 让画面动起来(固定 5 秒)
  'ai/video/create': async (p, uid, req) => {
    guard(req, 'ai/video/create', 6, 60_000, '视频生成请求过于频繁, 请稍后再试')
    if (!uid) throw err('请先登录后再生成视频')
    // 管理员总开关 + 用户级权限双重闸门; 不给通过时不消耗额度
    if (!aiAllowed(uid, 'video')) throw err('AI 生视频功能已被管理员限制, 如有疑问请联系管理员')
    if (!keyDashscope()) throw err('服务端未配置 DASHSCOPE_API_KEY')
    const item = mustItemOwner(p.id, uid)
    // 一条记忆只生成一个视频: 已有成品 / 已有进行中的任务都不重复提交
    if (item.ai_video) throw err('这条记忆已经生成过视频了(视频永久保存, 不可更改或删除)')
    // 用户自己上传过视频的记忆: AI 生视频自动禁止
    const userVideo = db
      .prepare('SELECT id FROM memory_media WHERE memory_id = ? AND type = 3 LIMIT 1')
      .get(item.id)
    if (userVideo) throw err('这条记忆已上传了自己的视频, 无需 AI 生成')
    if (item.ai_video_task) return { status: 'running', taskId: item.ai_video_task }
    if (!takeQuota('video', uid, AI_DAILY_VIDEO_LIMIT)) {
      throw err('今日 AI 视频额度已用完, 明天再来吧')
    }
    // 时长可控制: 只认 5/10 秒, 其它值一律按 5 秒
    const duration = Number(p.duration) === 10 ? 10 : 5
    // 首帧参考优先级: 用户自己上传的照片 > AI 封面
    const img = (await userPhotoToDataUrl(item.id)) || (await coverToDataUrl(item))
    const title = String(item.title || '').slice(0, 40)
    const content = String(item.content || '').slice(0, 160)
    const prompt = [
      '把这段记忆自然地变成一段温柔流动的生活片段: 从第一幅画面过渡到结尾画面,',
      '光线与时刻缓缓变化, 微风与细小景物轻轻晃动, 镜头缓慢移动, 保持水彩插画质感。',
      '不要出现文字、水印、字幕和突兀的剪辑, 整体安静治愈。',
      title ? `记忆标题: ${title}。` : '',
      content ? `记忆内容: ${content}。` : '',
    ]
      .filter(Boolean)
      .join('')
    // 智谱按标题+正文再生成一张「完全不同」的结尾画面, 与封面组成首尾帧(失败则退回单帧)
    const tail = await makeTailFrame(title, content)
    const submitVideo = (input) =>
      dashscopePost(
        '/api/v1/services/aigc/video-generation/video-synthesis',
        { model: DASHSCOPE_I2V_MODEL, input, parameters: { duration } },
        { async: true }
      )
    let json
    try {
      // 优先首尾帧: 封面做第一帧, 智谱新画面做结尾帧
      json = await submitVideo(tail ? { prompt, img_url: img, img_tail_url: tail } : { prompt, img_url: img })
    } catch (e) {
      // 模型不支持首尾帧等提交期错误: 退回只用封面的单帧生成
      if (!tail) throw e
      json = await submitVideo({ prompt, img_url: img })
    }
    const taskId = json?.output?.task_id
    if (!taskId) throw err('视频任务提交失败, 请稍后再试')
    db.prepare('UPDATE memory_item SET ai_video_task = ?, updated_at = ? WHERE id = ?').run(
      taskId,
      now(),
      item.id
    )
    return { status: 'running', taskId }
  },

  // 轮询任务状态: 成功后转存本地并写回 ai_video(之后前端就能在电视里看到)
  'ai/video/sync': async (p, uid, req) => {
    guard(req, 'ai/video/sync', 60, 60_000, '查询过于频繁, 请稍后再试')
    if (!uid) throw err('请先登录')
    const item = mustItemOwner(p.id, uid)
    if (item.ai_video) return { status: 'done', video: item.ai_video }
    if (!item.ai_video_task) return { status: 'none' }
    const t = await dashscopeFetchTask(item.ai_video_task)
    if (t.status === 'SUCCEEDED') {
      const video = await saveVideoToDisk(t.videoUrl, item.id, req)
      db.prepare('UPDATE memory_item SET ai_video = ?, ai_video_task = ?, updated_at = ? WHERE id = ?').run(
        video,
        '',
        now(),
        item.id
      )
      return { status: 'done', video }
    }
    // 失败/被拒审/取消: 清掉任务号, 允许在配额内重试(此时还没有成品, 不算「生成过」)
    if (['FAILED', 'CANCELED', 'CANCELLED', 'UNKNOWN'].includes(t.status)) {
      db.prepare('UPDATE memory_item SET ai_video_task = ?, updated_at = ? WHERE id = ?').run('', now(), item.id)
      return { status: 'failed', message: t.message || '视频生成失败, 请重新生成' }
    }
    return { status: 'running' }
  },

  'admin/user/setAiPerm': (p) => {
    const admin = isAdmin(p._uid)
    const target = getUser(p.id)
    if (!target) throw err('用户不存在')
    if (target.username === SUPER_ADMIN && admin.username !== SUPER_ADMIN) {
      throw err('无权修改超级管理员')
    }
    if (target.username === SUPER_ADMIN) throw err('超级管理员的 AI 权限不受限制')
    const col =
      p.kind === 'image' ? 'ai_image' : p.kind === 'chat' ? 'ai_chat' : p.kind === 'video' ? 'ai_video' : null
    if (!col) throw err('参数不正确(kind 应为 chat / image / video)')
    db.prepare(`UPDATE user SET ${col} = ?, updated_at = ? WHERE id = ?`).run(
      Number(p.value) ? 1 : 0,
      now(),
      target.id
    )
    return db
      .prepare('SELECT id, username, nickname, ai_chat, ai_image, ai_video FROM user WHERE id = ?')
      .get(target.id)
  },

  // ---- 数据搬运 ----
  // 重新发布会把本地 server/data/timepick.db 一起传上去覆盖线上库,
  // 这两个接口用来在发布前把线上数据拉下来、以及把快照灌回线上。
  'admin/data/export': (p) => {
    isAdmin(p._uid)
    const all = listTables()
    const want = Array.isArray(p.tables) && p.tables.length ? p.tables.filter((t) => all.includes(t)) : all
    const tables = {}
    let rows = 0
    for (const t of want) {
      const list = db.prepare(`SELECT * FROM "${t}"`).all()
      tables[t] = list
      rows += list.length
    }
    return { tables, rows, tableCount: want.length, exported_at: now() }
  },
  'admin/data/import': (p) => {
    isAdmin(p._uid)
    const src = p.tables
    if (!src || typeof src !== 'object') throw err('数据格式不正确(需要 tables 对象)')
    const mode = p.mode === 'replace' ? 'replace' : 'merge'
    // replace 会先清空同名表, 必须显式二次确认
    if (mode === 'replace' && p.confirm !== 'REPLACE') throw err('replace 模式需要传 confirm: "REPLACE"')

    const all = listTables()
    const names = Object.keys(src).filter((t) => all.includes(t) && Array.isArray(src[t]))
    if (!names.length) throw err('没有可导入的表')

    // 导入期间可能暂时违反外键顺序(先导入子表再导入父表), 临时关掉约束
    const fkOff = () => { try { db.pragma('foreign_keys = OFF') } catch { /* 驱动不支持时忽略 */ } }
    const fkOn = () => { try { db.pragma('foreign_keys = ON') } catch { /* 同上 */ } }

    const applied = {}
    const failures = []
    fkOff()
    try {
      for (const t of names) {
        const rows = src[t]
        if (!rows.length) {
          applied[t] = 0
          continue
        }
        if (mode === 'replace') db.exec(`DELETE FROM "${t}"`)
        const cols = Object.keys(rows[0]).filter((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c))
        const verb = mode === 'replace' ? 'REPLACE' : 'IGNORE'
        const sql = `INSERT OR ${verb} INTO "${t}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
        const stmt = db.prepare(sql)
        let n = 0
        for (const r of rows) {
          try {
            const info = stmt.run(...cols.map((c) => (r[c] === undefined ? null : r[c])))
            // INSERT OR IGNORE 撞主键时不报错但也没写进去, 不能算成功;
            // 驱动不返回 changes 时(内置/WASM)乐观计 1
            const changed = info && typeof info.changes === 'number' ? info.changes : 1
            if (changed > 0) n++
          } catch (e) {
            if (failures.length < 10) failures.push(`${t}: ${e?.message || e}`)
          }
        }
        applied[t] = n
      }
    } finally {
      fkOn()
    }
    return { applied, mode, failures, imported_at: now() }
  },
}

const PUBLIC_ACTIONS = new Set([
  'system/health',
  // 出口回声探针: 只回报自己的请求有没有带认证头, 不需要登录也不会泄露任何东西
  'debug/echo-header',
  'room3d/warmup-list',
  'auth/register',
  'auth/login',
  // 微信扫码登录: 此刻本地还没有 token, 身份由请求体里的云端 accessToken 换来
  'auth/wechat-login',
  'share/view',
  'square/post/list',
  'square/post/detail',
  'square/comment/list',
  'activity/list',
  'activity/comment/list',
  // 广场本身免登录可浏览, 侧栏「推荐记忆空间」「可能认识的人」与作者资料卡
  // 如果要求登录会 401 静默失败(前端各自 catch 成空数组), 整个侧栏就空了。
  // 这三个都只返回公开资料(昵称/公开条数/赞数/关注数), 不含登录名等凭证信息。
  'space/recommend',
  'user/random',
  'user/stats',
  // 广场顶部「官方通知」公告条的数据源。免登录可看(未登录时 handler 直接返回 []),
  // 和 activity/list 一致: 广场本身免登录可浏览, 少一个 401 静默失败的可能。
  'notification/list',
])

// token -> uid: 校验签名、有效期, 并比对 token_epoch(改密/禁用后旧 token 立即失效)
function authUid(token) {
  const payload = verifyToken(token)
  if (!payload) return 0
  const u = db.prepare('SELECT id, status, token_epoch FROM user WHERE id = ?').get(payload.uid)
  if (!u || u.status !== 1) return 0
  if ((u.token_epoch | 0) !== payload.e) return 0
  return u.id
}

// ---------------- 入口 ----------------
app.post('/api', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const action = typeof body.action === 'string' ? body.action : ''
  const params = body.params && typeof body.params === 'object' && !Array.isArray(body.params) ? body.params : {}
  const token = typeof body.token === 'string' ? body.token : ''

  const handler = handlers[action]
  if (!handler) return res.json({ code: 404, msg: '未知 action: ' + action, data: null })

  const uid = authUid(token)
  if (!PUBLIC_ACTIONS.has(action) && !uid) {
    return res.json({ code: 401, msg: '未登录或登录已过期', data: null })
  }
  try {
    // 注入 _uid 到 params, 供 admin handler 使用
    params._uid = uid
    const data = await handler(params, uid, req)
    return res.json({ code: 0, msg: 'ok', data: data ?? null })
  } catch (e) {
    // 只有业务错误的文案能原样回显; 其余异常一律替换为通用文案,
    // 避免把堆栈/路径/SQL 细节泄漏给客户端, 真实原因只在服务端日志里
    const safe = e?.isBiz ? e.message || '服务器内部错误' : '服务器内部错误'
    if (!e?.isBiz) console.error(`[api:${action}]`, e)
    return res.json({ code: 500, msg: safe, data: null })
  }
})

// ---------------- 生产: 单端口同时托管前端 ----------------
// 本地开发时前端跑在 vite(5173)、后端在 8787 两个端口; 上线环境只给一个端口,
// 所以这里让 Express 顺带把 `npm run build` 的产物管出来, 并对 history 路由做兜底。
// dist 是 vite 的默认产物目录; webroot* 是给部署用的备选(有些平台会把 dist 当构建产物排除)。
// webroot2/3/... 是 scripts/copy-webroot.mjs 在「webroot 被系统锁住写不进去」时的降级目标,
// 两份清单必须保持一致(改一处就要改另一处)。
const webRoot = [
  path.join(__dirname, '..', 'dist'),
  path.join(__dirname, '..', 'webroot'),
  path.join(__dirname, '..', 'webroot2'),
  path.join(__dirname, '..', 'webroot3'),
  path.join(__dirname, '..', 'webroot4'),
  path.join(__dirname, '..', 'webroot5'),
].find((d) => fs.existsSync(path.join(d, 'index.html')))
/** 弱 ETag：体积 + 修改时间。静态文件不会被就地改写，够用来做 304 */
const etagFor = (st) => `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`

/** 静态文件的缓存策略（express.static 与下面的 gzip 中间件共用同一套规则） */
function setStaticHeaders(res, rel) {
  if (/^assets\/[^/]+\.(js|css|woff2?|ttf|png|jpe?g|webp|svg)$/i.test(rel)) {
    // 文件名里带内容 hash，可以放心永久缓存
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  } else if (/(^|\/)index\.html$/i.test(rel)) {
    // ★ 入口页绝对不能缓存：发版后旧 index.html 会去引用已经删掉的 chunk，
    //   表现就是控制台一串加载失败 + 白屏。3D 房间的 index.html 同理。
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
  } else if (/^room3d\/(assets|cocos-js|src)\//i.test(rel)) {
    // 3D 房间的资源：文件名是「uuid@内容hash」，内容变了 hash 才变，
    // 所以能放心长缓存 —— 房间首开要下几十 MB，第二次开始必须走缓存才有救。
    // 用 7 天而不是 1 年：万一以后改了贴图但 hash 没变，一周后也能自动纠正回来。
    // ⚠ 入口（index.html / settings.json / config.json / application.js）不在此列。
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400')
  } else {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
  }
}

// ---- 3D 房间的传输层加速 ----
// 首开实测 167 个请求 100.7MB，其中 52MB 是 glTF 的 mesh(.bin)、还有几 MB 的 js/json。
// 这类「文本/浮点数组」gzip 能压掉 60%~75%，而 png/jpg/webp 本身已经是压缩格式，
// 压了没收益还白烧 CPU —— 所以只对下面这些后缀开 gzip。
const GZIP_EXT = /\.(js|mjs|cjs|json|css|html?|svg|xml|txt|wasm|bin|gltf|fbx|obj|mtl|glsl|vert|frag|map)$/i
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif)$/i
const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.gltf': 'model/gltf+json',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}
/**
 * 运行期压缩的兜底缓存：只对「没有 .br 旁挂文件」的资源生效。
 *
 * ★ 正常情况应该走预压缩：scripts/precompress-static.mjs 在构建期就生成好了 .br，
 *   请求路径上只剩读文件。这里的同步压缩是兜底（比如新上传的、没跑过预压缩的目录），
 *   它是**同步**的、会卡事件循环，所以只在真的没有旁挂文件时才用，且只压一次。
 * 实测 4.48MB 的 mesh：gzip L6 → 2.03MB(72ms)、brotli q5 → 1.70MB(114ms)、
 * brotli q11 → 1.59MB(约 600ms，所以只能放在构建期跑)。
 */
const gzipCache = new Map()
const GZIP_CACHE_MAX = 192

/** 预压缩旁挂文件：命中就直接发，零 CPU。返回 null 表示没有。 */
function precompressed(file, mtimeMs, enc) {
  if (enc !== 'br') return null
  const br = file + '.br'
  try {
    const bst = fs.statSync(br)
    // 源文件比 .br 新 → 预压缩过期了，宁可走运行期压缩也不发旧内容
    if (bst.isFile() && bst.mtimeMs >= mtimeMs) return { buf: fs.readFileSync(br), mtimeMs: bst.mtimeMs }
  } catch {
    /* 没有旁挂文件 */
  }
  return null
}

function encodedFor(file, mtimeMs, enc) {
  const key = `${enc}|${file}|${mtimeMs}`
  const hit = gzipCache.get(key)
  if (hit) return hit
  const raw = fs.readFileSync(file)
  const buf =
    enc === 'br' ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.gzipSync(raw, { level: 6 })
  if (gzipCache.size >= GZIP_CACHE_MAX) gzipCache.delete(gzipCache.keys().next().value)
  gzipCache.set(key, buf)
  return buf
}

/** 按文件头判断图片真实格式（贴图可能被优化成 WebP 但仍叫 .png，见 optimize-room3d.mjs） */
function sniffImageType(file) {
  try {
    const fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(12)
    fs.readSync(fd, buf, 0, 12, 0)
    fs.closeSync(fd)
    if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp'
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
    if (buf[0] === 0x89 && buf.subarray(1, 4).toString('ascii') === 'PNG') return 'image/png'
    if (buf.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif'
  } catch {
    /* 读不到就按扩展名猜 */
  }
  return ''
}


if (webRoot) {
  // 放在 express.static 之前：命中的直接发走，没命中的交给下面的 static 正常处理。
  // 覆盖 ETag/304 与 Range 之外的常规静态请求，行为与 express.static 一致。
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.headers.range || req.headers['if-range']) return next()
    let rel
    try {
      rel = decodeURIComponent(req.path.replace(/^\/+/, ''))
    } catch {
      return next()
    }
    if (!rel || rel.includes('..')) return next()
    const file = path.join(webRoot, rel)
    if (!file.startsWith(webRoot)) return next()
    let st
    try {
      st = fs.statSync(file)
    } catch {
      return next()
    }
    if (!st.isFile()) return next()
    const ext = path.extname(file).toLowerCase()
    if (!GZIP_EXT.test(ext) && !IMAGE_EXT.test(ext)) return next()

    setStaticHeaders(res, rel.split(path.sep).join('/'))

    if (IMAGE_EXT.test(ext)) {
      // 贴图可能是 WebP 却仍叫 .png：必须按真实内容回 Content-Type，否则解码会失败
      res.setHeader('Content-Type', sniffImageType(file) || MIME[ext] || 'application/octet-stream')
      if (req.headers['if-none-match'] === etagFor(st)) {
        res.statusCode = 304
        return res.end()
      }
      res.setHeader('ETag', etagFor(st))
      res.setHeader('Content-Length', st.size)
      if (req.method === 'HEAD') return res.end()
      return fs.createReadStream(file).pipe(res)
    }

    const ae = String(req.headers['accept-encoding'] || '')
    const enc = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : ''
    if (!enc || st.size < 1024) return next()
    const pre = precompressed(file, st.mtimeMs, enc)
    const tag = etagFor(st)
    // ETag 必须区分编码变体，否则缓存会拿 br 的实体去应别的编码的条件请求
    const etag = pre ? tag.slice(0, -1) + '-br"' : tag
    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304
      return res.end()
    }
    res.setHeader('Vary', 'Accept-Encoding')
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
    res.setHeader('Content-Encoding', enc)

    const body = pre ? pre.buf : encodedFor(file, st.mtimeMs, enc)
    res.setHeader('ETag', etag)
    res.setHeader('Content-Length', body.length)
    if (req.method === 'HEAD') return res.end()
    return res.end(body)
  })
  app.use(
    express.static(webRoot, {
      extensions: ['html'],
      setHeaders(res, filePath) {
        const rel = path.relative(webRoot, filePath).split(path.sep).join('/')
        setStaticHeaders(res, rel)
      },
    }),
  )
}
/**
 * 3D 房间「后台预热」清单。
 *
 * 用户逛别的页面时，前端会照这份清单把房间启动必需的小文件悄悄下到 HTTP 缓存里，
 * 等真进房间时就少等几秒。刻意**只含引擎/主包/元数据**（cocos-js、src、main、
 * internal、resources/import 的 json），几十 MB 的贴图与 mesh 一律不列
 * —— 那些东西在用户正常浏览时偷偷下载，只会把别的页面拖慢。
 */
let warmupCache = { at: 0, list: null }
function room3dWarmupList() {
  if (!webRoot) return []
  if (warmupCache.list && Date.now() - warmupCache.at < 600_000) return warmupCache.list
  const base = path.join(webRoot, 'room3d')
  if (!fs.existsSync(path.join(base, 'index.html'))) return []
  const isWanted = (rel) =>
    /^(cocos-js|src)\//i.test(rel) ||
    /^assets\/(main|internal)\//i.test(rel) ||
    /^assets\/resources\/import\//i.test(rel)
  const out = []
  const walk = (dir, relDir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${e.name}` : e.name
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, rel)
      else if (isWanted(rel)) out.push({ url: `/room3d/${rel}`, bytes: fs.statSync(full).size })
    }
  }
  try {
    walk(base, '')
  } catch {
    return []
  }
  out.sort((a, b) => a.bytes - b.bytes)
  let total = 0
  const list = []
  for (const it of out) {
    if (total + it.bytes > 12 * 1024 * 1024 || list.length >= 200) break
    list.push(it)
    total += it.bytes
  }
  warmupCache = { at: Date.now(), list }
  return list
}

// SPA 兜底: `/index/memory` 这种地址在静态目录里没有对应文件, 不回落的话用户刷新子页面就是 404
// 静态资源(带扩展名)和 /room3d/** 例外: 找不到就老老实实 404。
// ★ 以前把它们也回落成 index.html, 结果 3D 房间缺一个资源时浏览器会把 HTML 当 JS 解析,
//   控制台报 net::ERR_HTTP2_PROTOCOL_ERROR / Unexpected token '<', 画面只剩星空黑屏。
const ASSET_EXT_RE =
  /\.(js|mjs|css|json|bin|wasm|png|jpe?g|webp|gif|svg|ico|mp3|mp4|wav|ogg|ttf|otf|woff2?|map|txt)$/i
app.use((req, res, next) => {
  // 只兜底页面导航; API 与静态资源不能返回 HTML
  if (req.method !== 'GET') return next()
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next()
  if (!webRoot) return next()
  if (req.path.startsWith('/room3d/') || ASSET_EXT_RE.test(req.path)) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(404).type('text/plain; charset=utf-8').send('Not Found')
  }
  res.sendFile(path.join(webRoot, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[timepick-api] listening on http://0.0.0.0:${PORT}/api`)
  console.log(webRoot ? `[timepick-web] serving ${webRoot}` : '[timepick-web] 未找到前端产物, 仅提供 API')
  // 摆件语义检索：后台把 13 件物品的语料向量化好（有磁盘缓存，第二次启动瞬间完成）
  warmupProps()
  // 超管手机号不再写死在代码里，必须由环境变量提供，否则所有超管专属操作都会静默失效，
  // 排查起来很难（表现为「点了没反应」而不是报错），所以在启动时就明确提示一次。
  if (!SUPER_ADMIN) {
    console.warn(
      '[timepick-api] ⚠ 未设置 SUPER_ADMIN_USERNAME：管理员授权、AI 密钥等超管功能将不可用。\n' +
        '              解决办法：cp .env.example .env.local，把 SUPER_ADMIN_USERNAME 填成你的注册手机号。',
    )
  }
  // 存量房间摆件修复：旧版本按「内容分类」挑家具，同一分类会清一色变成书包；
  // 再往后摆位又改成了黄金角螺旋 + 朝向随机轮转（柜子背面朝人、家具全挤在房间正中）。
  // 这里按当前规则整间重排：家具名 + 坐标 + 朝向，全部走「槽位表 + 正面朝中心」。
  // 幂等，跑完再跑就是空转，所以直接放启动流程里。
  try {
    const r = repairLegacyRoomProps()
    console.log(
      `[room/repair] 自动摆件 ${r.scanned} 条：改判家具 ${r.reMatched} 条、归位/转向 ${r.moved} 条；补齐缺失摆件 ${r.backfilled} 条`,
    )
    for (const d of r.detail.slice(0, 20)) console.log('   ·', d)
  } catch (e) {
    console.warn('[room/repair] 存量摆件修复失败（不影响启动）:', e.message)
  }
  // 存量「共享记忆」并入广场：以前公开的记忆只出现在共享记忆流里，
  // 现在广场是唯一入口，启动时给还没投影的公开记忆补一条动态（幂等，跑完就是空转）。
  try {
    const made = backfillSquareProjections()
    console.log(`[square/backfill] 公开记忆补投影 ${made} 条`)
  } catch (e) {
    console.warn('[square/backfill] 补投影失败（不影响启动）:', e.message)
  }
  // 存量摆件的「数据检索」补全：给老记忆补上 prop_furniture，房间里的物品才跟得上新规则。
  // 要调向量接口，所以延后几秒再跑，绝不能挡启动。
  setTimeout(() => {
    backfillPropFurniture()
      .then((r) => {
        if (r.items) console.log(`[room/prop] 存量检索补全 ${r.items} 条（${r.spaces} 间房，${r.changed} 件物品因此更换）`)
      })
      .catch((e) => console.warn('[room/prop] 存量检索补全失败（不影响使用）:', e.message))
  }, 4000)
})
