<!--
  记忆岛屿总览: 一个「记忆空间」= 一座岛 = 一间 3D 房间(点岛进入 sg3d)。
  - 空间按创建先后成岛, 第一座居中放大, 其余左右交替排开(26vw 一档), 越远越小越靠上。
  - 木牌显示岛名 + 岛上记忆条数; 排不下的小岛用左右「‹‹ ››」翻页, 也可以直接拖拽云海。
  - 右上角可按「标题 / 悬停文案 / 岛屿类型」搜索。
  - 岛有齿轮菜单: 编辑悬停内容 / 更换小岛 / 删除小岛(整座岛连同里面的记忆一起删)。
-->
<template>
  <div class="isle-index">
    <!-- 原版手绘背景: 云海 + 左下角小橘(气泡按图内百分比钉回猫头) -->
    <img
      class="isle-bg"
      src="../assets/opt/islandindex.webp"
      srcset="../assets/opt/islandindex-sm.webp 1000w, ../assets/opt/islandindex.webp 1454w"
      sizes="100vw"
      alt=""
      decoding="async"
      draggable="false"
    />

    <!-- 三层动态云: 叠在画上做低透明度视差, 瓦片无缝循环 -->
    <div class="isle-clouds" aria-hidden="true">
      <div class="cloud-layer cloud-far"></div>
      <div class="cloud-layer cloud-mid"></div>
      <div class="cloud-layer cloud-near"></div>
    </div>

    <!-- 云海飞鸟已按需求整层删除（2026-10-27）：8 只雪碧图逐帧 + drop-shadow 是这页的卡顿来源之一。 -->

    <!-- 右上角搜索。★ 2026-10-29: 显示条件从「搜索结果非空」改成「有没有岛」——
         原先绑定 islands.length（过滤后的结果），搜索无匹配时搜索框和清空按钮会一起消失，
         用户只能刷新页面才能改关键词（验证报告 FIND-01，P1）。 -->
    <div v-if="store.islands.length" class="isle-search">
      <input
        v-model="query"
        class="isle-search-input"
        type="text"
        placeholder="搜索标题 / 悬停内容 / 岛屿类型"
        @pointerdown.stop
      />
      <button v-if="query" class="isle-search-clear" type="button" title="清空" @click="query = ''">
        &times;
      </button>
    </div>

    <!-- 左右翻页: 还有没排进画面的小岛时才出现 -->
    <button
      v-if="moreLeft"
      class="isle-more isle-more-l"
      type="button"
      title="左边还有小岛"
      @click="stepPan(-2)"
    >
      ‹‹
    </button>
    <button
      v-if="moreRight"
      class="isle-more isle-more-r"
      type="button"
      title="右边还有小岛"
      @click="stepPan(2)"
    >
      ››
    </button>

    <!-- 小岛时间线（右侧竖排）：最早建的一座在最上，按创建先后往下串。
         点一下先聚焦（云海滑到它、岛身亮起来），再点同一项才进房间 ——
         时间线很长时，单纯想浏览的人不该被一次误点带进别的房间。 -->
    <MemTimeline
      v-if="islands.length > 1"
      class="isle-timeline"
      label="小岛时间线"
      :nodes="isleNodes"
      :active-id="focusId"
      hint="再点一次进入这座岛"
      @pick="pickIsle"
      @hover="onNodeHover"
    />

    <!-- 云海: 整块横向平移, 拖拽/翻页都只改这一个 transform(合成层动画, 不重排) -->
    <div
      class="isle-field"
      :class="{ dragging: dragMoved, 'has-focus': focusId != null }"
      :style="{ transform: `translateX(calc(${pan} * -26vw))` }"
      @pointerdown="onFieldDown"
      @pointermove="onFieldMove"
      @pointerup="onFieldUp"
      @pointercancel="onFieldUp"
      @pointerleave="onFieldUp"
      @click="onFieldClick"
    >
      <div
        v-for="p in placed"
        :key="p.isle.id"
        class="isle-slot"
        :class="{ focused: focusId === isleKey(p.isle) }"
        :style="{
          left: p.slot.x + '%',
          top: p.slot.y + '%',
          '--float-t': p.slot.t + 's',
          '--float-d': p.slot.d + 's',
          '--float-a': p.slot.a + 'px',
          zIndex: p.slot.z,
          '--isle-scale': p.slot.scale,
        }"
        @mouseenter="hoverId = p.isle.id"
        @mouseleave="hoverId = null"
      >
        <!-- 漂浮层: 只做 translateY 动画(旧版动画 margin-top 每帧触发重排, 是卡顿主因) -->
        <div class="isle-floater">
          <!-- 岛身: 从 isle.webp 雪碧图按实测包围盒切出的外观 -->
          <button
            class="isle-art"
            type="button"
            :style="islandSpriteStyle(p.isle.island_art)"
            :title="tipOf(p.isle)"
            @click="enterIsle(p.isle)"
          ></button>

          <!-- 木牌: 常驻显示岛名(如「花信屿」); 右侧小角标显示岛上已有多少条记忆 -->
          <span class="isle-name">
            <span class="isle-name-txt">{{ p.isle.island_name || p.isle.space_name || '记忆空间' }}</span>
            <i v-if="p.isle.item_count" class="isle-cnt">{{ p.isle.item_count }}</i>
          </span>

          <!-- 有 AI 生成视频的小岛: 挂一个影像提示 -->
          <span v-if="p.isle.ai_video" class="isle-video" title="这条记忆有 AI 生成的影像">
            📺 影像
          </span>

          <!-- 用户上传了视频: 岛上放一台小电视, 点开播放/暂停 -->
          <button
            v-if="p.isle.user_video"
            class="isle-tv"
            type="button"
            title="看电视: 播放这条记忆的视频"
            @pointerdown.stop
            @click.stop="openTv(p.isle)"
          >
            <span class="tv-screen"><span class="tv-glint"></span></span>
            <span class="tv-knob tv-knob-l"></span>
            <span class="tv-knob tv-knob-r"></span>
          </button>

          <!-- 用户上传了音频: 岛上放一台可拖动的收音机, 点击播放/暂停(拖动不算点击) -->
          <button
            v-if="p.isle.user_audio"
            class="isle-radio"
            :class="{ playing: radioPlayingId === p.isle.id }"
            :style="radioStyle(p.isle.id)"
            type="button"
            :title="radioPlayingId === p.isle.id ? '点击暂停' : '点击播放'"
            @pointerdown.stop="onRadioDown($event, p.isle)"
            @click.stop.prevent
          >
            <span class="radio-grill"></span>
            <span class="radio-dial"></span>
            <span class="radio-state">{{ radioPlayingId === p.isle.id ? '⏸' : '▶' }}</span>
          </button>

          <!-- 悬停文案气泡 -->
          <Transition name="tip">
            <span v-if="hoverId === p.isle.id && !menuFor" class="isle-tip">
              {{ tipOf(p.isle) }}
            </span>
          </Transition>

          <!-- 定制按钮 + 菜单 -->
          <button
            class="isle-gear"
            :class="{ on: menuFor === p.isle.id }"
            type="button"
            title="定制小岛"
            @click.stop="toggleMenu(p.isle)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm9 3.5a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L16 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.5-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2L12 21h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.5 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
              />
            </svg>
          </button>
          <div v-if="menuFor === p.isle.id" class="isle-menu" @mouseleave="menuFor = null">
            <button class="isle-menu-item" type="button" @click.stop="openEdit(p.isle)">
              编辑悬停内容
            </button>
            <button class="isle-menu-item" type="button" @click.stop="changeArt(p.isle)">
              更换小岛
            </button>
            <button class="isle-menu-item" type="button" @click.stop="shareIsle(p.isle)">
              分享这座岛
            </button>
            <button class="isle-menu-item danger" type="button" @click.stop="askRemove(p.isle)">
              删除小岛
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 分享整座岛：生成公开链接（拿到链接的人免登录可看岛上的记忆） -->
    <div v-if="shareLink" class="isle-modal" @click.self="shareLink = ''">
      <div class="isle-modal-box isle-share-card">
        <p class="isle-share-title">分享链接已生成</p>
        <p class="isle-share-sub">把链接发给朋友，对方不用登录就能看到这座岛上的记忆</p>
        <input
          class="isle-share-input"
          :value="shareLink"
          readonly
          @focus="$event.target.select()"
          @click="$event.target.select()"
        />
        <div class="isle-modal-actions">
          <button class="isle-modal-btn" type="button" @click="shareLink = ''">关闭</button>
          <button class="isle-modal-btn primary" type="button" @click="copyShareLink">
            复制链接
          </button>
        </div>
        <p class="isle-share-tip">随时可在「我的 → 隐私设置 → 分享管理」里取消或删除</p>
      </div>
    </div>

    <!-- 空态。★ 2026-10-29: 拆成「搜索无结果」和「一座岛都没有」两套文案。
         原来两种情形共用"还没有记忆小岛 + 去记忆库写点什么"，搜索没结果时会误导用户
         去新建内容（验证报告 FIND-01）。 -->
    <div v-if="!islandsLoading && !islands.length" class="isle-empty">
      <template v-if="query.trim()">
        <p>没有找到「{{ query.trim() }}」</p>
        <p class="isle-empty-sub">换个关键词试试，或清空搜索看全部小岛</p>
        <button class="isle-empty-btn" type="button" @click="query = ''">清空搜索</button>
      </template>
      <template v-else>
        <p>还没有记忆小岛</p>
        <p class="isle-empty-sub">去「记忆库」写点什么，它就会变成一座小岛</p>
      </template>
    </div>
    <div v-if="islandsLoading" class="isle-empty">小岛正在浮出海面…</div>

    <!-- 木牌下小橘的想法气泡: 3s 一换 -->
    <!-- bg-anchor 复刻背景图 object-fit: cover 的渲染框, 气泡按「图内百分比」钉在猫头, 任何窗口比例都贴合 -->
    <div class="bg-anchor" :style="{ '--bg-r': BG_RATIO }" aria-hidden="true">
      <idle-thought v-if="islands.length" :lines="CAT_THOUGHTS" left="16%" top="67%" :interval="3000" />
    </div>

    <!-- 编辑悬停内容 -->
    <div v-if="editing" class="isle-modal" @click.self="editing = null">
      <div class="isle-modal-box">
        <h3>编辑悬停内容</h3>
        <input
          v-model="editTip"
          class="isle-modal-input"
          type="text"
          maxlength="40"
          placeholder="鼠标悬停在小岛上时显示的话"
          @keyup.enter="saveTip"
        />
        <p class="isle-modal-hint">留空则显示「标题 · 所属空间岛名」</p>
        <div class="isle-modal-actions">
          <button class="isle-modal-btn" type="button" @click="editing = null">取消</button>
          <button class="isle-modal-btn primary" type="button" @click="saveTip">保存</button>
        </div>
      </div>
    </div>

    <!-- 删除小岛确认 -->
    <div v-if="removing" class="isle-modal" @click.self="removing = null">
      <div class="isle-modal-box">
        <h3>删除这座小岛？</h3>
        <p class="isle-modal-text">
        「{{ removing.island_name || removing.space_name || '这座岛' }}」整座岛都会被删除
        <template v-if="removing.item_count">（含岛上 {{ removing.item_count }} 条记忆）</template>，且无法恢复。
      </p>
        <div class="isle-modal-actions">
          <button class="isle-modal-btn" type="button" @click="removing = null">取消</button>
          <button class="isle-modal-btn danger" type="button" @click="confirmRemove">删除</button>
        </div>
      </div>
    </div>


    <!-- 小电视: 播放用户上传的视频(原生控件提供播放/暂停/进度/音量) -->
    <div v-if="tvIsle" class="isle-modal" @click.self="closeTv">
      <div class="tv-modal-box">
        <div class="tv-modal-head">
          <span class="tv-modal-title">📺 {{ tvIsle.title || '记忆影像' }}</span>
          <button class="tv-modal-close" type="button" aria-label="关闭" @click="closeTv">×</button>
        </div>
        <video
          v-if="tvIsle.user_video"
          class="tv-video"
          :src="tvIsle.user_video"
          controls
          autoplay
          playsinline
        ></video>
        <p class="tv-modal-sub">{{ tvIsle.island_name || tvIsle.space_name || '记忆空间' }} · 这条记忆的视频</p>
      </div>
    </div>

    <!-- 轻提示：分享结果只用一句话回执，不弹系统 alert -->
    <transition name="isle-toast">
      <div v-if="toastText" class="isle-toast">{{ toastText }}</div>
    </transition>
  </div>
