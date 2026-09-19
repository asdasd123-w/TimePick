// 全局字号缩放(大/中/小): 设备级偏好, 存 localStorage, 不随云端账号同步
// 生效原理: vite.config.js 的 fontScalePlugin 在构建期把 `font-size: Npx`
// 编译成 `calc(Npx * var(--fs, 1))`, 这里把 --fs 挂到 <html> 上即可全局生效。
// 档位: small=1(当前默认) / mid=1.15 / large=1.3 —— 想调幅度改这里的 MAP 即可。
const KEY = 'tp:font-size'
const MAP = { small: '1', mid: '1.15', large: '1.3' }

export function getFontSize() {
  try {
    return localStorage.getItem(KEY) || 'small'
  } catch {
    return 'small'
  }
}

export function applyFontSize(v) {
  const val = MAP[v] ? v : 'small'
  const root = document.documentElement
  root.dataset.fs = val
  root.style.setProperty('--fs', MAP[val])
  try {
    localStorage.setItem(KEY, val)
  } catch {}
}
