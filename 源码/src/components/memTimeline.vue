<!--
  竖向时间轴（小岛总览页 / 3D 房间页共用）

  形态照参考图来：文字靠右对齐、圆点贴着右边缘，一条细线把圆点串起来。
  当前项 = 白色大圆点 + 外圈扩散的光环 + 文字加粗；其余是暗色小圆点。

  三条约定（页面按自己的需要接）：
  · hover(id)  —— 对应对象高亮（岛屿页让岛身发光，房间页亮卡片）
  · pick(id)   —— 点一下做什么由页面决定：
                  小岛页是「先聚焦，再点一次才进岛」；
                  房间页是「弹出这条记忆的详情，并把底部卡片滑到眼前」。
  · activeId 变化时自动把当前项滚到可视区中间

  ★ 容器默认不吃鼠标事件，只有每一行按钮吃。
    房间页这条压在 3D 画布上，整块吃事件会把「拖视角」截断成点不动。
-->
<template>
  <div class="mtl" :class="'mtl-' + kind">
    <p class="mtl-head">
      <span class="mtl-title">{{ label }}</span>
      <span class="mtl-count">{{ nodes.length }}</span>
    </p>

    <div ref="scrollEl" class="mtl-scroll">
      <span class="mtl-line" aria-hidden="true"></span>
      <ul class="mtl-list">
        <li
          v-for="n in nodes"
          :key="n.id"
          class="mtl-node"
          :class="{ on: n.id === activeId }"
        >
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
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  // [{ id, title, date }]，顺序由调用方决定（时间轴按调用方给的顺序从上往下排）
  nodes: { type: Array, default: () => [] },
  activeId: { type: [Number, String], default: null },
  label: { type: String, default: '时间线' },
  // 'isle' 岛屿页（木色）/ 'room' 房间页（深色遮罩上更亮一点）
  kind: { type: String, default: 'isle' },
  // 选中后显示的一行小提示，比如「再点一次进入这座岛」
  hint: { type: String, default: '' },
})

defineEmits(['pick', 'hover'])

const scrollEl = ref(null)

// 选中项自动滚到中间：手动算 top 而不是 scrollIntoView ——
// scrollIntoView 会连带滚动整个页面（岛屿页整页是可拖的云海，滚一下就跑偏）。
watch(
  () => props.activeId,
  async (id) => {
    if (id == null) return
    await nextTick()
    const box = scrollEl.value
    const node = box?.querySelector('.mtl-node.on')
    if (!box || !node) return
    const top = node.offsetTop - box.clientHeight / 2 + node.offsetHeight / 2
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }
)
</script>

<style scoped>
.mtl {
  --mtl-ink: #5b4433;
  --mtl-ink-dim: rgba(91, 68, 51, 0.66);
  --mtl-dot-off: rgba(120, 92, 70, 0.42);
  --mtl-dot-on: #fff;
  --mtl-halo: rgba(255, 196, 132, 0.85);

  /* 全站没有全局 border-box（默认 content-box），这里必须自己声明一次：
     否则 padding 不计入 max-height，房间页算好的「可用高度」会被多撑出去 21px，
     矮屏下正好压到下方陈列条上。 */
  box-sizing: border-box;
  width: 200px;
  padding: 11px 8px 10px 16px;
  border-radius: 16px;
  /* 刻意做得很淡：这条常压在画面内容上（岛屿页压着最右那座岛的画面，
     房间页压着 3D 画布），底色一重就变成"贴了张不透明卡片"。
     不用 backdrop-filter —— 房间页那层下面是 canvas，模糊整块画布很贵。 */
  background: linear-gradient(180deg, rgba(255, 252, 246, 0.34), rgba(255, 246, 235, 0.14));
  border: 1px solid rgba(255, 255, 255, 0.42);
  box-shadow: 0 8px 24px rgba(120, 90, 60, 0.1);
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
  width: 1px;
  background: linear-gradient(
    180deg,
    rgba(150, 120, 95, 0) 0%,
    rgba(150, 120, 95, 0.4) 10%,
    rgba(150, 120, 95, 0.4) 90%,
    rgba(150, 120, 95, 0) 100%
  );
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
  color: var(--mtl-ink-dim);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
  transition: color 0.2s ease, font-size 0.2s ease;
}
.mtl-date {
  font-size: 10.5px;
  font-style: normal;
  color: rgba(91, 68, 51, 0.46);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.55);
}

.mtl-dotbox {
  position: relative;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
}
.mtl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mtl-dot-off);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.32);
  transition: transform 0.25s cubic-bezier(0.22, 0.61, 0.36, 1), background 0.25s ease,
    box-shadow 0.25s ease, width 0.25s ease, height 0.25s ease;
}
.mtl-btn:hover .mtl-dot {
  background: #b8865a;
  transform: scale(1.3);
}

/* ---- 当前项：白点 + 光环 + 加粗 ---- */
.mtl-node.on .mtl-name {
  color: #43301f;
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
  border: 1.5px solid rgba(255, 206, 140, 0.9);
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
.mtl-isle {
  background: linear-gradient(180deg, rgba(255, 252, 246, 0.46), rgba(255, 246, 235, 0.26));
}
.mtl-isle .mtl-name {
  color: rgba(74, 52, 38, 0.84);
  text-shadow: 0 0 9px rgba(255, 255, 255, 0.95), 0 1px 0 rgba(255, 255, 255, 0.85);
}
.mtl-isle .mtl-date {
  color: rgba(74, 52, 38, 0.62);
  text-shadow: 0 0 7px rgba(255, 255, 255, 0.95);
}

/* ---- 房间页：压在 3D 画面上，底色要比岛屿页沉，但别沉成一块黑板 ---- */
.mtl-room {
  background: linear-gradient(180deg, rgba(46, 36, 30, 0.46), rgba(46, 36, 30, 0.22));
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
  color: rgba(255, 238, 220, 0.5);
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
}

@media (prefers-reduced-motion: reduce) {
  .mtl-node.on .mtl-dotbox::after {
    animation: none;
    opacity: 0;
  }
  .mtl-btn,
  .mtl-dot {
    transition: none;
  }
}
</style>