</template>

<script setup>
// 记忆岛屿总览: 每条记忆一座岛, 最新居中, 左右交替; 支持翻页与拖拽。
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMemoriesStore } from '@/stores/memories'
import { useGuideStore } from '@/stores/guide'
import { cloudApi } from '@/api/cloud'
import IdleThought from './idleThought.vue'
import { shareLinkOf } from '@/sharecode'
import MemTimeline from './memTimeline.vue'
import { islandSpriteStyle, ISLAND_ARTS } from '@/data/islands'

// 背景图原始宽高比(islandindex.webp = 1454x941), 供 bg-anchor 复刻 cover 渲染框
const BG_RATIO = (1454 / 941).toFixed(5)

const router = useRouter()
const store = useMemoriesStore()
const guide = useGuideStore()

onMounted(async () => {
  store.loadIslands().catch(() => {})
  // 新用户引导：人已经站在记忆空间了，说明「去我的记忆空间」这一步做到了。
  // 从左侧导航点过来的话 index.vue 已经推进过一次，这里是兜底（后端只前进，不会打架）。
  await guide.load()
  if (guide.step === 2) guide.advance(3)
})

// 飞鸟数据已随装饰层一起删除。

const query = ref('')
const hoverId = ref(null)
const menuFor = ref(null)
const editing = ref(null)
const editTip = ref('')
const removing = ref(null)

