import { ref, watch } from 'vue'

const PREFIX = 'timepick:'

// 把状态镜像到 localStorage, 刷新后自动恢复。
// onSave: 写入前裁剪不可持久化的字段(如会话级 objectURL)。
// onOverflow: 写入超出配额时的降级版本(如丢弃体积大的 dataURL 媒体), 至少保住文本数据。
export function usePersistentState(key, initial, { onSave, onOverflow } = {}) {
  const storageKey = PREFIX + key

  let value = initial
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw != null) value = JSON.parse(raw)
  } catch {
    // 缓存损坏时回落到初始值, 不影响应用启动
  }

  const state = ref(value)

  watch(
    state,
    (next) => {
      const payload = onSave ? onSave(next) : next
      try {
        localStorage.setItem(storageKey, JSON.stringify(payload))
      } catch {
        if (!onOverflow) return
        try {
          localStorage.setItem(storageKey, JSON.stringify(onOverflow(next)))
        } catch {
          // 仍失败则放弃本次持久化, 内存中的数据不受影响
        }
      }
    },
    { deep: true },
  )

  return state
}
