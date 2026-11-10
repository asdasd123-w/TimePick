<!--
  记忆时间线（小岛总览页 / 3D 房间页共用），两种排布：

  · layout="v"（默认，小岛总览页）：竖排。文字靠右对齐、圆点贴着右边缘，一条细线把点串起来。
  · layout="h"（3D 房间页）：横排。一条横线串起每个物品的圆形小图，名字、日期压在下面，
    左右滑动（或点两端箭头）看更多；当前项小图描一圈 #fBB043 的边并外发光。

  三种交互（页面按自己的需要接）：
  · hover(id)  —— 对应对象高亮（岛屿页让岛身发光）
  · pick(id)   —— 点一下做什么由页面决定：
                  小岛页是「先聚焦，再点一次才进岛」；
                  房间页是「弹出这条记忆的详情，并把底部卡片滑到眼前」。
  · activeId 变化时自动把当前项滚到可视区中间（竖排滚纵向，横排滚横向）

  ★ 容器默认不吃鼠标事件，只有每一行按钮 / 箭头吃。
    房间页这条压在 3D 画布上，整块吃事件会把「拖视角」截断成点不动。
-->
<template>
  <!-- ============ 横排（3D 房间页底部） ============ -->
  <div v-if="layout === 'h'" class="mtl mtl-h" :class="'mtl-' + kind">
    <div class="mth-head">
      <span class="mtl-title">{{ label }}</span>
      <span class="mtl-count">{{ nodes.length }}</span>
    </div>

    <!-- 箭头跟小图排在同一行的最右端（垂直居中于圆心）。
         放在滚动区外面当兄弟节点，而不是绝对定位压上去：
         压在内容上就得给滚动区补 padding-right，最后一屏会多出一块空白。 -->
    <div class="mth-body">
      <div ref="scrollEl" class="mth-scroll" @scroll="refreshArrows">
        <ul class="mth-list">
          <span class="mth-line" aria-hidden="true"></span>
          <li v-for="n in nodes" :key="n.id" class="mtl-node mth-node" :class="{ on: n.id === activeId }">
            <button
              class="mth-btn"
              type="button"
              :title="n.title"
              @click="$emit('pick', n.id)"
              @mouseenter="$emit('hover', n.id)"
              @mouseleave="$emit('hover', null)"
              @focus="$emit('hover', n.id)"
              @blur="$emit('hover', null)"
            >
              <span class="mth-thumb">
                <img v-if="n.cover" :src="n.cover" alt="" loading="lazy" />
                <!-- 没有 AI 封面时用家具图标兜底：圆形小图上一片空白比放个图标更难看 -->
                <em v-else-if="n.emoji" class="mth-ph">{{ n.emoji }}</em>
                <i v-else class="mth-dot"></i>
              </span>
              <b class="mth-name">{{ n.title }}</b>
              <em class="mth-date">{{ n.date }}</em>
            </button>
          </li>
        </ul>
      </div>
      <span class="mth-arrows">
        <button type="button" class="mth-arrow" aria-label="向左" :disabled="!canLeft" @click="scrollH(-1)">‹</button>
        <button type="button" class="mth-arrow" aria-label="向右" :disabled="!canRight" @click="scrollH(1)">›</button>
      </span>
    </div>
  </div>

  <!-- ============ 竖排（小岛总览页） ============ -->
  <div v-else class="mtl" :class="'mtl-' + kind">
    <!-- <p class="mtl-head">
      <span class="mtl-title">{{ label }}</span>
      <span class="mtl-count">{{ nodes.length }}</span>
    </p> -->

    <div ref="scrollEl" class="mtl-scroll">
      <span class="mtl-line" aria-hidden="true"></span>
      <ul class="mtl-list">
        <li v-for="n in nodes" :key="n.id" class="mtl-node" :class="{ on: n.id === activeId }">
          <button
            class="mtl-btn"
            type="button"
            :title="n.title"
            @click="$emit('pick', n.id)"
            @mouseenter="$emit('hover', n.id)"
            @mouseleave="$emit('hover', null)"
            @focus="$emit('hover', n.id)"
            @blur="$emit('hover', null)"
          >
            <span class="mtl-txt">
              <b class="mtl-name">{{ n.title }}</b>
              <em class="mtl-date">{{ n.date }}</em>
            </span>
            <span class="mtl-dotbox" aria-hidden="true"><i class="mtl-dot"></i></span>
          </button>
        </li>
      </ul>
    </div>

    <p v-if="hint && activeId != null" class="mtl-hint">{{ hint }}</p>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps({
  // [{ id, title, date, cover?, emoji? }]，顺序由调用方决定（时间轴按调用方给的顺序排）
  nodes: { type: Array, default: () => [] },
  activeId: { type: [Number, String], default: null },
  label: { type: String, default: '时间线' },
  // 'isle' 岛屿页（木色）/ 'room' 房间页（深色遮罩上更亮一点）
  kind: { type: String, default: 'isle' },
  // 'v' 竖排（岛屿页）/ 'h' 横排（房间页）
  layout: { type: String, default: 'v' },
  // 选中后显示的一行小提示，比如「再点一次进入这座岛」
  hint: { type: String, default: '' },
})