// 岛屿外观 key -> 类型中文名(与 src/data/islands.js 的 ISLAND_ARTS 对应)
const ART_LABEL = {
  blossom: '樱花',
  lagoon: '灯塔',
  forest: '森林',
  snow: '雪屋',
  amber: '秋日',
  dusk: '暮色',
}
// 搜索: 标题 / 悬停文案 / 岛屿类型(中文名或英文 key) / 空间岛名
const islands = computed(() => {
  const all = store.islands || []
  const q = query.value.trim().toLowerCase()
  if (!q) return all
  return all.filter((s) => {
    const art = String(s.island_art || '').toLowerCase()
    return (
      (s.title || '').toLowerCase().includes(q) ||
      (s.island_tip || '').toLowerCase().includes(q) ||
      (s.island_name || '').toLowerCase().includes(q) ||
      art.includes(q) ||
      (ART_LABEL[s.island_art] || '').toLowerCase().includes(q)
    )
  })
})
const islandsLoading = computed(() => store.islandsLoading)

// 0 号(最新)居中, 之后 1 左 / 2 右 / 3 左外 / 4 右外…横向 26vw 一档。
// 大小/高度/层级跟随「当前视口中心」实时变化: 最新的岛在正中间放大,
// 早出现的岛从中间向两侧延伸并缩小抬高; 翻页/拖拽把某座岛滑到中间时, 它也放大到和中间一样大。
const placed = computed(() =>
  islands.value.map((s, i) => {
    // u 是带符号的档位: 0, -1, 1, -2, 2…
    const u = i === 0 ? 0 : (Math.ceil(i / 2) * (i % 2 === 1 ? -1 : 1))
    // v = 相对当前视口中心的档位(随 pan 实时变化), d = 离中心几档
    const d = Math.abs(u - pan.value)
    return {
      isle: s,
      slot: {
        x: 50 + u * 26,
        y: 58 - d * 5.5,
        scale: Math.max(0.45, 1 - d * 0.14),
        // 越远越小: 用 scale 而不是 width, 动画走合成层
        z: 100 - Math.round(d * 2),
        t: 4.5 + (i % 5) * 0.6,
        d: -(i % 7) * 0.5,
        a: 10 + (i % 4) * 3,
      },
    }
  })
)

// 平移档位: 0 = 最新居中。左边的岛档位是负数(-1,-2,…), pan 取负值才能把它们滑到中间 ——
// 之前把 pan 钳在 [0,∞), 左边的岛永远翻不到、「‹‹」标记也永远不出现。
const pan = ref(0)
const minPan = computed(() => -Math.floor(islands.value.length / 2))
const maxPan = computed(() => Math.floor((islands.value.length - 1) / 2))
const moreLeft = computed(() => pan.value > minPan.value)
const moreRight = computed(() => pan.value < maxPan.value)
function stepPan(delta) {
  pan.value = Math.min(maxPan.value, Math.max(minPan.value, pan.value + delta))
}

// ---------- 拖拽云海 ----------
let dragging = false
let dragStartX = 0
let dragStartPan = 0
const dragMoved = ref(false)
function onFieldDown(e) {
  if (e.target.closest('input, textarea, .isle-menu, .modal, .isle-search, .isle-more, button')) {
    return
  }
  dragging = true
  dragMoved.value = false
  dragStartX = e.clientX
  dragStartPan = pan.value
}
function onFieldMove(e) {
  if (!dragging) return
  const dx = e.clientX - dragStartX
  if (Math.abs(dx) > 6) dragMoved.value = true
  const vw = window.innerWidth / 100
  const next = dragStartPan - dx / (vw * 0.26)
  pan.value = Math.min(maxPan.value, Math.max(minPan.value, next))
}
function onFieldUp() {
  if (!dragging) return
  dragging = false
  // 松手后吸附到整数档位, 避免停在两座岛中间
  pan.value = Math.round(pan.value)
  // 让本次点击的 mouseup 不触发进岛(拖拽误点保护)
  setTimeout(() => (dragMoved.value = false), 0)
}

// 岛身点击: 进入「我的记忆空间」里这座岛对应的 3D 房间(sg3d 承载页)。
// 一座岛 = 一个记忆空间 = 一间 3D 房间, 房间里的家具就是这座岛上已有的记忆。
function enterIsle(isle) {
  if (dragMoved.value) return
  const spaceId = isle.space_id || isle.id
  if (!spaceId) return
  router.push({ name: 'room3d', params: { spaceId } })
}

