<template>
  <!-- ★ :class="booting" ：房间还在加载（等 Cocos 发 tp:ready）时，宠物和右侧列表要藏起来。
       加载完成的一瞬间再一起出现 —— 这样"跑场"看起来就是宠物从加载态里跑进这个房间，
       而不是它一直挂在半透明的 loading 遮罩上面乱晃。 -->
  <div class="room3d" :class="{ booting }">
    <!-- 3D 房间由 Cocos 构建的 Web 产物承载（默认同源 /room3d，见 VITE_ROOM3D_URL） -->
    <iframe v-if="built && !layoutError" ref="frame" class="room3d-frame" :src="src" frameborder="0"></iframe>

    <!-- ★ 2026-10-29 房间进入失败（对应验证报告 FIX03）：
         以前布局接口报错只在角落闪一句 2.6 秒的提示，随后照样显示一间空屋子 ——
         用户会以为自己房间里的东西丢了。现在改成**常驻**错误页：说清原因、给重试和返回，
         并且把 iframe 一起摘掉，不再假装"房间正常、只是没东西"。
         ★ 这一支必须排在下面「产物没就位」之前，否则 built=true 时会先命中那一支。 -->
    <div v-else-if="layoutError" class="room-empty room-error">
      <div class="re-card">
        <p class="re-title">暂时无法进入房间</p>
        <p class="re-sub">{{ layoutError }}</p>
        <div class="re-acts">
          <button class="re-btn" type="button" @click="goBack">← 返回记忆空间</button>
          <button class="re-btn primary" type="button" @click="retryLayout">重新加载</button>
        </div>
      </div>
    </div>

    <!-- 产物还没就位: 绝不能让 iframe 去请求 /room3d/
         —— 此时 dev server / 静态服务的 SPA 兜底会把 TimePick 自己的首页返回给 iframe，
         页面里就"变成欢迎页"了。这里改成明确的空态提示。
         ★ 只在「探测失败」时才显示这一屏: 探测过程中用的是下面那层唯一的等待页
           （小猫跑酷 + 进度条），不再出现第二个"正在打开 3D 房间…"的独立加载页。 -->
    <div v-else-if="!probing" class="room-empty">
      <div class="re-card">
        <p class="re-title">{{ probing ? '正在打开 3D 房间…' : '3D 房间还没构建' }}</p>
        <template v-if="!probing">
          <p class="re-sub">
            把 Cocos 构建产物复制到
            <code>TimePick/public/room3d/</code>
            后刷新本页即可进入房间。详细步骤见
            <code>3d日记房间/sg3d_SETUP.md</code>。
          </p>
          <code class="re-cmd">cd E:\传智杯\TimePick &amp;&amp; npm run copy-room3d</code>
          <p class="re-sub">等价的原始命令：</p>
          <code class="re-cmd"
            >xcopy /E /Y "E:\传智杯\3d日记房间\sg3d\build\web-mobile\*"
            "E:\传智杯\TimePick\public\room3d\"</code
          >
        </template>
      </div>
    </div>

    <!-- 进入房间的等待层。
         Cocos 自带的启动插屏（那个 "Created with Cocos" 标志页）已经关掉了
         —— 见 scripts/patch-room3d-splash.mjs；插屏一关，引擎起来之前画布就是空的，
         所以这里盖一层拾光自己的等待态，等房间通过 postMessage 发来 tp:ready 再淡出。
         兜底 30 秒 + pointer-events:none：线上第一次打开要现场下载 161MB 资源
         （实测首开 24s 上下），12 秒会让等待层提前收掉，用户看到的是还没渲染完的黑画布。 -->
    <transition name="fade">
      <div
        v-if="showWaiting"
        class="room-loading"
        :style="{ '--rl-bg': `url(${ROOM_LOADING_BG})`, '--rl-bg-sm': `url(${ROOM_LOADING_BG_SM})` }"
      >
        <p class="rl-text">{{ loadStage }}</p>

        <!-- 进度条：数字来自 3D 页面真实统计的下载字节（见 inject-room3d-loader.mjs），
             收到 tp:progress 就按「已下载 / 预计总量」推进；只有还没收到第一个进度包时
             才用一点点时间兜底(最多 8%)，保证不是一条僵在 0 的假进度条。 -->
        <div class="rl-bar" role="progressbar" :aria-valuenow="Math.round(loadPct)" aria-valuemin="0" aria-valuemax="100">
          <i class="rl-bar-fill" :style="{ width: loadPct.toFixed(1) + '%' }"></i>
        </div>
        <p class="rl-pct">{{ Math.round(loadPct) }}%</p>

        <!-- 加载期间的小猫跑酷(原来是像素小恐龙): 让 20 多秒的等待有个能玩的东西。
             用的是站内「拾光兽」精灵图里用户自己那只猫，跑动/扑跳两行动画，
             尺寸和原来的恐龙一样大，手感与难度完全不变。 -->
        <div class="rl-game" @click="dinoJump" @touchstart.prevent="dinoJump">
          <canvas ref="dinoCanvas" class="rl-canvas" width="600" height="150"></canvas>
          <p class="rl-game-tip">
            <span v-if="dinoState.dead">撞到啦 · 点一下重来</span>
            <span v-else>空格 / 点一下 起跳 · 已跑 {{ dinoState.score }} 分</span>
          </p>
        </div>

        <p class="rl-sub">第一次打开需要多等一会儿，之后就快了</p>
      </div>
    </transition>

    <!-- 环境动效层：亮点粒子。纯装饰，pointer-events:none，不挡 3D 画面的拖动。
         ★ 原来这里还有「飘云」和「飞鸟」两层，已按要求去掉：
           - 云那层是 radial-gradient 拼的圆 + mix-blend-mode:screen，叠出来是一个个
             很明显的圆形光斑（用户反馈"光晕"），不像云；
           - 鸟那层 9 只各带两层 drop-shadow + 雪碧图逐帧步进，是页面卡顿的主要来源。
         两层的取舍、参数与踩过的坑都记在 sg3d_SETUP.md §3.11。 -->
    <div v-if="built" class="room-fx" aria-hidden="true">
      <div class="fx-sparks">
        <i v-for="s in SPARKS" :key="s.id" class="fx-spark" :style="s.style"></i>
      </div>
    </div>

    <!-- 房间物品：只保留「图片陈列」在 3D 房间下方（按需求不可隐藏）。
         每张卡片：标题在上、大图在下、鼠标移上去高亮；卡片之间留大间距，
         条数超出一屏时左右滑动（触屏拖、桌面点两端箭头）。 -->
    <div v-if="built && listItems.length && !booting" class="room-gallery">
      <div class="rg-head">
        <span class="rg-title">房间物品</span>
        <span class="rg-num">{{ listItems.length }}{{ maxItems ? '/' + maxItems : '' }}</span>
        <span class="rg-hint">点一张打开这条记忆 · 可左右滑动</span>
      </div>
      <div class="rg-strip">
        <button
          class="rg-arrow left"
          type="button"
          aria-label="向左"
          :disabled="!canLeft"
          @click="scrollStrip(-1)"
        >
          ‹
        </button>
        <div ref="stripRef" class="rg-scroll" @scroll="onStripScroll">
          <button
            v-for="it in listItems"
            :key="it.item_id"
            type="button"
            class="rg-card"
            :class="{ picked: pickedId === it.item_id }"
            @click="openItem(it)"
          >
            <span class="rg-card-title">{{ it.title || '（无标题）' }}</span>
            <span class="rg-card-pic">
              <img v-if="coverOf(it)" :src="coverOf(it)" alt="" loading="lazy" />
              <!-- 没有 AI 封面的记忆用淡色块 + 家具图标兜底，卡片仍然等高 -->
              <span v-else class="rg-card-ph">{{ furnitureEmoji(it.furniture) }}</span>
            </span>
            <!-- ★ 2026-10-27 用户要求：卡片下面的「家具名 + 摆放位置」不再显示，只留图片。
                 这里不写 <span class="rg-card-foot">，CSS 一并保留注释说明原因。 -->
          </button>
        </div>
        <button
          class="rg-arrow right"
          type="button"
          aria-label="向右"
          :disabled="!canRight"
          @click="scrollStrip(1)"
        >
          ›
        </button>
      </div>
    </div>

    <!-- 点 3D 家具后，iframe 通过 postMessage 通知此处弹出该记忆的详情浮层 -->
    <transition name="fade">
      <div v-if="detail" class="detail-mask" @click.self="closeDetail">
        <div class="detail-card">
          <button class="detail-close" type="button" aria-label="关闭" @click="closeDetail">×</button>
          <h3 class="detail-title">{{ detail.title }}</h3>
          <div v-if="detail.kind || detail.type || detail.entry_date" class="detail-meta">
            <span v-if="detail.kind">{{ kindLabel(detail.kind) }}</span>
            <span v-if="detail.type">{{ detail.type }}</span>
            <span v-if="detail.entry_date">{{ detail.entry_date }}</span>
          </div>
          <div v-if="images.length || videos.length || audios.length" class="detail-media">
            <img v-for="(m, i) in images" :key="'i' + i" :src="mediaSrc(m.url)" class="detail-img" alt="" />
            <video v-for="(m, i) in videos" :key="'v' + i" :src="mediaSrc(m.url)" controls class="detail-video"></video>
            <audio v-for="(m, i) in audios" :key="'a' + i" :src="mediaSrc(m.url)" controls></audio>
          </div>
          <!-- AI 产出：封面图 / AI 视频。以前详情只看 memory_media，所以 AI 生成的图
               和视频点开物品时完全看不到，看着就像"没生成"。这里单独列一块并标注来源。 -->
          <div v-if="detail.ai_cover || detail.ai_video" class="detail-ai">
            <p class="detail-ai-head">✨ AI 为这条记忆生成</p>
            <img v-if="detail.ai_cover" :src="mediaSrc(detail.ai_cover)" class="detail-img" alt="AI 封面" />
            <video
              v-if="detail.ai_video"
              :src="mediaSrc(detail.ai_video)"
              class="detail-video"
              controls
              playsinline
              preload="metadata"
            ></video>
            <p class="detail-ai-note">AI 为这条记忆生成的封面与视频</p>
          </div>
          <p v-if="detail.content" class="detail-content">{{ detail.content }}</p>
          <p v-if="detail.reason" class="detail-reason">
            🛋 房间里的「{{ furnitureName(detail.furniture) }}」：{{ detail.reason }}
          </p>
        </div>
      </div>
    </transition>

    <!-- 3D 小猫的互动层：猫本体在 Cocos 里（会自己在地板上走），
         这里只画它的菜单和气泡 —— 位置是 3D 侧把猫头顶投影成归一化坐标发过来的，
         所以镜头怎么转，菜单都贴在猫头上。
         ★ 菜单蹦出来的特效（缩放回弹 + 光环 + 几点火星）就画在 .cat-fx 里，
           它挂在 .cat-menu-wrap 内部，菜单一出现就跟着播一次。 -->
    <div
      v-if="catMenu"
      class="cat-menu-wrap"
      :style="{ left: catMenu.x * 100 + '%', top: catMenu.y * 100 + '%' }"
      @pointerdown.stop
    >
      <div class="cat-menu">
        <button
          v-for="(m, i) in CAT_MENU"
          :key="m.act"
          type="button"
          :style="{ '--i': i }"
          @click.stop="catAction(m.act)"
        >
          {{ m.label }}
        </button>
      </div>
      <span class="cat-fx" aria-hidden="true">
        <i class="cat-ring"></i>
        <i v-for="s in CAT_FX_SPARKS" :key="s.id" class="cat-spark" :style="s.style"></i>
      </span>
    </div>

    <!-- 「找找内容」的搜索框。
         摆在画面底部居中而不是跟着猫走：猫在菜单收起后会继续溜达，
         输入框要是贴着猫跑，一边打字一边追目标很难受。 -->
    <transition name="fade">
      <div
        v-if="findOpen"
        class="cat-find"
        :class="{ 'has-gallery': listItems.length }"
        @pointerdown.stop
      >
        <input
          ref="findInput"
          v-model="findKw"
          type="text"
          maxlength="30"
          placeholder="想找什么？比如「日记本」，或记忆的标题"
          @keyup.enter="doFind"
        />
        <button class="cf-go" type="button" @click="doFind">搜索</button>
        <button class="cf-x" type="button" aria-label="关闭" @click="closeFind">×</button>
        <p v-if="findHint" class="cf-hint" :class="findOk ? 'ok' : 'bad'">{{ findHint }}</p>
      </div>
    </transition>

    <div
      v-if="catBubble"
      class="cat-bubble"
      :class="catBubble.kind"
      :style="{ left: catBubble.x * 100 + '%', top: catBubble.y * 100 + '%' }"
    >
      {{ catBubble.text }}
    </div>
    <!-- 宠物菜单里的「找小橘聊天」打开的就是这块 AI 陪伴面板 -->
    <div v-if="companion.showAi" class="ai-fixed" @pointerdown.stop>
      <AiCompanion @close="companion.closeAi" />
    </div>

    <!-- 顶部信息条：日期 · 时钟 · 问候语 · 相伴天数 · 今日一句。
         这一栏原来是首页的（首页已按需求删除），现在搬到 3D 房间最上方。
         只用 pointer-events:none 的纯展示胶囊，不挡房间的拖动和拾取。 -->
    <div v-if="built && !booting" class="room-top" aria-hidden="true">
      <div class="rt-row">
        <span class="rt-chip">{{ dateStr }} · {{ weekName }}</span>
        <span class="rt-chip rt-clock">{{ clock }}</span>
        <span class="rt-hi">✧ {{ greeting }} ✧</span>
        <span class="rt-chip">相伴第 {{ togetherDays }} 天</span>
      </div>
      <p class="rt-quote" :key="quote">✧ {{ quote }} ✧</p>
    </div>

    <!-- 左上角一列：返回 + 视角导航，下面紧跟操作提示。
         放在同一个纵向流里（而不是各自绝对定位），这样导航换行成两排时
         提示卡会自动往下让位，永远不会压到下方的东西。 -->
    <!-- ★ 2026-10-29: 布局失败时整列收起 —— 错误卡片里已经有「返回 / 重新加载」，
         再挂一个左上角的返回按钮只是噪音（而且它指向同一个地方）。 -->
    <div v-if="!layoutError" class="left-col">
      <div class="top-actions">
        <button class="back-btn" type="button" @click="goBack">← 返回记忆空间</button>
        <!-- 镜头视角快捷定位：小屋 / 室内 / 花园 / 书桌 / 岛体。
             点一下 → 通知 3D 侧（tp:view）把相机平滑推到对应机位，按钮同时高亮。 -->
        <div v-if="!loading" class="view-nav">
          <button
            v-for="v in VIEWS"
            :key="v.key"
            type="button"
            class="vn-btn"
            :class="{ on: viewActive === v.key }"
            :title="v.tip"
            @click="goView(v.key)"
          >
            <svg class="vn-ico" viewBox="0 0 20 20" aria-hidden="true">
              <path :d="v.icon" />
            </svg>
            <span class="vn-label">{{ v.label }}</span>
          </button>
        </div>
      </div>
      <!-- ★ 操作提示已移到画面**右侧**（2026-10-27 用户要求），显示/隐藏换成右侧那条小竖向胶囊。
           这里只留左上角的"返回 + 视角导航"。 -->
    </div>

    <!-- ★ 2026-10-27 用户要求：折叠手柄要「就在操作提示栏旁边」，不能一个在右上角、一个在右边缘
         竖直居中（相距 200 多像素，完全看不出两者是一伙的）。
         做法：提示卡和手柄放进同一个 flex 容器 .hint-wrap（贴右上角），手柄自动吸在卡片右缘、
         竖直居中；卡片收起时容器只剩手柄，它就落在卡片的原位置 —— 点击位置永远一致。
         面板无关闭键，收起/展开只靠这条 20×52 的小胶囊。 -->
    <div v-if="built && !loading" class="hint-wrap">
      <transition name="fade">
        <aside v-if="hint" class="room-hint">
          <span class="rh-finger"></span>
          <!-- 两套文案，用 CSS 二选一（桌面 .rh-desktop / 手机 .rh-touch）。
               手机没有右键、滚轮、WASD，桌面这套在手机上纯属噪音，
               而且四行字会把卡片撑到 150px 高、直接压住左上角的返回按钮。 -->
          <span class="rh-text">
            <span class="rh-desktop">
              <b>左键拖动</b> 转视角 · <b>右键拖动</b> 平移 · <b>滚轮</b> 缩放<br />
              <b>WASD</b> 移动 · <b>Q/E</b> 转视角 · <b>右键 + WASD</b> 沿视线飞 ·
              <b>Shift</b> 加速 · <b>F</b> 复位<br />
              <b>双击地板</b> 让小猫走过去 · <b>点小猫</b> 打开互动菜单<br />
              <span class="rh-tip">键盘要先点一下房间才有反应</span>
            </span>
            <span class="rh-touch">
              <b>单指拖动</b> 转视角 · <b>双击地板</b> 让小猫走过去<br />
              <b>点小猫</b> 打开互动菜单 · <b>点上方按钮</b> 换机位
            </span>
          </span>
        </aside>
      </transition>
      <!-- 折叠手柄：竖向小胶囊（比截图那种更小），箭头朝外=收起、朝里=展开 -->
      <button
        class="hint-toggle"
        type="button"
        :title="hint ? '隐藏操作提示' : '显示操作提示'"
        :aria-label="hint ? '隐藏操作提示' : '显示操作提示'"
        :aria-expanded="hint"
        @click="hint = !hint"
      >
        <svg class="ht-chev" :class="{ open: hint }" viewBox="0 0 12 20" aria-hidden="true">
          <path d="M8 4L3 10l5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
    <p v-if="tipText" class="room-tip">{{ tipText }}</p>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { useCompanionStore, PET_SHEETS, petRows, sheetRatio } from '@/stores/companion'
