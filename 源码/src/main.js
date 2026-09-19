import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { applyFontSize, getFontSize } from './fontSize'
import { startFpsWatch } from './perf'
// 首屏(欢迎页)背景已挪到 public/bg/ 下（文件名不带 hash），
// 预加载改在 index.html 里用 <link rel="preload"> 直接发起 —— 不用等 JS 执行。

// 渲染前先挂字号档位, 避免首帧闪一下默认字号
applyFontSize(getFontSize())

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 云账号（微信）登录会带着 ?code=…&state=…&provider=wechat 回到站点根路径。
// 这一步必须赶在路由守卫之前跑完：code 是一次性的，被守卫踢走就白扫了。
import {
  afterCloudLoginRedirect,
  clearCloudCallbackUrl,
  handleCloudCallback,
  isCloudCallback,
  takeLocalWechatIntent,
} from './cloud/client'
import { finishLocalWechatLogin, wechatLoginFailedToWelcome } from './cloud/localLogin'

async function boot() {
  try {
    if (isCloudCallback()) {
      // 先取意图再处理回调：不管成败都要清掉，免得上一次失败的扫码影响下一次
      const intent = takeLocalWechatIntent()
      const ok = await handleCloudCallback()
      if (ok) {
        // ★ 这里原来只看 sessionStorage 里的「扫码意图」决定要不要换本地登录态。
        //   但微信授权要经过 open.weixin.qq.com → www.workbuddy.cn 再跳回来，
        //   中间只要有一次落到新标签页（微信/中转页用 window.open 打开），
        //   sessionStorage 就没了（它按标签页隔离）。丢了的后果是：
        //   云会话明明已经建立，却只按「连云备份」处理，用户回到首页仍是未登录
        //   —— 表现就是「扫码成功但登不上去」。
        //   改成：本地还没有登录态就一定要换；已登录时仅当本次扫码确实是从
        //   登录弹窗发起（intent 还在）才切换账号，否则按连云备份处理，
        //   避免「已登录的用户想连云备份，结果被换成了另一个微信账号」。
        const hasLocal = !!localStorage.getItem('tp_token')
        if (intent || !hasLocal) {
          await finishLocalWechatLogin(intent?.next)
          return
        }
        // 否则是云面板发起的扫码，回到「我的」页打开云面板
        afterCloudLoginRedirect()
        return
      }
      // 扫码/换会话失败：别把用户留在带 code 的空白页上，回欢迎页显示原因。
      // 和上面同理，不能只看 intent：intent 丢了的时候用户本来就还没登录，
      // 更应该回欢迎页告诉他这次为什么没成，而不是把他丢回一个未登录的首页。
      if (intent || !localStorage.getItem('tp_token')) {
        wechatLoginFailedToWelcome()
        return
      }
      // 已登录的用户这次只是想连云备份：失败不必踢走，但一次性 code 不能留在地址栏
      clearCloudCallbackUrl()
    }
  } catch (e) {
    console.warn('[cloud] 启动回调处理失败:', e && e.message)
  }
  app.mount('#app')
}

boot()

// 帧率看门狗: 掉帧时自动降档(仅砍装饰动画)
startFpsWatch()

// ---- 图片加载失败兜底: 捕获阶段统一处理, 不用给每个组件加 onerror ----
// 失败先打标记(CSS 给占位底纹), 再带时间戳重试一次(绕开缓存); 重试成功自动去掉标记
window.addEventListener(
  'error',
  (e) => {
    const el = e.target
    if (!el || el.tagName !== 'IMG' || el.dataset.retried) return
    el.dataset.failed = '1'
    el.dataset.retried = '1'
    const raw = el.currentSrc || el.src || ''
    if (!raw) return
    setTimeout(() => {
      el.src = raw.split('?')[0] + '?retry=' + Date.now()
    }, 600)
  },
  true,
)

window.addEventListener(
  'load',
  (e) => {
    const el = e.target
    if (el && el.tagName === 'IMG' && el.dataset.failed && el.naturalWidth > 0) {
      delete el.dataset.failed
    }
  },
  true,
)