// ---- 小岛时间线（右侧）----
// 一座岛 = 一个记忆空间，服务端按创建时间倒序给；时间线要「最早的在最上」，
// 所以这里翻过来排。日期用本地时区格式化 —— 不能走 toISOString，
// 那是 UTC，国内早上 8 点前建的岛会显示成前一天。
function isleKey(s) {
  return s?.space_id || s?.id || null
}
function fmtDay(ts) {
  const ms = Number(ts)
  if (!ms) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
}
const focusId = ref(null)
const isleNodes = computed(() =>
  [...islands.value]
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0) || (isleKey(a) || 0) - (isleKey(b) || 0))
    .map((s) => ({
      id: isleKey(s),
      title: s.island_name || s.space_name || '记忆空间',
      date: fmtDay(s.created_at),
    }))
)
// 点节点：第一次只聚焦，第二次（点同一项）才进岛。
// 聚焦时把云海滑到这座岛所在的档位：档位公式与 placed 里的 u 保持一致
// （0 号居中，之后 1 右 / 2 左 / 3 右外 / 4 左外 …），所以 pan 直接设成 u 就等于把它挪到屏幕中间。
function pickIsle(id) {
  const idx = islands.value.findIndex((s) => isleKey(s) === id)
  if (idx < 0) return
  if (focusId.value === id) {
    enterIsle(islands.value[idx])
    return
  }
  focusId.value = id
  const u = idx === 0 ? 0 : Math.ceil(idx / 2) * (idx % 2 === 1 ? -1 : 1)
  pan.value = Math.min(maxPan.value, Math.max(minPan.value, u))
}
// 悬停节点 = 悬停对应的岛：复用 hoverId，岛身发光 + 悬停气泡一起触发
function onNodeHover(id) {
  hoverId.value = id || null
}
// 点云海空白处取消聚焦（只认落在容器本身上的点击，
// 岛身/齿轮/电视这些子元素的点击不参与，避免点菜单时把选中状态清掉）
function onFieldClick(e) {
  if (dragMoved.value) return
  if (e.target !== e.currentTarget) return
  focusId.value = null
}
// 搜索把某座岛过滤掉时，聚焦状态要跟着清掉，否则时间线上会留着一个不存在的选中项
watch(islands, (list) => {
  if (focusId.value == null) return
  if (!list.some((s) => isleKey(s) === focusId.value)) focusId.value = null
})

// ---- 小电视: 用户上传的视频 ----
const tvIsle = ref(null)
function openTv(isle) {
  tvIsle.value = isle
}
function closeTv() {
  tvIsle.value = null
}

// ---- 收音机: 用户上传的音频; 可拖动(拖动超过 6px 算拖, 不触发播放), 点击播放/暂停 ----
const radioOffsets = reactive({}) // 岛 id -> {x, y} 拖动位移
let radioDragState = null
const radioPlayingId = ref(null)
let radioAudioEl = null
function radioStyle(id) {
  const o = radioOffsets[id]
  return o ? { transform: 'translate(' + o.x + 'px, ' + o.y + 'px)' } : {}
}
function onRadioDown(e, isle) {
  const o = radioOffsets[isle.id] || { x: 0, y: 0 }
  radioDragState = { id: isle.id, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, moved: false }
  window.addEventListener('pointermove', onRadioMove)
  window.addEventListener('pointerup', onRadioUp)
}
function onRadioMove(e) {
  if (!radioDragState) return
  const dx = e.clientX - radioDragState.sx
  const dy = e.clientY - radioDragState.sy
  if (Math.abs(dx) > 6 || Math.abs(dy) > 6) radioDragState.moved = true
  radioOffsets[radioDragState.id] = { x: radioDragState.ox + dx, y: radioDragState.oy + dy }
}
function onRadioUp() {
  const st = radioDragState
  radioDragState = null
  window.removeEventListener('pointermove', onRadioMove)
  window.removeEventListener('pointerup', onRadioUp)
  if (st && !st.moved) toggleRadio(st.id)
}
function toggleRadio(id) {
  const isle = islands.value.find((x) => x.id === id)
  if (!isle || !isle.user_audio) return
  // 同一时间只放一台收音机: 换台时先停掉上一台
  if (radioPlayingId.value === id) {
    radioAudioEl && radioAudioEl.pause()
    radioPlayingId.value = null
    return
  }
  if (!radioAudioEl) {
    radioAudioEl = new Audio()
    radioAudioEl.addEventListener('ended', () => {
      radioPlayingId.value = null
    })
  }
  radioAudioEl.pause()
  radioAudioEl.src = isle.user_audio
  radioAudioEl.play().catch(() => {})
  radioPlayingId.value = id
}
onBeforeUnmount(() => {
  if (radioAudioEl) {
    radioAudioEl.pause()
    radioAudioEl = null
  }
  radioPlayingId.value = null
})

function tipOf(isle) {
  if (isle.island_tip) return isle.island_tip
  const name = isle.island_name || isle.space_name || '记忆空间'
  const n = isle.item_count || 0
  return n ? `${name} · ${n} 条记忆` : `${name} · 还是空岛，去记一条吧`
}

function toggleMenu(isle) {
  menuFor.value = menuFor.value === isle.id ? null : isle.id
}

// ---- 分享整座岛（"切片"）----
// 与「记忆库 → 某条记忆 → 生成分享链接」是同一套后端（share/create），
// 区别只是这里的 space_id 换成岛 id，公开页会把岛上所有记忆一起列出来。
const shareLink = ref('')
const shareBusy = ref(false)

// 页面内轻提示（不用系统 alert：和站点风格不搭，手机上还容易被拦）
const toastText = ref('')
let toastTimer = 0
function toast(msg) {
  toastText.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastText.value = ''), 2400)
}
onBeforeUnmount(() => clearTimeout(toastTimer))

async function shareIsle(isle) {
  menuFor.value = null
  if (!isle?.id || shareBusy.value) return
  shareBusy.value = true
  try {
    const name = isle.island_name || isle.space_name || '记忆空间'
    let rec = null
    try {
      const list = await cloudApi.listShares()
      rec = (list || []).find((s) => s.space_id === isle.id && s.status === 'valid') || null
    } catch {
      /* 查不到就新建 */
    }
    if (!rec) {
      rec = await cloudApi.createShare({
        space_id: isle.id,
        name,
        meta: isle.item_count ? `${isle.item_count} 条记忆` : '',
      })
    }
    if (!rec?.token) throw new Error('生成失败，请稍后再试')
    shareLink.value = shareLinkOf(rec.token)
    try {
      await navigator.clipboard.writeText(shareLink.value)
      toast('链接已复制，发给朋友就能打开')
    } catch {
      toast('链接已生成，点弹层里的按钮复制')
    }
  } catch (e) {
    toast(e?.message || '生成分享链接失败')
  } finally {
    shareBusy.value = false
  }
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    toast('链接已复制')
  } catch {
    toast('复制失败，请点输入框全选手动复制')
  }
}

