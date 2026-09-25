<template>
  <!-- 进入主页靠「点击页面」, 原先的上滑拖拽与跟手位移已移除 -->
  <div class="welcome" @click="explore">
    <!-- 与 cover 裁切等效的比例容器: 背景呼吸 + 睡猫 Zzz 按图片坐标贴合 -->
    <div class="cover" :style="coverStyle">
      <img
        class="welcome-bg"
        src="/bg/welcome.webp"
        srcset="/bg/welcome-sm.webp 1000w, /bg/welcome.webp 1672w"
        sizes="100vw"
        alt="欢迎背景"
        fetchpriority="high"
        decoding="async"
        draggable="false"
      />
      <div class="zzz" aria-hidden="true">
        <span class="z z1">Z</span>
        <span class="z z2">z</span>
        <span class="z z3">z</span>
      </div>

      <!-- 标题文案: 按参考图渲染为文字(不烘焙进背景), 错峰入场 + 缓慢浮动 -->
      <div class="wk-title">
        <span class="wk-logo" role="img" aria-label="拾光">
          <!-- 字形取自参考图(shiguang-immersive-preview-v4)里的手写「拾光」+ 甩尾,
               已抠成纯白透明 PNG(见 scripts/extract-title.mjs), 比手绘路径更贴原稿,
               也不依赖系统字体(KaiTi/行楷在不同机器上粗细差别很大) -->
          <img
            class="wk-logo-art"
            src="@/assets/title-shiguang.webp"
            alt="拾光"
            draggable="false"
          />
          <i class="wk-spark" aria-hidden="true">✦</i>
        </span>
        <span class="wk-slogan">—— 进入，某个阶段的我</span>
        <!--待改文字-->
        <span class="wk-sub">沿着时光，重新遇见曾经的自己</span>
      </div>

      <!-- 右上拍立得照片墙: 六张记忆卡片, 错峰入场 + 各自缓慢摇摆 -->
      <img
        v-for="c in CARDS"
        :key="c.alt"
        class="wk-card"
        :src="c.src"
        :alt="c.alt"
        draggable="false"
        :style="c.style"
      />

      <!-- "开始探索"按钮: 按参考图文字渲染, 呼吸光晕 -->
      <span class="wk-enter">开始探索</span>
    </div>

    <!-- 漂浮光点: 缓慢上升 + 摇摆 + 淡入淡出 -->
    <div class="wk-dots" aria-hidden="true">
      <span v-for="d in DOTS" :key="d.id" class="wk-dot" :style="d.style"></span>
    </div>

    <!-- 登录/注册入口: 阻止冒泡, 避免点它时被当成点击背景进入主页 -->
    <div class="wk-auth" @click.stop>
      <button v-if="!auth.isLogin" class="wk-auth-btn" type="button" @click="showAuth = true">
        <span class="wk-auth-ico">✦</span>
        登录 / 注册
      </button>
      <div v-else class="wk-auth-user">
        <span class="wk-auth-name">☁ {{ auth.user?.nickname || auth.user?.username }}</span>
        <button class="wk-auth-out" type="button" @click="onLogout">退出</button>
      </div>
      <!-- 云端公告: 公开只读数据, 未登录也能看到 -->
      <cloud-notice class="wk-notice" />
    </div>

    <!-- 登录/注册子组件: diaryOrMnemonic 背景 + 动态光效 -->
    <welcome-auth
      v-if="showAuth"
      @close="onAuthClose"
      @success="onAuthSuccess"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { throttle } from '@/composables/useRateLimit'
import WelcomeAuth from './welcomeAuth.vue'
import CloudNotice from './cloudNotice.vue'
// 卡片大图也走压缩版(1.5MB -> 148KB)
import cardSakura from '@/assets/opt/welcomeCard1.webp'
import cardVinyl from '@/assets/welcomeCard2.webp'
import cardDaisy from '@/assets/welcomeCard3.webp'
import cardCity from '@/assets/welcomeCard4.webp'
import cardLake from '@/assets/welcomeCard5.webp'
import cardMountain from '@/assets/welcomeCard6.webp'

const emit = defineEmits(['explore'])

const auth = useCloudAuthStore()

// 登录/注册子组件的显示开关
const showAuth = ref(false)