import { call } from '@/api/cloud'
import AiCompanion from './aiCompanion.vue'
// 加载页背景（原来是一层径向渐变，按需求换成 background.png）：大屏用 1600w、小屏用 900w
import ROOM_LOADING_BG from '@/assets/opt/roomLoading.webp'
import ROOM_LOADING_BG_SM from '@/assets/opt/roomLoading-sm.webp'

const route = useRoute()
const router = useRouter()
const auth = useCloudAuthStore()
const companion = useCompanionStore()

// 3D 产物位置：同源默认 /room3d（Cocos 构建后复制到 TimePick/public/room3d）；
// 跨域独立部署时由 .env 的 VITE_ROOM3D_URL 指定
const ROOM3D_BASE = import.meta.env.VITE_ROOM3D_URL || '/room3d'

// 传给 3D 房间的后端地址（去掉结尾的 /api，房间内部会自己补 /api）
// 默认复用前端自己的 API 基址：dev = http://localhost:8787/api（跨域），线上 = /api（同源，留空即用相对路径）
const CLOUD_API_BASE = import.meta.env.VITE_CLOUD_API_BASE || ''
const ROOM3D_API_BASE =
  import.meta.env.VITE_ROOM3D_API || CLOUD_API_BASE.replace(/\/api\/?$/, '')

const spaceId = computed(() => Number(route.params.spaceId) || 0)

const src = computed(() => {
  const params = new URLSearchParams()
  params.set('spaceId', String(spaceId.value))
  if (auth.token) params.set('token', auth.token)
  if (ROOM3D_API_BASE) params.set('apiBase', ROOM3D_API_BASE)
  // ⚠ 必须显式带上 index.html：
  //   静态服务（vite dev / 后端的 SPA 兜底）对 `/room3d/` 这种"目录形式"的请求
  //   会先落到单页应用兜底规则，把「拾光」自己的首页返回给 iframe ——
  //   表现出来的就是"点岛之后跳到了欢迎页"。写成 /room3d/index.html 就没这个歧义。
  return `${ROOM3D_BASE.replace(/\/+$/, '')}/index.html?${params.toString()}`
})

// ---- 产物探测：先确认 /room3d/index.html 真的是 Cocos 的页面 ----
// 不做这一步的话，产物缺失时 iframe 会拿到 SPA 兜底页 —— 也就是 TimePick 首页，
// 用户看到的就是"点岛之后跳到了欢迎页"。
const probing = ref(true)
// 房间进入失败的原因（非空时：模板切错误页、iframe 摘掉、等待层收起）
// ★ 2026-10-29 对应验证报告 FIX03：原来 catch 里只 tip 2.6 秒，然后照常显示一间
//   空屋子（用户以为东西丢了）。现在改成常驻错误。
const layoutError = ref('')

const built = ref(false)
// 跨域独立部署（VITE_ROOM3D_URL 指到别的域/端口）或本地文件打开时不做探测，直接交给 iframe
const canProbe = computed(() => !/^https?:\/\//i.test(ROOM3D_BASE) && location.protocol !== 'file:')

async function looksLikeCocos(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return false
    const text = await res.text()
    if (/id="app"/.test(text)) return false // TimePick 自己的 SPA 兜底页
    return /GameCanvas|GameDiv|application\.js|import-map\.json|cc\.js/i.test(text)
  } catch {
    return false
  }
}

async function probe() {
  if (!canProbe.value) {
    probing.value = false
    built.value = true
    return
  }
  probing.value = true
  built.value = await looksLikeCocos(`${ROOM3D_BASE}/index.html`)
  probing.value = false
  if (!built.value) tipText.value = ''
}

// ---- 顶部信息条（原首页那一条：日期 / 时钟 / 问候 / 相伴天数 / 今日一句）----
const now0 = new Date()
const dateStr = `${now0.getMonth() + 1}月${now0.getDate()}日`
const weekName = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now0.getDay()]

// 分时段问候：口径与原首页完全一致
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return '早上好'
  if (h >= 11 && h < 13) return '午间小憩'
  if (h >= 13 && h < 18) return '下午好'
  if (h >= 18 && h < 23) return '晚上好'
  return '深夜安好'
})

// 时钟：1s 一跳，跨分钟即时变化
const clock = ref('')
let clockTimer = 0
function tickClock() {
  const t = new Date()
  clock.value = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
}

// 相伴天数：自注册那天算起，注册当天就是第 1 天。
// 这里没有用「最早一条记忆的日期」——3D 页不加载记忆列表，而且记忆日期可以往前填，
// 算出来会比真实相伴时间更早；注册日更稳，也不会因为没数据退回 1。
// ★ 2026-10-27 修复：服务端 now() 存的是 **毫秒数字**（Date.now()），
//   老代码 String(数字).replace(' ','T') 再 new Date() 是 Invalid Date → 永远算成第 1 天。
//   这里统一把「数字(秒/毫秒) / 'YYYY-MM-DD HH:mm:ss' / ISO」都归一成毫秒。
function toTimeMs(v) {
  if (v == null || v === '') return NaN
  if (v instanceof Date) return v.getTime()
  const n = Number(v)
  if (Number.isFinite(n) && n > 0) return n < 1e11 ? n * 1000 : n // 秒(10位) / 毫秒(13位)
  const s = String(v).trim().replace(' ', 'T')
  const t = Date.parse(s)
  if (Number.isFinite(t)) return t
  const t2 = Date.parse(s + '+08:00') // 无时区标记时按本地时间兜底
  return Number.isFinite(t2) ? t2 : NaN
}
const togetherDays = computed(() => {
  const src = auth.user || auth.profile || {}
  const t = toTimeMs(src.created_at ?? src.joined_at ?? '')
  if (!Number.isFinite(t)) return 1
  // 用「日历天」相减，避免 23:50 注册、次日 00:10 就显示第 2 天这种离谱情况
  const d0 = new Date(t)
  const d1 = new Date()
  const day0 = Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate())
  const day1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate())
  return Math.max(1, Math.round((day1 - day0) / 86400000) + 1)
})

// 今日一句：8s 换一句，淡入
const QUOTES = ['今天也值得被记录', '慢慢来, 让时间展开', '给生活留一点光', '每个记忆都值得被好好收藏']
const quote = ref(QUOTES[0])
let quoteTimer = 0

const propMap = ref({}) // itemId -> 该记忆的摆件数据（含 media）
// 每个空间的物品上限与场景自带家具数量（都由后端 room/layout 下发）
const maxItems = ref(0)
const fixedCount = ref(0)
const detail = ref(null)
const tipText = ref('')
// iframe 元素引用：双击转发时要用它的 getBoundingClientRect 把归一化坐标换算回页面坐标
const frame = ref(null)

