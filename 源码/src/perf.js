// 实时帧率看门狗: 掉帧时自动降档, 只砍装饰性开销(粒子/漂浮/云), 交互与功能不受影响。
//
// 想调参改这里:
//   SAMPLE_EVERY 每 3 秒抽一次样; WINDOW_MS 每次采样 500ms(其余时间不跑 rAF, 自身几乎零开销)
//   LOW_FPS / GOOD_FPS 降档与恢复阈值; BAD_ROUNDS 连续几次判定卡才真的降(防抖)
// 想彻底关掉自动降档: localStorage.setItem('tp:perf-auto', '0')
const SAMPLE_EVERY = 3000
const WINDOW_MS = 500
const LOW_FPS = 42
const GOOD_FPS = 52
const BAD_ROUNDS = 2
const OFF_KEY = 'tp:perf-auto'

let low = false
let badRounds = 0
let timer = null
let raf = 0

export function isPerfLow() {
  return low
}

function setLow(v) {
  if (low === v) return
  low = v
  // 全局 CSS 消费: html[data-perf='low'] 下停掉装饰动画
  document.documentElement.dataset.perf = v ? 'low' : 'ok'
  try {
    window.dispatchEvent(new CustomEvent('tp:perf', { detail: { low: v } }))
  } catch {}
}

function sample() {
  let frames = 0
  const t0 = performance.now()
  const tick = (ts) => {
    frames += 1
    if (ts - t0 < WINDOW_MS) {
      raf = requestAnimationFrame(tick)
      return
    }
    raf = 0
    const fps = (frames * 1000) / (ts - t0)
    if (document.visibilityState !== 'visible') return // 后台标签页的帧率没有参考价值
    if (fps < LOW_FPS) {
      badRounds += 1
      if (badRounds >= BAD_ROUNDS) setLow(true)
    } else if (fps > GOOD_FPS) {
      badRounds = 0
      setLow(false)
    }
  }
  raf = requestAnimationFrame(tick)
}

export function startFpsWatch() {
  if (timer) return
  try {
    if (localStorage.getItem(OFF_KEY) === '0') return // 手动关闭
  } catch {}
  sample()
  timer = setInterval(() => {
    if (!raf) sample()
  }, SAMPLE_EVERY)
}

export function stopFpsWatch() {
  if (timer) clearInterval(timer)
  timer = null
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

// 页面切到后台别再采样: 后台 rAF 会被浏览器限到 1fps, 会误判成"卡"
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!raf) sample()
    } else if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  })
}