// 微信扫码失败会带一条原因回到本站(存在 sessionStorage 的 tp_wx_error 里):
// 自动打开登录框让用户看见原因。原因由 welcomeAuth 取走即清, 所以只会弹这一次。
try {
  if (sessionStorage.getItem('tp_wx_error')) showAuth.value = true
} catch {}
// 因为「未登录」而被拦下的进入主页动作: 登录成功后自动续上, 不用再点一次
const pendingExplore = ref(false)
// 校验进行中: 避免连点触发多次校验
const checking = ref(false)

/**
 * 进入主页的门禁。
 * 不能只看 auth.isLogin —— 那只是「localStorage 里存过一个 token」,
 * 过期/伪造的 token 同样为真。这里让服务端用签名 + 有效期 + token_epoch 验一次。
 */
async function explore() {
  if (checking.value) return
  // 本地连 token 都没有, 直接要求登录, 不必多跑一次网络请求
  if (!auth.isLogin) {
    pendingExplore.value = true
    showAuth.value = true
    return
  }
  checking.value = true
  try {
    const ok = await auth.ensureSession()
    // 服务端没确认就一律不放行, 包括断网/后端不可达(详见 ensureSession 注释)
    if (!ok) {
      pendingExplore.value = true
      showAuth.value = true
      return
    }
    emit('explore')
  } finally {
    checking.value = false
  }
}

function onAuthSuccess() {
  showAuth.value = false
  // 补上被门禁打断的那一步
  if (pendingExplore.value) {
    pendingExplore.value = false
    emit('explore')
  }
}

function onAuthClose() {
  showAuth.value = false
  pendingExplore.value = false
}

function onLogout() {
  auth.logout()
}

// 拍立得照片墙: 位置/尺寸按参考图坐标(2000x1125)摆放;
// 各图透明边距占比不同, 宽度按卡片实际占比补偿; 入场延迟与摇摆周期错开
const CARDS = [
  {
    src: cardSakura,
    alt: '春天的樱花和那时的我们',
    left: '48.2%',
    top: '15.6%',
    w: 195,
    delay: 0.35,
    dur: 6.2,
  },
  {
    src: cardLake,
    alt: '那年夏天风很温柔',
    left: '47.6%',
    top: '35.7%',
    w: 590,
    delay: 0.55,
    dur: 7.1,
  },
  {
    src: cardCity,
    alt: '大学时光是我喜欢的样子',
    left: '61.9%',
    top: '26.7%',
    w: 900,
    delay: 0.15,
    dur: 6.6,
  },
  {
    src: cardVinyl,
    alt: '有些旋律一直在',
    left: '75.5%',
    top: '14.8%',
    w: 465,
    delay: 0.75,
    dur: 5.8,
  },
  {
    src: cardDaisy,
    alt: '成为更好的人',
    left: '73.1%',
    top: '39.6%',
    w: 430,
    delay: 0.95,
    dur: 6.9,
  },
  {
    src: cardMountain,
    alt: '去看更大的世界',
    left: '83.3%',
    top: '28.4%',
    w: 570,
    delay: 0.45,
    dur: 7.4,
  },
].map((c) => ({
  ...c,
  style: {
    left: c.left,
    top: c.top,
    width: `calc(var(--u) * ${c.w})`,
    animationDelay: `${c.delay}s, ${c.delay}s`,
    animationDuration: `0.9s, ${c.dur}s`,
  },
}))

// ---- 与 cover 裁切等效的容器: 保证 Zzz 在任何视口比例下都贴在睡猫头上 ----
const IMG_W = 2000
const IMG_H = 1125
const vw = ref(window.innerWidth)
const vh = ref(window.innerHeight)

// resize 高频触发, 节流 100ms 足够(保持同一引用以便卸载时移除)
const onResize = throttle(() => {
  vw.value = window.innerWidth
  vh.value = window.innerHeight
}, 100)

onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

// cover 容器只负责按视口等比裁切背景, 页面切换不再做位移跟手
const coverStyle = computed(() => {
  const s = Math.max(vw.value / IMG_W, vh.value / IMG_H)
  const w = IMG_W * s
  const h = IMG_H * s
  return {
    left: `${(vw.value - w) / 2}px`,
    top: `${(vh.value - h) / 2}px`,
    width: `${w}px`,
    height: `${h}px`,
    // 1 个参考图像素 = --u, 供文案/卡片按图内尺寸等比缩放
    '--u': `${w / IMG_W}px`,
    // 手机端标题定位要用：cover 相对视口的偏移（竖屏时 left 是很大的负数，
    // 见下方 ≤767.98px 的媒体查询）
    '--cover-x': `${(vw.value - w) / 2}px`,
    '--cover-y': `${(vh.value - h) / 2}px`,
  }
})

