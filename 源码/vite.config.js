import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// ---- 全局字号缩放(个人中心可选 大/中/小) ----
// 构建期把所有 `font-size: Npx` 重写为 `calc(Npx * var(--fs, 1))`,
// --fs 挂在 <html> 上(src/fontSize.js 读 localStorage: small=1 / mid=1.15 / large=1.3)。
// 只缩放文字、不动布局骨架(宽高间距仍是 px), 配合 App.vue 里的护栏样式, 页面不会被撑变形。
// 注意: 只匹配纯 px 单值, `font-size: 0`(窄屏隐藏文字的技巧)与 em/% 均不受影响。
const FONT_SCALE_RE = /^(\d+(?:\.\d+)?)px$/
function fontScalePlugin() {
  return {
    postcssPlugin: 'tp-font-scale',
    Declaration(decl) {
      if (decl.prop !== 'font-size') return
      const m = FONT_SCALE_RE.exec(decl.value.trim())
      if (m) decl.value = `calc(${m[1]}px * var(--fs, 1))`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  build: {
    // 关掉 vite 自带的 public/ 拷贝：它会在 prepare-out-dir 阶段无条件递归整个 public/，
    // 只要里面有一个读不动的残留目录（被系统加了"拒绝访问"的那种），整个构建就 EPERM 挂掉。
    // 改由 scripts/copy-public.mjs 拷（遇到读不动的条目跳过并告警，不会拖垮构建）。
    copyPublicDir: false,
    // 同理关掉「构建前清空 dist」：这里塞了 100MB 的 3D 房间产物（public/room3d），
    // 清空动作会走系统回收站、在受限环境里直接超时/EPERM 把整个构建拖挂。
    // 不清理只是留下上一轮的旧 hash 文件（index.html 不会引用它们），比构建失败划算得多。
    emptyOutDir: false,
  },
  css: {
    postcss: {
      plugins: [fontScalePlugin()],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // DeepSeek 已改为由后端 action `ai/chat` 代理(密钥只存服务端), 这里不再需要转发代理
    proxy: {
      // 媒体地址已改为相对路径 /uploads/... 入库, dev 下由 vite 转发到后端 8787, 与线上同源行为一致
      '/uploads': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
})
