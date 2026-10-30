<template>
  <span class="pet-sprite-img" :style="frameStyle"></span>
</template>

<script setup>
import { computed } from 'vue'
import { petSheet, petRows, useCompanionStore } from '@/stores/companion'

// 取精灵图第 0 行"坐着眨眼"首帧: 正面全身坐姿猫, 透明背景。
// 裁剪窗口按花色逐张实测(见 src/data/petFrames.js), 直接用素材像素坐标。
const props = defineProps({
  // 显示高度: 数字=px; 字符串=任意 CSS 长度(可用 cqw 等容器单位做自适应, 见 profile 宠物格)
  height: { type: [Number, String], default: 40 },
  // 指定显示哪只猫; 留空则跟随全局当前选中的宠物
  type: { type: String, default: '' },
})

const companion = useCompanionStore()
const sheet = computed(() => petSheet(props.type || companion.petType))
const rows = computed(() => petRows(props.type || companion.petType))

// ★ 这个组件只画 24~48px 的小头像，用 1/3 小图（省解码内存）。
//   大尺寸的宠物本体走 petCompanion.vue，那边用的是高清图。
//   两者都靠 backgroundSize 写「逻辑尺寸 × 比例」，所以坐标系没差别。
const imgSrc = computed(() => sheet.value.small || sheet.value.src)

const frameStyle = computed(() => {
  const s = sheet.value
  const row = rows.value[0]
  const [x0, x1] = row.f[0]
  const [y0, y1] = row.y
  // 高度统一走 CSS 变量, 尺寸全部写成 calc(var(--ps-h) * 比例)。
  // 这样传数字(px)和传 CSS 长度(cqw 之类)都能用, 容器变窄时猫会跟着缩, 不会被挤爆格子。
  const rowH = y1 - y0 + 1
  const h = typeof props.height === 'number' ? `${props.height}px` : props.height
  const k = (n) => `calc(var(--ps-h) * ${(n / rowH).toFixed(5)})`
  return {
    '--ps-h': h,
    width: k(x1 - x0 + 1),
    height: 'var(--ps-h)',
    backgroundImage: `url(${imgSrc.value})`,
    backgroundSize: `${k(s.w)} ${k(s.h)}`,
    backgroundPosition: `${k(-x0)} ${k(-y0)}`,
  }
})
</script>

<style scoped>
.pet-sprite-img {
  display: inline-block;
  flex: none;
  background-repeat: no-repeat;
}
</style>
