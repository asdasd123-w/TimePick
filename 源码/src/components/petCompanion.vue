<template>
  <!-- ★ 2026-10-28：不再用 :style 绑 transform。位置每帧直接写 el.style，
       Vue 的响应式只负责"翻转气泡"这类真正的状态变化。 -->
  <div ref="rootEl" class="pet-root" :class="{ flip }" @pointerdown.stop="onDown">
    <!-- ★ 2026-10-27 用户要求「宠物的名字不显示」：头顶那个名字小胶囊不再渲染。
         名字仍然从 config.pet_name 读进 petName（别处还会用到），只是不画出来。 -->
    <div v-if="say" class="pet-say">{{ say }}</div>
    <div v-if="thought" class="pet-thought">{{ thought }}</div>
    <div v-if="menu" class="pet-menu">
      <button type="button" @click.stop="doPat">摸摸头</button>
      <button type="button" @click.stop="doWave">打招呼</button>
      <button type="button" @click.stop="doGaze">望望天</button>
      <button type="button" @click.stop="doHug">要抱抱</button>
      <button type="button" @click.stop="doChat">找小橘聊天</button>
      <button type="button" @click.stop="doStop">取消动作</button>
    </div>
    <!-- 点击粒子特效 -->
    <span v-for="p in parts" :key="p.id" class="pet-part" :style="p.style">{{ p.ch }}</span>
    <!-- 外层固定占位盒, 内层按帧精确裁切, 避免露出相邻行; key 变化重播挤压动画 -->
    <div :key="boingKey" class="pet-box boing">
      <!-- 地面阴影：以前是 .pet-sprite 上的 filter: drop-shadow，换帧时那层滤镜要
           整块重新栅格化（140×178、10px 模糊），手机 GPU 上很贵。换成一张静态
           径向渐变，跟着 transform 走，零重绘。 -->
      <span class="pet-shadow" aria-hidden="true"></span>
      <div class="pet-sprite" :class="{ grab: dragging }" :style="spriteStyle"></div>
    </div>
  </div>
  <!-- 双击落点波纹: 挂到 body 避免跟随宠物位移 -->
  <Teleport to="body">
    <span
      v-if="ping"
      :key="ping.id"
      class="pet-ping"
      :style="{ left: `${ping.x}px`, top: `${ping.y}px` }"
    ></span>
  </Teleport>
</template>

<script setup>
// 游走宠物: 全页常驻, 可拖拽; 自主随机游走+随机动作; 点击菜单可互动/联动 AI
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  useCompanionStore,
  petSheet,
  petMetrics,
  PET_FRAMES,
  DEFAULT_PET_TYPE,
} from '@/stores/companion'
import { cloudApi } from '@/api/cloud'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { useSpacePrefsStore } from '@/stores/spacePrefs'

const companion = useCompanionStore()
const spacePrefs = useSpacePrefsStore()
const auth = useCloudAuthStore()
const route = useRoute()

// 宠物名字
const petName = ref('')

// 加载宠物配置
// 花色必须在这里同步: AI 陪伴面板(AiCompanion)要打开才挂载, 光靠它同步的话
// 用户选了花色后, 页面上游走的猫还是会一直显示默认橘猫。
async function loadPetConfig() {
  if (!auth.isLogin) return
  try {
    const config = await cloudApi.getPet()
    if (config && config.pet_name) {
      petName.value = config.pet_name
    }
    if (config && config.pet_type) {
      companion.setPetType(config.pet_type, auth.user?.id)
    }
  } catch (e) {
    console.error('加载宠物配置失败:', e.message)
  }
}

// PetCompanion 挂在主页上, 而主页与欢迎页是同时在 DOM 里的, 未登录时也会挂载。
// 早先只在 onMounted 里拉一次配置: 未登录进站 → 直接 return → 之后登录也不会补拉,
// 于是整场都是默认的橘猫(用户看到的就是"昨天选的猫第二天变回第一只")。
// 这里盯着登录态, 一登录就补拉; 本地缓存(见 stores/companion.js)保证首帧不闪橘猫。
watch(
  () => auth.isLogin,
  (on) => {
    if (on) loadPetConfig()
  }
)

// 帧表按花色逐张实测(见 src/data/petFrames.js): 各素材的帧落位、行高都有 ±10px
// 抖动(新素材的猫身还比橘猫大约 4%), 用橘猫网格等比换算会切掉耳尖/尾巴,
// 所以这里直接用素材像素坐标, 不再做比例换算。
const frames = computed(() => PET_FRAMES[companion.petType] || PET_FRAMES[DEFAULT_PET_TYPE])

