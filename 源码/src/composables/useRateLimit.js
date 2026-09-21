import { ref, watch } from 'vue'

// 防抖: 连续触发只执行最后一次(搜索输入等), 停止 wait ms 后才生效
export function debounce(fn, wait = 250) {
  let timer = null
  return function debouncedFn(...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}

// 节流: wait ms 内最多执行一次, 尾部补一次(resize/scroll 等高频事件)
export function throttle(fn, wait = 100) {
  let last = 0
  let timer = null
  return function throttledFn(...args) {
    const remain = wait - (Date.now() - last)
    if (remain <= 0) {
      clearTimeout(timer)
      timer = null
      last = Date.now()
      fn.apply(this, args)
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now()
        timer = null
        fn.apply(this, args)
      }, remain)
    }
  }
}

// 提交类节流: wait ms 内只放行第一次点击, 冷却期内的后续点击直接丢弃。
// 与 throttle 的区别: 不做「尾部补一次」, 否则连点两次的按钮会在冷却结束后
// 自动再执行一次, 反而造成重复提交(保存/下单这类操作要的就是丢弃而非补刀)。
export function throttleSubmit(fn, wait = 1200) {
  let last = 0
  return function throttledSubmit(...args) {
    const now = Date.now()
    if (now - last < wait) return false
    last = now
    fn.apply(this, args)
    return true
  }
}

// 输入防抖 ref: source 绑 v-model 即时响应, debounced 延迟更新供过滤/查询使用
export function useDebouncedRef(initial = '', wait = 250) {
  const source = ref(initial)
  const debounced = ref(initial)
  const sync = debounce((v) => {
    debounced.value = v
  }, wait)
  watch(source, (v) => sync(v))
  return { source, debounced }
}
