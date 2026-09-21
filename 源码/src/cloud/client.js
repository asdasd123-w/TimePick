// WorkBuddy 云服务客户端（Auth / Database / Storage 共用同一个实例）
//
// 这三个值来自云服务开通时下发的 publicConfig，直接写在代码里是刻意的：
// 它们不含任何密钥（publishableKey 只标识"是哪个应用"，权限由服务端按 Origin 判定），
// 而 endpoint 是当前应用的发布域名数据面入口，绝不能靠 location 猜。
// 云调用只在**已发布的 HTTPS 域名**上生效，localhost / 预览地址会被服务端按 Origin 拒绝。
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'

export const CLOUD_ENDPOINT = 'https://timepick-memory.app.workbuddy.host'
export const CLOUD_PUBLISHABLE_KEY =
  'wbpk_vB3xE6OSbYoIOGOQrfWV72_hS5iyCvWNwJFsW91TgmDKxpJxEugv1sk'
export const CLOUD_OAUTH_RELAY_BASE_URL = 'https://www.workbuddy.cn/v2/as/genie-baas/oauth'

// 初始化失败时不能把整个应用带崩：cloud 为 null，云端相关 UI 统一显示"云服务未就绪"，
// 本地账号与所有既有功能照常可用。
let client = null
let initError = null
try {
  client = createWorkBuddyCloud({
    endpoint: CLOUD_ENDPOINT,
    oauthRelayBaseUrl: CLOUD_OAUTH_RELAY_BASE_URL,
    publishableKey: CLOUD_PUBLISHABLE_KEY,
  })
} catch (e) {
  initError = e
  console.error('[cloud] 初始化失败:', e && e.message)
}

export const cloud = client
export const cloudReady = !!client

/** 把 SDK 的 error 对象转成能直接给用户看的一句话 */
export function cloudErrorText(error, fallback = '云端服务暂时不可用，请稍后再试') {
  if (!error) return fallback
  if (typeof error === 'string') return error
  const msg = error.message || error.msg || ''
  if (msg) return msg
  return fallback
}

/** 当前云会话；未登录返回 null */
export async function currentSession() {
  if (!client) return null
  try {
    const { data } = await client.auth.getSession()
    return data || null
  } catch {
    return null
  }
}

// ---- 第三方登录回调 ----
// 微信登录会以 ?code=…&state=…&provider=wechat 回到站点根路径。
// 这一步必须在任何路由守卫之前跑完：code 是一次性的，被守卫踢走就白扫了。
const CALLBACK_KEYS = ['code', 'state', 'provider']

/**
 * 回调参数可能落在 query，也可能被中转页拼到 # 后面（OAuth 回跳时见过）。
 * 应用自己的路由是 history 模式、不用 hash，所以两种位置都认不会误伤。
 */
