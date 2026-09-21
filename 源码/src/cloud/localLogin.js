// 微信扫码落地：把「云账号已登录」换成「拾光账号已登录」
//
// 为什么需要这一步：云服务只认得微信 openid，拾光的记忆、空间、AI 会话全在
// 本地 SQLite 的 user.id 下。所以扫码回来必须换一张本地 token 才能真正进站。
//
// 换票由后端完成（server/wechat-auth.js）：前端只交云服务的 accessToken，
// 后端自己去云端核实身份，因此伪造不了别人的账号。
import { cloudApi, setToken } from '../api/cloud'
import { cloud, cloudErrorText, currentSession } from './client'

/** 从多个候选里取第一个非空字符串（云端不同版本字段名不统一） */
function firstStr(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/**
 * 客户端自检：用同一个 accessToken 直接问一次云端「我是谁」。
 * 只用于排错——服务端要是也被云端拒了，这段结果能区分
 * 「token 本身无效」和「只有服务端那条路走不通」，用户截个图就能定位。
 */
async function probeWhoami() {
  if (!cloud) return { text: '', uid: '' }
  try {
    const { data, error } = await cloud.database.from('tp_whoami').select('uid')
    if (error) {
      return { text: `客户端自检失败 ${error.status || ''} ${error.message || error.kind || ''}`.trim(), uid: '' }
    }
    const uid = (data && data[0] && data[0].uid) || ''
    return { text: `客户端自检 OK ${uid || '(空)'}`, uid: typeof uid === 'string' ? uid : '' }
  } catch (e) {
    return { text: `客户端自检异常 ${e && e.message}`, uid: '' }
  }
}

/** 票面指纹：只报尾号与长度，用来核对「服务端收到的和这里发出的是不是同一张票」 */
function tokenFacts(t) {
  if (typeof t !== 'string' || !t) return '票空'
  return `票尾=${t.slice(-6)}(${t.length})`
}

/**
 * 用当前云会话换取拾光登录态。成功会直接 replace 到目标页（页面随即重载）。
 * @param {string} [nextPath] 扫码成功后的落点
 * @returns {Promise<boolean>} true = 已登录；false = 失败（已跳回欢迎页提示）
 */
export async function finishLocalWechatLogin(nextPath) {
  try {
    let session = await currentSession()
    if (!session?.accessToken) throw new Error('云登录态已失效，请重新扫码')

    // 微信昵称 / 头像 / 手机号：先只从会话里取，不额外打云接口。
    // ★ 这一步很关键：SDK 的 getSession / getUser / 数据库调用在取票时都可能顺手
    //   刷新会话，刷新有可能把上一张 access token 换掉。原来的顺序是先 getUser()
    //   再拿早先快照里的 token 去换票 —— 发出去的其实是刷新前的旧票，云端回
    //   「invalid / issued for another client」，看着像过期，其实是自己弄旧了。
    //   所以：第一次换票只用刚取到的这张票，任何附加的云调用都放到失败之后。
    const u = session.user || {}
    const raw = u.raw || {}
    let nickname = firstStr(u.name, raw.name, raw.nickname, raw.nick_name)
    let avatar = firstStr(u.avatarUrl, raw.avatar_url, raw.avatarUrl, raw.headimgurl, raw.head_img_url)
    let phone = firstStr(u.phone, raw.phone, raw.phone_number, raw.mobile)

    // 换票偶发网络抖动就先重试两次：扫码这一步只可能走一次，重试成本远低于重扫
    const exchange = async (accessToken, probe, uidHint) => {
      let data = null
      let lastErr = null
      for (let i = 0; i < 3; i++) {
        try {
          data = await cloudApi.wechatLogin({ accessToken, nickname, avatar, phone, probe, uidHint })
          break
        } catch (e) {
          lastErr = e
          if (i < 2) await new Promise((r) => setTimeout(r, 400 * (i + 1)))
        }
      }
      return { data, lastErr }
    }

    // 第一次：干净利落，直接用当前的票
    let { data, lastErr } = await exchange(session.accessToken, '', '')

    // 失败之后才补资料 / 做自检 / 换新票重试
    if (!data?.token) {
      if (cloud && (!phone || !nickname || !avatar)) {
        try {
          const { data: me } = await cloud.auth.getUser()
          if (me) {
            nickname = nickname || firstStr(me.name)
            avatar = avatar || firstStr(me.avatarUrl)
            phone = phone || firstStr(me.phone)
          }
        } catch {
          /* 取不到就当没有：绝不因为补资料失败而挡登录 */
        }
      }
      // 自检可能触发过刷新 → 重新取一次最新的票再发
      const who = await probeWhoami()
      const latest = await currentSession()
      if (latest?.accessToken) session = latest
      const probe = `${who.text} ${tokenFacts(session.accessToken)}`.trim()
      ;({ data, lastErr } = await exchange(session.accessToken, probe, who.uid))

      // 还不行就强制刷新一次会话，拿一张新票再试（refresh token 没过期的场景很常见）
      if (!data?.token && cloud) {
        try {
          const { data: fresh } = await cloud.auth.refreshSession()
          if (fresh?.accessToken && fresh.accessToken !== session.accessToken) {
            session = fresh
            ;({ data, lastErr } = await exchange(
              fresh.accessToken,
              `${who.text} ${tokenFacts(fresh.accessToken)}`.trim(),
              who.uid,
            ))
          }
        } catch {
          /* 刷不出来就按原错误报出去 */
        }
      }
    }

    if (!data?.token) throw lastErr || new Error('微信登录失败，请重新扫码')
    setToken(data.token)
    location.replace(nextPath || '/index/memory')
    return true
  } catch (e) {
    wechatLoginFailedToWelcome(cloudErrorText(e, '微信登录失败，请重新扫码'))
    return false
  }
}

/** 扫码失败 / 换票失败：回欢迎页并把原因带过去，由登录弹窗显示 */
export function wechatLoginFailedToWelcome(fallback = '微信登录失败，请重试') {
  try {
    // handleCloudCallback 已经把云端给出的原因写进 tp_cloud_error，优先用它
    const detail = sessionStorage.getItem('tp_cloud_error')
    sessionStorage.removeItem('tp_cloud_error')
    sessionStorage.setItem('tp_wx_error', detail || fallback)
  } catch {
    /* 隐私模式下 sessionStorage 可能不可写：位置照常跳，只是没有具体原因 */
  }
  location.replace('/')
}

/** 登录弹窗启动时取一次这次扫码的失败原因（取完即清，刷新不会重复提示） */
export function takeWechatLoginError() {
  try {
    const msg = sessionStorage.getItem('tp_wx_error') || ''
    if (msg) sessionStorage.removeItem('tp_wx_error')
    return msg
  } catch {
    return ''
  }
}
