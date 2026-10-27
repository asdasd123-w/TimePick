// inject-room3d-loader.mjs —— 给 Cocos 产物页面加一层「真·加载进度」
// ---------------------------------------------------------------------------
// 用法（TimePick 目录下）：
//   node scripts/inject-room3d-loader.mjs "D:\...\build\web-mobile" [更多目录…]
//
// 为什么需要：Cocos 自带的启动插屏已经关掉了（patch-room3d-splash.mjs），
//   引擎起来之前画布是空的 —— 首开要下几十 MB，用户看到的就是一片白/黑，
//   体验上跟「卡死了」没区别。这里在产物页面里补一个进度层：
//     · 立刻显示（不等引擎），带进度条 + 已下载 MB 数（真实统计，不是假动画）
//     · 通过 postMessage 把进度报给宿主页面，父页面等待层显示同一串数字
//     · 房间发 tp:ready 时收起；60 秒兜底，绝不会一直盖住画面
//
// ★ 每次 Cocos 重新构建都会覆盖 index.html，所以这一步必须在拷贝产物之后做。
//   copy-room3d.mjs 与 timeick_data/deploy_sync.py 都会自动调用本模块。
// ★★ 2026-10-27：改成「每次都重算并整块替换」。原来是「发现已有 id="tp-room-loader"
//   就跳过」，而 EST 是用**当时**产物体积算出来的 —— 后来贴图从 129MB 压到 74MB，
//   EST 却一直留着 59.7MB 的老值，进度条到 51% 就再也爬不动了（线上实测）。
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import path from 'node:path'

/**
 * 首开下载量的估算基数：产物所有文件原始体积之和。
 * 实测（贴图优化 + brotli 之后）：首开 33.8MB / 产物原始 96MB ≈ 0.35。
 * 这个值只影响进度条走向（分母），不写死"已经下完多少"；
 * 不再用 localStorage 记"上次实测总量"：Cocos 有部分请求不进 Resource Timing，
 * 实测值会偏小，拿它当分母会让进度条一开局就冲到 90%+。
 */
const TRANSFER_RATIO = 0.44

function dirBytes(dir) {
  let n = 0
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) n += dirBytes(p)
    else n += fs.statSync(p).size
  }
  return n
}

