<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Welcome from './components/welcome.vue'
import AuthModal from './components/authModal.vue'
import VideoNotice from './components/videoNotice.vue'
import { usePageSlideStore } from './stores/pageSlide'
import { useCloudAuthStore } from './stores/cloudAuth'
import { refreshAiStatus } from './api/deepseek'
import { warmupRoom3d } from './room/warmup'

const router = useRouter()
const store = usePageSlideStore()
const cloudAuth = useCloudAuthStore()

// 首屏渲染完成后再启用过渡动画, 避免刷新 /index 时播放不必要的开场动画
const ready = ref(false)
onMounted(() => {
  requestAnimationFrame(() => {
    ready.value = true
  })
  // 恢复本地 token 对应的登录态(拉取用户与资料)
  cloudAuth.refresh()
  // 3D 房间预热：已登录的用户在别的页面闲着时，把房间启动必需的小文件先下到缓存里。
  // 只在空闲时段做、一次会话只做一次、总预算 6MB，不会影响当前页面的手感。
  setTimeout(() => {
    if (!cloudAuth.token) return
    warmupRoom3d().then((bytes) => {
      if (bytes > 0) console.debug('[room3d] 后台预热', (bytes / 1048576).toFixed(1), 'MB')
    })
  }, 3000)
  // 探测服务端是否配置了 AI 能力(密钥在服务端, 这里只拿一个布尔值)
  refreshAiStatus(true)
})

// 监听路由变化(包括浏览器前进/后退), 同步页面切换状态
watch(
  () => router.currentRoute.value.name,
  (name) => {
    if (name === 'welcome') store.goWelcome()
    else store.goIndex()
  },
  { immediate: true },
)

// 两页由同一个标记驱动显隐: 欢迎页与首页之间不再做上下滑动, 只做淡入淡出
const atWelcome = computed(() => store.view === 'welcome')

function handleExplore() {
  router.replace({ name: 'index' })
}

function handleBack() {
  router.replace({ name: 'welcome' })
}
</script>

<template>
  <div class="app-shell" :class="{ ready }">
    <!-- 欢迎页常驻, 与首页互斥显隐 -->
    <Welcome class="page" :class="{ active: atWelcome }" @explore="handleExplore" />
    <!-- index 主路由(布局)经 router-view 渲染: '/' 与 '/index/*' 都是它, 保证常驻且内部子路由深度正确 -->
    <router-view class="page" :class="{ active: !atWelcome }" @back="handleBack" />
    <!-- 全局登录/注册弹窗: 由 cloudAuth store 的 modal 状态驱动 -->
    <AuthModal />
    <!-- 全局顶部提示: AI 视频生成进度 + 完成/失败 toast -->
    <VideoNotice />
    <!-- 冷色氛围纱罩: 由空间偏好 tone 控制(html[data-tone]) -->
    <div class="tone-veil" aria-hidden="true"></div>
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  overflow: hidden;
  overscroll-behavior: none;
  -webkit-user-select: none;
  user-select: none;
}

/* 全局断行护栏: 字号调大后长词/长句优先在词内折行, 不把固定宽容器撑变形 */
body {
  overflow-wrap: break-word;
}

/* ---- 字号档位(大/中/小)护栏: --fs 只放大文字, 布局骨架不动, 关键容器兜底 ---- */
/* 左侧导航: 导航项是 nowrap, 字号放大后 15% 侧栏装不下, 给侧栏抬最低宽度, 内容区自动让位 */
html[data-fs='mid'] .index-side {
  min-width: 206px;
}

html[data-fs='large'] .index-side {
  min-width: 238px;
}

/* 固定宽度的弹层/面板: 字号放大后允许内部换行, 不横向溢出 */
.dm-panel,
.dm-confirm,
.idx-notice,
.idx-toast {
  max-width: min(92vw, 460px);
}

/* 岛屿木牌/翻页按钮等绝对定位小件: 字号变大后限宽省略, 不压到邻岛 */
html:not([data-fs='small']) .isle-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- 尺寸自适应: 笔记本 / 平板 / 手机 ---- */
/* 根层 touch-action: none 是为了「下滑回欢迎页」的手势, 但它会连带禁掉内容区的触摸滚动,
   手机上列表根本滚不动。这里在可滚动区域把纵向手势还给浏览器。 */
.index-main,
.page-view,
.dm-panel-body {
  touch-action: pan-y;
}