// 动作定义: row=帧行; 时长单位 ms; script=手动帧脚本([帧号, 停留ms]); 否则顺序播放 ms/帧 × cycles 遍
const ACTS = {
  // 待机: 大部分时间静止, 偶尔眨眼/歪头, 不频繁扭头
  idle: {
    row: 0,
    loop: true,
    script: [
      [0, 900],
      [1, 110],
      [2, 110],
      [0, 750],
      [3, 280],
      [0, 600],
      [4, 420],
      [0, 450],
    ],
  },
  walkR: { row: 1, loop: true, ms: 120 },
  walkL: { row: 2, loop: true, ms: 120 },
  wave: { row: 3, ms: 130, cycles: 2 },
  pounce: { row: 4, ms: 120, cycles: 1 },
  mope: { row: 5, ms: 220, cycles: 1 },
  beckon: { row: 6, ms: 130, cycles: 2 },
  groom: { row: 7, ms: 190, cycles: 2 },
  enjoy: { row: 8, ms: 190, cycles: 2 },
  look: { row: 9, ms: 150, cycles: 1 },
  gaze: { row: 10, ms: 160, cycles: 1 },
}

// 占位盒尺寸：桌面 140×178；手机按屏宽缩到约 92×117（见 syncBoxSize）
const BOX_W = ref(140)
const BOX_H = ref(178)

// 当前花色的精灵图; 帧表用的就是素材自身像素坐标, 不需要再换算画布比例
const sheet = computed(() => petSheet(companion.petType))

// 各素材的画布只有橘猫那张的 2/3, 猫身大小也跟着不同,
// 按"该素材的猫身内容尺寸"折算缩放, 三只猫才会显示成同样大。
const metrics = computed(() => petMetrics(companion.petType))
const SCALE = computed(
  () => Math.min(BOX_W.value / metrics.value.w, BOX_H.value / metrics.value.h),
)

// 双击导航巡航速度 px/ms; 每帧步幅(px), 用于按地速换算蹬腿节奏
// ★ 原来是 0.05 —— 看着"走过去", 实测双击屏幕另一侧(约 700px)要走 14 秒,
//   用户反馈的「双击没反应 / 半天不动」就是这个。现在 0.18 ≈ 4 秒跑完,
//   明显是"跑过去"而不是"蹭过去", 又不至于像 runAcross(0.26) 那样一路狂奔。
// 对照: 自主溜达 0.032~0.058(散步), 双击 0.18(小跑), 入场跑场 0.26(全速跑)。
const CRUISE_NAV = 0.18
const STRIDE_PX = 5.5

const curAct = ref('idle')
const frameIdx = ref(0)
const dragging = ref(false)
const menu = ref(false)
const say = ref('')

// ★ 2026-10-28：pos 不再是 reactive。每帧改一个响应式对象，Vue 就要在 30fps 下
//   反复 patch 这个组件；现在位置直接写 DOM 的 transform（合成层，不重排不重绘），
//   Vue 只在"气泡要不要翻到下方"这种真正的状态变化时才更新。
const pos = { x: 0, y: 0 }
const flip = ref(false)
const rootEl = ref(null)
const POS_KEY = 'timepick-pet-pos'

// ---- 帧脚本引擎 ----
// ★ 全局动作节奏倍率（>1 = 放慢）。
//   背景：早先 `loop()` 把每帧 dt 截断在 250ms，页面一卡（进 3D 房间时引擎在编译着色器）
//   动画推进就比真实时间慢一大截，看起来"动作偏慢"。把 dt 修好之后动画恢复正常速度，
//   用户反馈"帧率好像变快了" → 先调到 1.4，之后又要求"再减小点" → 现在 1.8。
//   改这一处就能同时影响待机/走路/所有动作，不用逐个调 ACTS 里的 ms。
const ACT_SPEED = 1.8

let script = []
let sp = 0
let holdMs = 0
let looping = false

function buildScript(act) {
  const a = ACTS[act]
  const k = ACT_SPEED
  if (a.script) return a.script.map(([f, ms]) => [f, Math.round(ms * k)])
  const n = frames.value[a.row].f.length
  const one = Array.from({ length: n }, (_, i) => [i, Math.round(a.ms * k)])
  // loop 动作(走路/待机)没有 cycles, 默认 1 遍循环播放
  return Array.from({ length: a.cycles || 1 }, () => one).flat()
}