defineEmits(['pick', 'hover'])

const scrollEl = ref(null)
const canLeft = ref(false)
const canRight = ref(false)

function refreshArrows() {
  const el = scrollEl.value
  if (!el || props.layout !== 'h') return
  canLeft.value = el.scrollLeft > 4
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}
// 箭头一次滚「差不多一屏的 0.7」，慢慢挪反而要点很多下
function scrollH(dir) {
  const el = scrollEl.value
  if (!el) return
  el.scrollBy({ left: dir * Math.max(180, el.clientWidth * 0.7), behavior: 'smooth' })
}

onMounted(refreshArrows)

// 选中项自动滚到中间。
// 竖排手动算 top / 横排手动算 left，而不是 scrollIntoView ——
// scrollIntoView 会连带滚动整个页面（岛屿页整页是可拖的云海，滚一下就跑偏）。
watch(
  () => props.activeId,
  async (id) => {
    if (id == null) return
    await nextTick()
    const box = scrollEl.value
    const node = box?.querySelector('.mtl-node.on')
    if (!box || !node) return
    if (props.layout === 'h') {
      const left = node.offsetLeft - box.clientWidth / 2 + node.offsetWidth / 2
      box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
    } else {
      const top = node.offsetTop - box.clientHeight / 2 + node.offsetHeight / 2
      box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
  }
)

// 条数变了（新建/删除记忆）箭头可用状态要重算
watch(
  () => props.nodes.length,
  async () => {
    await nextTick()
    refreshArrows()
  }
)
</script>

<style scoped>
.mtl {
  --mtl-ink: #5b4433;
  --mtl-ink-dim: rgba(91, 68, 51, 0.66);
  --mtl-dot-off: rgba(120, 92, 70, 0.42);
  /* 当前项的点 / 光环统一用 rgb(251,176,67)：和小岛翻页按钮、房间时间线的高亮同色 */
  --mtl-dot-on: rgb(251, 176, 67);
  --mtl-halo: rgba(251, 176, 67, 0.78);

  /* 全站没有全局 border-box（默认 content-box），这里必须自己声明一次：
     否则 padding 不计入 max-height，房间页算好的「可用高度」会被多撑出去 21px。
     ★ 横排也用得上：宽度 100% + 左右 padding，不写就会横向溢出 20px。 */
  box-sizing: border-box;
  width: 200px;
  /* padding: 11px 8px 10px 16px; */
  /* border-radius: 16px; */
  /* 刻意做得很淡：这条常压在画面内容上（岛屿页压着最右那座岛的画面），
     底色一重就变成"贴了张不透明卡片"。
     不用 backdrop-filter —— 房间页那层下面是 canvas，模糊整块画布很贵。 */
  /* background: rgba(247, 213, 203,0.6); */
  /* background: linear-gradient(180deg, rgba(255, 252, 246, 0.34), rgba(255, 246, 235, 0.14)); */
  /* border: 1px solid rgba(255, 255, 255, 0.42); */
  /* box-shadow: 0 8px 24px rgba(120, 90, 60, 0.1); */
  color: var(--mtl-ink);
  /* 容器不吃事件：房间页这条压在 3D 画布上，挡了就没法拖视角 */
  pointer-events: none;
}

.mtl-head {
  display: flex;
  align-items: center;
  gap: 6px;
  /* 右边留 10px：圆点列宽 18px，标题行的条数角标要跟圆点对齐，
     不留这一截角标会贴着卡片右边缘，看起来像被裁掉了 */
  margin: 0 0 8px;
  padding: 0 10px 0 2px;
  font-size: 11.5px;
  letter-spacing: 0.08em;
  color: rgba(91, 68, 51, 0.66);
}
.mtl-title {
  font-weight: 700;
}
.mtl-count {
  margin-left: auto;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(169, 130, 90, 0.16);
  font-size: 10.5px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.mtl-scroll {
  position: relative;
  max-height: min(54vh, 430px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  pointer-events: none;
  /* 上下各淡出一小段：矮屏下可用高度只够放 4 条时，最后一行会正好被切成半行，
     加一道渐隐才看得出"下面还有"。只淡 6/12px，不切圆点也不切光晕。 */
  -webkit-mask-image: linear-gradient(
    180deg,
    transparent 0,
    #000 6px,
    #000 calc(100% - 12px),
    transparent 100%
  );
  mask-image: linear-gradient(180deg, transparent 0, #000 6px, #000 calc(100% - 12px), transparent 100%);
}
.mtl-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* 竖线：对齐圆点盒的中心（盒宽 18px → right 9px） */
.mtl-line {
  position: absolute;
  right: 9px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  /* background: linear-gradient(
    180deg,
    rgba(150, 120, 95, 0) 0%,
    rgba(150, 120, 95, 0.4) 10%,
    rgba(150, 120, 95, 0.4) 90%,
    rgba(150, 120, 95, 0) 100%
  ); */
  background-color: #EBCF9B;
  pointer-events: none;
}

.mtl-list {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}
.mtl-node {
  display: block;
}

.mtl-btn {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 6px 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: right;
  cursor: pointer;
  pointer-events: auto; /* 只有按钮吃事件 */
  transition: transform 0.2s ease;
}
.mtl-btn:hover {
  transform: translateX(-2px);
}
.mtl-btn:focus-visible {
  outline: 2px solid rgba(255, 214, 160, 0.9);
  outline-offset: 2px;
  border-radius: 8px;
}

.mtl-txt {
  padding: 6px 10px 6px 12px;
  box-shadow: 0 3px  rgba(91, 80, 116, 0.06);
  background:rgba(255,249,242,0.82);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  min-width: 0;
}
.mtl-name {
  max-width: 138px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  /* color: var(--mtl-ink-dim); */
  color:#454764;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
  transition: color 0.2s ease, font-size 0.2s ease;
}
.mtl-date {
  font-size: 10.5px;
  font-style: normal;
  /* color: rgba(91, 68, 51, 0.46); */
  color:#85839A;
  font-variant-numeric: tabular-nums;
  /* text-shadow: 0 1px 0 rgba(255, 255, 255, 0.55); */
}

.mtl-dotbox {
  position: relative;
  flex: 0 0 20px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
}
.mtl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  /* background: var(--mtl-dot-off); */
  background-color:#FFF9F2;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.32);
  transition: transform 0.25s cubic-bezier(0.22, 0.61, 0.36, 1), background 0.25s ease,
    box-shadow 0.25s ease, width 0.25s ease, height 0.25s ease;
}
.mtl-txt:hover {
  background:rgba(246,189,88,0.3);
}
.mtl-btn:hover .mtl-dot {
   background-color: #F6BA5B;
  transform: scale(1.3);
}

/* ---- 当前项：白点 + 光环 + 加粗 ---- */
.mtl-node.on .mtl-name {
  /* color: #43301f; */
  
  font-weight: 700;
  font-size: 13.5px;
}
.mtl-node.on .mtl-date {
  color: rgba(91, 68, 51, 0.66);
}
.mtl-node.on .mtl-dot {
  width: 13px;
  height: 13px;
  background: var(--mtl-dot-on);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.92), 0 0 16px 4px var(--mtl-halo);
}
.mtl-node.on .mtl-dotbox::after {
  content: '';
  position: absolute;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.5px solid rgba(251, 176, 67);
  animation: mtl-ping 2.6s ease-out infinite;
  pointer-events: none;
}
@keyframes mtl-ping {
  0% {
    transform: scale(1);
    opacity: 0.85;
  }
  70% {
    transform: scale(2.3);
    opacity: 0;
  }
  100% {
    transform: scale(2.3);
    opacity: 0;
  }
}

.mtl-hint {
  margin: 5px 0 0;
  padding-right: 2px;
  font-size: 10.5px;
  color: rgba(91, 68, 51, 0.6);
  text-align: right;
}

/* ---- 岛屿页：底色浅一些、文字加白色描边光 ----
   这条会压在画面最右那座岛上，底色压太重就成"贴了张卡片"，
   压太轻文字就飘在树影里看不清。取中间值：底色留一点纱，给文字补一圈白晕。 */
 /* .mtl-isle { 
   background: linear-gradient(180deg, rgba(255, 252, 246, 0.46), rgba(255, 246, 235, 0.26)); 
   border:1px solid rgba(0,0,0); 
}  */
.mtl-isle .mtl-name {
  color: #454764;
  text-shadow: 0 0 9px rgba(255, 255, 255, 0.95), 0 1px 0 rgba(255, 255, 255, 0.85);
}
.mtl-isle .mtl-date {
  color:#85839A;
  /* text-shadow: 3px 3px 3px rgba(0, 0, 0, 0.95); */
}

/* ---- 房间页：压在 3D 画面上，底色要比岛屿页沉，但别沉成一块黑板 ---- */
.mtl-room {
  /* background-color: rgba(247,213,203); */
  border-color: rgba(255, 226, 190, 0.22);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.26);
}
.mtl-room .mtl-head {
  color: rgba(255, 236, 214, 0.72);
}
.mtl-room .mtl-count {
  background: rgba(255, 226, 190, 0.18);
}
.mtl-room .mtl-line {
  background: linear-gradient(
    180deg,
    rgba(255, 226, 190, 0) 0%,
    rgba(255, 226, 190, 0.34) 10%,
    rgba(255, 226, 190, 0.34) 90%,
    rgba(255, 226, 190, 0) 100%
  );
}
.mtl-room .mtl-name {
  color: rgba(255, 242, 228, 0.84);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}
.mtl-room .mtl-date {
  color: rgba(255, 242, 228, 0.84);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.mtl-room .mtl-node.on .mtl-name {
  color: #fff6e8;
}
.mtl-room .mtl-node.on .mtl-date {
  color: rgba(255, 240, 222, 0.78);
}
.mtl-room .mtl-dot {
  background: rgba(255, 232, 208, 0.5);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.14);
}

/* ================= 横排（3D 房间页底部） =================
   配色按用户给的三色定：
     高亮 #FBB043 = rgb(251,176,67)、连线 #FEECCD = rgb(254,236,205)、
     发光/阴影全部由高亮色带透明度派生（暖光压在暖色房间里，用纯黑阴影会发灰）。
   小图就是时间线上的"点"：36px 圆，选中那一颗描边 + 外发光 + 放大 1.08。 */
.mtl-h {
  --mth-th: 46px; /* 小图直径，横线高度、行高都跟着它走 */
  --mth-pad: 2px; /* 列表上内边距 */
  --mth-on: rgb(251, 176, 67);
  --mth-line: rgb(254, 236, 205);

  /* 宽度跟着内容走（最多撑满）：5 条时条子只有 ~450px，右侧不会留一大片空面板；
     条数多到放不下时 max-width 兜住，交给 .mth-scroll 横滚。 */
  width: fit-content;
  max-width: 100%;
  padding: 9px 12px 8px;
  border-radius: 16px;
  /* 底下那层已经是 .room-gallery 的深色渐隐，这里再压太实就成一块黑板了 */
  /* background: linear-gradient(180deg, rgba(46, 36, 30, 0.42), rgba(46, 36, 30, 0.2)); */
  border: 1px solid rgba(255, 226, 190, 0.2);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.2);
}
.mth-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 2px 6px;
  font-size: 11.5px;
  letter-spacing: 0.08em;
  color: rgba(255, 236, 214, 0.86);
}
.mth-head .mtl-count {
  background: rgba(255, 226, 190, 0.18);
}