// 房间等待层：房间起来前盖住空白画布，收到 tp:ready 就收掉
const loading = ref(false)
let loadingTimer = 0
// 看门狗：只在「真实字节连续很久没增长」时提前放行（见 onMounted）
let readyWatchdog = 0

// ---- 等待层进度条 ----
// 数字来自 3D 页面（iframe 里的 index.html）真实统计的下载字节：它每 250ms 把
// {bytes, est} 通过 postMessage 报给宿主（见 scripts/inject-room3d-loader.mjs）。
// 收到 tp:progress 之前只允许爬到 8%（纯兜底），保证进度条不会一直僵在 0 或跑得比真实加载还快。
const loadPct = ref(0)
const loadStage = ref('正在进入房间…')
let progressTimer = 0
let finishTimer = 0
let readyDone = false
// 是否已经收到过真实下载进度
const gotRealProgress = ref(false)
// 是否收到过 3D 页面任何一条进度消息 —— 用来区分「iframe 根本没起来」和「在下但很慢」
let gotAnyProgressMsg = false
// 最近一次「字节数真的变大」的时间(用来判断数字是不是"卡住"了)
let lastProgressAt = 0
let lastBytes = 0
const loadStartedAt = ref(0)

function startProgress() {
  clearInterval(progressTimer)
  gotRealProgress.value = false
  gotAnyProgressMsg = false
  lastProgressAt = 0
  lastBytes = 0
  loadPct.value = 0
  loadStage.value = '正在进入房间…'
  loadStartedAt.value = Date.now()
  // 真实字节数是主依据(会直接顶上去)。它原来只统计"已经下完"的部分 —— 一个大文件
  // 十几 MB，弱网下一个就能传 25s，数字纹丝不动，进度条看着像死了。现在 iframe 那边
  // 会把「正在传的那部分」也报过来（msg.live），两条加起来才是真实手感。
  // 这条平滑曲线只当兜底（一条消息都没收到时别让进度条僵在 0），时间常数放到 60s，
  // 避免像以前那样 15 秒就冲到 90%、然后真进度还在 40% 时尴尬地停着。
  const startedAt = Date.now()
  progressTimer = setInterval(() => {
    const t = (Date.now() - startedAt) / 1000
    const smooth = 92 * (1 - Math.exp(-t / 60))
    if (!gotRealProgress.value) {
      // 还没收到第一包真实数据: 只走这条平滑曲线, 且不越过 12%
      if (loadPct.value < 12) loadPct.value = Math.min(12, 12 * (1 - Math.exp(-t / 8)))
      return
    }
    if (smooth > loadPct.value && loadPct.value < 92) loadPct.value = Math.min(92, smooth)
    // 字节数长时间不动时再补一点点, 免得看起来完全停住（只补 0.1%/200ms ≈ 0.5%/s，很慢）
    if (lastProgressAt && Date.now() - lastProgressAt > 8000 && loadPct.value < 92) {
      loadPct.value = Math.min(92, loadPct.value + 0.1)
    }
  }, 200)
}

function stopProgress() {
  clearInterval(progressTimer)
  progressTimer = 0
}

// 「还在启动」= 产物没就位 或 房间没报 ready。
// 这段时间里藏掉右侧列表：加载遮罩是半透明的，列表先于房间出现会像坏了。
// （2D 宠物已经不在 3D 房间里了，所以这里不用再管它。3D 猫在 Cocos 画布里，
//   画布本身被遮罩盖住，天然看不到。）
const booting = computed(() => !built.value || loading.value)

// 唯一的等待页：探测产物那几百毫秒 + 房间真正加载的全过程都用这一层
// （小猫跑酷 + 真实下载进度）。以前探测阶段会先闪一个「正在打开 3D 房间…」的空态卡片，
// 看起来像两个不同的加载页（2026-10-21 用户反馈），现在合并成一个。
// ★ 2026-10-29: 布局失败时立刻收起等待层。否则 iframe 已被摘掉、'tp:ready' 永远不会来，
//   用户被迫看满 30 秒跑酷才见到错误页 —— 错误态必须优先于加载态。
const showWaiting = computed(
  () => !layoutError.value && (probing.value || (built.value && loading.value))
)

// 操作提示：房间就绪后常驻显示（按需求「常驻但可以隐藏」），
// 由面板右上角的 × 收起，收起后左下角留一个「?」唤出。
// 加它的原因：3D 房间默认是固定机位，用户很难猜到画面能拖着转视角。
const hint = ref(false)

function markReady() {
  clearTimeout(loadingTimer)
  clearInterval(readyWatchdog)
  if (readyDone) return
  readyDone = true
  if (!loading.value) {
    showHint()
    return
  }
  // 先把进度条补满、文案改成「准备就绪」，再让整层淡出（0.45s）。
  // 直接秒消失会让人觉得"是不是加载失败了"，补满这一步成本很低。
  stopProgress()
  loadPct.value = 100
  loadStage.value = '准备就绪'
  clearTimeout(finishTimer)
  finishTimer = setTimeout(() => {
    loading.value = false
    showHint()
  }, 450)
}

// 房间就绪后的操作提示：按需求「常驻但可以隐藏」—— 显示后不再自动消失，
// 由面板右上角的 × 收起，收起后左下角留一个「?」可以再唤出。
function showHint() {
  // ★ 手机端（≤767.98px）默认**收起**：桌面那套操作说明在手机上既没用（没有右键/滚轮/
  //   WASD），展开后又正好盖住左上角的「返回记忆空间」和视角按钮。手机上只留右侧小胶囊，
  //   用户想看再点。桌面端行为不变（就绪后常驻显示）。
  hint.value = window.innerWidth >= 768
  // ★ 这里原来会让 2D 宠物从画面一侧跑进来（runAcross）。
  //   现在 3D 房间里的猫是 Cocos 里的真 3D 模型，用户明确要求「不要进场的动作」，
  //   所以房间就绪后什么都不做，猫本来就在房间里。
}

const detailMedia = computed(() => detail.value?.media || [])
const images = computed(() => detailMedia.value.filter((m) => m.type === 1))
const videos = computed(() => detailMedia.value.filter((m) => m.type === 3))
const audios = computed(() => detailMedia.value.filter((m) => m.type === 2))

// 后端把上传/AI 产物存成相对路径（/uploads/...）。dev 模式下前端与后端不同源
// （vite 5173 直连 8787），相对路径会打到 vite 上 404 —— 这里统一补成后端地址；
// 线上同源时 ASSET_BASE 为空，原样返回。
const ASSET_BASE = (import.meta.env.VITE_CLOUD_API_BASE || '').replace(/\/api\/?$/, '')
function mediaSrc(u) {
  const s = String(u || '')
  if (!s) return ''
  if (/^(https?:|data:|blob:)/i.test(s)) return s
  return s.startsWith('/') ? ASSET_BASE + s : s
}

const KIND_LABEL = {
  memory: '记忆',
  book: '书',
  music: '音乐',
  travel: '旅行',
  photo: '照片',
  sleep: '睡眠',
  work: '工作',
}
function kindLabel(k) {
  return KIND_LABEL[k] || k
}
const FURNITURE_CN = {
  bed: '床', desk: '书桌', chair: '椅子', cabinet: '柜子', computer: '电脑', diary: '日记本',
  cup: '水杯', camera_my: '相机', schoolbag: '书包', tableLamp: '台灯', record: '唱片机',
  greenbook: '绿皮书', yellowbook: '黄皮书',
}
function furnitureName(f) {
  return FURNITURE_CN[f] || f
}
// 这件家具是被"撑"在哪里的（后端 planSpace 算好后随 layout 一起下发）
const SUPPORT_CN = { desk: '摆在书桌上', cabinet: '放进柜子隔板' }
function supportText(it) {
  return SUPPORT_CN[it.support] || ''
}
// 同一件事的另一种说法，专门给「找到了…」那句提示用（"它放进柜子隔板"不通顺）
const SUPPORT_AT = { desk: '摆在书桌上', cabinet: '放在柜子隔板里' }
const FURNITURE_EMOJI = {
  bed: '🛏', desk: '🪑', chair: '💺', cabinet: '📚', computer: '💻', diary: '📔',
  cup: '☕', camera_my: '📷', schoolbag: '🎒', tableLamp: '💡', record: '🎵',
  greenbook: '📗', yellowbook: '📒',
}
function furnitureEmoji(f) {
  return FURNITURE_EMOJI[f] || '🪑'
}

// ---- 右侧「房间物品」列表 ----
// 直接复用 loadLayout 已经拉回来的 propMap，不额外请求后端；
// 键是 item_id（数字），Object.values 会按升序给出 —— 正好等于记忆的创建顺序，自上而下。
const listItems = computed(() => Object.values(propMap.value).filter((p) => p && p.item_id != null))

// ---- 底部图片陈列条 ----
// 卡片封面：★ 2026-10-27 用户要求「玩家上传的图片不显示，只显示我们自己给他加的」，
// 所以这里只认 AI 生成的封面（ai_cover），不再回落到用户上传的照片；
// 两者都没有时用家具图标占位。
function coverOf(it) {
  return it?.ai_cover ? mediaSrc(it.ai_cover) : ''
}

const stripRef = ref(null)
const canLeft = ref(false)
const canRight = ref(false)
function refreshStripArrows() {
  const el = stripRef.value
  if (!el) {
    canLeft.value = false
    canRight.value = false
    return
  }
  canLeft.value = el.scrollLeft > 4
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}
function onStripScroll() {
  refreshStripArrows()
}
// 箭头一次滚「差不多两屏」的量，慢慢挪反而要点很多下
function scrollStrip(dir) {
  const el = stripRef.value
  if (!el) return
  el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' })
}
watch(listItems, async () => {
  await nextTick()
  refreshStripArrows()
})

// ---- 镜头视角快捷定位（小屋 / 室内 / 花园 / 书桌 / 岛体）----
// 图标是自己画的极简线稿（不直接切用户截图）。key 与 Cocos 侧 CameraRig 的预设名一一对应。
const VIEWS = [
  {
    key: 'house',
    label: '小屋',
    tip: '看整座小屋的外观',
    icon: 'M3 9.6 10 3.6l7 6M4.6 9v7.4h4.2v-4h2.4v4h4.2V9',
  },
  {
    key: 'indoor',
    label: '室内',
    tip: '把镜头推进屋里',
    icon: 'M4 16.4v-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6M4 13h12M6.6 16.4v-2.2M13.4 16.4v-2.2',
  },
  {
    key: 'garden',
    label: '花园',
    tip: '看房子前的花园/露台',
    icon: 'M10 17v-6M10 11c-3 0-4-2.2-3.4-4.2C8 5 10 6.6 10 8.4M10 11c3 0 4-2.2 3.4-4.2C12 5 10 6.6 10 8.4M5.4 17h9.2',
  },
  {
    key: 'desk',
    label: '书桌',
    tip: '对准房间里的书桌',
    icon: 'M3 8h14M5 8v8.4M15 8v8.4M3 11.4h14',
  },
  {
    key: 'island',
    label: '岛体',
    tip: '拉远俯瞰整座岛',
    icon: 'M2.6 13.6c2.6-1.8 12.2-1.8 14.8 0l-2.2 3.2H4.8zM10 13.2V5.4M10 7.4c-1.8-1.4-3.4-.4-3.6 1M10 7.4c1.8-1.4 3.4-.4 3.6 1',
  },
]
const viewActive = ref('')
let viewActiveTimer = 0
function goView(key) {
  viewActive.value = key
  postCat({ type: 'tp:view', name: key })
  // 高亮不用一直亮着：镜头到位后自动淡化回常态。
  // ★ 2026-10-27 从 1.4s 放宽到 2.4s —— 相机推拉本身约 1.2s，原来的高亮几乎和动画同时结束，
  //   用户刚抬头就看不到"我点的是哪一个"了。
  clearTimeout(viewActiveTimer)
  viewActiveTimer = setTimeout(() => (viewActive.value = ''), 2400)
}
// 场景自带的固定家具（床/书桌/椅子/柜子…），带世界坐标。
// 「找找内容」要用它：物品摆在桌上/柜子里时，猫得走到那件**宿主家具**旁边，
// 而不是走到物品自己的坐标（那个坐标在桌面高度上，猫是走不过去的）。
const fixedFurniture = ref([])

