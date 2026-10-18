// warmup.js —— 3D 房间的「后台预热」
// ---------------------------------------------------------------------------
// 思路（用户提的）：用户在别的页面闲着的时候，先把 3D 房间启动必需的东西偷偷
// 下到 HTTP 缓存里，等他点进房间时就能少等几秒。
//
// 但这里有个前提不能糊弄过去：**预热的字节数必须小，且只能在浏览器真的闲着时做**，
// 否则就会把用户当前正在逛的页面拖慢 —— 那就不叫优化，叫抢带宽。
// 所以做了这几层限制：
//   · 只下「启动必需品」：引擎(cocos-js)、主包 main/internal、资源元数据 json。
//     服务端 /api 的 room3d/warmup-list 只列这些，几十 MB 的贴图/模型一律不列。
//   · 有预算上限 BUDGET（默认 6MB，实际 gzip/brotli 之后只有 2MB 左右），超了就停。
//   · 只在 requestIdleCallback 里跑：当前页面忙（动画/滚动/请求）就自动让路。
//   · 省流量模式 / 2G/3G 直接不预热。
//   · 一个会话只做一次（sessionStorage 记标记）。
// 另外：这些文件都带了长缓存头（7 天），所以预热完进了房间是真的命中缓存，不是白下。
//
// ★ 想更激进就把 BUDGET 调大；不想要就别调 warmupRoom3d()。
// ---------------------------------------------------------------------------
const BUDGET = 6 * 1024 * 1024
const FLAG = 'tp_room3d_warm'

function connectionAllows() {
  const c = typeof navigator !== 'undefined' ? navigator.connection : null
  if (!c) return true
  if (c.saveData) return false
  const t = c.effectiveType || ''
  return !/^(slow-2g|2g|3g)$/.test(t)
}

function whenIdle(fn) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout: 10000 })
  } else {
    setTimeout(fn, 2000)
  }
}

function asOf(url) {
  if (/\.js$/i.test(url)) return 'script'
  if (/\.css$/i.test(url)) return 'style'
  if (/\.json$/i.test(url)) return 'fetch'
  return ''
}

/**
 * 预热 3D 房间的启动文件。
 * @returns {Promise<number>} 这次提交给浏览器的字节数（0 = 跳过）
 */
export async function warmupRoom3d() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0
  try {
    if (sessionStorage.getItem(FLAG)) return 0
  } catch {
    return 0
  }
  if (!connectionAllows()) {
    try {
      sessionStorage.setItem(FLAG, 'skip')
    } catch {
      /* 隐私模式：无所谓 */
    }
    return 0
  }
  try {
    sessionStorage.setItem(FLAG, '1')
  } catch {
    /* 隐私模式：这次也照做，只是下次会再做一遍 */
  }

  return new Promise((resolve) => {
    whenIdle(async () => {
      try {
        const r = await fetch('/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'room3d/warmup-list', params: {} }),
        }).then((x) => x.json())
        const list = (r && r.data) || []
        let total = 0
        let n = 0
        for (const it of list) {
          if (!it || !it.url) continue
          if (total + (it.bytes || 0) > BUDGET) break
          total += it.bytes || 0
          n++
          // 用 <link rel=prefetch>：优先级由浏览器统一调度，切走页面时它自己会取消，
          // 比我们自己 fetch 一堆请求更不容易影响当前页面。
          const l = document.createElement('link')
          l.rel = 'prefetch'
          const as = asOf(it.url)
          if (as) l.setAttribute('as', as)
          l.href = it.url
          l.crossOrigin = 'anonymous'
          document.head.appendChild(l)
        }
        resolve(total)
      } catch {
        resolve(0)
      }
    })
  })
}