const LOADER = (est) => `
<!--TP_LOADER_START 由 scripts/inject-room3d-loader.mjs 生成，会被整块替换，别手改-->
<!-- ★ 只做进度上报，不再画加载画面。
     加载页统一由宿主（src/components/room3d.vue）那一层负责（小猫跑酷 + 进度条）：
     以前这里还有一套"拾光 + 进度条"的浅色页面，用户会先看到它、再看到宿主的页面，
     看起来像两个加载页（2026-10-21 用户反馈）。现在这里只留一个隐藏节点做标记，
     真实下载字节通过 postMessage 报给父页面，进度条因此是真实进度。 -->
<div id="tp-room-loader" hidden></div>
<script>
(function () {
  // 预计总量：按产物体积 × 传输比估的固定值（每次注入时重算，不会留旧值）。
  // ★ 不再拿 localStorage 里"上次实测"当分母 —— Cocos 的部分请求不写进 Resource Timing，
  //   实测值会明显偏小，用它当分母会让进度条一开局就冲到 90%+（线上实测踩过）。
  var EST = ${est};
  var done = false
  function finish() {
    if (done) return
    done = true
    // 加载画面由宿主负责，这里只需要停止上报
    clearInterval(iv)
  }
  // ① 主信号：房间通过 HostBridge 向宿主 post tp:ready，这里拦一次
  try {
    var P = (window.parent && window.parent !== window) ? window.parent : window
    var raw = P.postMessage ? P.postMessage.bind(P) : null
    if (raw) {
      P.postMessage = function () {
        try { var m = arguments[0]; if (m && m.type === 'tp:ready') finish() } catch (e) {}
        return raw.apply(null, arguments)
      }
    }
  } catch (e) {}
  // ② 兜底：240s 后无论如何停止上报（线上弱网首开实测要 100s+，60s 太短会中途断报）
  setTimeout(finish, 240000)
  // ★ 另外拦一层 XMLHttpRequest：Resource Timing 只记「已经下完」的请求，
  //   3D 的大文件往往一个就十几 MB，传输途中数字会卡住不动。拦截 send 拿
  //   progress 事件里的 loaded 字节，就能把「正在传的那部分」也报出去。
  var live = {}          // url -> 已收字节（含已下完的）
  var settled = {}       // url -> 已经下完（不重复计入 liveSum）
  var liveSum = 0        // 只统计「此刻仍在传」的部分
  var recomputeLive = function () {
    var t = 0
    for (var k in live) if (!settled[k]) t += live[k]
    liveSum = t
  }
  try {
    var XP = XMLHttpRequest.prototype
    var rawOpen = XP.open
    var rawSend = XP.send
    XP.open = function (m, u) {
      try { this.__tpUrl = String(u) } catch (e) {}
      return rawOpen.apply(this, arguments)
    }
    XP.send = function () {
      var xhr = this
      try {
        var u = xhr.__tpUrl || ''
        // ★ 这里不能用 '/room3d/' 之类的前缀过滤: 引擎请求的是相对地址
        //   (assets/resources/native/xx/uuid), 没有前缀会全部漏掉。
        //   3D 页面里除了 /api 的接口调用, 其余请求都是房间资源, 全部计入。
        if (u.indexOf('/api') < 0 && u.indexOf('apiBase') < 0) {
          xhr.addEventListener('progress', function (e) {
            // 不要求 lengthComputable: 分块传输/压缩响应常常没有 Content-Length,
            // 但 e.loaded 依然是已收字节数, 正好用来推动进度条
            if (e && e.loaded > (live[u] || 0)) { live[u] = e.loaded; recomputeLive() }
          })
          xhr.addEventListener('load', function () {
            var n = 0
            try { n = xhr.response ? (xhr.response.byteLength || xhr.response.length || 0) : 0 } catch (e) {}
            if (n > (live[u] || 0)) live[u] = n
            settled[u] = 1
            recomputeLive()
          })
          xhr.addEventListener('error', function () { settled[u] = 1; recomputeLive() })
          xhr.addEventListener('abort', function () { settled[u] = 1; recomputeLive() })
        }
      } catch (e) {}
      return rawSend.apply(this, arguments)
    }
  } catch (e) {}

  var painted = 0
  // ★ 按 URL 累加，而不是每轮重新求和一次：
  //   performance 的资源时间线是有上限的环形缓冲（引擎/浏览器都可能清理），
  //   直接求和会让"已下载字节数"忽多忽少、甚至长期偏小，进度条就卡住了。
  var seen = {}
  var sum = 0
  var iv = setInterval(function () {
    try {
      var es = performance.getEntriesByType('resource') || []
      for (var i = 0; i < es.length; i++) {
        var n = es[i].name || ''
        if (n.indexOf('/room3d/') < 0 && n.indexOf('/assets/') < 0 && n.indexOf('/cocos-js/') < 0) continue
        if (seen[n]) continue
        var sz = es[i].transferSize || es[i].encodedBodySize || 0
        if (sz <= 0) continue // 还在传输/跨域读不到长度，下一轮再看
        seen[n] = sz
        sum += sz
      }
    } catch (e) {}
    // bytes=已下完（传输字节），live=此刻还在传的（解码后字节）。宿主两个加起来用，
    // 否则"大文件正在传"的那几十秒里 bytes 完全不动，看起来就像卡死了。
    try { (window.parent && window.parent !== window ? window.parent : window).postMessage({ type: 'tp:progress', bytes: sum, live: liveSum, est: EST }, '*') } catch (e) {}
    var cv = document.querySelector('canvas')
    if (cv && cv.width > 100 && cv.height > 100) {
      painted++
      // 只用来判断"画布已经画出来了"，不再回写 localStorage 当分母
      if (painted === 12) painted = 13
    }
    if (done) clearInterval(iv)
  }, 250)
})()
</script>
<!--TP_LOADER_END-->
`

// 旧块（没有标记的老产物）从 div 一直删到紧随其后的第一个 </script>
const OLD_BLOCK = [
  /<!--TP_LOADER_START[\s\S]*?<!--TP_LOADER_END-->\s*/i,
  /<div id="tp-room-loader"[\s\S]*?<\/script>\s*/i,
]

export function injectLoader(dir) {
  const html = path.join(dir, 'index.html')
  if (!fs.existsSync(html)) return `跳过（没有 index.html）: ${dir}`
  let src = fs.readFileSync(html, 'utf8')
  for (const re of OLD_BLOCK) src = src.replace(re, '')
  const est = Math.round(dirBytes(dir) * TRANSFER_RATIO)
  const chunk = LOADER(est)
  if (/\s*<\/body>/i.test(src)) src = src.replace(/\s*<\/body>/i, chunk + '\n</body>')
  else src += chunk
  fs.writeFileSync(html, src)
  return `已注入加载进度层（估算首开 ${(est / 1048576).toFixed(1)}MB）: ${dir}`
}

const dirs = process.argv.slice(2).filter(Boolean)
if (dirs.length) for (const d of dirs) console.log(injectLoader(d))
else console.log('用法: node scripts/inject-room3d-loader.mjs <cocos产物目录> [更多目录…]')