// ★ 2026-10-27：底部「房间物品」卡片点了要有明显反馈。
// 原来只有 :active 的 1px 缩放（点完弹层立刻盖上来，等于完全没反馈）。
// 这里记住被点的那张卡并**一直保持**（只在下一次点别的卡时切换）——
// 早先试过 1.6s 后自动熄灭，但关掉浮层往往已经超时，等于白加；常亮反而像"当前正在看这条"。
const pickedId = ref(null)
function openItem(it) {
  pickedId.value = it.item_id
  detail.value = it
}

// ---- 3D 小猫的互动层（菜单 / 气泡 / 找找内容）----
// 猫本体是 Cocos 里的 3D 模型：自主在地板上溜达、双击走过去、点头顶出菜单。
// 宿主只负责把菜单/气泡画出来 —— 因为 Cocos 里的 UI 排版远不如 HTML 好调，
// 而这块又必须和 2D 页面的宠物菜单长得一模一样。
//
// 菜单只留三项：摸摸头 / 打招呼 / 望望天 / 要抱抱 已按需求删掉，
// 宠物名字标签也一并去掉了（3D 这边不再显示名字）。
const CAT_MENU = [
  { act: 'chat', label: '找小橘聊天' },
  { act: 'find', label: '找找内容' },
  { act: 'stop', label: '取消动作' },
]
// 菜单弹出时那圈火星：沿一圈均匀撒开，各自往外飞一点再淡掉。
// 视觉参数都在这里，想更夸张就把 radius 和 --dx/--dy 一起调大。
const CAT_FX_SPARKS = Array.from({ length: 7 }, (_, i) => {
  const a = (i / 7) * Math.PI * 2 + 0.35
  return {
    id: i,
    style: {
      '--dx': (Math.cos(a) * 30).toFixed(1) + 'px',
      '--dy': (Math.sin(a) * 22 - 4).toFixed(1) + 'px',
      '--del': (i * 0.018).toFixed(3) + 's',
    },
  }
})
const catMenu = ref(null) // { x, y } 归一化坐标
const catBubble = ref(null) // { x, y, text, kind }
let catMenuTimer = 0
let catBubbleTimer = 0

function postCat(msg) {
  frame.value?.contentWindow?.postMessage(msg, '*')
}

function catAction(act) {
  catMenu.value = null
  clearTimeout(catMenuTimer)
  postCat({ type: 'tp:catAction', action: act })
  // 这两项的实际界面都在宿主这边：
  //   chat → AI 陪伴面板（和 2D 页面共用同一个 companion store）
  //   find → 下面的搜索框（3D 侧收到的是 default 分支，只把菜单收起来）
  if (act === 'chat') companion.openAi()
  else if (act === 'find') openFind()
}

// ---- 「找找内容」----
const findOpen = ref(false)
const findKw = ref('')
const findHint = ref('')
const findOk = ref(false)
const findInput = ref(null)
let findHideTimer = 0

function openFind() {
  findOpen.value = true
  findKw.value = ''
  findHint.value = ''
  findOk.value = false
  clearTimeout(findHideTimer)
  // 等过渡结束再聚焦，否则元素还没进场、focus() 会失效
  setTimeout(() => findInput.value?.focus(), 60)
}
function closeFind() {
  findOpen.value = false
  clearTimeout(findHideTimer)
}

/** 关键词 → 房间里的那件物品（先按记忆标题精确匹配，再退到家具中文名） */
function matchItem(kw) {
  const k = String(kw || '').trim().toLowerCase()
  if (!k) return null
  let byFurniture = null
  for (const it of listItems.value) {
    if (String(it.title || '').toLowerCase().includes(k)) return it
    if (!byFurniture) {
      const f = String(it.furniture || '').toLowerCase()
      const cn = String(furnitureName(it.furniture))
      if (f.includes(k) || cn.includes(k)) byFurniture = it
    }
  }
  return byFurniture
}

// 猫该走到哪儿：
//   · 物品摆在书桌 / 柜子隔板上（support=desk|cabinet）→ 走到那件**宿主家具**旁边，
//     留 0.8 个单位的距离（猫够不着桌面，只能"就在这附近"）；
//   · 其余（摆在地板上的）→ 直接走到物品边上，留 0.28 个单位别踩上去。
// ★ 这两个数是"半个身位"，3D 猫的尺寸缩到原来一半后同步减半（原来 1.15 / 0.5）——
//   不改的话小奶猫会停在离东西很远的空地上，看着像没找到。
function gotoTargetOf(it) {
  if (it.support === 'desk' || it.support === 'cabinet') {
    const hosts = fixedFurniture.value.filter((f) => f.furniture === it.support)
    if (hosts.length) {
      // 同款家具有多件（比如两张柜子）时，挑离这件物品最近的那件
      let best = hosts[0]
      let bd = Infinity
      for (const h of hosts) {
        const d = Math.hypot((h.x || 0) - (it.x || 0), (h.z || 0) - (it.z || 0))
        if (d < bd) {
          bd = d
          best = h
        }
      }
      return { x: best.x, z: best.z, stop: 0.8, near: true }
    }
  }
  if (Number.isFinite(it.x) && Number.isFinite(it.z)) {
    return { x: it.x, z: it.z, stop: 0.28, near: false }
  }
  return null
}

function doFind() {
  const k = findKw.value.trim()
  if (!k) {
    findOk.value = false
    findHint.value = '先输入想找的东西呀～'
    return
  }
  const it = matchItem(k)
  if (!it) {
    findOk.value = false
    findHint.value = `房间里好像没有「${k}」呢…`
    return
  }
  const name = it.title || furnitureName(it.furniture)
  findOk.value = true
  const at = SUPPORT_AT[it.support]
  findHint.value = at
    ? `找到了「${name}」，它${at}，小猫这就过去～`
    : `找到了「${name}」，小猫这就过去～`

  // 先让这句提示露一秒钟的脸，再收起输入框与互动，猫才开始走 ——
  // 直接收掉的话用户只知道"框没了"，不知道到底找没找到。
  clearTimeout(findHideTimer)
  findHideTimer = setTimeout(() => {
    findOpen.value = false
    const t = gotoTargetOf(it)
    // itemId 一起带过去：猫走到之后会自动弹出这条记忆的详情
    if (t) postCat({ type: 'tp:catGoto', x: t.x, z: t.z, stop: t.stop, near: t.near, itemId: it.item_id })
  }, 950)
}

// ---- 装饰动效数据（只剩亮点粒子）----
// 飘云与飞鸟已按要求移除；它们曾经的实现与踩过的坑记在 sg3d_SETUP.md §3.11，
// 以后想加回来可以直接从那里抄。
// 亮点粒子：缓缓向上飘、轻微横移，装饰 3D 画面外的"空气感"。
// 26 → 14 个：每个都带 box-shadow（光晕），是这层唯一还剩的开销，压一半肉眼几乎看不出差别。
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  style: {
    left: (i * 53) % 100 + '%',
    '--dur': 8 + (i % 5) * 2.4 + 's',
    '--delay': -(i * 2.6) + 's',
    '--sz': 3 + (i % 3) + 'px',
    '--dx': (i % 2 ? 1 : -1) * (10 + (i % 4) * 14) + 'px',
    '--op': 0.28 + (i % 4) * 0.14,
  },
}))

function retryLayout() {
  layoutError.value = ''
  loadLayout()
}

// 进入房间即拉取布局（含每条记忆的媒体），点家具时直接取用，无需再请求
async function loadLayout() {
  if (!spaceId.value) {
    layoutError.value = '没有拿到房间编号，可能是链接不完整。'
    return
  }
  try {
    const data = await call('room/layout', { space_id: spaceId.value })
    layoutError.value = ''
    const map = {}
    for (const p of data.props || []) map[p.item_id] = p
    propMap.value = map
    // 固定家具留一份带坐标的副本（找找内容要拿它当"走到旁边"的落点）
    fixedFurniture.value = (data.fixed || []).filter((f) => Number.isFinite(f.x) && Number.isFinite(f.z))
    // 每个空间的物品上限（后端给的权威值；固定家具床/桌/椅/柜不计入）
    maxItems.value = Number(data.max_items) || 0
    fixedCount.value = (data.fixed || []).length
  } catch (e) {
    // 服务端对「不存在 / 不是自己的空间」会回明确的业务错误，直接把原话显示出来，
    // 不用泛泛的"请稍后重试"——用户看到"记忆空间不存在"才知道是链接问题还是网络问题。
    layoutError.value = e.message || '房间数据加载失败，请稍后重试。'
  }
}

function onMessage(e) {
  const msg = e.data
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'tp:openMemory' && msg.itemId != null) {
    const p = propMap.value[msg.itemId]
    if (p) {
      detail.value = p
    } else {
      // 3D 里命中了家具、但本地没有这条记忆的数据 —— 以前会静默什么都不做，
      // 看起来和"没点中"一模一样，极难区分。这里给一句提示，便于定位是数据没对上。
      console.warn('[room3d] 3D 命中了 itemId=' + msg.itemId + '，但本地布局里没有它', Object.keys(propMap.value))
      tipText.value = '这条记忆的数据还没加载完，稍等一下再点'
      setTimeout(() => (tipText.value = ''), 2200)
    }
  } else if (msg.type === 'tp:catMenu') {
    // 3D 里点了小猫：菜单摆到它头上（归一化坐标，直接换成百分比，
    // 因为 iframe 占满整个 room3d 容器，比例坐标天然对得上）
    const nx = Number(msg.nx)
    const ny = Number(msg.ny)
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return
    // 猫在菜单打开期间每 0.2 秒回一次锚点（镜头转了菜单要跟着走），
    // 所以只有"第一次打开"才重置超时，否则超时永远不会到。
    const first = !catMenu.value
    catMenu.value = { x: nx, y: ny }
    if (first) {
      clearTimeout(catMenuTimer)
      // 菜单一直没人点就自己收掉，免得挂在画面上挡视线（3D 侧同时间也会收）
      catMenuTimer = setTimeout(() => (catMenu.value = null), 15000)
    }
  } else if (msg.type === 'tp:catMenuClose') {
    catMenu.value = null
    clearTimeout(catMenuTimer)
  } else if (msg.type === 'tp:catBubble') {
    const nx = Number(msg.nx)
    const ny = Number(msg.ny)
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !msg.text) return
    catBubble.value = {
      x: nx,
      y: ny,
      text: String(msg.text),
      kind: msg.kind === 'thought' ? 'thought' : 'say',
    }
    clearTimeout(catBubbleTimer)
    // ★ 3D 侧说话期间会周期性重发这条消息（气泡要跟着猫走），
    //   带来的 ms 是"还剩多少毫秒"，不是总时长。所以每次都重设定时器：
    //   那边一停发，这里的定时器最多再等一个 tick（0.12s）就把气泡淡出。
    //   ⚠ 不能用 `Number(msg.ms) || 2600`：剩余时长为 0 时会被兜底成 2600，气泡反而赖着不走。
    const ms = Number(msg.ms)
    catBubbleTimer = setTimeout(
      () => (catBubble.value = null),
      Number.isFinite(ms) && ms > 0 ? ms : 2600,
    )
  } else if (msg.type === 'tp:ready') {
    markReady()
    tipText.value = ''
  } else if (msg.type === 'tp:progress') {
    // 3D 页面把自己真实统计的下载进度报了过来（见 scripts/inject-room3d-loader.mjs）。
    //   bytes = 已经下完的字节（传输体量，压缩后）
    //   live  = 此刻仍在传的那部分字节（已经收到的，不算进 bytes，避免重复计入）
    //   est   = 这次大概总共要下多少
    // ★ 只看 bytes 会被"大文件传输中"骗：一个 2MB 的 bin 在弱网要传 25s，这期间
    //   bytes 一动不动，看门狗就会误判成卡死、把等待层揭掉（线上实测：真加载 100s，
    //   但 40s 时等待层就没了，用户对着 Cocos 启动图干等一分钟）。所以要加上 live。
    gotAnyProgressMsg = true
    const bytes = Number(msg.bytes)
    const live = Number(msg.live) || 0
    const cur = (Number.isFinite(bytes) ? Math.max(0, bytes) : 0) + Math.max(0, live)
    if (cur <= 0) return
    const est = Number(msg.est) || 0
    gotRealProgress.value = true
    // 只有数字真的变了才算"进度在动"；同一份数字每 250ms 重发一次不算
    if (cur > lastBytes) {
      lastBytes = cur
      lastProgressAt = Date.now()
    }
    const mb = cur / 1048576
    // ★ 到顶之后不是"卡住"，是进入第二阶段了：底模下完 → 引擎起来 → 摆 9 个记忆摆件
    //   （线上实测这一段要 60~90s，进度数字几乎不动）。这时把文案换掉，
    //   否则用户看到的是「97% / 31.8MB 一直不动」，观感和卡死没区别。
    const topping = loadPct.value >= 96
    if (est > 0) {
      const pct = Math.min(97, (cur / est) * 100)
      // 只许涨不许退：进度统计口径会有小抖动，进度条往回缩很难看
      if (pct > loadPct.value) loadPct.value = pct
      // 刚开始几乎都是 0.0 MB（大文件还在传），这时候不显示数字更干净
      if (topping) {
        loadStage.value = '正在把记忆摆件摆进房间…'
      } else {
        loadStage.value =
          mb >= 0.1 ? `正在载入小岛资源… ${mb.toFixed(1)} / ${(est / 1048576).toFixed(1)} MB` : '正在载入小岛资源…'
      }
    } else if (topping) {
      loadStage.value = '正在把记忆摆件摆进房间…'
    } else {
      loadStage.value = mb >= 0.1 ? `正在载入小岛资源… ${mb.toFixed(1)} MB` : '正在载入小岛资源…'
    }
    // 慢网络坦白告知，别让人以为卡死了（超过 35s 还没就绪才提示）
    if (Date.now() - loadStartedAt.value > 35000 && !/网络较慢/.test(loadStage.value)) {
      loadStage.value += '（网络较慢，正在继续加载）'
    }
  }
}