function openEdit(isle) {
  menuFor.value = null
  editing.value = isle
  editTip.value = isle.island_tip || ''
}
async function saveTip() {
  if (!editing.value) return
  try {
    await store.updateIsland({ id: editing.value.id, island_tip: editTip.value.trim() })
  } catch {
    /* store 里已 toast */
  }
  editing.value = null
}

async function changeArt(isle) {
  menuFor.value = null
  const cur = ISLAND_ARTS.indexOf(isle.island_art)
  const next = ISLAND_ARTS[(cur + 1) % ISLAND_ARTS.length]
  try {
    await store.updateIsland({ id: isle.id, island_art: next })
  } catch {
    /* 同上 */
  }
}

function askRemove(isle) {
  menuFor.value = null
  removing.value = isle
}
async function confirmRemove() {
  if (!removing.value) return
  const id = removing.value.id
  removing.value = null
  try {
    await store.removeIsland(id)
  } catch {
    /* 同上 */
  }
}

// 搜索后重置到中间, 免得停在不存在的档位
watch(query, () => (pan.value = 0))

const CAT_THOUGHTS = [
  '每座小岛都藏着一天～',
  '要不要去岛上坐坐？',
  '海风把记忆吹得好香…',
  '喵？你又来啦',
  '那座岛的夕阳最好看',
  '慢慢看，别着急～',
]
</script>

<style scoped>
.isle-index {
  position: absolute;
  inset: 0;
  overflow: hidden;
  user-select: none;
}

/* 原版手绘背景: cover 铺满, 气泡锚点层与它共用同一个渲染框 */
.isle-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

/* ---------- 三层动态云 ---------- */
.isle-clouds {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
.cloud-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 200%;
  height: 100%;
  background-repeat: repeat-x;
  will-change: transform;
  opacity: 0.4;
  mix-blend-mode: screen;
  pointer-events: none;
}
/* 用重复的 radial-gradient 拼出软边云团, 左右无缝 */
.cloud-far {
  background-image: radial-gradient(
    circle at 20% 30%,
    rgba(255, 255, 255, 0.5) 0 60px,
    transparent 62px
  );
  background-size: 520px 100%;
  opacity: 0.45;
  animation: cloud-drift 160s linear infinite;
}
.cloud-mid {
  background-image: radial-gradient(
    circle at 60% 22%,
    rgba(255, 255, 255, 0.6) 0 80px,
    transparent 82px
  );
  background-size: 680px 100%;
  opacity: 0.4;
  animation: cloud-drift 120s linear infinite;
}
.cloud-near {
  background-image: radial-gradient(
    circle at 40% 40%,
    rgba(255, 255, 255, 0.72) 0 100px,
    transparent 102px
  );
  background-size: 860px 100%;
  opacity: 0.32;
  animation: cloud-drift 80s linear infinite;
}
@keyframes cloud-drift {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

/* ---------- 搜索 ---------- */
.isle-search {
  position: absolute;
  right: 80px;
  top: 18px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 6px;
}
.isle-search-input {
  width: 200px;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.82);
  color: #4a3a28;
  font-size: 15.5px;
  outline: none;
  box-shadow: 0 4px 12px rgba(60, 40, 20, 0.16);
}
.isle-search-input:focus {
  border-color: #ffca6b;
  background: #fff;
}
.isle-search-clear {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 0;
  background: rgba(120, 100, 80, 0.5);
  color: #fff;
  font-size: 16.5px;
  line-height: 1;
  cursor: pointer;
}

/* ---------- 翻页省略号 ---------- */
/* 翻页按钮：原来是白底棕字，压在奶油色云海上几乎看不出来是"能点的东西"。
   改成时间线那套橙金色 rgb(251,176,67)：跟高亮、连线是同一组颜色，
   用户扫一眼就知道这个圆点和时间线上那个亮着的是同一个系统。 */
.isle-more {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 55;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 0;
  background: rgb(251, 176, 67);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(214, 138, 40, 0.42), 0 0 22px rgba(251, 176, 67, 0.34);
  transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.isle-more:hover {
  background: rgb(253, 190, 92);
  box-shadow: 0 8px 22px rgba(214, 138, 40, 0.5), 0 0 28px rgba(251, 176, 67, 0.46);
}
.isle-more:active {
  transform: translateY(-50%) scale(0.94);
}
.isle-more-l {
  left: 18px;
}
.isle-more-r {
  right: 18px;
}

/* ---------- 云海 ---------- */
.isle-field {
  position: absolute;
  inset: 0;
  z-index: 20;
  cursor: grab;
  will-change: transform;
  transition: transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.isle-field.dragging {
  cursor: grabbing;
  transition: none;
}

.isle-slot {
  position: absolute;
  /* 档位间距是 26vw, 滑到中心时 scale=1: 槽宽 x 最大缩放必须压得住间距,
     否则相邻岛会互相压住(右边那座盖住左边的齿轮和木牌)。vmin 兜上限防窄窗糊脸。 */
  width: min(27vw, 34vmin);
  transform: translate(-50%, -50%) scale(var(--isle-scale, 1));
  /* 大小/高度随滑动到中心平滑放大缩小 */
  transition: transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1), top 0.45s cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 0.28s ease;
}
/* 手机竖屏: 岛太小看不清, 放大到接近半屏宽 */
@media (max-width: 760px) {
  .isle-slot {
    width: min(52vw, 46vmin);
  }
}

/* 矮屏(横放手机/笔记本): 岛别顶到上下边缘 */
@media (max-height: 620px) {
  .isle-slot {
    width: min(30vw, 30vmin);
  }
}

.isle-slot {
  --isle-scale: 1;
}

/* 漂浮层: 只有 translateY 动画(合成层), 周期/延迟/幅度错开 */
.isle-floater {
  position: relative;
  animation: isle-float var(--float-t, 5s) ease-in-out var(--float-d, 0s) infinite;
  will-change: transform;
}
@keyframes isle-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(calc(var(--float-a, 12px) * -1));
  }
}

