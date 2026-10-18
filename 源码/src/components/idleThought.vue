<template>
  <Transition name="thought" mode="out-in">
    <div v-if="text" :key="text" class="idle-thought" :style="{ left, top }">
      {{ text }}
    </div>
  </Transition>
</template>

<script setup>
// 背景图里睡觉/趴着的猫"想事情": 头顶冒出小气泡。
// 两种模式:
//   默认(慢速) —— 随机 3~7s 冒一条, 停 3.4s 淡出;
//   传 interval(毫秒) —— 常驻气泡, 每 interval 换一条(如 :interval="1000" = 1s 一换)。
import { onUnmounted, ref } from 'vue'

const props = defineProps({
  lines: { type: Array, required: true },
  left: { type: String, default: '50%' },
  top: { type: String, default: '50%' },
  interval: { type: Number, default: 0 }, // >0 时进入定速轮播模式
})

const text = ref('')
let timer = null
let last = -1

function pick() {
  if (props.lines.length < 2) return props.lines[0]
  let i = Math.floor(Math.random() * props.lines.length)
  if (i === last) i = (i + 1) % props.lines.length
  last = i
  return props.lines[i]
}

function loop() {
  // 随机 3~7s 冒出一条想法, 停留 3.4s
  timer = setTimeout(
    () => {
      text.value = pick()
      timer = setTimeout(() => {
        text.value = ''
        loop()
      }, 3400)
    },
    3000 + Math.random() * 4000,
  )
}

if (props.interval > 0) {
  text.value = pick()
  timer = setInterval(() => {
    text.value = pick()
  }, props.interval)
} else {
  loop()
}

onUnmounted(() => {
  clearInterval(timer)
  clearTimeout(timer)
})
</script>

<style scoped>
.idle-thought {
  position: absolute;
  z-index: 5;
  transform: translate(-50%, -100%);
  max-width: 34%;
  padding: 6px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 4px 14px rgba(120, 90, 40, 0.18);
  color: #7a5c33;
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  pointer-events: none;
}

/* 气泡尾巴: 两颗小圆点 */
.idle-thought::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
}

.idle-thought::before {
  content: '';
  position: absolute;
  left: calc(50% + 7px);
  bottom: -10px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
}

.thought-enter-active,
.thought-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.thought-enter-from {
  opacity: 0;
  transform: translate(-50%, -92%) scale(0.9);
}

.thought-leave-to {
  opacity: 0;
  transform: translate(-50%, -104%) scale(0.94);
}
</style>
