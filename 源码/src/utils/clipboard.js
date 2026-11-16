/**
 * 剪贴板复制（带 http 降级）
 *
 * ★ 为什么不能直接 await navigator.clipboard.writeText()：
 *   Clipboard API 只在「安全上下文」（https / localhost）里存在。
 *   站点现在跑在 http://101.201.54.16 这种裸 IP 上，navigator.clipboard 整个是 undefined，
 *   一调用就抛 TypeError，用户看到的就是「复制失败」。而且这种失败跟权限无关，重试多少次都一样。
 *
 * ★ 兜底：document.execCommand('copy')。虽然已标记废弃，但所有主流浏览器在 http 下仍然支持，
 *   只要求由真实的用户手势（点击）触发 —— 这里每一处都是按钮点击，满足条件。
 *
 * @param {string} text 要复制的文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyText(text) {
  const str = String(text ?? '')
  if (!str) return false

  // 1) 安全上下文：用标准 API，最可靠
  if (typeof window !== 'undefined' && window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(str)
      return true
    } catch {
      /* 权限被拒 / 用户拒绝 → 继续走兜底 */
    }
  }

  // 2) 兜底：临时 textarea + execCommand
  let ta = null
  try {
    ta = document.createElement('textarea')
    ta.value = str
    ta.setAttribute('readonly', '')
    // 不能用 display:none —— 看不见的元素选不中；放到左上角 1px 大小、透明
    ta.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;outline:none;box-shadow:none;background:transparent;opacity:0;'
    document.body.appendChild(ta)

    // iOS Safari 上 select() 不会全选，需要 contentEditable + range 才稳
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if (isIOS) {
      ta.contentEditable = 'true'
      ta.readOnly = false
      const range = document.createRange()
      range.selectNodeContents(ta)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      ta.setSelectionRange(0, str.length)
    } else {
      ta.focus()
      ta.select()
      ta.setSelectionRange(0, str.length)
    }

    const ok = document.execCommand('copy')
    return !!ok
  } catch {
    return false
  } finally {
    if (ta && ta.parentNode) ta.parentNode.removeChild(ta)
  }
}