@media (max-width: 1280px) {
  .page-view {
    padding: 32px 36px;
  }

  .page-body {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}

/* 平板 / 窄窗口 */
@media (max-width: 980px) {
  .page-view {
    padding: 26px 22px;
  }

  .page-title {
    font-size: 25px;
  }

  .card {
    padding: 18px;
  }

  /* 字号放大档给侧栏抬的最低宽度, 在窄屏上会把内容区挤没 —— 这里撤掉, 交给 760 断点的图标栏 */
  html[data-fs='mid'] .index-side,
  html[data-fs='large'] .index-side {
    min-width: 0;
  }

  .index-side {
    flex: 0 0 21%;
  }
}

/* 手机 */
@media (max-width: 760px) {
  .page-view {
    padding: 18px 14px;
  }

  .page-title {
    font-size: 22px;
    letter-spacing: 2px;
  }

  .page-desc {
    font-size: 15px;
  }

  .page-body {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .card {
    padding: 16px;
  }

  .switch-row {
    padding: 14px 16px;
  }
}

/* 手机专属: 点击热区 / iOS 聚焦缩放 / 弹窗全屏化 */
@media (max-width: 760px) {
  /* iOS 上输入框字号 <16px 会在聚焦时自动放大整页 —— 统一抬到 16px */
  input,
  textarea,
  select {
    font-size: 16px;
  }

  /* 手指点得到: 小按钮抬到 40px 最小热区 */
  .dm-tab,
  .dm-action-btn,
  .idx-notice-go,
  .idx-notice-x,
  .dm-panel-close,
  .nav-fold {
    min-height: 40px;
    min-width: 40px;
  }

  .idx-bell {
    width: 46px;
    height: 46px;
    top: 14px;
    right: 14px;
  }

  /* 弹窗在手机上做成底部抽屉, 比居中浮层好用得多 */
  .dm-panel {
    width: 100%;
    max-width: 100%;
    max-height: 88vh;
    border-radius: 18px 18px 0 0;
  }

  .dm-overlay {
    align-items: flex-end;
  }

  .dm-panel-body {
    max-height: 60vh;
  }

  .dm-confirm {
    width: 92%;
  }

  .idx-notice {
    left: 12px;
    right: 12px;
    bottom: 74px;
    transform: none;
  }

  .idx-toast {
    bottom: 40px;
  }
}

/* 小屏手机 */
@media (max-width: 480px) {
  .page-view {
    padding: 14px 10px;
  }

  .page-body {
    gap: 10px;
  }
}

/* 横屏矮屏(笔记本 / 平板横放): 纵向空间紧张, 收紧上下留白 */
@media (max-height: 620px) {
  .page-view {
    padding: 16px 22px;
  }

  .page-body {
    margin-top: 18px;
  }
}

.app-shell {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0d1420;
}

.page {
  position: absolute;
  inset: 0;
  opacity: 0;
  /* 藏起来的那一层不能吃掉点击和滚动 */
  visibility: hidden;
  pointer-events: none;
}

/* 首页渲染完成后才启用过渡, 避免刷新 /index 时播放不必要的开场动画 */
.app-shell.ready .page {
  transition: opacity 0.32s ease, visibility 0s linear 0.32s;
}

.app-shell.ready .page.active {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition: opacity 0.32s ease, visibility 0s;
}

/* ★ 2026-10-27 性能：欢迎页是常驻挂载的（只切 opacity/visibility），而
   `visibility: hidden` **不会**暂停 CSS 动画 —— 在记忆库 / 广场 / 3D 房间里时，
   欢迎页那 7 个 infinite 动画（kenburns 全屏背景 26s 缩放、card-sway、logo-float、
   spark-twinkle、zzz、wk-rise、enter-glow）仍在后台空转，每帧都要重新合成整页。
   这一行把它们全部冻结，零成本换回不少帧率；切回欢迎页时动画从暂停处继续，观感不变。
   ★ 用 animation-play-state 而不是 animation:none —— 后者会让元素瞬移回初始位置。 */
.page:not(.active) *,
.page:not(.active) *::before,
.page:not(.active) *::after {
  animation-play-state: paused !important;
}

/* 子页面(记忆空间/记忆库/隐私设置/个人中心)通用样式 */
.page-view {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 40px 56px;
  overflow: auto;
  background: #f7f8fa;
}

.page-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.page-title {
  margin: 0;
  font-size: 28px;
  letter-spacing: 3px;
  color: #2b3440;
}

.page-desc {
  margin: 0;
  font-size: 17px;
  letter-spacing: 1px;
  color: #9aa3af;
}

.page-body {
  margin-top: 32px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.page-body.col {
  grid-template-columns: 1fr;
  max-width: 560px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(31, 45, 61, 0.06);
}

.card-title {
  font-size: 17.5px;
  letter-spacing: 1px;
  color: #2b3440;
}

.card-sub {
  font-size: 14.5px;
  color: #9aa3af;
}

.empty-tip {
  grid-column: 1 / -1;
  padding: 48px 0;
  text-align: center;
  font-size: 17px;
  letter-spacing: 2px;
  color: #b3bac4;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(31, 45, 61, 0.06);
}

.switch-label {
  font-size: 17px;
  letter-spacing: 1px;
  color: #2b3440;
}

.switch {
  position: relative;
  width: 44px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: #dfe3e8;
  cursor: pointer;
  transition: background 0.2s ease;
}

.switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.2s ease;
}

.switch.on {
  background: #3d7bfd;
}

.switch.on::after {
  left: 23px;
}

.profile-card {
  flex-direction: row;
  align-items: center;
  gap: 16px;
}

.profile-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd9a0, #ff9db1);
}

/* 冷色氛围: 全屏冷调纱罩, 不参与交互 */
.tone-veil {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  /* 原先用 mix-blend-mode: multiply 做冷调, 但全屏混合模式会让每一帧都多一次整页合成, 是全局卡顿的大头; 改成普通半透明叠加, 观感接近但便宜得多 */
  background: linear-gradient(180deg, rgba(96, 138, 200, 0.2), rgba(70, 110, 180, 0.14));
  opacity: 0;
  transition: opacity 0.6s ease;
}

html[data-tone='cool'] .tone-veil {
  opacity: 1;
}

/* 低动效: 停掉装饰性动画与过渡(与 prefers-reduced-motion 同一套路) */
html[data-motion='low'] *,
html[data-motion='low'] *::before,
html[data-motion='low'] *::after {
  animation-duration: 0.001s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001s !important;
}

/* 帧率自动降档(perf.js 写入 html[data-perf='low']): 只停装饰性动画,
   过渡与交互动效保留, 所以降档后手感不会变生硬 */
html[data-perf='low'] .deco-cloud,
html[data-perf='low'] .isle-floater,
html[data-perf='low'] .fx-cloud,
html[data-perf='low'] .memory-tv,
html[data-perf='low'] .wa-glow,
html[data-perf='low'] .idx-bell.alert svg {
  animation: none !important;
}

html[data-perf='low'] .deco-spark {
  opacity: 0.55;
}

/* 图片加载失败占位: 不再是一片空白, 显示柔和底纹(由 main.js 打 data-failed) */
img[data-failed] {
  background:
    linear-gradient(135deg, #eef1f6 0%, #e4e9f0 100%);
  background-size: cover;
  object-fit: cover;
}

/* 系统级"减少动态效果"也走同一套关停逻辑 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001s !important;
  }
}

/* ============================================================================
   手机地基（2026-10-28）
   ★ 全部写在 max-width 断点里：桌面宽屏根本不会匹配这些选择器，
     样式匹配阶段就被跳过，没有运行时成本，也不改桌面任何一条现有规则。
   ★ 这里只放"全站共用"的一层；各页自己的版式在各组件里，避免互相打架。
   ============================================================================ */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  /* 1) 100dvh 取代 100vh ── 手机地址栏收起/展开时，vh 是按"最高"算的，
        底部那条陈列栏会被地址栏盖住；dvh 跟着可视高度走。老浏览器回落到 100%。 */
  @supports (height: 100dvh) {
    html,
    body,
    #app,
    .app-shell {
      height: 100dvh;
    }
  }

  /* 2) 安全区 ── 刘海/圆角/底部小白条。只给贴边的容器补内边距，
        不给 body 加 padding（那会让整页背景露白）。 */
  .index-side {
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }

  .idx-notice {
    bottom: calc(74px + env(safe-area-inset-bottom));
  }

  .idx-toast {
    bottom: calc(40px + env(safe-area-inset-bottom));
  }

  /* 3) 点击手感 ── 去掉浏览器"等 300ms 看是不是双击"的判定，按下去立刻响应。
        双指缩放仍然可用（没动 viewport 的 maximum-scale）。 */
  button,
  a,
  [role='button'],
  label,
  select {
    touch-action: manipulation;
  }

  /* 4) iOS 聚焦放大 ── 输入框字号 <16px 时 Safari 会放大整页且不自动缩回，
        这是手机上"点一下输入框，整个页面就歪了"的常见原因。 */
  input,
  textarea,
  select {
    font-size: 16px;
  }

  /* 5) 弹层改底部抽屉 ── 大拇指够得到，也不会被软键盘顶飞。
        这里先覆盖布局壳自己的三个弹层（私信面板/确认框/通知条），
        其它组件的弹层在各自文件里改，避免一条通配规则误伤。 */
  .dm-overlay {
    align-items: flex-end;
  }

  .dm-panel {
    width: 100%;
    max-width: 100%;
    max-height: 88dvh;
    border-radius: 18px 18px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .dm-panel-body {
    max-height: 62dvh;
  }

  /* 6) 小胶囊按钮的统一兜底热区 ── 实测各页还有一批 26~34px 高的按钮
        （广场的点赞/详情/标签、记忆卡的分享、反馈的类型、我的页面里的配置入口）。
         它们分散在各自 scoped 样式里，逐个改既啰嗦又容易漏；
         而这些规则都**没有声明 min-height**，所以这里一条全局 min-height
         不会被 scoped 选择器压掉，也不会改变任何视觉（只把外面的盒子撑高一点）。 */
  .p-like,
  .p-expand,
  .p-tag,
  .entry-share,
  .fb-type,
  .fb-contact,
  .edit-btn,
  .link-row,
  .search-go {
    min-height: 38px;
  }

  .search-go {
    min-width: 38px;
  }

  /* 我的页面里那组配置入口：桌面靠右对齐的窄条，手机上宽度跟着内容走，
     行宽参差不齐（虚线只画到一半）。整宽之后既好看又好点。 */
  .link-row {
    width: 100%;
  }
}
</style>