// 走路帧停留: 按当前地速换算, 走得慢蹬腿就慢, 停下前腿频渐缓（再乘全局节奏倍率）
function frameMsFor(base) {
  if (curAct.value === 'walkR' || curAct.value === 'walkL') {
    if (dragging.value) return Math.round(110 * ACT_SPEED)
    if (vel > 0.004) {
      return Math.round(Math.min(220, Math.max(70, STRIDE_PX / vel)) * ACT_SPEED)
    }
  }
  return base
}

function play(act) {
  const a = ACTS[act]
  if (!a) return
  curAct.value = act
  script = buildScript(act)
  if (!script.length) script = [[0, 100]]
  looping = Boolean(a.loop)
  sp = 0
  holdMs = script[0][1]
  frameIdx.value = script[0][0]
  // 自主伤心时配一句台词, 只在进入动作时说一次
  if (act === 'mope' && Math.random() < 0.6) {
    showSay(SAD_LINES[Math.floor(Math.random() * SAD_LINES.length)])
  }
  if (act === 'gaze' && Math.random() < 0.5) {
    showThought(GAZE_THOUGHTS[Math.floor(Math.random() * GAZE_THOUGHTS.length)])
  }
}

// ---- 自主行为: 随机动作 + 随机游走 (冷却单位 ms, 受空间偏好动效档位缩放) ----
// ★ 2026-10-29：游走间隔 20~46s 收到 9~24s、步幅 70~200px 放到 110~330px。
//   原因：间隔 20s 起步时，猫会有大半分钟完全不动 —— 用户看到的就是「小猫卡住了」
//   （实测 100 秒里最长静止 55 秒）。即使逻辑没坏，观感也是死了。宁可多走两趟。
// 数值是"适中"档的基准, 动效=高时 petFactor=0.55 会更活跃, 动效=低时 2.2 更懒。
const AMBIENT_MIN = 9000
const AMBIENT_RAND = 11000
const WANDER_MIN = 9000
const WANDER_RAND = 15000
let ambientMs = (AMBIENT_MIN + Math.floor(Math.random() * AMBIENT_RAND)) * spacePrefs.petFactor
let wanderMs = (WANDER_MIN + Math.floor(Math.random() * WANDER_RAND)) * spacePrefs.petFactor
let walkDir = 1
// 移动目标点 { x, y, cruise }: 双击导航与自主游走共用
let moveTarget = null
// 当前地速 px/ms (变速运动: 出发加速/到点减速)
let vel = 0

// 双击落点波纹
const ping = ref(null)
let pingId = 0

// null = 这次什么都不做(继续发呆): 权重给到最大, 让动作之间留出静息,
// 否则加权总和里每个 roll 都会真的切一次动作, 看起来就是一直在动。
const AMBIENT_POOL = [
  [null, 40],
  ['groom', 22],
  ['gaze', 16],
  ['look', 14],
  ['wave', 10],
  ['mope', 10],
  ['pounce', 8],
]

function rollAmbient() {
  ambientMs = (AMBIENT_MIN + 4000 + Math.floor(Math.random() * (AMBIENT_RAND + 6000))) * spacePrefs.petFactor
  const total = AMBIENT_POOL.reduce((s, p) => s + p[1], 0)
  let r = Math.random() * total
  for (const [act, w] of AMBIENT_POOL) {
    r -= w
    if (r <= 0) {
      if (act) play(act)
      return
    }
  }
}

function startWander() {
  wanderMs = (WANDER_MIN + 4000 + Math.floor(Math.random() * (WANDER_RAND + 6000))) * spacePrefs.petFactor
  // 靠边时朝内走
  const nearLeft = pos.x < window.innerWidth * 0.2
  const nearRight = pos.x > window.innerWidth * 0.8
  walkDir = nearLeft ? 1 : nearRight ? -1 : Math.random() < 0.5 ? -1 : 1
  // 随机溜达距离/随机巡航速度, 每次走得不一样（步幅也一并放大，否则动起来也像在原地挪）
  const dist = 110 + Math.random() * 220
  moveTarget = {
    x: Math.min(Math.max(pos.x + walkDir * dist, 4), window.innerWidth - BOX_W.value - 4),
    y: Math.min(Math.max(pos.y + (Math.random() - 0.5) * 60, 4), window.innerHeight - BOX_H.value - 4),
    cruise: 0.032 + Math.random() * 0.026,
  }
  play(walkDir > 0 ? 'walkR' : 'walkL')
  // ★★ 2026-10-29 修「小猫时不时卡住」的根因：
  //   自主游走只设了 moveTarget + 播走路动画，却**没有 startMove()**。
  //   于是位移循环（rAF）根本没跑，位置永远不变 —— 表现为小猫原地踏步、
  //   而且因为 moveTarget 一直非空，advanceFrames 里的自主行为被全部跳过，
  //   它会**永远**保持走路姿势，直到用户双击/拖动才"解冻"。
  //   实测（95 秒）：换帧 215 次、位移 0px、不同位置只有 1 个。
  startMove()
}