/* 一行 = 滚动区 + 右端箭头。箭头不再放标题行：标题行只有一行字那么高，
   箭头跟小图对不齐，看着像"挂"在上面。 */
.mth-body {
  display: flex;
  align-items: flex-start;
  gap: 3px;
}
.mth-arrows {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 1px;
  /* 与小图圆心对齐：列表上内边距 + 小图半径 - 箭头半高(13) */
  margin-top: calc(var(--mth-pad) + (var(--mth-th) - 26px) / 2);
  pointer-events: auto;
}
/* 只有箭头本身，没有圆底也没有描边（用户明确不要那个框）：
   底色一去掉它就跟连线一个颜色，看起来是"线的两端"，而不是两个按钮。 */
.mth-arrow {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--mth-line);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.18s ease, transform 0.18s ease;
}
.mth-arrow:hover:not(:disabled) {
  color: var(--mth-on);
  transform: scale(1.16);
}
.mth-arrow:focus-visible {
  outline: 2px solid var(--mth-on);
  outline-offset: -2px;
}
.mth-arrow:disabled {
  opacity: 0.26;
  cursor: default;
}

.mth-scroll {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  /* ★ 这条要吃事件：手机上要能直接拖、桌面滚轮要能滚。
     它已经落在底部陈列条那块覆盖层里（不是 3D 拖视角的主区域），拦下拖拽不吃亏；
     竖排那条就不行 —— 它压在画布中间，挡住就没法转视角了。 */
  pointer-events: auto;
}
.mth-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* 横线挂在 ul 上（不是滚动容器上）：容器的绝对定位子元素只按可视宽度铺开，
   条数一多线就断在半路；挂 ul 上才是整条内容的宽度。 */