function callbackParams(url) {
  const p = new URLSearchParams(url.search)
  const raw = url.hash.replace(/^#\/?/, '')
  if (raw.includes('=')) {
    new URLSearchParams(raw).forEach((v, k) => {
      if (!p.has(k)) p.set(k, v)
    })
  }
  return p
}

/** 清掉 URL 上的回调参数，保留应用自己的 query（如 sharecode） */
function stripCallbackParams(url) {
  for (const key of CALLBACK_KEYS) url.searchParams.delete(key)
  if (url.hash.includes('=')) {
    const hp = new URLSearchParams(url.hash.replace(/^#\/?/, ''))
    for (const key of CALLBACK_KEYS) hp.delete(key)
    const rest = hp.toString()
    url.hash = rest ? `#${rest}` : ''
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export function isCloudCallback() {
  const p = callbackParams(new URL(location.href))
  return p.has('code') || p.has('error')
}

/** 处理回调；返回 true 表示刚刚完成了一次云端登录 */
export async function handleCloudCallback() {
  if (!client || !isCloudCallback()) return false
  const url = new URL(location.href)
  const params = callbackParams(url)
  // 只按 provider 选一个 handler：两个都调会让每次成功登录都报另一家的错
  const provider = params.get('provider') || 'wechat'
  const handler =
    provider === 'workbuddy'
      ? client.auth.handleWorkBuddyCallback
      : provider === 'wechat'
        ? client.auth.handleWechatWebCallback
        : null
  if (!handler) {
    console.warn('[cloud] 未知的登录回调方式:', provider)
    return false
  }
  try {
    // 云 SDK 只从 location.search 取 code；万一参数落在 hash 里，先搬回 search 再交给它，
    // 否则 handler 会认为「没有 code」而直接失败。
    if (!url.searchParams.has('code') && params.has('code')) {
      for (const key of CALLBACK_KEYS) {
        if (params.has(key)) url.searchParams.set(key, params.get(key))
      }
      history.replaceState(null, '', `${url.pathname}${url.search}`)
    }
    // 换票动作：拿 code 去云端换会话。
    // ★ 扫码扫得很快时，云端的 flow state 可能还没落库，第一次会回「已过期 / 已失效」。
    //   同一个 code 在服务端通常还能再换一次，所以失败后隔 700ms 重试一次再判死。
    const exchange = async () => {
      const first = await handler.call(client.auth)
      if (!first?.error) return first
      console.warn('[cloud] 登录回调失败，700ms 后重试:', cloudErrorText(first.error))
      await new Promise((r) => setTimeout(r, 700))
      const again = await handler.call(client.auth)
      return again?.error ? first : again
    }
    const { data, error } = await exchange()
    if (error) {
      console.warn('[cloud] 登录回调失败:', cloudErrorText(error))
      // 兜一层：code 一次性，浏览器有时会重复回调（前进/后退、刷新、被拦后重试），
      // 第一次其实已经换到会话了，第二次就报「已过期」。这种情况不该把用户挡在门外，
      // 直接看当前有没有云会话，有就当作成功。
      const sess = await currentSession()
      if (sess?.accessToken) {
        console.warn('[cloud] 回调报错但云会话已建立，按成功处理')
        history.replaceState(null, '', stripCallbackParams(url))
        return true
      }
      sessionStorage.setItem('tp_cloud_error', cloudErrorText(error))
      return false
    }
    if (!data) {
      // 同上：handler 没报错但也没返回数据，只要云会话在就当成功
      const sess = await currentSession()
      if (!sess?.accessToken) return false
      for (const key of CALLBACK_KEYS) url.searchParams.delete(key)
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
      return true
    }
    // 成功：只删回调参数，保留应用自己的 query（如 sharecode）
    history.replaceState(null, '', stripCallbackParams(url))
    return true
  } catch (e) {
    console.warn('[cloud] 登录回调异常:', e && e.message)
    return false
  }
}

/** 清掉地址栏上的回调参数（code 是一次性的，留着刷新会再触发一次必然失败的换票） */
export function clearCloudCallbackUrl() {
  const url = new URL(location.href)
  if (!callbackParams(url).has('code') && !callbackParams(url).has('error')) return
  history.replaceState(null, '', stripCallbackParams(url))
}

/** 登录成功后把用户送回原来的页面（本地已登录时直接去"我的"页打开云端面板） */
export function afterCloudLoginRedirect() {
  const url = new URL(location.href)
  const hasLocal = !!localStorage.getItem('tp_token')
  const target = hasLocal ? '/index/profile' : '/'
  if (url.pathname !== target) url.pathname = target
  url.searchParams.set('cloud', '1')
  location.replace(`${url.pathname}${url.search}${url.hash}`)
}

// ---- 用微信扫码登录「拾光账号」 ----
// 云面板里的微信登录只解决云账号; 用户真正要的是扫码后直接进站。
// 做法: 跳微信之前先在 sessionStorage 记下"这次扫码是为了登录拾光",
// 扫码回来由 main.js 拿云 session 去后端换本地 token（见 cloud/localLogin.js）。
const LOCAL_INTENT_KEY = 'tp_wx_local_intent'
const LOCAL_INTENT_TTL = 10 * 60_000

/**
 * 发起微信扫码登录拾光账号。成功时浏览器已经跳走，不会返回。
 * @param {string} [nextPath] 扫码回来后要去的页面
 */
export async function startLocalWechatLogin(nextPath = '/index/memory') {
  if (!client) throw new Error('云服务未就绪，微信登录暂时不可用')
  // 回调只能落站点根: 静态托管没有 history fallback, 子路径会 404 把 code 丢掉
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'wechat',
    redirectTo: location.origin,
  })
  if (error) throw new Error(cloudErrorText(error, '微信登录暂不可用'))
  if (!data?.url) throw new Error('微信登录暂不可用，请稍后再试')
  sessionStorage.setItem(LOCAL_INTENT_KEY, JSON.stringify({ next: nextPath || '/index/memory', at: Date.now() }))
  location.assign(data.url)
}

/**
 * 取出并清掉扫码意图。没有则返回 null（说明这次扫码是云面板发起的，走原来的逻辑）。
 * 无论后面成功与否都会清掉，避免一次失败的扫码影响下一次。
 */
export function takeLocalWechatIntent() {
  let raw = null
  try {
    raw = sessionStorage.getItem(LOCAL_INTENT_KEY)
    if (raw) sessionStorage.removeItem(LOCAL_INTENT_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const it = JSON.parse(raw)
    // 扫到一半关掉页面又过很久才回来: 不该再认这次意图
    if (!it || Date.now() - (it.at || 0) > LOCAL_INTENT_TTL) return null
    return it
  } catch {
    return null
  }
}