/**
 * 让小猫走到页面上的某个点（页面坐标系，px）。
 * 唯一的调用方：页面里直接双击（onDbl）。
 *
 * ★ 3D 房间里的双击不再走这里 —— 那边的猫是 Cocos 里的真 3D 模型，
 *   在 3D 内部就处理完了（见 sg3d 的 CatPet.tryWalkTo）。
 */
function moveTo(clientX, clientY) {
  moveTarget = {
    x: Math.min(Math.max(clientX - BOX_W.value / 2, 4), Math.max(4, window.innerWidth - BOX_W.value - 4)),
    y: Math.min(Math.max(clientY - BOX_H.value / 2, 4), Math.max(4, window.innerHeight - BOX_H.value - 4)),
    cruise: CRUISE_NAV,
  }
  // 在目标点打一个水波纹，告诉用户"它要去那儿"
  startMove()
  pingId += 1
  ping.value = { id: pingId, x: clientX, y: clientY }
  const myId = pingId
  setTimeout(() => {
    if (ping.value && ping.value.id === myId) ping.value = null
  }, 700)
  return moveTarget
}

/**
 * 帧推进（只换精灵帧 + 安排自主行为，不动位置）。
 * ★ 2026-10-28 拆分的动机：以前位置和帧由同一个 15/30fps 的循环驱动 ——
 *   非空间页 66ms 才更新一次坐标，走路和拖拽就是"一跳一跳"的。现在帧还按原节奏走
 *   （本来就只有 8~10 帧/秒），位置交给 rAF 每帧写 transform，手感回到 60fps。
 */
function advanceFrames(dt) {
  // ★ 兜底：有目标点却没有位移循环 = 一定会原地踏步卡死。
  //   任何以后新增的"让猫走过去"的入口忘了 startMove()，这里都还能自愈。
  if (moveTarget && !raf) startMove()
  holdMs -= dt
  while (holdMs <= 0) {
    sp += 1
    if (sp >= script.length) {
      if (looping || moveTarget) sp = 0
      else {
        play('idle')
        break
      }
    }
    if (script[sp]) {
      frameIdx.value = script[sp][0]
      holdMs += frameMsFor(script[sp][1])
    }
  }
  // 空闲时才安排自主行为
  if (!dragging.value && !menu.value && !moveTarget) {
    // 想法随机冒出: 走路/做动作时也会想事情
    thoughtMs -= dt
    if (thoughtMs <= 0 && !thought.value && !say.value) {
      thoughtMs = 10000 + Math.floor(Math.random() * 15000)
      showThought(THOUGHT_LINES[Math.floor(Math.random() * THOUGHT_LINES.length)])
    }
    if (curAct.value === 'idle') {
      ambientMs -= dt
      if (ambientMs <= 0) rollAmbient()
      wanderMs -= dt
      if (wanderMs <= 0) startWander()
    }
  }
}

/**
 * 位移（双击导航 / 自主游走）：出发加速、到点减速的变速运动。
 * 只在 rAF 里被调用，dt 是两帧之间的真实毫秒差。
 */
function advanceMove(dt) {
  if (!moveTarget || dragging.value) return
  const dx0 = moveTarget.x - pos.x
  const dy0 = moveTarget.y - pos.y
  const dist = Math.hypot(dx0, dy0)
  if (dist < 5) {
    moveTarget = null
    vel = 0
    play('idle')
    return
  }
  const targetV = moveTarget.cruise * Math.min(1, Math.max(0.25, dist / 80))
  vel += (targetV - vel) * Math.min(1, dt / 300)
  pos.x += (dx0 / dist) * vel * dt
  pos.y += (dy0 / dist) * vel * dt
  clampPos()
  const dir = dx0 > 2 ? 'walkR' : dx0 < -2 ? 'walkL' : curAct.value === 'walkL' ? 'walkL' : 'walkR'
  if (curAct.value !== dir) play(dir)
}