// ---- 漂浮光点: 随机参数只生成一次, 动画纯 CSS ----
const DOTS = Array.from({ length: 12 }, (_, id) => {
  const size = 3 + Math.random() * 4
  return {
    id,
    style: {
      left: `${4 + Math.random() * 92}%`,
      width: `${size}px`,
      height: `${size}px`,
      animationDuration: `${9 + Math.random() * 10}s`,
      animationDelay: `${-Math.random() * 16}s`,
      '--sway': `${(Math.random() - 0.5) * 90}px`,
    },
  }
})
</script>

<style scoped>
/* 手写体: 马善政毛笔楷书(OFL 开源)子集, 仅含欢迎页两行文案用到的 31 个字形(9KB),
   与「拾光」大字的手写风真正统一; 系统楷体各机器差异大且无毛笔感, 故不再依赖 */
@font-face {
  font-family: 'Shiguang Hand';
  src: url('../assets/hand-writing-subset.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
.welcome {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 移除上滑手势后不再需要拦截原生滚动 */
  cursor: pointer;
}

/* cover 等效容器: 由 JS 按视口算出裁切矩形, 内部坐标 = 图片坐标 */
.cover {
  position: absolute;
  pointer-events: none;
}

.welcome-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  user-select: none;
  transform-origin: 62% 58%;
  animation: kenburns 26s ease-in-out infinite alternate;
}

/* 慢速推拉: 静图也有镜头呼吸感 */
@keyframes kenburns {
  from {
    transform: scale(1);
  }

  to {
    transform: scale(1.07);
  }
}

/* 睡猫头上的 Zzz: 错峰上升淡出 */
.zzz {
  position: absolute;
  left: 85.5%;
  top: 76.5%;
}

.zzz .z {
  position: absolute;
  bottom: 0;
  left: 0;
  color: #fff;
  font-weight: 700;
  opacity: 0;
  text-shadow: 0 1px 6px rgba(120, 90, 40, 0.45);
  animation: zzz 3.6s ease-in-out infinite;
}

.zzz .z1 {
  font-size: 17.5px;
}

.zzz .z2 {
  font-size: 14.5px;
  animation-delay: 1.2s;
}

.zzz .z3 {
  font-size: 12px;
  animation-delay: 2.4s;
}

@keyframes zzz {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.7) rotate(-6deg);
  }

  25% {
    opacity: 0.95;
  }

  100% {
    opacity: 0;
    transform: translate(16px, -52px) scale(1.2) rotate(10deg);
  }
}

/* 漂浮光点层 */
.wk-dots {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.wk-dot {
  position: absolute;
  bottom: -3%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 246, 218, 0.95) 0%, rgba(255, 246, 218, 0) 70%);
  opacity: 0;
  animation: wk-rise linear infinite;
}

@keyframes wk-rise {
  0% {
    transform: translate3d(0, 0, 0);
    opacity: 0;
  }

  12% {
    opacity: 0.8;
  }

  50% {
    transform: translate3d(var(--sway), -46vh, 0);
    opacity: 0.65;
  }

  100% {
    transform: translate3d(calc(var(--sway) * -0.6), -92vh, 0);
    opacity: 0;
  }
}

