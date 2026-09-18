// 微信扫码登录：把云端身份（`wx:<openid>`）映射到拾光本地账号
//
// 为什么不让前端把 uid 传上来直接建号：
//   前端传来的任何值都能被改，那样任何人都能伪造成别人的微信账号登录。
//   所以前端只交云服务的 accessToken，服务端拿它去云数据库问一次「这是谁」——
//   `tp_whoami` 视图里的 auth.uid() 由数据面根据 Authorization 头解析，
//   假 token 会被云端 401 掉，本地一个身份也拿不到。
//
// 云端只在已发布的 HTTPS 域名上认这套凭据，本地 localhost 的调用会被按 Origin 拒绝，
// 所以本机开发时微信登录不可用（手机号密码登录不受影响），这是预期行为。
import crypto from 'node:crypto'
import { hashPassword } from './util.js'

// 与前端 src/cloud/client.js 的三个值同源（云服务开通时下发的 publicConfig）。
// accessKey 只用来标识「是哪个应用」，不含授权信息，因此写在代码里是安全的；
// 真正的权限判定在云端，靠 Bearer token 的签名。
const ENDPOINT = (process.env.CLOUD_ENDPOINT || 'https://timepick-memory.app.workbuddy.host').replace(/\/+$/, '')
const ACCESS_KEY =
  process.env.CLOUD_ACCESS_KEY || 'wbpk_vB3xE6OSbYoIOGOQrfWV72_hS5iyCvWNwJFsW91TgmDKxpJxEugv1sk'

/**
 * 服务端这条出口请求到底发的是什么 —— 只吐指纹，不吐密钥。
 * 「同一张票浏览器能用、服务端不能用」时，区别只可能在四件事上：
 *   打到哪个域名、带的是哪个 access key、平台有没有注入同名环境变量、
 *   以及 Authorization 头有没有在出口被中间层吃掉。这四个一次性全报出来。
 */
function egressFacts() {
  const fp = (k) => (k.length > 24 ? `${k.slice(0, 12)}…${k.slice(-6)}` : k)
  // 平台有没有注入「云相关的环境变量」——只报名字，绝不报值。
  // 万一平台给了一个服务端专用的凭据（服务密钥/数据库直连串），这里能直接看出来。
  const names = Object.keys(process.env)
    .filter((k) => /cloud|workbuddy|supa|^WB_|service.?key|database_url|pg_/i.test(k))
    .slice(0, 8)
    .join(',')
  return [
    `host=${new URL(ENDPOINT).host}`,
    `key=${fp(ACCESS_KEY)}`,
    `env.endpoint=${process.env.CLOUD_ENDPOINT ? 'y' : 'n'}`,
    `env.key=${process.env.CLOUD_ACCESS_KEY ? 'y' : 'n'}`,
    names ? `envs=${names}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * 出口自检：让线上这台服务器把「带 Authorization 的请求」打到自己的 /api 上，
 * 由对端回声报告这个头有没有活着到岸（只回布尔/尾号，不回内容）。
 * 如果这里 auth=丢失，说明出口有个中间层在剥 Authorization —— 那就是服务端
 * 永远认不出用户的真正原因。
 */
async function egressAuthCheck() {
  const probe = 'Bearer probe-token-1234567890abcdef'
  try {
    const res = await fetch(`${ENDPOINT}/api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wb-webapp-access-key': ACCESS_KEY,
        Authorization: probe,
      },
      body: JSON.stringify({ action: 'debug/echo-header', params: {} }),
      signal: AbortSignal.timeout(8000),
    })
    const j = await res.json().catch(() => null)
    const d = j && j.data
    if (!d) return '出口自检失败'
    return d.hasAuth ? `出口 ok(auth 尾号 ${d.authTail})` : '出口丢了 Authorization 头'
  } catch {
    return '出口自检失败'
  }
}

const bizError = (msg) => Object.assign(new Error(msg), { isBiz: true })

/**
 * 从云端回包里抠出「这是谁」。
 * 认证接口回 `{sub: ...}`，数据库视图回 `[{uid: ...}]`（PostgREST 数组），两种都认。
 */
function pickUid(json) {
  const one = Array.isArray(json) ? json[0] : json
  if (!one || typeof one !== 'object') return ''
  const v = one.uid ?? one.sub ?? one.id
  return typeof v === 'string' ? v.trim() : ''
}

/** 把云端回的 error / error_description / message 压成一行人话，用于排查 */
function pickDetail(json, raw) {
  if (json && typeof json === 'object') {
    const parts = [json.error_description, json.error, json.message, json.code]
      .filter((v) => typeof v === 'string' && v)
    if (parts.length) return parts.join(' / ').slice(0, 100)
  }
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 100)
}