function isMoving() {
  return Boolean(moveTarget) && !dragging.value
}

// ---- 渲染样式: 内层尺寸=帧尺寸, 窗口与帧完全重合 ----
const spriteStyle = computed(() => {
  const row = frames.value[ACTS[curAct.value].row]
  const [x0, x1] = row.f[frameIdx.value % row.f.length]
  const [y0, y1] = row.y
  const s = sheet.value
  const k = SCALE.value
  return {
    width: `${(x1 - x0) * k}px`,
    height: `${(y1 - y0) * k}px`,
    backgroundImage: `url(${s.src})`,
    backgroundSize: `${s.w * k}px ${s.h * k}px`,
    backgroundPosition: `${-x0 * k}px ${-y0 * k}px`,
  }
})

let sayTimer = null
let frameTimer = 0
let raf = 0
let lastTs = 0
let lastFrameAt = 0
// 单帧最多补多少真实时间：进 3D 房间时主线程会被占住几百毫秒到两三秒，
// 超过这个值就不再补，避免一口气跳过好几帧动画。
const MAX_CATCHUP = 1500

/* ---- 帧驱动：setTimeout 自己排下一拍 ----
   ★ 好处是"不动的时候也几乎不花钱"：待机脚本一帧要停 900ms，那就 900ms 之后再醒，
   中间不占一帧 rAF。以前是不管动没动，30fps 常驻跑循环。 */
function scheduleFrame() {
  clearTimeout(frameTimer)
  frameTimer = setTimeout(tickFrames, Math.max(16, Math.min(2000, holdMs)))
}

function tickFrames() {
  frameTimer = 0
  const now = performance.now()
  const dt = lastFrameAt ? Math.min(MAX_CATCHUP, now - lastFrameAt) : 16
  lastFrameAt = now
  advanceFrames(dt)
  scheduleFrame()
}

/* ---- 位移驱动：只在真的在走的时候开 rAF ---- */
function loop(ts) {
  // 进回调先清掉句柄：这样帧里再判断 `!raf` 才是"真的没有下一帧了"，
  // 也不会因为一次异常就让 raf 留下一个永远等不到帧的僵尸值。
  raf = 0
  if (!isMoving()) return
  const dt = lastTs ? Math.min(100, ts - lastTs) : 16
  lastTs = ts
  try {
    advanceMove(dt)
  } catch (err) {
    // 位移逻辑出任何异常都不要让猫卡在半路：放弃目标、回到待机。
    moveTarget = null
    vel = 0
    play('idle')
    return
  }
  applyTransform()
  if (isMoving()) raf = requestAnimationFrame(loop)
}

function startMove() {
  if (dragging.value) return
  if (!raf) {
    lastTs = 0
    raf = requestAnimationFrame(loop)
  }
}

function stopMove() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function startLoop() {
  stopMove()
  lastFrameAt = 0
  tickFrames()
  // ★ 切回标签页时如果在游走途中，rAF 已经被 stopLoop 掐掉了，
  //   这里必须把位移重新接上，否则又变成原地踏步（同 startWander 的坑）。
  if (moveTarget) startMove()
}

function stopLoop() {
  stopMove()
  clearTimeout(frameTimer)
  frameTimer = 0
}

// 标签页不可见时停掉所有定时器, 避免后台空转
function onVisibility() {
  if (document.hidden) stopLoop()
  else startLoop()
}

function showSay(text) {
  thought.value = ''
  say.value = text
  clearTimeout(sayTimer)
  sayTimer = setTimeout(() => {
    say.value = ''
  }, 2400)
}

function showThought(text) {
  say.value = ''
  thought.value = text
  clearTimeout(thoughtTimer)
  thoughtTimer = setTimeout(() => {
    thought.value = ''
  }, 3200)
}