.isle-art {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border: 0;
  padding: 0;
  cursor: pointer;
  /* button 的 UA 默认背景是 ButtonFace(白), 不清掉雪碧图的透明部分就会露出白色方块 */
  background-color: transparent;
  background-repeat: no-repeat;
  /* 阴影只做静态一层: 动画 filter 每帧重算大图模糊, 非常卡 */
  filter: drop-shadow(0 18px 22px rgba(90, 80, 110, 0.35));
  transition: transform 0.3s ease;
}
.isle-slot:hover .isle-art {
  transform: scale(1.07) translateY(-4px);
}

/* 岛名木牌: 常驻显示岛名 + 「岛上有几条记忆」小角标 */
.isle-name {
  position: absolute;
  left: 50%;
  bottom: -9%;
  transform: translateX(-50%);
  max-width: 96%;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 16px;
  border-radius: 10px;
  background: linear-gradient(180deg, #a9825a, #8a6643);
  border: 2px solid rgba(255, 244, 222, 0.5);
  color: #fff6e3;
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 6px 14px rgba(60, 40, 20, 0.28);
}

/* 名字过长时在木牌内省略, 不撑破木牌 */
.isle-name-txt {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.isle-cnt {
  flex: none;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #ffb27a;
  color: #4a3320;
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

/* 有视频的小岛: 岛顶挂一个影像提示 */
.isle-video {
  position: absolute;
  left: 50%;
  top: -4%;
  transform: translateX(-50%);
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 13px;
  color: #fff3dc;
  background: rgba(62, 42, 94, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 4px 10px rgba(30, 20, 50, 0.35);
  white-space: nowrap;
  pointer-events: none;
}

/* 悬停文案气泡 */
.isle-tip {
  position: absolute;
  left: 50%;
  top: -14%;
  transform: translateX(-50%);
  max-width: 220px;
  padding: 6px 12px;
  border-radius: 12px;
  background: rgba(52, 40, 30, 0.86);
  color: #fff3dd;
  font-size: 14.5px;
  line-height: 1.5;
  text-align: center;
  white-space: normal;
  pointer-events: none;
}
.tip-enter-active,
.tip-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.tip-enter-from,
.tip-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}

/* 齿轮 */
.isle-gear {
  position: absolute;
  right: -6px;
  top: 6px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.86);
  color: #6b5540;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.isle-gear svg {
  width: 16px;
  height: 16px;
}
.isle-slot:hover .isle-gear,
.isle-gear.on {
  opacity: 1;
}
.isle-gear:hover {
  background: #fff;
}

.isle-menu {
  position: absolute;
  right: -4px;
  top: 38px;
  z-index: 30;
  min-width: 128px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 24px rgba(60, 40, 20, 0.24);
}
.isle-menu-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #4a3a28;
  font-size: 15.5px;
  text-align: left;
  cursor: pointer;
}
.isle-menu-item:hover {
  background: #f3e7d6;
}
.isle-menu-item.danger {
  color: #c0392b;
}
.isle-menu-item.danger:hover {
  background: #fdecea;
}

/* ---------- 空态 ---------- */
.isle-empty {
  position: absolute;
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%);
  z-index: 30;
  text-align: center;
  color: #6b5540;
  font-size: 16.5px;
}
.isle-empty-sub {
  margin-top: 6px;
  font-size: 15.5px;
  color: #8a7a6d;
}
/* 「搜索无结果」时才出现的就地恢复入口: 不用刷新页面也能回到全部小岛 */
.isle-empty-btn {
  margin-top: 14px;
  padding: 8px 20px;
  border: 1px solid rgba(160, 128, 99, 0.4);
  border-radius: 999px;
  background: rgba(255, 252, 246, 0.92);
  color: #8a6a4a;
  font-size: 14.5px;
  letter-spacing: 1px;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}
.isle-empty-btn:hover {
  background: #f3e6d4;
  color: #6b5540;
}

/* 猫气泡锚点: 复刻背景图 object-fit: cover 的渲染框 */
.bg-anchor {
  position: absolute;
  left: 50%;
  top: 50%;
  width: max(100vw, calc(100vh * var(--bg-r, 1.5454)));
  height: max(100vh, calc(100vw / var(--bg-r, 1.5454)));
  transform: translate(-50%, -50%);
  z-index: 60;
  pointer-events: none;
}

/* ---------- 弹窗 ---------- */
.isle-modal {
  position: absolute;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 20, 12, 0.42);
}

/* ---------- 分享弹层 + 轻提示 ---------- */
.isle-share-card {
  width: min(90%, 400px);
}
.isle-share-title {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
  color: #4a3a28;
}
.isle-share-sub {
  margin: 0 0 12px;
  font-size: 13.5px;
  line-height: 1.6;
  color: #8a7a6d;
}
.isle-share-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #e2d3bd;
  border-radius: 10px;
  background: #fff;
  font-size: 13px;
  color: #6b5540;
  outline: none;
}
.isle-share-input:focus {
  border-color: #ffca6b;
}
.isle-share-tip {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #a2907c;
}
.isle-toast {
  position: absolute;
  left: 50%;
  bottom: 9%;
  z-index: 130;
  transform: translateX(-50%);
  padding: 9px 18px;
  border-radius: 999px;
  background: rgba(60, 44, 28, 0.86);
  color: #fff8ef;
  font-size: 13.5px;
  white-space: nowrap;
  box-shadow: 0 10px 26px rgba(40, 26, 12, 0.3);
}
.isle-toast-enter-active,
.isle-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.isle-toast-enter-from,
.isle-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
.isle-modal-box {
  width: min(90%, 340px);
  padding: 20px;
  border-radius: 16px;
  background: #fffaf1;
  box-shadow: 0 18px 40px rgba(40, 26, 12, 0.32);
}
.isle-modal-box h3 {
  margin: 0 0 12px;
  font-size: 17.5px;
  color: #4a3a28;
}
.isle-modal-input {
  width: 100%;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid #e2d3bd;
  background: #fff;
  font-size: 17px;
  outline: none;
}
.isle-modal-input:focus {
  border-color: #ffca6b;
}
.isle-modal-hint {
  margin: 8px 0 0;
  font-size: 14.5px;
  color: #8a7a6d;
}
.isle-modal-text {
  margin: 0;
  font-size: 17px;
  color: #6b5540;
  line-height: 1.6;
}
.isle-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.isle-modal-btn {
  padding: 7px 16px;
  border-radius: 10px;
  border: 1px solid #e2d3bd;
  background: #fff;
  color: #6b5540;
  font-size: 15.5px;
  cursor: pointer;
}
.isle-modal-btn.primary {
  background: #ffca6b;
  border-color: #ffca6b;
  color: #4a3a28;
}
.isle-modal-btn.danger {
  background: #c0392b;
  border-color: #c0392b;
  color: #fff;
}