// ---------------- 等待层小恐龙跑酷 ----------------
// 纯 canvas 手绘，不引入依赖。房间就绪（loading=false）时等待层整层卸载，
// watch 里会把 raf 停掉，不会在后台空转。
const dinoCanvas = ref(null)
const dinoState = reactive({ score: 0, dead: false })
let dinoWorld = null
let dinoRaf = 0
let retryTimer = 0

const DINO_GRAVITY = 0.62
const DINO_JUMP_V = 10.2
const DINO_BASE_SPEED = 4.4

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
  ctx.fill()
}

function dinoReset(st) {
  st.t = 0
  st.elapsed = 0
  st.score = 0
  st.speed = DINO_BASE_SPEED
  st.y = 0
  st.vy = 0
  st.dead = false
  st.cactus = []
  st.sinceSpawn = 0
  st.nextAt = 70
  st.jumpLock = false
  dinoState.score = 0
  dinoState.dead = false
}

function dinoJump() {
  const st = dinoWorld
  if (!st) return
  if (st.dead) {
    dinoReset(st)
    return
  }
  if (st.y <= 0.01) {
    st.vy = DINO_JUMP_V
    st.jumpLock = true
  }
}

function dinoStep(st, dt) {
  st.t = Math.max(0, st.t + dt)
  if (!st.dead) {
    st.elapsed += dt
    // 越跑越快，但封顶，免得后面快到没法反应
    st.speed = DINO_BASE_SPEED + Math.min(5.2, st.elapsed / 260)
    st.score = Math.floor(st.elapsed / 6)
    dinoState.score = st.score
  }

  // 跳跃物理（y = 离地高度）
  if (st.y > 0 || st.vy > 0) {
    st.y += st.vy * dt
    st.vy -= DINO_GRAVITY * dt
    if (st.y <= 0) {
      st.y = 0
      st.vy = 0
      st.jumpLock = false
    }
  }

  // 仙人掌左移 + 生成 + 回收
  for (const c of st.cactus) c.x -= st.speed * dt
  st.cactus = st.cactus.filter((c) => c.x + c.w > -10)
  if (!st.dead) {
    st.sinceSpawn += st.speed * dt
    if (st.sinceSpawn >= st.nextAt) {
      st.sinceSpawn = 0
      st.nextAt = 190 + Math.random() * 170
      st.cactus.push({ x: st.w + 16, w: 13 + Math.random() * 7, h: 26 + Math.random() * 20 })
    }
  }

  // 云飘动
  for (const s of st.sky) {
    s.x -= st.speed * 0.12 * dt
    if (s.x < -30) {
      s.x = st.w + 20
      s.y = 16 + Math.random() * 56
    }
  }

  // 碰撞：只有落地附近才算撞（跳过去就不会死）
  if (!st.dead) {
    const dx = 56
    const dw = 30
    const dh = st.jumpLock ? 30 : 36
    const dTop = st.ground - st.y - dh
    for (const c of st.cactus) {
      const cTop = st.ground - c.h
      if (dx + dw > c.x + 2 && dx < c.x + c.w - 2 && dTop + dh > cTop + 3) {
        st.dead = true
        dinoState.dead = true
        break
      }
    }
  }
}