const PAT_LINES = ['喵呜~ 好舒服, 呼噜呼噜…', '嘿嘿, 再摸一下嘛!', '你的手心暖暖的, 喵~']
const WAVE_LINES = ['喵喵! 你来啦~', '嗨呀, 陪我玩一会好不好?', '伸个懒腰~ 你好呀!']
const SAD_LINES = ['呜…今天有点想家了。', '有些记忆, 想着想着就酸酸的。']
const GAZE_THOUGHTS = [
  '上面会有小鱼形状的云吗?',
  '盯———看久了脖子酸酸的。',
  '天上那颗星星, 像不像罐头的盖子?',
]
// 点击时冒出的想法
const TAP_THOUGHTS = [
  '咦? 怎么啦~',
  '嘿嘿, 被你找到了。',
  '嗯? 想陪我玩吗?',
  '别戳啦, 痒痒的~',
  '喵! 吓我一跳。',
]
// 发呆时自己冒出的想法
const THOUGHT_LINES = [
  '在想…今天有没有小鱼干的记忆。',
  '那朵云好像一条晒干的沙丁鱼。',
  '是在这里打盹, 还是去那边呢?',
  '唔…太阳晒着好舒服。',
  '广场里大家在聊什么呀?',
  '尾巴今天也很听话, 真好。',
]

// ---- 点击特效: 粒子迸发 + 挤压弹跳 + 想法气泡 ----
const parts = ref([])
const thought = ref('')
const boingKey = ref(0)
let partId = 0
let thoughtTimer = null
let thoughtMs = 8000 + Math.floor(Math.random() * 12000)

const PART_CHARS = [
  ['♥', '#e78ca0'],
  ['✦', '#e9b451'],
  ['♪', '#8fb7e0'],
  ['✿', '#d99ac4'],
  ['˚', '#9ec9a2'],
]

function burst() {
  for (let i = 0; i < 6; i++) {
    const [ch, color] = PART_CHARS[Math.floor(Math.random() * PART_CHARS.length)]
    const id = ++partId
    parts.value.push({
      id,
      ch,
      style: {
        color,
        '--dx': `${(Math.random() - 0.5) * 90}px`,
        '--dy': `${-(30 + Math.random() * 55)}px`,
      },
    })
    setTimeout(() => {
      parts.value = parts.value.filter((p) => p.id !== id)
    }, 800)
  }
}

function doPat() {
  menu.value = false
  moveTarget = null
  play('enjoy')
  showSay(PAT_LINES[Math.floor(Math.random() * PAT_LINES.length)])
}

function doWave() {
  menu.value = false
  moveTarget = null
  play('wave')
  showSay(WAVE_LINES[Math.floor(Math.random() * WAVE_LINES.length)])
}

function doChat() {
  menu.value = false
  moveTarget = null
  play('beckon')
  showSay('小橘醒啦, 一起聊天喵~')
  companion.openAi()
}

function doGaze() {
  menu.value = false
  moveTarget = null
  play('gaze')
  showSay('一起看看上面有什么喵~')
}

function doHug() {
  menu.value = false
  moveTarget = null
  play('mope')
  showSay('呜…抱抱就不委屈了。')
}

function doStop() {
  menu.value = false
  moveTarget = null
  play('idle')
  clearTimeout(sayTimer)
  clearTimeout(thoughtTimer)
  say.value = ''
  thought.value = ''
}

// 转屏 / 改窗口宽度：重算盒子尺寸（位置会顺带夹回可视区）
let resizeTimer = 0
function onResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(syncBoxSize, 150)
}

// ---- 拖拽移动 / 点击判定: window 监听, 不捕获指针 ----
let start = null
let moved = 0
let wasMenu = false
let downInMenu = false
let lastX = 0

function clampPos() {
  pos.x = Math.min(Math.max(pos.x, 4), Math.max(4, window.innerWidth - BOX_W.value - 4))
  pos.y = Math.min(Math.max(pos.y, 4), Math.max(4, window.innerHeight - BOX_H.value - 4))
}