/* ---- 岛上的小电视: 用户上传了视频才出现 ---- */
.isle-tv {
  position: absolute;
  left: 50%;
  bottom: -6px;
  transform: translateX(-160%);
  width: 46px;
  height: 34px;
  padding: 0;
  border: 2px solid #6b4f3a;
  border-radius: 6px;
  background: #f7ecd9;
  box-shadow: 0 3px 8px rgba(60, 45, 30, 0.35);
  cursor: pointer;
  z-index: 6;
  transition: transform 0.15s ease;
}
.isle-tv:hover {
  transform: translateX(-160%) scale(1.12);
}
.tv-screen {
  position: absolute;
  left: 3px;
  top: 3px;
  right: 17px;
  bottom: 3px;
  background: #22333d;
  border-radius: 3px;
  overflow: hidden;
}
.tv-glint {
  position: absolute;
  left: 14%;
  top: 16%;
  width: 34%;
  height: 24%;
  background: rgba(255, 255, 255, 0.35);
  border-radius: 50%;
}
.tv-knob {
  position: absolute;
  right: 3.5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c9a87c;
}
.tv-knob-l { top: 6px; }
.tv-knob-r { top: 18px; }

/* 电视弹窗 */
.tv-modal-box {
  width: min(560px, 90%);
  padding: 14px 16px;
  border-radius: 18px;
  background: #fffdf9;
  box-shadow: 0 24px 60px rgba(90, 70, 40, 0.3);
}
.tv-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 16px;
  font-weight: 700;
  color: #4a3f37;
}
.tv-modal-close {
  border: none;
  background: transparent;
  color: #a89c90;
  font-size: 20px;
  cursor: pointer;
}
.tv-video {
  display: block;
  width: 100%;
  max-height: 56vh;
  border-radius: 10px;
  background: #000;
}
.tv-modal-sub {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: #b3a79c;
  text-align: center;
}