/* ---- 标题文案: 参考图文字渲染, 不烘焙进背景 ---- */
.wk-title {
  position: absolute;
  /* ★ 3.6% 是相对 cover 的，而 cover 在 16:10 这类窗口比例下比视口宽（left 是负数），
     标题会被挤到屏幕外、第一个「拾」字被裁掉（1440×900 实测 left = -22px）。
     这里取「3.6%」和「离视口左缘 3vw」两者较大值：宽屏（≥16:9）结果不变，
     更窄的比例自动退回 3vw，字永远完整。 */
  left: max(3.6%, calc(3vw - var(--cover-x, 0px)));
  top: 7.5%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: calc(var(--u) * 22);
  pointer-events: none;
  color: #fff;
  /* 整块文案自左侧滑入(带轻微回弹), 与子元素各自的原入场动画叠加 */
  animation: title-slide 1.2s 0.1s both cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes title-slide {
  from {
    transform: translateX(calc(var(--u) * -140));
  }

  to {
    transform: translateX(0);
  }
}

.wk-logo {
  position: relative;
  display: block;
  /* 素材紧贴笔画(底边即字底), 所以这里比旧版多留一点, 与下方标语拉开同样的距离 */
  margin-bottom: calc(var(--u) * 56);
  color: #fff;
  animation:
    logo-in 1.1s 0.15s both cubic-bezier(0.22, 0.61, 0.36, 1),
    logo-float 7s 1.3s ease-in-out infinite;
}

/* 参考图字形的落位: 素材是紧贴笔画的 402x181(2.221:1), 这里按宽度自适应,
   宽度取值与旧版手绘 SVG 的「字身」视觉等大(旧 viewBox 内字身约占 232/268) */
.wk-logo-art {
  display: block;
  width: calc(var(--u) * 324);
  height: auto;
  /* 纯白笔画 + 极轻的暖白光晕, 让字从深色照片里浮出来 */
  filter: drop-shadow(0 calc(var(--u) * 2) calc(var(--u) * 10) rgba(255, 240, 210, 0.3));
}

.wk-spark {
  position: absolute;
  left: 76%;
  top: -20%;
  font-size: calc(var(--u) * 30);
  font-style: normal;
  animation: spark-twinkle 2.6s 1.2s ease-in-out infinite;
}

.wk-slogan {
  /* 与手写大字「拾光」呼应: 走楷体/行楷族, 各平台自动落到最接近的手写体 */
  font-family: 'Shiguang Hand', 'Kaiti SC', 'STKaiti', KaiTi, '楷体', '华文行楷', 'Xingkai SC', serif;
  font-size: calc(var(--u) * 34);
  letter-spacing: calc(var(--u) * 8);
  text-shadow: 0 calc(var(--u) * 1) calc(var(--u) * 8) rgba(90, 60, 20, 0.4);
  animation: line-up 1s 0.75s both cubic-bezier(0.22, 0.61, 0.36, 1);
}

.wk-sub {
  /* 同上: 小字与大字统一为手写风 */
  font-family: 'Shiguang Hand', 'Kaiti SC', 'STKaiti', KaiTi, '楷体', '华文行楷', 'Xingkai SC', serif;
  font-size: calc(var(--u) * 24);
  letter-spacing: calc(var(--u) * 5);
  color: rgba(255, 255, 255, 0.88);
  text-shadow: 0 calc(var(--u) * 1) calc(var(--u) * 6) rgba(90, 60, 20, 0.4);
  animation: line-up 1s 1.05s both cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes logo-in {
  from {
    opacity: 0;
    filter: blur(calc(var(--u) * 10));
    scale: 0.92;
  }

  to {
    opacity: 1;
    filter: blur(0);
    scale: 1;
  }
}

@keyframes logo-float {
  0%,
  100% {
    translate: 0 0;
  }

  50% {
    translate: 0 calc(var(--u) * -8);
  }
}

@keyframes line-up {
  from {
    opacity: 0;
    translate: 0 calc(var(--u) * 18);
  }

  to {
    opacity: 1;
    translate: 0 0;
  }
}

@keyframes spark-twinkle {
  0%,
  100% {
    opacity: 0.35;
    scale: 0.7;
    rotate: 0deg;
  }

  50% {
    opacity: 1;
    scale: 1.15;
    rotate: 90deg;
  }
}

/* ---- 拍立得照片墙: 入场缩放淡入 + 悬摆摇摆(不同属性, 互不覆盖) ---- */
.wk-card {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 calc(var(--u) * 10) calc(var(--u) * 24) rgba(70, 50, 30, 0.25));
  animation:
    card-in 0.9s both cubic-bezier(0.22, 0.61, 0.36, 1),
    card-sway 6.5s ease-in-out infinite;
}

@keyframes card-in {
  from {
    opacity: 0;
    scale: 0.55;
  }

  to {
    opacity: 1;
    scale: 1;
  }
}

@keyframes card-sway {
  0%,
  100% {
    translate: 0 0;
    rotate: 0deg;
  }

  50% {
    translate: 0 calc(var(--u) * -10);
    rotate: 1.4deg;
  }
}

/* ---- 开始探索按钮 ---- */
.wk-enter {
  position: absolute;
  left: 50%;
  top: 88.5%;
  transform: translate(-50%, -50%);
  padding: calc(var(--u) * 16) calc(var(--u) * 62);
  border: 1px solid rgba(255, 240, 214, 0.75);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 244, 224, 0.32), rgba(255, 226, 190, 0.16));
  backdrop-filter: blur(2px);
  color: #fff;
  font-size: calc(var(--u) * 26);
  letter-spacing: calc(var(--u) * 10);
  text-shadow: 0 1px 6px rgba(90, 60, 20, 0.45);
  pointer-events: none;
  animation:
    enter-in 1s 1.3s both cubic-bezier(0.22, 0.61, 0.36, 1),
    enter-glow 3.2s 2.3s ease-in-out infinite;
}