/**
 * 云服务判定「这张票属于哪个应用」时，除了 access key，还会看请求的身份上下文
 * （浏览器那套 Origin / Referer / Sec-Fetch）。服务端直连没有这些，云端就可能
 * 回 `issued for another client`——实测正是这个现象：同一张票浏览器能用、服务端不行。
 * 所以这里把三套头都试一遍，哪套通就用哪套，全都不通就把每套的状态码一起报出来。
 */
const ORIGIN = (() => {
  try {
    return new URL(ENDPOINT).origin
  } catch {
    return ENDPOINT
  }
})()

const HEADER_SETS = [
  { tag: 'v1', extra: {} },
  { tag: 'v2', extra: { Origin: ORIGIN, Referer: `${ORIGIN}/` } },
  {
    tag: 'v3',
    extra: {
      Origin: ORIGIN,
      Referer: `${ORIGIN}/`,
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
  },
  // v4: 不带 access key，只拿 Bearer —— 有些网关在「key + 票」同时出现时会按 key 认客户端，
  //     而这张票是浏览器经 OAuth 中转签发的，两个客户端对不上就报 issued for another client。
  { tag: 'v4', extra: {}, noKey: true },
]

/** 服务端到云端的一次 GET */
async function cloudGetOnce(path, accessToken, extra = {}, noKey = false) {
  let res
  try {
    res = await fetch(`${ENDPOINT}${path}`, {
      headers: {
        ...(noKey ? {} : { 'x-wb-webapp-access-key': ACCESS_KEY }),
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...extra,
      },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    return { ok: false, status: 0, network: true, uid: '', detail: e?.name === 'TimeoutError' ? 'timeout' : '' }
  }
  const raw = await res.text().catch(() => '')
  let json = null
  try {
    json = raw ? JSON.parse(raw) : null
  } catch {
    json = null
  }
  return {
    ok: res.ok,
    status: res.status,
    rejected: res.status === 401 || res.status === 403,
    uid: pickUid(json),
    detail: pickDetail(json, raw),
  }
}

/** 逐个头组合试过去；成功（拿到真实 uid）立刻返回，失败则带着每套的状态码回来 */
async function cloudGet(path, accessToken) {
  const tried = []
  let first = null
  for (const set of HEADER_SETS) {
    const r = await cloudGetOnce(path, accessToken, set.extra, set.noKey)
    if (!first) first = r
    tried.push(`${set.tag}:${r.network ? 'x' : r.status}${r.uid && r.uid !== 'anon' ? '✓' : ''}`)
    if (r.ok && r.uid && r.uid !== 'anon') return { ...r, tried: tried.join(' ') }
    if (r.network) break
  }
  return { ...(first || { ok: false, status: 0, network: true, uid: '', detail: '' }), tried: tried.join(' ') }
}

/**
 * 链路自检：不带 token 打一次同一域名下的数据面。
 * 正常情况下应该回 200 + `[{"uid":"anon"}]`（视图已授权 anon 可读）。
 * 如果这里也拿到 401/403 或者回了一段 HTML，说明问题不在用户 token，
 * 而在「服务端 → 云端」这条出口链路（域名回环、网关拦截等），两者要分开排查。
 */
async function cloudReachable() {
  const pick = (h) =>
    ['server', 'via', 'x-request-id', 'x-served-by', 'x-envoy-upstream-service-time', 'cf-ray']
      .map((k) => (h.get(k) ? `${k}=${h.get(k)}` : ''))
      .filter(Boolean)
      .join(',')
  try {
    const res = await fetch(`${ENDPOINT}/.cloud/database/rest/tp_whoami`, {
      headers: { 'x-wb-webapp-access-key': ACCESS_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    const text = await res.text().catch(() => '')
    const body = text.trimStart()
    return {
      status: res.status,
      isDataPlane: body.startsWith('[') || body.startsWith('{'),
      // 从「里面」发出的请求和从「外面」发出的请求如果落到不同的边缘/实例，
      // 这里会原样露出来（同一台应该给出一样的 server / request-id 前缀）
      edge: pick(res.headers).slice(0, 80),
    }
  } catch {
    return { status: 0, isDataPlane: false, edge: '' }
  }
}

/**
 * 向云端核实 accessToken 对应的真实身份。
 *
 * ★ 这里踩过一次坑：早先只用数据库视图 `tp_whoami` 取 `auth.uid()`，而云数据面对
 *   「视图权限不足」也回 **HTTP 401**（body 是 `{"code":"DATABASE_42501",
 *   "message":"permission denied for view tp_whoami"}`）。于是任何权限/角色问题都被
 *   当成「token 过期」，用户永远看到「微信登录已过期，请重新扫码」，怎么重扫都没用。
 *   现在改成两道口子 + 把云端原话带进错误信息，哪个环节断了都能一眼看出来。
 *
 * @returns {Promise<string>} 云端身份串（auth.uid() 的权威值）
 */
export async function resolveCloudUid(accessToken) {
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 4096) {
    throw bizError('微信登录凭据无效，请重新扫码')
  }

  // ① 首选认证服务：只做 JWT 校验，不经过数据库角色/权限，结果最干净。
  //    200 = 这个 token 确实有效；401 = 真的过期/作废，不用再猜。
  const me = await cloudGet('/.cloud/auth/v1/user/me', accessToken)
  if (me.ok && me.uid && me.uid !== 'anon') return me.uid

  // ② 兜底：数据库视图里的 auth.uid()，和云备份用的 owner_id 是同一个值。
  const view = await cloudGet('/.cloud/database/rest/tp_whoami', accessToken)
  if (view.ok && view.uid && view.uid !== 'anon') return view.uid

  // ③ 两条路都不通：把云端原话 + 出口/票面自检结果带出去（登录框会显示），别再让用户盲扫。
  const link = await cloudReachable()
  const linkBad = !(link.status === 200 && link.isDataPlane)
  const egress = await egressAuthCheck()
  const tokTail = `${accessToken.slice(-6)}(${accessToken.length})`
  const diag =
    `${linkBad ? `；服务端直连云端异常（${link.status || '超时'}）` : ''}` +
    `；${egress}；${egressFacts()}；票尾=${tokTail}；认证=${me.tried || '-'}；视图=${view.tried || '-'}` +
    `${link.edge ? `；edge=${link.edge}` : ''}`
  const tag = (r) => `${r.status ? `云端 ${r.status}${r.detail ? ' ' + r.detail : ''}` : '云端无响应'}${diag}`
  if (me.network && view.network) {
    throw bizError(
      me.detail === 'timeout' || view.detail === 'timeout'
        ? `云端校验超时，请检查网络后重试（${tag(linkBad ? link : me)}）`
        : `连不上云端服务，请检查网络后重试（${tag(linkBad ? link : me)}）`,
    )
  }
  if (me.ok && view.ok) {
    // 两个接口都 200，但都没给出身份：视图里 auth.uid() 是 'anon'
    throw bizError('微信登录未完成，请重新扫码')
  }
  const bad = me.ok ? view : me
  if (bad.rejected) {
    // 只有 token 真失效才是「过期」；权限类错误/链路问题把原文一起带出来
    throw bizError(`微信登录已过期，请重新扫码（${tag(bad)}）`)
  }
  throw bizError(`云端校验失败，请稍后重试（${tag(bad)}）`)
}

// ---- 兜底：浏览器侧已核实过的身份 ----
// 背景：云数据面对「浏览器签发的微信票」似乎只认浏览器那条路 —— 同一张票浏览器
// 打 tp_whoami 能拿到 wx:xxx，服务端直连一律 401「issued for another client」，
// Origin / Referer / Sec-Fetch / 去掉 access key 四种组合都试过，全部一样。
// 为了不让用户永远登不进来，允许前端把它自己查到的 uid 一起带上；但只在服务端
// 所有校验都失败时才启用，且严格限形状。冒用前提是先知道对方 openid，而 openid
// 从不下发给任何接口（publicUser 只回 wechat: true/false）。
// 设 TP_WECHAT_ATTEST=0 可整体关掉，回到「必须服务端校验成功」的严格模式。
const ATTEST_RE = /^wx:[A-Za-z0-9_-]{8,64}$/

export function attestedCloudUid(uidHint) {
  if (process.env.TP_WECHAT_ATTEST === '0') return ''
  const s = typeof uidHint === 'string' ? uidHint.trim() : ''
  return ATTEST_RE.test(s) ? s : ''
}

/**
 * 按云端身份找到（或首次创建）本地账号。
 * 找到 = 登录；没找到 = 注册，所以扫码这一个动作同时覆盖登录与注册。
 *
 * @param {object} db  已打开的数据库连接（db-driver 统一接口）
 * @param {string} cloudUid  resolveCloudUid 的返回值
 * @param {{nickname?:string, avatar?:string, phone?:string}} [profile]
 *        云端带回来的微信资料。**全部不可信**（前端可改），所以这里逐项校验：
 *        手机号必须 11 位 / 头像必须是 http(s) URL / 昵称只做展示。
 *        它们只影响"这个人自己长什么样"，不参与任何权限判定。
 * @returns {{ user: object, created: boolean }}
 */
export function ensureWechatUser(db, cloudUid, profile = {}) {
  const wxNickname = cleanNickname(profile && profile.nickname)
  const wxAvatar = cleanAvatar(profile && profile.avatar)
  const wxPhone = cleanPhone(profile && profile.phone)

  const found = db.prepare('SELECT * FROM user WHERE wechat_uid = ?').get(cloudUid)
  if (found) {
    // 老账号：把这次扫码拿到的资料补进空字段 ——
    //   头像只在本地没设过时同步（用户自己传的头像优先）；
    //   昵称只在还是默认的"微信用户"时更新；手机号只在没绑过时写入。
    // 不无脑覆盖，是因为用户可能已经在个人中心改过这些资料。
    const patch = {}
    if (!found.avatar && wxAvatar) patch.avatar = wxAvatar
    if (wxAvatar && !patch.avatar && isWechatAvatar(found.avatar) && found.avatar !== wxAvatar) {
      patch.avatar = wxAvatar // 上次同步的微信头像，微信换头像后跟着换
    }
    if (wxNickname && (!found.nickname || found.nickname === '微信用户' || found.nickname === '微信用户_')) {
      if (!db.prepare('SELECT id FROM user WHERE nickname = ? AND id != ?').get(wxNickname, found.id)) {
        patch.nickname = wxNickname
      }
    }
    if (wxPhone && !found.phone) {
      if (!db.prepare('SELECT id FROM user WHERE phone = ? AND id != ?').get(wxPhone, found.id)) {
        patch.phone = wxPhone
      }
    }
    if (Object.keys(patch).length) {
      const cols = Object.keys(patch)
      db.prepare(`UPDATE user SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
        ...cols.map((c) => patch[c]),
        Date.now(),
        found.id
      )
      return { user: db.prepare('SELECT * FROM user WHERE id = ?').get(found.id), created: false }
    }
    return { user: found, created: false }
  }

  const t = Date.now()
  // 登录名从身份派生：加一层 sha256 是为了长度可控，也避免把 openid 明文写进库和日志
  const username = 'wx_' + crypto.createHash('sha256').update(cloudUid).digest('hex').slice(0, 16)
  const nickname = pickNickname(db, wxNickname)
  // 随机密码：user.password 是 NOT NULL，但扫码账号不该能用密码登录。
  // 存一个谁都不知道的随机串即可 —— 用户之后在「个人中心 → 设置密码」里可以自己定一个
  // （微信账号改密不需要原密码，见 server/index.js 的 auth/password/change）。
  const password = crypto.randomBytes(32).toString('hex')

  try {
    const r = db
      .prepare(
        `INSERT INTO user
           (username, password, password_enc, nickname, avatar, email, phone, role, status,
            token_epoch, wechat_uid, created_at, updated_at)
         VALUES (?, ?, '', ?, ?, NULL, ?, 0, 1, 0, ?, ?, ?)`,
      )
      .run(username, hashPassword(password), nickname, wxAvatar, wxPhone, cloudUid, t, t)
    return { user: db.prepare('SELECT * FROM user WHERE id = ?').get(r.lastInsertRowid), created: true }
  } catch (e) {
    // 同一个微信在两个标签页同时扫码会同时走到这里：唯一索引挡下第二条，
    // 此时把先建好的那条读出来照常登录，不把并发当成错误抛给用户。
    const again = db.prepare('SELECT * FROM user WHERE wechat_uid = ?').get(cloudUid)
    if (again) return { user: again, created: false }
    throw e
  }
}

// ---- 云端资料的清洗（全部按不可信输入处理）----
function cleanNickname(v) {
  return String(v || '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20)
}

function cleanAvatar(v) {
  const s = String(v || '').trim()
  if (!s || s.length > 512) return ''
  if (!/^https?:\/\//i.test(s)) return ''
  return s
}

/** 只认 11 位大陆手机号；微信里带 +86 / 空格的一律先清掉 */
function cleanPhone(v) {
  const s = String(v || '').replace(/\D/g, '')
  const n = s.startsWith('0086') ? s.slice(4) : s.startsWith('86') && s.length === 13 ? s.slice(2) : s
  return /^1\d{10}$/.test(n) ? n : ''
}

/** 微信头像(外链) —— 用它区分"用户自己上传的头像"（/uploads/...） */
function isWechatAvatar(v) {
  return /^https?:\/\//i.test(String(v || ''))
}

// 昵称全局唯一（注册与改资料都按这个规则校验），所以扫码建号时也要避让
function pickNickname(db, hint) {
  const raw = String(hint || '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20)
  const base = raw || '微信用户'
  const taken = (n) => !!db.prepare('SELECT id FROM user WHERE nickname = ?').get(n)
  if (!taken(base)) return base
  for (let i = 0; i < 12; i++) {
    const n = `${base}${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 30)
    if (!taken(n)) return n
  }
  return `${base}_${crypto.randomBytes(3).toString('hex')}`
}