/* ---- 可拖动的收音机: 用户上传了音频才出现 ---- */
.isle-radio {
  position: absolute;
  left: 50%;
  bottom: -8px;
  transform: translateX(60%);
  width: 42px;
  height: 27px;
  padding: 0;
  border: 2px solid #6b4f3a;
  border-radius: 5px;
  background: linear-gradient(160deg, #e8b98a, #d89a6a);
  box-shadow: 0 3px 8px rgba(60, 45, 30, 0.35);
  cursor: grab;
  touch-action: none;
  z-index: 7;
}
.isle-radio:active {
  cursor: grabbing;
}
.isle-radio.playing {
  box-shadow: 0 0 0 2px rgba(255, 190, 120, 0.65), 0 3px 10px rgba(60, 45, 30, 0.4);
}
.radio-grill {
  position: absolute;
  left: 3px;
  top: 3px;
  bottom: 3px;
  width: 18px;
  border-radius: 3px;
  background: repeating-linear-gradient(0deg, #6b4f3a 0 1.5px, transparent 1.5px 4px);
  opacity: 0.55;
}
.radio-dial {
  position: absolute;
  right: 4px;
  top: 5px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #fff3dc;
  border: 1.5px solid #6b4f3a;
}
.radio-state {
  position: absolute;
  right: 3px;
  bottom: 1px;
  font-size: 10px;
  line-height: 1.2;
  color: #4a3320;
}

/* ---------- 小岛时间线（右侧竖排） ----------
   right 留 70px：右边竖着的 ‹‹ ›› 翻页按钮占 18~60px，时间线让开它，
   两者只在横向上错开，纵向就不用互相躲了。
   高度上限 52vh：再高会顶到右上角的搜索框。 */
.isle-timeline {
  position: absolute;
  right: 70px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 26;
  max-height: 52vh;
}
.isle-timeline :deep(.mtl-scroll) {
  max-height: calc(52vh - 46px);
}

/* 时间线聚焦的那座岛：底座亮一圈暖光 + 岛身描边发光 + 木牌描边，
   三层一起上才看得出"是被时间线选中的那一座"（只靠 drop-shadow 在浅色云海上几乎看不见）。 */
/* 选中某座岛时，其余几座退到 .66：白光在奶油色云海上本来就不显眼，
   靠"其余的暗下去"来做对比，比一味加亮更有效，也不会把画面烧白。 */
.isle-field.has-focus .isle-slot:not(.focused) {
  opacity: 0.66;
}
.isle-slot.focused::before {
  content: '';
  position: absolute;
  inset: -6% -8% 4% -8%;
  border-radius: 50%;
  /* 用白光而不是暖色光：这页的背景本身就是暖奶油色，
     暖色高亮压上去跟背景同色，等于没做。白光才会"亮出来"。 */
  background: radial-gradient(
    closest-side,
    rgba(255, 255, 255, 0.62) 0%,
    rgba(255, 242, 208, 0.24) 52%,
    rgba(255, 242, 208, 0) 74%
  );
  z-index: -1;
  pointer-events: none;
  animation: isle-focus-pulse 2.6s ease-in-out infinite;
}
@keyframes isle-focus-pulse {
  0%,
  100% {
    opacity: 0.72;
    transform: scale(0.98);
  }
  50% {
    opacity: 1;
    transform: scale(1.03);
  }
}
/* 聚焦那座岛打的是橙金色的光（rgb(251,176,67)），跟时间线的高亮同一套颜色。
   原来是纯白光 —— 这片背景本身就是奶油色云海，白光等于没做；
   橙色饱和度高得多，在暖色底上反而更"跳"，远处那座岛也能一眼认出来。 */
.isle-slot.focused .isle-art {
  filter: drop-shadow(0 0 9px rgba(255, 232, 190, 0.98)) drop-shadow(0 0 26px rgba(251, 176, 67, 0.92))
    drop-shadow(0 0 52px rgba(251, 176, 67, 0.55)) drop-shadow(0 18px 26px rgba(90, 80, 110, 0.34));
  /* 1.14 而不是 1.08：悬停本来就有 1.07 的放大，
     选中和悬停拉不开差距的话，用户分不清"鼠标扫过"和"被时间线选中"。 */
  transform: scale(1.14) translateY(-10px);
}
.isle-slot.focused .isle-name {
  box-shadow: 0 6px 18px rgba(60, 40, 20, 0.34), 0 0 0 2px rgba(255, 224, 176, 0.92);
}

/* ============================================================================
   手机版式（≤767.98）
   ★ 桌面是「可左右拖拽的云海 + 按 26vw 档位绝对定位的岛」：竖屏 390px 里，
     26vw=101px 的档距放不下 52vw 的岛，岛会互相压住，右侧的岛永远要用 ‹‹ ›› 翻页。
     这里改成**竖列表**：一座岛一张，从上往下排，滚动浏览（点岛照样进 3D 房间）。
   ★ 岛身尺寸由 .isle-slot 的 width 控制（.isle-art 是 width:100% + aspect-ratio:1），
     所以只改宽度，雪碧图裁切、木牌、齿轮、电视/收音机全部等比跟着走，不用重排绝对定位。
   ============================================================================ */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  .isle-index {
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }

  /* 手机版本身就是一个从上往下的竖列表，右侧再挂一条竖向时间线等于同一件事做两遍，
     还把本来就窄的屏再切掉 100 多像素 —— 直接收掉。 */
  .isle-timeline {
    display: none;
  }

  /* 背景改成固定层：列表滚动时云海不动，否则往下滑就是一片空白 */
  .isle-bg {
    display: none;
  }

  .isle-index::before {
    content: '';
    position: fixed;
    left: 56px; /* 让开左侧图标栏 */
    right: 0;
    top: 0;
    bottom: 0;
    background: url('../assets/opt/islandindex.webp') center / cover no-repeat;
    pointer-events: none;
  }

  .isle-clouds {
    position: fixed;
    left: 56px;
    right: 0;
    top: 0;
    bottom: 0;
  }

  /* 搜索：整宽、38px（比首版的 44px 收一档，一屏能多露半座岛） */
  .isle-search {
    /* relative 而不是 static：z-index 只对定位元素生效，
       否则会被下面 z-index:20 的 .isle-field 盖住（搜索框"消失"就是这么来的） */
    position: relative;
    z-index: 60;
    /* 基础规则是 absolute + right:80px; top:18px。改成 relative 后这些偏移量仍然生效，
       会把整条搜索框往左推 80px（实测输入框 x 变成 -12，文字被左边栏切掉）。
       这里必须把 left/top/right 一起复位。 */
    left: auto;
    right: auto;
    top: auto;
    margin: 10px 10px 0;
  }

  .isle-search-input {
    width: 100%;
    height: 38px;
    /* ★ 必须 16px：iOS 上小于 16px 的输入框聚焦时会被自动放大整页 */
    font-size: 16px;
  }

  .isle-search-clear {
    position: absolute;
    right: 6px;
    top: 50%;
    width: 26px;
    height: 26px;
    margin: 0;
    transform: translateY(-50%);
  }

  /* 列表模式不需要左右翻页 */
  .isle-more {
    display: none;
  }

  /* ★ 一行两座岛（2026-11-11 用户要求）：
     原来是 flex 竖排、一座岛 62vw，一屏只能看两座半，翻列表要滑半天。
     改成 2 列 grid，岛宽交给列宽（≈ (390-56-16-6)/2 ≈ 156px），
     所有装饰（雪碧图裁切、木牌、齿轮、电视/收音机）都是按 .isle-slot 宽度等比缩放的，
     这里只改容器，不用动绝对定位。 */
  .isle-field {
    position: static;
    /* 内联样式给了 translateX(pan)，列表模式必须按掉 */
    transform: none !important;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    justify-items: center;
    align-items: start;
    /* 行距 26px：木牌挂在岛下方 -9%，得留出它的高度，否则下行岛会压住上行木牌 */
    gap: 26px 6px;
    width: auto;
    height: auto;
    padding: 14px 8px calc(28px + env(safe-area-inset-bottom));
    will-change: auto;
    cursor: default;
    touch-action: pan-y;
  }

  .isle-slot {
    position: static !important;
    width: 100% !important;
    max-width: 178px;
    transform: none !important;
    transition: none;
  }

  /* 一排岛同时在飘，读起来晕，也白占合成层 */
  .isle-floater {
    animation: none;
  }

  /* 触摸设备没有 hover，齿轮要一直可见。2 列网格里岛只有 ~156px 宽，
     40px 的齿轮会压掉四分之一座岛，收到 30px 并贴回岛内。 */
  .isle-gear {
    opacity: 1;
    width: 30px;
    height: 30px;
    right: -2px;
    top: -2px;
  }

  .isle-gear svg {
    width: 16px;
    height: 16px;
  }

  .isle-menu {
    min-width: 132px;
  }

  .isle-menu-item {
    min-height: 38px;
    font-size: 13.5px;
  }

  /* 木牌：岛宽只剩 ~156px，17px 的字必然两行撑破，收到 11.5px + 紧凑内边距 */
  .isle-name {
    max-width: 100%;
    gap: 4px;
    padding: 3px 9px;
    font-size: 11.5px;
    border-width: 1.5px;
    border-radius: 8px;
    box-shadow: 0 3px 8px rgba(60, 40, 20, 0.26);
  }

  /* 弹窗（编辑悬停内容 / 更换小岛 / 分享 / 删除确认）统一底部抽屉 */
  .isle-modal {
    align-items: flex-end;
  }

  .isle-modal-box {
    width: 100%;
    max-width: 100%;
    max-height: 88dvh;
    overflow: auto;
    border-radius: 18px 18px 0 0;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
  }

  .isle-modal-btn {
    min-height: 44px;
  }
}


</style>