// ---- 位置渲染：唯一一处写 transform ----
function applyTransform() {
  const el = rootEl.value
  if (!el) return
  el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`
  const f = pos.y < 190
  if (f !== flip.value) flip.value = f
}

// 屏幕变窄时把盒子缩小：手机 88~132px，桌面维持 140
function syncBoxSize() {
  const w = window.innerWidth
  const size = w < 768 ? Math.round(Math.min(132, Math.max(88, w * 0.24))) : 140
  BOX_W.value = size
  BOX_H.value = Math.round(size * (178 / 140))
  el_size_apply()
}

function el_size_apply() {
  const el = rootEl.value
  if (!el) return
  el.style.width = `${BOX_W.value}px`
  el.style.height = `${BOX_H.value}px`
  clampPos()
  applyTransform()
}

function onDown(e) {
  // 点在菜单里时不干预, 让按钮自己的 click 生效
  downInMenu = Boolean(e.target.closest('.pet-menu'))
  wasMenu = menu.value
  start = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
  moved = 0
  lastX = e.clientX
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onMove(e) {
  if (!start) return
  const dx = e.clientX - start.x
  const dy = e.clientY - start.y
  moved = Math.max(moved, Math.abs(dx) + Math.abs(dy))
  if (moved > 6) {
    if (!dragging.value) {
      dragging.value = true
      moveTarget = null
      menu.value = false
    }
    // ★ 这里原来有一行 `lastUserNavAt = ...`（给"入场跑场"让路用的），
    //   但入场跑场早就删了，这个变量也从来没声明过 —— ESM 是严格模式，
    //   拖动宠物走到这一行会直接抛 "lastUserNavAt is not defined"，
    //   表现是"拖着拖着宠物卡住/控制台报错"。已删除。
    const step = e.clientX - lastX
    // 仅在方向变化时切换走路动作, 避免每次 pointermove 重置帧脚本导致腿不动
    if (step > 0 && curAct.value !== 'walkR') play('walkR')
    else if (step < 0 && curAct.value !== 'walkL') play('walkL')
    pos.x = start.px + dx
    pos.y = start.py + dy
    clampPos()
    applyTransform()
  }
  lastX = e.clientX
}

function onUp() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  if (!start) return
  start = null
  if (moved <= 6) {
    // 点击: 点宠物本体开合菜单+特效想法; 点菜单内部交给按钮处理
    if (!downInMenu) {
      menu.value = !wasMenu
      burst()
      boingKey.value += 1
      showThought(TAP_THOUGHTS[Math.floor(Math.random() * TAP_THOUGHTS.length)])
    }
  } else {
    dragging.value = false
    play('idle')
    applyTransform()
    localStorage.setItem(POS_KEY, JSON.stringify({ x: pos.x, y: pos.y }))
  }
}

// 点击页面空白/其他位置: 收起菜单与气泡等互动 (宠物自身 pointerdown 已 stop, 不会误关)
function onGlobalDown(e) {
  const el = e.target
  if (el instanceof Element && el.closest('.pet-root')) return
  menu.value = false
  if (say.value) {
    clearTimeout(sayTimer)
    say.value = ''
  }
  if (thought.value) {
    clearTimeout(thoughtTimer)
    thought.value = ''
  }
}

// 双击页面任意位置: 小猫自己走过去
function onDbl(e) {
  if (
    e.target.closest(
      'button, input, textarea, a, select, .pet-root, .ai-fixed, .cat-zone, .sq-publish, .p-audio',
    )
  )
    return
  moveTo(e.clientX, e.clientY)
}

onMounted(() => {
  loadPetConfig()
  syncBoxSize()
  const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null')
  // 初始位置: 左下角空白处(导航栏右侧贴底)
  pos.x = saved ? saved.x : window.innerWidth * 0.15 + 16
  pos.y = saved ? saved.y : window.innerHeight - BOX_H.value - 24
  clampPos()
  applyTransform()
  play('idle')
  startLoop()
  window.addEventListener('resize', onResize)
  window.addEventListener('dblclick', onDbl)
  window.addEventListener('pointerdown', onGlobalDown)
  document.addEventListener('visibilitychange', onVisibility)
  // 开发环境调试钩子: 便于手动触发动作/游走验证
  if (import.meta.env.DEV) {
    window.__pet = {
      play,
      wander: startWander,
      ambient: rollAmbient,
      act: curAct,
      frame: frameIdx,
      pos,
      step: advanceFrames,
      getVel: () => vel,
      moveTo,
      isNavigating: () => Boolean(moveTarget),
    }
  }
})

onUnmounted(() => {
  stopLoop()
  window.removeEventListener('resize', onResize)
  clearTimeout(sayTimer)
  clearTimeout(thoughtTimer)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('dblclick', onDbl)
  window.removeEventListener('pointerdown', onGlobalDown)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<style scoped>
.pet-root {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 65;
  /* 尺寸由脚本的 syncBoxSize() 写内联样式（桌面 140×178、手机约 92×117），
     这里给个兜底值，避免首帧抖动 */
  width: 140px;
  height: 178px;
  touch-action: none;
  user-select: none;
  cursor: grab;
  will-change: transform;
}

.pet-box {
  position: absolute;
  inset: 0;
  transform-origin: 50% 100%;
}

/* 点击/加载时的挤压弹跳 */
.pet-box.boing {
  animation: pet-boing 340ms ease-out;
}

@keyframes pet-boing {
  0% {
    transform: scale(1, 1);
  }
  30% {
    transform: scale(1.12, 0.86);
  }
  60% {
    transform: scale(0.94, 1.06);
  }
  100% {
    transform: scale(1, 1);
  }
}

/* 点击粒子: 向上飘散淡出 */
.pet-part {
  position: absolute;
  left: 50%;
  top: 32%;
  z-index: 3;
  pointer-events: none;
  font-size: 14.5px;
  animation: pet-pop 720ms ease-out forwards;
}

@keyframes pet-pop {
  0% {
    transform: translate(-50%, -50%) scale(0.4);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1.15);
    opacity: 0;
  }
}

/* 想法气泡: 云朵形 + 下方小圆点 */
.pet-thought {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 12px;
  padding: 7px 11px;
  border-radius: 14px;
  background: #fffdf9;
  box-shadow: 0 6px 16px rgba(120, 80, 40, 0.16);
  color: #8a7568;
  font-size: 13px;
  font-style: italic;
  white-space: nowrap;
}

.pet-thought::before,
.pet-thought::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: #fffdf9;
  box-shadow: 0 4px 10px rgba(120, 80, 40, 0.12);
}

.pet-thought::before {
  width: 8px;
  height: 8px;
  left: 20px;
  bottom: -7px;
}

.pet-thought::after {
  width: 5px;
  height: 5px;
  left: 13px;
  bottom: -13px;
}

/* 内层按帧裁切, 底对齐水平居中 (背景图与尺寸由 spriteStyle 动态给) */
.pet-sprite {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  background-repeat: no-repeat;
  /* ★ 2026-10-28：这里原来是 filter: drop-shadow(...)。精灵图每次换帧，
     滤镜层都要在 140×178 的区域上重新做一遍 10px 模糊，手机上是白烧的 GPU 时间。
     改成下面这张静态椭圆阴影，视觉几乎一致，且完全不参与逐帧重绘。 */
}

/* 地面阴影：静态径向渐变，跟着父级 transform 走（合成层里平移，不重绘） */
.pet-shadow {
  position: absolute;
  left: 50%;
  bottom: 2px;
  width: 58%;
  height: 12px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(90, 60, 30, 0.26), rgba(90, 60, 30, 0) 70%);
  pointer-events: none;
}

.pet-sprite.grab {
  cursor: grabbing;
}

/* 双击落点波纹 */
.pet-ping {
  position: fixed;
  z-index: 64;
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  border: 2px solid #f2a9c0;
  border-radius: 50%;
  pointer-events: none;
  animation: pet-ping 650ms ease-out forwards;
}

@keyframes pet-ping {
  from {
    transform: scale(0.4);
    opacity: 0.9;
  }
  to {
    transform: scale(1.7);
    opacity: 0;
  }
}

/* 宠物名字 */
.pet-name {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: -8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 8px rgba(120, 80, 40, 0.15);
  color: #8a6f5a;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  z-index: 10;
}

/* 说话气泡 */
.pet-say {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 6px;
  padding: 6px 10px;
  border: 1px solid #f3d9c8;
  border-radius: 10px;
  background: #fffdf9;
  box-shadow: 0 6px 16px rgba(120, 80, 40, 0.16);
  color: #7a5c48;
  font-size: 13px;
  white-space: nowrap;
}

/* 互动菜单 */
.pet-menu {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid #f0dcc9;
  border-radius: 12px;
  background: #fffdf9;
  box-shadow: 0 8px 20px rgba(120, 80, 40, 0.18);
}

.pet-menu button {
  padding: 5px 12px;
  border: none;
  border-radius: 8px;
  background: #fbeee2;
  color: #8a5f43;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}

.pet-menu button:hover {
  background: #f6ddc6;
}

/* 宠物靠近顶部时, 菜单/气泡/想法翻到下方避免出屏 */
.pet-root.flip .pet-say,
.pet-root.flip .pet-menu,
.pet-root.flip .pet-thought {
  bottom: auto;
  top: 100%;
  margin-bottom: 0;
  margin-top: 6px;
}

.pet-root.flip .pet-thought {
  margin-top: 12px;
}

.pet-root.flip .pet-thought::before {
  bottom: auto;
  top: -7px;
}

.pet-root.flip .pet-thought::after {
  bottom: auto;
  top: -13px;
}
</style>
