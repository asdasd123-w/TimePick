import { ref } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'

// 欢迎页与首页之间的显示状态(已移除上滑/下滑翻页的位移与跟手效果)
// view: 'welcome' 表示欢迎页可见, 'index' 表示首页可见
export const usePageSlideStore = defineStore('pageSlide', () => {
  const view = ref('welcome')

  function goWelcome() {
    view.value = 'welcome'
  }

  function goIndex() {
    view.value = 'index'
  }

  return { view, goWelcome, goIndex }
})

// dev 下让 store 定义可被热替换(详见 memories.js 里的说明)
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePageSlideStore, import.meta.hot))
}