.mth-list {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 20px;
  margin: 0;
  padding: var(--mth-pad) 8px 0;
  list-style: none;
}
.mth-line {
  position: absolute;
  left: 10px;
  right: 10px;
  top: calc(var(--mth-pad) + var(--mth-th) / 2);
  height: 1.5px;
  background: linear-gradient(
    90deg,
    rgba(254, 236, 205, 0) 0%,
    var(--mth-line) 6%,
    var(--mth-line) 94%,
    rgba(254, 236, 205, 0) 100%
  );
  pointer-events: none;
}

.mth-node {
  flex: 0 0 auto;
  width: 90px;
}
.mth-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}
.mth-thumb {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--mth-th);
  height: var(--mth-th);
  margin-bottom: 5px;
  overflow: hidden;
  border-radius: 50%;
  border: 1.5px solid rgba(254, 236, 205, 0.55);
  background: rgba(255, 232, 208, 0.16);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
  transition: transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1), border-color 0.22s ease,
    box-shadow 0.22s ease;
}
.mth-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mth-ph {
  font-size: 20px;
  font-style: normal;
  line-height: 1;
}
.mth-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(254, 236, 205, 0.8);
}
.mth-name {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 500;
  color: rgba(255, 242, 228, 0.82);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  transition: color 0.2s ease, font-size 0.2s ease;
}
.mth-date {
  font-size: 11px;
  font-style: normal;
  color: rgba(255, 238, 220, 0.46);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.mth-btn:hover .mth-thumb {
  border-color: rgba(251, 176, 67, 0.85);
  transform: scale(1.06);
}
.mth-btn:hover .mth-name {
  color: #fff6e8;
}
.mth-btn:focus-visible {
  outline: 2px solid rgba(251, 176, 67, 0.9);
  outline-offset: 3px;
  border-radius: 10px;
}

/* ---- 当前项 ---- */
.mth-node.on .mth-thumb {
  border-color: var(--mth-on);
  transform: scale(1.1);
  /* 内环 + 一圈淡环 + 外发光：单靠 1.5px 描边在暖色房间上认不出来 */
  box-shadow: inset 0 0 0 1px var(--mth-on), 0 0 0 4px rgba(251, 176, 67, 0.28),
    0 0 22px 4px rgba(251, 176, 67, 0.6), 0 2px 8px rgba(0, 0, 0, 0.3);
}
.mth-node.on .mth-name {
  color: #fff6e8;
  font-weight: 700;
  font-size: 13px;
}
.mth-node.on .mth-date {
  color: rgba(251, 176, 67, 0.92);
}

/* 矮屏（720p 笔记本 / 分屏）：整条往回收一档，给 3D 画面多留些地方。
   ★ 这条只压横排；竖排的高度本来就由页面自己卡（岛屿页 52vh）。 */
@media (max-height: 800px) {
  .mtl-h {
    --mth-th: 38px;
    padding: 7px 10px 6px;
  }
  .mth-name {
    font-size: 11.5px;
  }
  .mth-date {
    font-size: 10.5px;
  }
}

/* 手机上收窄：只留名字（日期藏起来），圆点仍贴右边缘。
   ★ 不要做成「只显示圆点、选中才出名字」—— 没有选中项时那一列就是七个点，
     用户看不出这条是干什么的。宁可名字截断，也要能一眼读出是哪些记忆。 */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  .mtl {
    width: 116px;
    padding: 8px 6px 8px 10px;
    border-radius: 13px;
  }
  .mtl-head {
    display: none;
  }
  .mtl-scroll {
    max-height: 38vh;
  }
  .mtl-btn {
    min-height: 32px;
    padding: 2px 0;
    gap: 6px;
  }
  .mtl-name {
    max-width: 70px;
    font-size: 11px;
  }
  .mtl-date {
    display: none;
  }
  .mtl-hint {
    display: none;
  }

  /* 横排：小图缩到 36px，日期整行去掉（手机上 4 行字会占掉半个底部条） */
  .mtl-h {
    --mth-th: 36px;
    width: 100%;
    max-width: 100%;
    padding: 6px 8px 5px;
    border-radius: 12px;
  }
  .mth-head {
    font-size: 10.5px;
  }
  .mth-arrow {
    width: 28px;
    height: 28px;
    font-size: 18px;
  }
  .mth-list {
    gap: 10px;
  }
  .mth-node {
    width: 70px;
  }
  .mth-name {
    max-width: 70px;
    font-size: 11px;
  }
  .mth-date {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mtl-node.on .mtl-dotbox::after {
    animation: none;
    opacity: 0;
  }
  .mtl-btn,
  .mtl-dot,
  .mth-btn,
  .mth-thumb {
    transition: none;
  }
}
</style>