function dinoDraw(st) {
  const { ctx, w, h, ground } = st
  ctx.clearRect(0, 0, w, h)

  // 背景：和等待层同色系的深色渐变，保证不突兀
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, 'rgba(30,25,20,0)')
  bg.addColorStop(1, 'rgba(60,48,38,0.55)')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // 远处的光点
  for (const s of st.sky) {
    ctx.fillStyle = `rgba(233,214,190,${0.1 + s.s * 0.12})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.s * 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // 地面线 + 移动的小石子（给速度感）
  ctx.strokeStyle = 'rgba(232,217,200,0.28)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, ground + 1)
  ctx.lineTo(w, ground + 1)
  ctx.stroke()

  const off = (st.t * st.speed) % 46
  ctx.fillStyle = 'rgba(232,217,200,0.16)'
  for (let x = -off; x < w; x += 46) {
    ctx.fillRect(x, ground + 7, 16, 2)
  }

  // 仙人掌
  for (const c of st.cactus) {
    const top = ground - c.h
    ctx.fillStyle = '#6f9d5c'
    roundRect(ctx, c.x, top, c.w, c.h, 4)
    ctx.fillStyle = '#5d8a4c'
    roundRect(ctx, c.x - 5, top + c.h * 0.36, 5, c.h * 0.3, 2)
    roundRect(ctx, c.x + c.w, top + c.h * 0.5, 5, c.h * 0.26, 2)
  }

  // 小猫（跑动/扑跳都来自用户自己那只猫的精灵图；尺寸与原来的恐龙一致）
  const drawn = drawCat(ctx, st)
  if (!drawn) {
    // 兜底：连帧表都没取到时，画一个和恐龙同尺寸的简笔猫，别让跑道空着
    catPlaceholder(ctx, 56, ground - st.y - CAT_DRAW_H, 44, CAT_DRAW_H)
  }

  // 撞了：蒙一层暗色，提示在 HTML 里
  if (st.dead) {
    ctx.fillStyle = 'rgba(23,19,15,0.35)'
    ctx.fillRect(0, 0, w, h)
  }
}

// ---------------- 跑酷的小猫（替换原来的像素小恐龙） ----------------
// 素材直接用站内「拾光兽」的精灵图：从同一套动作里挑两行 ——
//   第 1 行 walkR（向右走/小跑）、第 4 行 pounce（起跳扑）。
// 尺寸对齐原来的恐龙（视觉高度 40px、命中框仍是 30×36），所以玩法与难度完全没变。
// 实测橘猫素材: 跑动帧 190×208、猫身内容只占 ~74%（上下各有透明边）,
// 跳帧 176×220、猫身占 ~90%。所以按 52px 的帧高画, 肉眼看到的猫 ≈ 38px,
// 和原来那只 36px 高的恐龙一样大; 两个偏移量用来把脚底压回地面线。
const CAT_DRAW_H = 52
const CAT_FOOT_RUN = 9
const CAT_FOOT_JUMP = 1
const CAT_ROW_RUN = 1
const CAT_ROW_JUMP = 4
const catImages = new Map() // src -> HTMLImageElement（同一花色只加载一次）
// 跑酷只要 52px 高，用 1/3 小图足够清楚，也省掉进 3D 时那 2.8MB 的解码。
// ★ 但帧表坐标是**原图**空间的，所以每张图都要带一个 sheetRatio：
//   之前漏了这一步，drawImage 直接拿 1536 空间的矩形去切 512 宽的图，
//   源矩形越界被裁剪，画出来的就是两团糊在一起的色块（线上截图里的"乱码"）。
function ensureCatImage(type) {
  const sheet = PET_SHEETS[type] || PET_SHEETS['橘猫']
  const src = sheet.small || sheet.src
  let img = catImages.get(src)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.src = src
    catImages.set(src, img)
  }
  return { img, sheet }
}

// 画猫：帧窗口取自 petFrames.js（素材像素坐标），按高度等比缩放到 CAT_DRAW_H
function drawCat(ctx, st) {
  const rows = st.catRows
  const img = st.catImg
  const sheet = st.catSheet
  if (!rows || !rows.length || !img) return false
  const airborne = st.y > 0.5
  const row = rows[airborne ? CAT_ROW_JUMP : CAT_ROW_RUN] || rows[0]
  if (!row || !row.f || !row.f.length) return false
  const n = row.f.length
  // 双取模: st.t 万一异常也不会算出负索引(负索引取到 undefined 会直接抛错)
  const idx = ((Math.floor(st.t * (airborne ? 0.12 : 0.3)) % n) + n) % n
  const [x0, x1] = row.f[idx]
  const [y0, y1] = row.y
  const fw = x1 - x0 + 1
  const fh = y1 - y0 + 1
  const w = (fw / fh) * CAT_DRAW_H
  // 命中框是 dx=56 起、宽 30 —— 让猫身中心落在 71，脚底贴地
  const x = 56 + 15 - w / 2
  // 帧底部有透明边，按行补一个偏移，让脚真正踩在地面线上
  const y = st.ground - st.y - CAT_DRAW_H + (airborne ? CAT_FOOT_JUMP : CAT_FOOT_RUN)
  if (img.complete && img.naturalWidth) {
    // 帧表(原图坐标) → 这张图的实际像素坐标
    const r = sheetRatio(sheet, img)
    ctx.drawImage(
      img,
      x0 * r,
      y0 * r,
      Math.max(1, fw * r),
      Math.max(1, fh * r),
      x,
      y,
      w,
      CAT_DRAW_H
    )
  } else {
    // 精灵图还没解码完（极少见）：先用同色系简笔猫占位，别让跑道空着
    catPlaceholder(ctx, x, y, w, CAT_DRAW_H)
  }
  return true
}

function catPlaceholder(ctx, x, y, w, h) {
  ctx.fillStyle = '#e8b071'
  roundRect(ctx, x + w * 0.18, y + h * 0.45, w * 0.64, h * 0.5, h * 0.18)
  ctx.beginPath()
  ctx.arc(x + w * 0.5, y + h * 0.34, h * 0.22, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + w * 0.34, y + h * 0.2)
  ctx.lineTo(x + w * 0.42, y + h * 0.02)
  ctx.lineTo(x + w * 0.5, y + h * 0.2)
  ctx.moveTo(x + w * 0.66, y + h * 0.2)
  ctx.lineTo(x + w * 0.58, y + h * 0.02)
  ctx.lineTo(x + w * 0.5, y + h * 0.2)
  ctx.fill()
}

function dinoStop() {
  if (dinoRaf) cancelAnimationFrame(dinoRaf)
  dinoRaf = 0
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = 0
  dinoWorld = null
}

function dinoStart() {
  const cv = dinoCanvas.value
  if (!cv) {
    // 组件刚 setup、DOM 还没挂上（immediate 的 watch 会先跑一次）：
    // 稍后再试，离开等待层就放弃，避免空转
    if (showWaiting.value && !retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = 0
        dinoStart()
      }, 50)
    }
    return
  }
  dinoStop()
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const st = {
    ctx,
    w: cv.width,
    h: cv.height,
    ground: cv.height - 30,
    sky: [],
  }
  // 用用户自己那只猫（拾光兽）跑酷：花色跟随后台设置，换猫后这里也跟着换
  const petType = PET_SHEETS[companion.petType] ? companion.petType : '橘猫'
  const catAsset = ensureCatImage(petType)
  st.catImg = catAsset.img
  st.catSheet = catAsset.sheet
  st.catRows = petRows(petType) || []
  for (let i = 0; i < 6; i++) {
    st.sky.push({ x: Math.random() * st.w, y: 14 + Math.random() * 58, s: 0.5 + Math.random() })
  }
  dinoWorld = st
  dinoReset(st)

  let last = performance.now()
  const frame = (now) => {
    // 切到后台再回来时 dt 会很大，钳住否则一帧跨过一整片仙人掌。
    // ★ 必须夹住下界: rAF 回调收到的是「这一帧的开始时间」，可能比调度时的
    //   performance.now() 还早一点点 —— 不夹负值就会出现"已跑 -1 分"，甚至让
    //   st.t 变负、帧索引算出 undefined（线上实测踩到过）。
    const raw = (now - last) / 16.67
    const dt = Math.max(0, Math.min(3, Number.isFinite(raw) ? raw : 1))
    last = now
    dinoStep(st, dt)
    dinoDraw(st)
    dinoRaf = requestAnimationFrame(frame)
  }
  dinoRaf = requestAnimationFrame(frame)
}

// 空格起跳（仅等待层存在时接管，进房间后不再响应）
function onDinoKey(e) {
  if (!showWaiting.value) return
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault()
    dinoJump()
  }
}

watch(
  showWaiting,
  async (on) => {
    if (on) {
      readyDone = false
      startProgress()
      await nextTick()
      dinoStart()
    } else {
      stopProgress()
      dinoStop()
    }
  },
  // immediate: 一进页面就在探测产物，等待层（小猫跑酷）要立刻出现，
  // 不能等 built/loading 变化才启动 —— 否则先看到的是空画布再蹦出游戏。
  { immediate: true, flush: 'post' },
)

function closeDetail() {
  detail.value = null
}

function goBack() {
  // ★ 2026-10-29: 固定回「记忆空间」列表（验证报告 FIX04）。
  //   原来优先 router.back()：从地址栏、分享链接或外部入口直接进房间时，
  //   历史里的上一条是别的页面，「← 返回记忆空间」会把用户带到不相干的地方。
  router.push({ name: 'space' })
}

onMounted(async () => {
  window.addEventListener('message', onMessage)
  window.addEventListener('keydown', onDinoKey)
  // 窗口尺寸变了，底部陈列条能滚多少也会变 —— 同步一下两端箭头的可用状态
  window.addEventListener('resize', refreshStripArrows)
  // 顶部信息条的时钟 / 今日一句
  tickClock()
  clockTimer = setInterval(tickClock, 1000)
  quoteTimer = setInterval(() => {
    quote.value = QUOTES[(QUOTES.indexOf(quote.value) + 1) % QUOTES.length]
  }, 8000)
  await probe()
  if (built.value) {
    loading.value = true
    // ★ 加载兜底（2026-10-27 第二次修）：
    //   ① 绝对兜底 210s —— 线上实测首开要下 ~31MB，沙箱/弱网环境 100s 是常态，
    //      原来 75s 会直接把等待层揭掉，露出 Cocos 启动图，看着就是"卡死在启动页"；
    //   ② 看门狗分两种：
    //      · 一条进度消息都没收到 → iframe 根本没起来，25s 就放行（让它自己报错/白屏）；
    //      · 收到过消息但数字连续 45s 不动 → 传输真断了，放行。
    //      45s 而不是 20s：一个大 bin 在 150KB/s 的通道上要传 20s+，20s 会误判。
    loadingTimer = setTimeout(markReady, 210000)
    readyWatchdog = setInterval(() => {
      if (!gotAnyProgressMsg) {
        if (Date.now() - loadStartedAt.value > 25000) markReady()
        return
      }
      if (!gotRealProgress.value) return
      if (Date.now() - lastProgressAt > 45000) markReady()
    }, 5000)
    loadLayout()
  }
})
onUnmounted(() => {
  window.removeEventListener('message', onMessage)
  window.removeEventListener('keydown', onDinoKey)
  window.removeEventListener('resize', refreshStripArrows)
  clearInterval(clockTimer)
  clearInterval(quoteTimer)
  dinoStop()
  stopProgress()
  clearTimeout(loadingTimer)
  clearInterval(readyWatchdog)
  clearTimeout(finishTimer)
  clearTimeout(catMenuTimer)
  clearTimeout(catBubbleTimer)
  clearTimeout(findHideTimer)
  clearTimeout(viewActiveTimer)
})
</script>

<style scoped>
.room3d {
  position: absolute;
  inset: 0;
  background: #1a1714;
}
.room3d-frame {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}
/* 启动中：右侧列表已在模板里用 v-if 排除了；3D 猫在 Cocos 画布里，
   不再有 2D 宠物需要隐藏（原来的 .pet-root 规则随 PetCompanion 一起删掉了）。 */
.room-loading {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  /* 背景图 = 用户给的 background.png（已转 webp 压体积）。
     上面压一层由深到浅的渐变，保证进度条/文案在亮部也读得清。
     小屏优先用 900w 那张，省流量也更快出画面。 */
  background-color: #17130f;
  background-image: linear-gradient(180deg, rgba(20, 16, 12, 0.26), rgba(20, 16, 12, 0.58)),
    var(--rl-bg-sm, none);
  background-size: cover, cover;
  background-position: center, center;
  background-repeat: no-repeat, no-repeat;
  pointer-events: none;
}
@media (min-width: 900px) {
  .room-loading {
    background-image: linear-gradient(180deg, rgba(20, 16, 12, 0.26), rgba(20, 16, 12, 0.58)),
      var(--rl-bg, none);
  }
}
.rl-spinner {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid rgba(232, 217, 200, 0.18);
  border-top-color: #d9915c;
  animation: rl-spin 0.9s linear infinite;
}
@keyframes rl-spin {
  to {
    transform: rotate(360deg);
  }
}
.rl-text {
  margin: 0;
  font-size: 14.5px;
  letter-spacing: 2px;
  color: #fdf3e6;
  /* 背景是用户给的插画（亮部很亮），文字加一层暖色投影保证可读 */
  text-shadow: 0 2px 10px rgba(28, 18, 10, 0.6), 0 1px 2px rgba(28, 18, 10, 0.5);
}

/* 进度条：细长一条，底色压暗，填充用暖色渐变（跟拾光的桔色调一致） */
.rl-bar {
  position: relative;
  width: min(320px, 62vw);
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(232, 217, 200, 0.13);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
}

.rl-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #e8a87c, #d9915c);
  box-shadow: 0 0 10px rgba(217, 145, 92, 0.55);
  transition: width 0.18s linear;
}

.rl-pct {
  margin: -8px 0 0;
  font-size: 11.5px;
  letter-spacing: 1px;
  color: #f4e7d6;
  text-shadow: 0 1px 8px rgba(28, 18, 10, 0.6);
}

/* 等待层第二行：说明首次加载会慢一点，免得用户以为卡死 */
.rl-sub {
  margin: 8px 0 0;
  font-size: 12px;
  letter-spacing: 0.5px;
  color: #f2e6d7;
  opacity: 0.9;
  text-shadow: 0 1px 8px rgba(28, 18, 10, 0.6);
}

/* ---- 加载期小恐龙跑酷 ---- */
.rl-game {
  /* 等待层整体 pointer-events:none，这里单独放开，否则点不动没法跳 */
  pointer-events: auto;
  width: min(560px, calc(100vw - 60px));
  border-radius: 14px;
  overflow: hidden;
  background: rgba(24, 18, 13, 0.42);
  box-shadow: inset 0 0 0 1px rgba(255, 240, 220, 0.22), 0 10px 30px rgba(20, 14, 10, 0.35);
  cursor: pointer;
  user-select: none;
}

.rl-canvas {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 600 / 150;
}

.rl-game-tip {
  margin: 0;
  padding: 6px 10px 8px;
  font-size: 12px;
  text-align: center;
  letter-spacing: 0.5px;
  color: #b3a08d;
}
/* 左上角竖列容器：返回 + 视角导航 + 操作提示，三者按流水排列。
   ★ 用容器而不是各自绝对定位：导航在窄屏会换成两排，提示卡跟着往下让，
   不会像以前那样按 44% 高度硬算、在小高度屏幕上压住底部陈列条的标题行。 */
.left-col {
  position: absolute;
  left: 16px;
  top: 78px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  max-width: calc(100% - 32px);
  /* 容器本身不吃点击（3D 画面要能拖），里面的按钮各自放行 */
  pointer-events: none;
}
/* 操作提示 + 折叠手柄共用外框（2026-10-27）：贴右上角，横向 flex。
   手柄跟着卡片走 —— 卡片展开时吸在卡片右缘竖直居中，收起时容器只剩手柄，
   落在卡片原本的位置附近，不会像以前那样一个在右上、一个在右中，隔 200px 看不出关系。 */
.hint-wrap {
  position: absolute;
  right: 0;
  top: 78px;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  max-width: calc(100% - 24px);
  /* 外框不吃点击（3D 画面要能拖），手柄自己放行 */
  pointer-events: none;
}
/* 操作提示：半透明 + 无 backdrop-filter（下面就是每秒重绘的 WebGL 画布，磨砂会把帧率砍一半），
   pointer-events:none 不挡拖动；显示/隐藏交给右边那条竖向小胶囊。 */
.room-hint {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  max-width: 340px;
  padding: 10px 16px;
  border-radius: 14px;
  background: rgba(28, 22, 18, 0.62);
  color: #fff;
  font-size: 12.5px;
  line-height: 1.85;
  letter-spacing: 0.3px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  pointer-events: none;
  /* ★ 原来这里有个 rh-nudge 横向呼吸（往左荡 8px 提示"可拖"）。手柄改成贴在卡片右缘之后
     这个位移会让卡片和手柄之间一张一合地露缝，看着像没对齐，所以去掉；
     "能拖"的提示改由卡片里的手指图标承担。 */
}
.rh-text b {
  font-weight: 600;
  color: #ffd9a8;
}
.rh-tip {
  opacity: 0.62;
  font-size: 11px;
}
/* 手机文案默认不显示，由 ≤767.98px 的媒体查询接管切换（见文件末尾）。 */
.rh-touch {
  display: none;
}
/* 折叠手柄（2026-10-27）：紧挨提示卡右侧的竖向小胶囊 + 尖角箭头。
   18×46 比之前更小；完整圆角 + 深色底，在亮天空上也能一眼看到它是个按钮。
   hover 只提亮、不撑宽 —— 一改宽度就会把左边卡片顶得左右抖。 */
.hint-toggle {
  flex: none;
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 18px;
  height: 46px;
  padding: 0;
  border: none;
  border-radius: 9px;
  background: rgba(28, 22, 18, 0.62);
  color: #ffd9a8;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
  transition: background 0.18s ease, box-shadow 0.18s ease;
}
.hint-toggle:hover {
  background: rgba(28, 22, 18, 0.88);
  box-shadow: 0 5px 16px rgba(0, 0, 0, 0.38);
}
.hint-toggle:focus-visible {
  outline: 2px solid #ffd9a8;
  outline-offset: -3px;
}
.ht-chev {
  width: 10px;
  height: 18px;
  transition: transform 0.24s ease;
}
.ht-chev.open {
  transform: rotate(180deg);
}
.rh-finger {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.75);
  box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.22);
}

/* ============ 环境动效层：亮点粒子 ============
   仅剩粒子一层：飘云(圆形光斑)与飞鸟已按要求移除，原因见上方模板注释。
   ⚠ 之前删那两层时把这段注释的结束符一起删掉了，结果 .room-fx 整段规则
     被吞进注释里（粒子失去定位父级与 overflow:hidden）。已补回。 */
.room-fx {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  overflow: hidden;
}
/* ---- 亮点粒子：自下而上飘、轻微横移、到顶淡出 ---- */
.fx-spark {
  position: absolute;
  bottom: -12px;
  width: var(--sz, 3px);
  height: var(--sz, 3px);
  border-radius: 50%;
  background: #fff6df;
  box-shadow: 0 0 8px 2px rgba(255, 236, 190, 0.75);
  opacity: 0;
  animation: fx-rise var(--dur, 11s) linear var(--delay, 0s) infinite;
}
@keyframes fx-rise {
  0% {
    transform: translate(0, 0) scale(0.6);
    opacity: 0;
  }
  12% {
    opacity: var(--op, 0.5);
  }
  80% {
    opacity: var(--op, 0.5);
  }
  100% {
    transform: translate(var(--dx, 16px), -104vh) scale(1);
    opacity: 0;
  }
}

/* ============ 底部「房间物品」图片陈列条 ============
   按需求：只保留图片陈列、不可隐藏、图尽量大、标题在上、hover 高亮、
   卡片之间留大间距、太多时可左右滑动。压在画面底部，不挡 3D 拖动（只有卡片和箭头可点）。 */
.room-gallery {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 6;
  padding: 10px 12px 12px;
  /* 由下往上的深色渐隐，让卡片浮在画面上但不生硬 */
  background: linear-gradient(to top, rgba(18, 14, 11, 0.82), rgba(18, 14, 11, 0.55) 60%, rgba(18, 14, 11, 0));
  pointer-events: none;
}
.rg-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 4px 8px;
  pointer-events: none;
}
.rg-title {
  font-size: 13px;
  letter-spacing: 1.2px;
  color: #f7ece0;
  /* 标题行正好在渐隐条的最上端（几乎全透明），底色一准是亮天空/云，
     只靠颜色读不清 —— 加一层贴边阴影，任何背景上都立得住 */
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8), 0 0 14px rgba(0, 0, 0, 0.5);
}
.rg-num {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 11px;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
.rg-hint {
  font-size: 11px;
  color: rgba(244, 233, 219, 0.85);
  letter-spacing: 0.5px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.rg-strip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}
.rg-scroll {
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  /* 卡间距要大：需求里明确"每个图片之间空隙大一点" */
  gap: 26px;
  padding: 3px 6px 6px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
  pointer-events: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}
.rg-scroll::-webkit-scrollbar {
  height: 6px;
}
.rg-scroll::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.26);
}
.rg-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.rg-card {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 216px;
  padding: 0 0 6px;
  border: none;
  border-radius: 14px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  scroll-snap-align: start;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
/* 标题在上（需求：标题写在上方） */
.rg-card-title {
  display: block;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.5;
  letter-spacing: 0.5px;
  color: #f0e3d3;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 卡片标题在渐隐条中段，底色可能是亮的云/岛，同样要压一层阴影 */
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8), 0 0 12px rgba(0, 0, 0, 0.45);
}
/* 大图：216 宽 × 164 高，等比裁切铺满，圆角柔和（"图尽量大一点"） */
.rg-card-pic {
  position: relative;
  display: block;
  width: 100%;
  height: 164px;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}
.rg-card-pic img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.28s ease, filter 0.2s ease;
}
.rg-card-ph {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  /* ★ 2026-10-27 用户反馈「图标放大一点，与框框有点不匹配」：
     34px 的图标放在 164 高的卡片里太空，放大到 76px 并加一圈柔光底，
     让占位卡看起来是"一张图"而不是"一个小图标漂在大框里"。 */
  font-size: 76px;
  line-height: 1;
  background:
    radial-gradient(circle at 50% 46%, rgba(255, 236, 210, 0.5), rgba(255, 236, 210, 0) 62%),
    linear-gradient(150deg, rgba(255, 226, 188, 0.26), rgba(255, 255, 255, 0.07));
}
.rg-card-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  font-size: 11px;
  color: rgba(238, 226, 210, 0.78);
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65);
}
.rg-card-sup {
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(255, 217, 168, 0.16);
  font-style: normal;
  color: #ffd9a8;
}
/* hover / 键盘聚焦：整体抬一下 + 图放大一点 + 标题变亮（"鼠标驻留后高亮"） */
.rg-card:hover .rg-card-pic,
.rg-card:focus-visible .rg-card-pic {
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.42), 0 0 0 2px rgba(255, 205, 140, 0.85);
}
.rg-card:hover .rg-card-pic img,
.rg-card:focus-visible .rg-card-pic img {
  transform: scale(1.06);
}
.rg-card:hover .rg-card-title,
.rg-card:focus-visible .rg-card-title {
  color: #ffd9a8;
}
.rg-card:hover {
  transform: translateY(-4px);
}
.rg-card:active {
  transform: translateY(-1px) scale(0.99);
}
/* ★ 2026-10-27 用户反馈「最下面物体栏点击高亮不明显」：
   hover 的那点描边在点击瞬间根本来不及看清（浮层马上盖上来）。点击后保留 1.6s：
   ① 3px 橙金实描边 + 外圈大面积暖光；② 图片提亮并轻微放大；③ 内层暖光晕；
   ④ 整张卡再上浮 1px、标题换成暖金色加粗。多层叠加，关掉浮层也能一眼找到刚才点的那张。 */
.rg-card.picked {
  transform: translateY(-5px);
}
.rg-card.picked .rg-card-pic {
  box-shadow:
    0 0 0 3px #ffc46a,
    0 0 26px 4px rgba(255, 176, 92, 0.55),
    0 14px 32px rgba(0, 0, 0, 0.48);
}
.rg-card.picked .rg-card-pic img {
  transform: scale(1.05);
  filter: brightness(1.14) saturate(1.08);
}
.rg-card.picked .rg-card-title {
  color: #ffd08a;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 14px rgba(255, 176, 92, 0.6);
}
.rg-card.picked .rg-card-ph {
  box-shadow: inset 0 0 0 2px rgba(255, 196, 106, 0.75);
}
/* 两端箭头：只在还能滚的方向显示为可用 */
.rg-arrow {
  flex: none;
  width: 30px;
  height: 60px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: rgba(28, 22, 18, 0.66);
  color: #f3e7d8;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.16s, opacity 0.16s;
}
.rg-arrow:hover:not(:disabled) {
  background: rgba(28, 22, 18, 0.85);
}
.rg-arrow:disabled {
  opacity: 0.25;
  cursor: default;
}

/* AI 陪伴面板（与 index 布局里的 .ai-fixed 同一套定位；因为 room3d 是顶层路由，
   那份 scoped 样式不生效，这里必须自己写一份） */
.ai-fixed {
  position: fixed;
  right: 3%;
  top: 8%;
  z-index: 70;
  width: 30%;
  height: 72%;
}
/* 产物缺失时的空态：不要让用户以为是"打不开/跳走了" */
.room-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: linear-gradient(180deg, #cfe2f6 0%, #f6e7ea 100%);
}
.re-card {
  width: min(560px, 92%);
  padding: 22px 24px;
  border-radius: 16px;
  background: rgba(255, 253, 251, 0.96);
  box-shadow: 0 18px 44px rgba(60, 45, 35, 0.22);
}
.re-title {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #4a3f37;
}
/* 错误页的两个动作：返回 / 重新加载 */
.re-acts {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.re-btn {
  padding: 9px 18px;
  border: 1px solid rgba(160, 128, 99, 0.35);
  border-radius: 999px;
  background: #fff;
  color: #8a6a4a;
  font-size: 14px;
  letter-spacing: 1px;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}
.re-btn:hover {
  background: #f3e6d4;
}
.re-btn.primary {
  border-color: transparent;
  background: linear-gradient(135deg, #f7a58f, #e0705a);
  color: #fff;
  font-weight: 600;
}
.re-btn.primary:hover {
  background: linear-gradient(135deg, #f09a82, #d4644e);
}
.re-sub {
  margin: 0 0 10px;
  font-size: 14.5px;
  line-height: 1.8;
  color: #8a7a6d;
}
.re-sub code,
.re-cmd {
  padding: 1px 6px;
  border-radius: 6px;
  background: #f6efe7;
  color: #cf7a45;
  font-size: 13px;
}
.re-cmd {
  display: block;
  padding: 10px 12px;
  line-height: 1.6;
  word-break: break-all;
}
.top-actions {
  /* 位置由 .left-col 决定，这里只排内部两个按钮 */
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  /* 容器层 pointer-events:none，这一行要放行（否则返回/视角按钮点不动）。
     只放行到按钮本身，不留整块挡板 —— 3D 画面能拖的地方尽量大。 */
  pointer-events: none;
}
.top-actions .back-btn,
.top-actions .view-nav {
  pointer-events: auto;
}

/* ---- 顶部信息条（原首页搬来）：居中一排胶囊 + 下面一句今日一句 ---- */
.room-top {
  position: absolute;
  left: 50%;
  top: 12px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  max-width: min(760px, calc(100% - 32px));
  transform: translateX(-50%);
  pointer-events: none;
  animation: rt-in 0.8s 0.15s both cubic-bezier(0.22, 0.61, 0.36, 1);
}
@keyframes rt-in {
  from {
    opacity: 0;
    transform: translate(-50%, -8px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}
.rt-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 7px;
}
.rt-chip,
.rt-hi,
.rt-quote {
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(255, 252, 249, 0.82);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.22);
  color: #7a6455;
  font-size: 12px;
  letter-spacing: 1px;
  line-height: 1.5;
  white-space: nowrap;
  backdrop-filter: blur(6px);
}
.rt-hi {
  background: rgba(255, 246, 232, 0.9);
  color: #a4692a;
  font-weight: 600;
}
.rt-clock {
  font-variant-numeric: tabular-nums;
  letter-spacing: 1.5px;
}
.rt-quote {
  color: #8d7663;
  font-size: 11.5px;
  /* <p> 默认上下各 1em 外边距，会把信息条撑高 20 多像素，
     进而和下面那排按钮的包围盒重叠；这里清零，间距交给 flex gap */
  margin: 0;
  animation: rt-quote-in 0.7s both;
}
@keyframes rt-quote-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 窄屏：返回按钮和右侧列表会挤到中间，信息条改成贴顶整行，并允许换行 */
@media (max-width: 900px) {
  .room-top {
    left: 12px;
    right: 12px;
    top: 10px;
    max-width: none;
    transform: none;
    animation: none;
  }
  .left-col {
    top: 72px;
    left: 12px;
    max-width: calc(100% - 24px);
  }
  .rt-row {
    gap: 5px;
  }
  .rt-chip,
  .rt-hi,
  .rt-quote {
    padding: 3px 9px;
    font-size: 11px;
  }
  /* 窄屏：提示卡在右上角，别顶到屏幕外，宽度跟着屏减 */
  .hint-wrap {
    max-width: calc(100% - 20px);
  }
  .room-hint {
    max-width: calc(100% - 24px);
    font-size: 12px;
    line-height: 1.75;
  }
}
/* 屏幕很矮时（横屏手机 / 小窗口）：提示卡会顶到下方陈列条，
   直接收成两行紧凑版；再矮就藏起来，只留右侧小胶囊。 */
@media (max-height: 640px) {
  .room-hint .rh-tip {
    display: none;
  }
  .room-hint {
    font-size: 11.5px;
    line-height: 1.6;
    padding: 8px 14px;
  }
}
@media (max-height: 520px) {
  .hint-wrap {
    display: none;
  }
}
.back-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 252, 249, 0.92);
  color: #5c4f45;
  font-size: 14.5px;
  letter-spacing: 1px;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
}
.back-btn:hover {
  background: #fff;
}

/* ---- 「返回记忆空间」旁边的视角导航（小屋 / 室内 / 花园 / 书桌 / 岛体）---- */
.view-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.vn-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 11px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 252, 249, 0.86);
  color: #5c4f45;
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 0.6px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
  transition: background 0.16s, color 0.16s, transform 0.12s, box-shadow 0.16s;
}
.vn-btn:hover {
  background: #fff;
  transform: translateY(-1px);
}
.vn-btn:active {
  transform: translateY(1px) scale(0.985);
}
/* ★ 2026-10-27 用户反馈「点击高亮不怎么明显」：
   原来只是浅橙底 + 柔光，在亮天空背景上几乎看不出来。现在：
   ① 白描边 + 橙色实底 + 外圈光晕，三层对比，白色永远压得住彩色；
   ② 字重加到 700、图标的线也加粗，形状本身就变"实"；
   ③ 点击瞬间从按钮边缘荡出一圈扩散光环（vn-pulse），视线一定被拉过去。 */
.vn-btn.on {
  background: linear-gradient(145deg, #ffb877 0%, #ef8038 46%, #d4651d 100%);
  color: #fff;
  font-weight: 700;
  transform: translateY(-1px) scale(1.04);
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 6px rgba(238, 128, 56, 0.32),
    0 8px 20px rgba(150, 66, 12, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
}
.vn-btn.on .vn-ico {
  stroke-width: 2.2;
}
.vn-btn:focus-visible {
  outline: 2px solid #ef8038;
  outline-offset: 2px;
}
/* 点击波纹：只播一次（.on 第一次挂上时），0.62s 内放大淡出 */
.vn-btn.on::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 999px;
  border: 2px solid rgba(255, 186, 120, 0.9);
  pointer-events: none;
  animation: vn-pulse 0.62s cubic-bezier(0.22, 0.61, 0.36, 1) 1 both;
}
@keyframes vn-pulse {
  from {
    opacity: 0.95;
    transform: scale(0.94);
  }
  to {
    opacity: 0;
    transform: scale(1.42);
  }
}
.vn-ico {
  width: 15px;
  height: 15px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.vn-label {
  line-height: 1;
}
.detail-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(30, 24, 19, 0.5);
  z-index: 10;
}
.detail-card {
  position: relative;
  width: min(560px, 90%);
  max-height: 86%;
  overflow: auto;
  padding: 22px 24px;
  border-radius: 16px;
  background: #fffdfb;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}
.detail-close {
  position: absolute;
  top: 12px;
  right: 14px;
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: #c9bbae;
  cursor: pointer;
}
.detail-title {
  margin: 0 0 8px;
  font-size: 19px;
  font-weight: 700;
  color: #4a3f37;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #a08063;
}
.detail-media {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.detail-img {
  width: 100%;
  border-radius: 10px;
}
.detail-video {
  width: 100%;
  border-radius: 10px;
  background: #000;
}
.detail-media audio {
  width: 100%;
}
/* AI 产出区：和普通媒体分开，标明这是 AI 生成的，并且已经同步到相框/电视 */
.detail-ai {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 2px 0 12px;
  padding: 10px;
  border: 1px solid rgba(217, 145, 92, 0.28);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(255, 248, 238, 0.95), rgba(255, 252, 247, 0.95));
}
.detail-ai-head {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #c08a52;
}
.detail-ai-note {
  margin: 0;
  font-size: 12px;
  color: #b3a294;
}
.detail-content {
  margin: 0;
  font-size: 15.5px;
  line-height: 1.8;
  color: #5c4f45;
  white-space: pre-wrap;
  word-break: break-word;
}
.detail-reason {
  margin: 12px 0 0;
  font-size: 13px;
  color: #b3a79c;
  font-style: italic;
}
/* ============ 3D 小猫的菜单 / 气泡 ============
   位置用百分比：3D 侧把猫头顶投影成归一化坐标发来，iframe 又正好铺满这个容器，
   所以 left/top 直接乘 100% 就贴着猫，不需要换算 devicePixelRatio。 */
.cat-menu-wrap {
  position: absolute;
  z-index: 7;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transform: translate(-50%, -100%) translateY(-10px);
  /* ★ 点小猫时菜单「啵」地弹出来：缩放带一点回弹（cubic-bezier 的第二个数 > 1），
       比单纯淡入明显得多。v-if 让它只在菜单出现时播一次；
       之后 3D 每 0.2s 更新一次 left/top，动画不会重播。 */
  animation: cat-pop 0.34s cubic-bezier(0.2, 1.5, 0.5, 1) both;
}
@keyframes cat-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -100%) translateY(-10px) scale(0.55);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -100%) translateY(-10px) scale(1);
  }
}
.cat-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid #f0dcc9;
  border-radius: 12px;
  background: #fffdf9;
  box-shadow: 0 10px 26px rgba(20, 14, 10, 0.34);
}
.cat-menu button {
  padding: 5px 14px;
  border: none;
  border-radius: 8px;
  background: #fbeee2;
  color: #8a5f43;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease;
  /* 三个按钮依次登场（--i 由模板按序号写入），比整块一起出现更有生气 */
  animation: cat-item 0.3s cubic-bezier(0.2, 1.4, 0.5, 1) both;
  animation-delay: calc(var(--i, 0) * 0.055s + 0.06s);
}
@keyframes cat-item {
  0% {
    opacity: 0;
    transform: translateY(7px) scale(0.88);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}
.cat-menu button:hover {
  background: #f6ddc6;
}

/* ---- 菜单弹出的那一下特效：一圈扩散光环 + 几点往外飞的火星 ----
   锚在 .cat-menu-wrap 的底部中心，也就是猫头顶那个点上。 */
.cat-fx {
  position: absolute;
  left: 50%;
  top: 100%;
  width: 0;
  height: 0;
  pointer-events: none;
}
.cat-ring {
  position: absolute;
  left: 0;
  top: 0;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border-radius: 50%;
  border: 2px solid rgba(255, 206, 150, 0.95);
  animation: cat-ring 0.62s ease-out both;
}
@keyframes cat-ring {
  0% {
    opacity: 0.95;
    transform: scale(0.3);
  }
  100% {
    opacity: 0;
    transform: scale(3.6);
  }
}
.cat-spark {
  position: absolute;
  left: 0;
  top: 0;
  width: 5px;
  height: 5px;
  margin: -2.5px 0 0 -2.5px;
  border-radius: 50%;
  background: #ffd9a8;
  box-shadow: 0 0 7px 2px rgba(255, 206, 150, 0.85);
  animation: cat-spark 0.66s ease-out var(--del, 0s) both;
}
@keyframes cat-spark {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.4);
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx, 24px), var(--dy, -10px)) scale(0.7);
  }
}

/* ---- 「找找内容」的搜索框：画面底部居中 ----
   不跟着猫走（猫在菜单收起后会继续溜达，输入框会追着目标跑，很难打字）。 */
.cat-find {
  position: absolute;
  left: 50%;
  bottom: 84px;
  /* 底下有「房间物品」图片条时整体抬高，别被卡片挡住 */
  z-index: 9;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: min(430px, 88%);
  padding: 10px 12px;
  border: 1px solid #f0dcc9;
  border-radius: 14px;
  background: rgba(255, 253, 249, 0.97);
  box-shadow: 0 14px 34px rgba(20, 14, 10, 0.34);
  transform: translateX(-50%);
  animation: cat-find-in 0.28s cubic-bezier(0.2, 1.4, 0.5, 1) both;
}
/* 高度跟着陈列条走：卡片去掉底部文字后整条从 275 降到 253，这里同步抬一下 */
.cat-find.has-gallery {
  bottom: 261px;
}
@keyframes cat-find-in {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(14px) scale(0.94);
  }
  100% {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}
.cat-find input {
  flex: 1 1 190px;
  min-width: 0;
  padding: 7px 12px;
  border: 1px solid #ecdbcb;
  border-radius: 999px;
  background: #fffaf4;
  color: #6f5546;
  font-size: 13.5px;
  outline: none;
}
.cat-find input:focus {
  border-color: #e0b98f;
}
.cf-go {
  flex: none;
  padding: 7px 16px;
  border: none;
  border-radius: 999px;
  background: #fbeee2;
  color: #8a5f43;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.cf-go:hover {
  background: #f6ddc6;
}
.cf-x {
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #c3b0a2;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.cf-x:hover {
  background: rgba(0, 0, 0, 0.05);
}
.cf-hint {
  flex: 1 1 100%;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.6;
}
.cf-hint.ok {
  color: #4f7f57;
}
.cf-hint.bad {
  color: #b4603f;
}

.cat-bubble {
  position: absolute;
  z-index: 6;
  max-width: 230px;
  padding: 7px 12px;
  border-radius: 14px;
  background: #fffdf9;
  box-shadow: 0 8px 22px rgba(20, 14, 10, 0.3);
  color: #7a5c48;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  transform: translate(-50%, -100%) translateY(-6px);
  pointer-events: none;
  /* ★ 气泡跟随：3D 侧每 0.12s 重发一次猫头坐标，这里用同长度的线性过渡补间，
       看起来是"贴着猫飘"，而不是每 0.12 秒跳一格。 */
  transition:
    left 0.14s linear,
    top 0.14s linear;
}
/* 想法：斜体 + 颜色浅一点，和"说话"区分开（与 2D 页面一致） */
.cat-bubble.thought {
  color: #8a7568;
  font-style: italic;
}

.room-tip {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  padding: 8px 18px;
  border-radius: 999px;
  background: rgba(255, 252, 249, 0.95);
  color: #a08063;
  font-size: 14px;
  z-index: 6;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
/* 提示卡现在没有自带 animation 了（rh-nudge 已移除），这段只是留个保险：
   以后谁再给 .room-hint 加动画，别让它拖长 Vue <transition> 的离场计时。 */
.room-hint.fade-leave-active {
  animation: none;
}
/* ============ 手机端（≤767.98px）覆盖 UI ============
   只动这一层 HTML 覆盖物，Cocos 侧一行没改（触摸手势本来就有，见 CameraRig 的 TOUCH_MOVE）。
   要解决的问题（390×844 实测）：
     ① 桌面操作提示卡 4 行字撑到 ~150px 高，正好压在「← 返回记忆空间」和一排视角按钮上，
        而且文案是键鼠说明，手机上一条都用不上；
     ② 返回/视角按钮只有 29~34px 高，手柄只有 18×46，点在手机上很难命中；
     ③ 底部陈列条压到安全区里（刘海屏横条）。
   做法：视角按钮去掉装饰图标只留文字 → 5 个挤成一行 40px；提示卡默认收起，
   展开时落到按钮列**下方**的空白天空里（top 用按钮列的确定高度算，不是瞎猜）。 */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  .room-top {
    top: calc(8px + env(safe-area-inset-top, 0px));
    left: 10px;
    right: 10px;
  }
  /* 按钮列：返回单独一行，视角导航另起一行（并排会折成 3 行，把画面吃掉） */
  .left-col {
    top: calc(68px + env(safe-area-inset-top, 0px));
    left: 10px;
    gap: 6px;
    max-width: calc(100% - 20px);
  }
  .top-actions {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .back-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    padding: 0 16px;
    font-size: 14px;
  }
  .view-nav {
    flex-wrap: nowrap;
    gap: 5px;
  }
  .vn-btn {
    height: 40px;
    padding: 0 12px;
    font-size: 13px;
    letter-spacing: 0.4px;
  }
  /* 20px 的图标 + 2 字标签在 40px 胶囊里会溢出，手机上图标是纯装饰，去掉 */
  .vn-btn .vn-ico {
    display: none;
  }
  /* 提示卡：按钮列 = 40 + 6 + 40 = 86，从 68 起算到 154，再留 10px 间隙 */
  .hint-wrap {
    top: calc(164px + env(safe-area-inset-top, 0px));
    right: 10px;
    max-width: calc(100% - 20px);
  }
  .room-hint {
    max-width: calc(100% - 20px);
    padding: 9px 13px;
    font-size: 12.5px;
    line-height: 1.7;
  }
  .rh-desktop {
    display: none;
  }
  .rh-touch {
    display: block;
  }
  /* 折叠手柄：18×46 只有 18px 宽，手指点不中；手机给 40×40 */
  .hint-toggle {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }
  .ht-chev {
    width: 12px;
    height: 20px;
  }
  /* 底部陈列条：让出刘海屏/手势条的安全区，左右箭头抬到 40 宽 */
  .room-gallery {
    padding: 10px 10px calc(10px + env(safe-area-inset-bottom, 0px));
  }
  .rg-arrow {
    width: 40px;
    height: 52px;
  }
  .room-tip {
    /* 默认 bottom:24px 会压在陈列条上（同 z-index，陈列条在后面所以盖住它） */
    bottom: calc(190px + env(safe-area-inset-bottom, 0px));
    font-size: 13px;
    padding: 7px 14px;
  }
  /* AI 陪伴面板：桌面是 right:3% / width:30%，手机上只有 117px 宽，没法用 */
  .ai-fixed {
    right: 8px;
    left: 8px;
    top: calc(56px + env(safe-area-inset-top, 0px));
    width: auto;
    height: 62%;
  }
}
</style>