@keyframes enter-in {
  from {
    opacity: 0;
    scale: 0.8;
  }

  to {
    opacity: 1;
    scale: 1;
  }
}

@keyframes enter-glow {
  0%,
  100% {
    box-shadow: 0 0 calc(var(--u) * 12) rgba(255, 214, 160, 0.35);
  }

  50% {
    box-shadow: 0 0 calc(var(--u) * 26) rgba(255, 214, 160, 0.7);
  }
}

/* ---- 登录/注册入口: 右上角胶囊, 与欢迎页暖金风一致 ---- */
.wk-auth {
  position: absolute;
  top: 4.5%;
  right: 4%;
  z-index: 5;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  animation: auth-in 1s 1.1s both cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes auth-in {
  from {
    opacity: 0;
    transform: translateY(-12px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.wk-auth-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 20px;
  border: 1px solid rgba(255, 240, 214, 0.7);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 244, 224, 0.3), rgba(255, 226, 190, 0.14));
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 15.5px;
  letter-spacing: 2px;
  text-shadow: 0 1px 6px rgba(90, 60, 20, 0.45);
  cursor: pointer;
  transition:
    transform 0.18s,
    box-shadow 0.18s,
    background 0.18s;
}

.wk-auth-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(255, 200, 140, 0.4);
  background: linear-gradient(180deg, rgba(255, 248, 232, 0.42), rgba(255, 226, 190, 0.22));
}

.wk-auth-ico {
  font-size: 14.5px;
  color: #ffe6b8;
  animation: spark-twinkle 2.6s ease-in-out infinite;
}

.wk-auth-user {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px 7px 18px;
  border: 1px solid rgba(255, 240, 214, 0.6);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 244, 224, 0.3), rgba(255, 226, 190, 0.14));
  backdrop-filter: blur(4px);
}

.wk-auth-name {
  color: #fff;
  font-size: 15.5px;
  letter-spacing: 1px;
  text-shadow: 0 1px 6px rgba(90, 60, 20, 0.45);
}

.wk-auth-out {
  padding: 4px 12px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.18s;
}

.wk-auth-out:hover {
  background: rgba(255, 255, 255, 0.38);
}

@media (prefers-reduced-motion: reduce) {
  .welcome-bg,
  .wk-auth,
  .wk-auth-ico,
  .wk-dot,
  .zzz .z,
  .wk-title,
  .wk-logo,
  .wk-spark,
  .wk-slogan,
  .wk-sub,
  .wk-card,
  .wk-enter {
    animation: none;
  }
}
/* ============ 手机竖屏（≤767.98px）============
   根因：背景是 2000×1125 的横图，靠 cover 铺满 390×844 的竖屏时横向被裁掉大半
   （cover 变成 1500 宽、left = -555）。所有按「图片百分比」定位的东西（标题、拍立得墙）
   都会跑到屏幕外 —— 实测手机上标题整个看不见，拍立得 6 张里 4 张在裁剪区外。
   标题：改成按**视口**锚定（left = 7vw 减去 cover 的横向偏移），字号用 --u 缩到手机比例；
   拍立得墙：手机上一张不显示（4 张本来就看不见，剩下 2 张会和标题撞在一起）。 */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  .wk-title {
    left: calc(7vw - var(--cover-x, 0px));
    top: calc(150px + env(safe-area-inset-top, 0px) - var(--cover-y, 0px));
    /* 标题自己一套比例尺：图片宽度 ≈ 62vw（390 上是 204px），不再跟 cover 的 --u 走 */
    --u: calc(min(100vw, 520px) / 620);
  }
  .wk-card {
    display: none;
  }
  /* 「退出」只有 50×27，手指点容易点空；外层扩一圈热区，视觉大小不变 */
  .wk-auth-out {
    position: relative;
    min-height: 38px;
    padding: 8px 16px;
  }
  .wk-auth-out::after {
    content: '';
    position: absolute;
    inset: -7px -6px;
  }
  /* 手机端登录按钮 / 公告条跟着往下让一点，别贴到安全区里 */
  .wk-auth {
    top: calc(4.5% + env(safe-area-inset-top, 0px));
    right: 4%;
  }
  /* 「开始探索」是按 --u 撑出来的胶囊，手机上顺手把热区标高一点 */
  .wk-enter {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
