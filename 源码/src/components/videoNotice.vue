<template>
  <!-- 全局顶部提示: 视频生成进行中常驻进度条 + 完成/失败 toast。
       挂在 App.vue 最外层, 任何页面都能看到, 不随页面切换消失。 -->
  <div class="video-notice" aria-live="polite">
    <Transition name="vn-drop">
      <div v-if="count > 0" class="vn-progress" :key="'bar-' + count">
        <span class="vn-spinner" aria-hidden="true"></span>
        <span class="vn-text">
          正在生成记忆影像{{ count > 1 ? '（' + count + ' 条）' : '' }}，大约需要一两分钟，可以先去别处逛逛…
        </span>
        <span class="vn-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      </div>
    </Transition>

    <Transition name="vn-drop">
      <div
        v-if="toast"
        class="vn-toast"
        :class="toast.ok ? 'is-ok' : 'is-bad'"
        :key="'toast-' + toast.at"
        role="status"
      >
        {{
          toast.ok
            ? '🎉 「' + toast.title + '」的记忆影像生成好了，去空间里的大电视看看吧！'
            : '⚠️ 「' + toast.title + '」视频生成失败：' + (toast.error || '未知原因')
        }}
        <button class="vn-close" type="button" title="知道了" @click="toast = null">&times;</button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
// 视频是分钟级异步任务: memories store 的 pendingVideos / lastVideoFinish 是唯一事实来源。
// pendingVideos.length > 0 → 顶部常驻进度条; lastVideoFinish 变化 → 弹 6s toast。
import { computed, ref, watch } from 'vue'
import { useMemoriesStore } from '@/stores/memories'

const store = useMemoriesStore()
const count = computed(() => store.pendingVideos.length)
const toast = ref(null)
let hideTimer = null

watch(
  () => store.lastVideoFinish,
  (n) => {
    if (!n || !n.at) return
    toast.value = { ...n }
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => (toast.value = null), 6000)
  },
)
</script>

<style scoped>
.video-notice {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.vn-progress,
.vn-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(92vw, 560px);
  padding: 9px 16px;
  border-radius: 999px;
  background: rgba(52, 38, 22, 0.88);
  color: #fff3da;
  font-size: 15.5px;
  line-height: 1.4;
  box-shadow: 0 10px 30px rgba(30, 18, 6, 0.35);
  backdrop-filter: blur(6px);
}

/* 进行中: 琥珀描边呼吸 */
.vn-progress {
  border: 1px solid rgba(255, 202, 107, 0.55);
  animation: vn-breath 2.2s ease-in-out infinite;
}
@keyframes vn-breath {
  0%, 100% { box-shadow: 0 10px 30px rgba(30, 18, 6, 0.35), 0 0 0 0 rgba(255, 202, 107, 0.35); }
  50% { box-shadow: 0 10px 30px rgba(30, 18, 6, 0.35), 0 0 0 6px rgba(255, 202, 107, 0); }
}

.vn-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(255, 226, 168, 0.35);
  border-top-color: #ffca6b;
  animation: vn-spin 0.9s linear infinite;
  flex: none;
}
@keyframes vn-spin { to { transform: rotate(360deg); } }

/* 小声波: 提示“正在出片” */
.vn-wave { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; flex: none; }
.vn-wave i {
  width: 3px;
  border-radius: 2px;
  background: #ffca6b;
  animation: vn-wave 1s ease-in-out infinite;
}
.vn-wave i:nth-child(1) { height: 6px; animation-delay: 0s; }
.vn-wave i:nth-child(2) { height: 10px; animation-delay: 0.15s; }
.vn-wave i:nth-child(3) { height: 14px; animation-delay: 0.3s; }
.vn-wave i:nth-child(4) { height: 8px; animation-delay: 0.45s; }
@keyframes vn-wave {
  0%, 100% { transform: scaleY(0.5); }
  50% { transform: scaleY(1.25); }
}

/* 完成 / 失败 */
.vn-toast.is-ok { border: 1px solid rgba(134, 216, 149, 0.6); }
.vn-toast.is-bad { border: 1px solid rgba(255, 138, 128, 0.6); }

.vn-close {
  border: 0;
  background: rgba(255, 255, 255, 0.12);
  color: #fff3da;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 15.5px;
  line-height: 1;
  cursor: pointer;
  flex: none;
}
.vn-close:hover { background: rgba(255, 255, 255, 0.24); }

/* 进出场: 从顶上轻轻落下 */
.vn-drop-enter-active,
.vn-drop-leave-active { transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.vn-drop-enter-from,
.vn-drop-leave-to { opacity: 0; transform: translateY(-14px) scale(0.94); }
</style>
