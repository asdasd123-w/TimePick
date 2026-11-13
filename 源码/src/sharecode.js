// 平台分享网关（2026-11-14 起）：分享域名必须带 ?sharecode=xxx 才能打开，
// 直接访问裸域名会返回「链接不完整」。首次带 sharecode 打开时网关会种 30 天的 cookie，
// 这里再把值记到 localStorage，这样生成分享链接（/share/<token>）时能带上，
// 否则朋友点开就只会看到一张「链接不完整」的说明页。
const KEY = 'tp:sharecode'

export function captureShareCode() {
  try {
    const sc = new URLSearchParams(window.location.search).get('sharecode')
    if (sc) localStorage.setItem(KEY, sc)
  } catch {
    // 隐私模式 / 禁用存储时忽略：没有 sharecode 也能正常用站内功能
  }
}

function currentShareCode() {
  try {
    return (
      new URLSearchParams(window.location.search).get('sharecode') ||
      localStorage.getItem(KEY) ||
      ''
    )
  } catch {
    return ''
  }
}

export function withShareCode(url) {
  const sc = currentShareCode()
  if (!sc) return url
  return url + (url.includes('?') ? '&' : '?') + 'sharecode=' + encodeURIComponent(sc)
}

// 站内分享链接：/share/<token>，统一在这里拼，避免各处写法不一致
export function shareLinkOf(token) {
  return withShareCode(`${window.location.origin}/share/${token}`)
}
