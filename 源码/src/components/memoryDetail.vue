<template>
  <!-- 回忆详情子组件: 完整内容 + 评论区 -->
  <div class="md-mask" @click.self="$emit('close')">
    <div class="md-card" :style="mdDragStyle" role="dialog" aria-modal="true" aria-label="记忆详情">
      <div class="md-head" @pointerdown="onMdDragStart">
        <span class="md-ava" :style="avaStyle(post.name)">
          <img class="md-ava-img" :src="avatarOf(post)" alt="" />
        </span>
        <div class="md-meta">
          <b>{{ post.name }}</b>
          <!-- 有来源才写"来自"，否则会留下一个空荡荡的"来自 " -->
          <span>{{ post.time }}<template v-if="post.from"> · 来自 {{ post.from }}</template></span>
        </div>
        <button ref="closeBtn" class="md-close" type="button" aria-label="关闭" @click="$emit('close')">
          ×
        </button>
      </div>

      <div class="md-body">
        <h3 v-if="post.title" class="md-title">{{ post.title }}</h3>
        <template v-if="post.title && post.text">
          <div class="md-divider"></div>
        </template>
        <p v-if="post.text" class="md-text">{{ post.text }}</p>
        <!-- 图片(可多张, 上下排布随 md-body 滚动) -> 分割线 -> 视频 -> 分割线 -> 音频 -->
        <template v-if="imgList.length">
          <div class="md-divider"></div>
          <img v-for="(u, i) in imgList" :key="i" class="md-photo md-media" :src="u" alt="" loading="lazy" decoding="async" />
        </template>
        <img v-else-if="post.img" class="md-photo grad" :class="post.img" alt="" />
        <template v-if="post.videoUrl">
          <div class="md-divider"></div>
          <video class="md-video" :src="post.videoUrl" controls playsinline></video>
        </template>
        <template v-if="post.audioUrl">
          <div class="md-divider"></div>
          <audio class="md-audio" :src="post.audioUrl" controls></audio>
        </template>
        <div v-if="post.tags && post.tags.length" class="md-tags">
          <span v-for="t in post.tags" :key="t" class="md-tag"># {{ t }}</span>
        </div>
        <div class="md-stats">{{ post.likes != null ? '♥ ' + post.likes + ' · ' : '' }}💬 {{ post.comments }}</div>

        <!-- 评论: 头像 + 昵称 + 内容 -->
        <div class="md-comments">
          <b class="mc-title">评论 {{ comments.length }}</b>
          <div v-for="(c, i) in comments" :key="i" class="mc-row">
            <span class="md-ava sm" :style="avaStyle(c.name)">
              <img class="md-ava-img" :src="avatarOf(c)" alt="" />
            </span>
            <div class="mc-meta">
              <span class="mc-line">
                <b>{{ c.name }}</b>
                <em>{{ c.time }}</em>
              </span>
              <p>{{ c.text }}</p>
            </div>
          </div>
          <p v-if="!comments.length" class="mc-empty">还没有评论, 来说点什么吧</p>
        </div>
      </div>

      <div class="md-foot">
        <input v-model="input" type="text" placeholder="写一条温柔的评论..." @keyup.enter="send" />
        <button type="button" :disabled="!input.trim()" @click="send">发送</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// 回忆详情子组件: 展示该条记忆的完整内容与评论区
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
// ★ 2026-10-27 用户要求：广场详情里作者这里要显示头像（原来是"名字首字 + 渐变块"）
import { avatarOf } from '@/data/avatar'

const props = defineProps({
  post: { type: Object, required: true },
  comments: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'add-comment'])

const input = ref('')

// ★ 2026-10-29 键盘可访问性（对应验证报告 FIX02）：
//   以前弹层没有 dialog 语义、Esc 关不掉、焦点还停在三维画布/原卡片上。
//   现在打开时把焦点放到关闭按钮，Esc 关闭，关闭后把焦点还给打开它的入口。
const closeBtn = ref(null)
let lastActive = null

function onKeydown(e) {
  if (e.key !== 'Escape' && e.key !== 'Esc') return
  // 原生音视频控件自己会吃掉 Esc（退出全屏/停止播放），这时不应该顺手把弹层关掉
  const t = e.target
  if (t && t.closest && t.closest('audio, video')) return
  e.stopPropagation()
  emit('close')
}

onMounted(() => {
  lastActive = document.activeElement
  document.addEventListener('keydown', onKeydown)
  nextTick(() => closeBtn.value && closeBtn.value.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  if (lastActive && lastActive.focus && document.contains(lastActive)) lastActive.focus()
})

// 详情卡片拖动: 按住头部平移(点关闭按钮不触发); 组件每次打开都会重新挂载, 无需重置
const mdDrag = ref({ x: 0, y: 0 })
let mdDragState = null
const mdDragStyle = computed(() =>
  mdDrag.value.x || mdDrag.value.y
    ? { transform: `translate(${mdDrag.value.x}px, ${mdDrag.value.y}px)` }
    : {}
)
function onMdDragStart(e) {
  if (e.target.closest('button')) return
  mdDragState = { sx: e.clientX, sy: e.clientY, ox: mdDrag.value.x, oy: mdDrag.value.y }
  window.addEventListener('pointermove', onMdDragMove)
  window.addEventListener('pointerup', onMdDragEnd)
}
function onMdDragMove(e) {
  if (!mdDragState) return
  mdDrag.value = {
    x: mdDragState.ox + (e.clientX - mdDragState.sx),
    y: mdDragState.oy + (e.clientY - mdDragState.sy),
  }
}
function onMdDragEnd() {
  mdDragState = null
  window.removeEventListener('pointermove', onMdDragMove)
  window.removeEventListener('pointerup', onMdDragEnd)
}

// 图片列表: 优先 imgList(多张), 兼容旧的 imgUrl 单图字段
const imgList = computed(() => {
  if (Array.isArray(props.post.imgList) && props.post.imgList.length) return props.post.imgList
  return props.post.imgUrl ? [props.post.imgUrl] : []
})

function send() {
  const text = input.value.trim()
  if (!text) return
  emit('add-comment', text)
  input.value = ''
}

// 昵称首字哈希出色相, 与作者卡同一套配色逻辑
function avaStyle(name) {
  const n = name || '匿'
  const hue = (n.charCodeAt(0) * 7) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hue} 80% 78%), hsl(${(hue + 40) % 360} 70% 66%))`,
  }
}
</script>

<style scoped>
.md-card,
.md-card * {
  box-sizing: border-box;
}

.md-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: rgba(40, 34, 28, 0.32);
  backdrop-filter: blur(2px);
}

.md-card {
  display: flex;
  flex-direction: column;
  width: 460px;
  max-width: calc(100vw - 40px);
  max-height: min(78vh, 640px);
  border-radius: 18px;
  background: rgba(255, 252, 248, 0.98);
  box-shadow: 0 24px 60px rgba(90, 70, 40, 0.3);
  overflow: hidden;
  /* 不用 fill:both: forwards 会永久覆盖 inline transform, 拖动就失效了 */
  animation: md-in 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes md-in {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.97);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.md-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #f0e8de;
}

.md-ava {
  display: grid;
  flex: none;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  overflow: hidden;
  color: #fff;
  font-size: 16.5px;
  font-weight: 600;
}
.md-ava-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.md-ava.sm {
  width: 30px;
  height: 30px;
  font-size: 14.5px;
}

.md-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.md-meta b {
  font-size: 15.5px;
  color: #3d352e;
}

.md-meta span {
  font-size: 12px;
  color: #b3a79c;
}

.md-close {
  flex: none;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: #f6f0e8;
  color: #8a7a6d;
  font-size: 17.5px;
  line-height: 1;
  cursor: pointer;
}

.md-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px;
  scrollbar-width: thin;
  scrollbar-color: #d8c9b8 transparent;
}

.md-title {
  margin: 0 0 8px;
  font-size: 17px;
  color: #3d352e;
}

.md-text {
  margin: 0 0 10px;
  font-size: 15.5px;
  line-height: 1.8;
  color: #4a4038;
  white-space: pre-line;
}

/* 图片/视频/音频分段之间的细分割线 */
.md-divider {
  height: 1px;
  margin: 10px 0;
  background: #eee6da;
}

.md-photo.md-media {
  height: auto;
  margin-bottom: 10px;
  object-fit: contain;
  background: #f6f1e9;
}

.md-video {
  display: block;
  width: 100%;
  border-radius: 12px;
  background: #000;
}

.md-audio {
  display: block;
  width: 100%;
  border-radius: 10px;
}

.md-photo {
  width: 100%;
  height: 180px;
  border-radius: 12px;
  object-fit: cover;
}

.md-photo.grad {
  background-size: cover;
  background-position: center;
}

/* 与广场卡片同一套渐变占位图 */
.g-sunset {
  background: linear-gradient(160deg, #ffd9a0, #ff9d7c 55%, #8a6aa0);
}

.g-book {
  background: linear-gradient(150deg, #f7e8d4, #d9b896);
}

.g-flower {
  background: linear-gradient(150deg, #eaf6e2, #bcd9a8 60%, #f4fbee);
}

.g-film {
  background: linear-gradient(150deg, #dfe6ee, #9fb2c8);
}

.g-rain {
  background: linear-gradient(150deg, #dce8f2, #a9c2d8);
}

.md-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.md-tag {
  padding: 2px 9px;
  border-radius: 999px;
  background: #fdeae2;
  color: #e0705a;
  font-size: 12px;
}

.md-stats {
  margin-top: 8px;
  font-size: 13px;
  color: #a08063;
}

.md-comments {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #eadfd2;
}

.mc-title {
  font-size: 14.5px;
  color: #4a3f37;
}

.mc-row {
  display: flex;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0ebe5;
}

.mc-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.mc-meta {
  flex: 1;
  min-width: 0;
}

.mc-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.mc-line b {
  font-size: 14px;
  color: #6b5d4f;
}

.mc-line em {
  font-size: 11.5px;
  font-style: normal;
  color: #c0b4a6;
}

.mc-meta p {
  margin: 2px 0 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: #55606c;
}

.mc-empty {
  margin: 6px 0;
  text-align: center;
  font-size: 13px;
  color: #b3a79c;
}

.md-foot {
  display: flex;
  flex: none;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid #f0e8de;
}

.md-foot input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid #eadfd2;
  border-radius: 999px;
  background: #fff;
  font-size: 14.5px;
  color: #4a4038;
  outline: none;
}

.md-foot input:focus {
  border-color: #f0917c;
}

.md-foot button {
  flex: none;
  padding: 8px 18px;
  border: none;
  border-radius: 999px;
  background: #f0917c;
  color: #fff;
  font-size: 14.5px;
  cursor: pointer;
}

.md-foot button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
