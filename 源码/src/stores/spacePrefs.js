import { computed, ref } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { cloudApi } from '@/api/cloud'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { BGM_PRESETS, BGM_DEFAULT_TRACK, resolveBgmSrc } from '@/data/bgmTracks'

// 空间偏好的全局副作用中心:
// - motion/tone: 写到 html 的 dataset, 由 App.vue 全局样式消费(低动效停动画, 冷色加冷调纱罩)
// - bgm: 播放选中曲目(预置四首 + 用户自传), 播完自动切下一首循环; 用户关掉则不再自启
export const useSpacePrefsStore = defineStore('spacePrefs', () => {
  const bgm = ref(false)
  const motion = ref('适中')
  const tone = ref('暖色')
  // 选中的曲目 id: 预置 'preset-xxx' / 自传 'url:/uploads/bgm/xxx'; '' = 默认曲
  const bgmTrackId = ref('')
  // 用户自传曲目(由个人中心拉取后写入, 播放器也需要)
  const bgmUploads = ref([])

  // 浏览器禁止无手势自动播放: 播放被拒后等首次交互再补播
  let resumeBound = false
  function bindGestureResume(retry) {
    if (resumeBound) return
    resumeBound = true
    const kick = () => {
      resumeBound = false
      window.removeEventListener('keydown', kick, true)
      bgmAudio && bgmAudio.play().catch(() => {})
    }
    window.addEventListener('pointerdown', kick, { once: true, capture: true })
    window.addEventListener('keydown', kick, { once: true, capture: true })
  }

  // ---- 背景音乐: 预置曲目 + 自传曲目, 单曲播完顺延到下一首(列表循环) ----
  let bgmAudio = null
  let bgmUrl = ''
  let failStreak = 0 // 连续加载/解码失败数: 全列表都坏就停止, 防止死循环空转
  function bgmPlaylist() {
    return [
      ...BGM_PRESETS.map((p) => ({ id: p.id, src: p.src })),
      ...bgmUploads.value.map((t) => ({ id: `url:${t.url}`, src: t.url })),
    ]
  }
  function resolveTrack() {
    const list = bgmPlaylist()
    const want = resolveBgmSrc(bgmTrackId.value, bgmUploads.value)
    if (want) return list.find((t) => t.src === want) || null
    // 未选/已失效 -> 默认曲
    return list.find((t) => t.id === BGM_DEFAULT_TRACK) || list[0] || null
  }
  function advanceBgm() {
    const list = bgmPlaylist()
    if (!list.length) return stopBgm()
    const idx = list.findIndex((t) => t.src === bgmUrl)
    const next = list[(idx + 1) % list.length]
    bgmTrackId.value = next.id
    bgmUrl = '' // 强制重建 Audio
    playCurrent()
  }
  function playCurrent() {
    const track = resolveTrack()
    if (!track) return stopBgm()
    if (!bgmAudio || bgmUrl !== track.src) {
      const list = bgmPlaylist()
      bgmAudio?.pause()
      bgmAudio = new Audio(track.src)
      bgmAudio.volume = 0.22
      bgmUrl = track.src
      bgmAudio.loop = list.length === 1
      bgmAudio.addEventListener('ended', advanceBgm)
      // 某首坏了(404/编码不支持/平台加密文件浏览器解不了) -> 顺延下一首, 不卡死
      bgmAudio.addEventListener('error', () => {
        if (++failStreak >= Math.max(bgmPlaylist().length, 1)) {
          failStreak = 0
          stopBgm()
          return
        }
        advanceBgm()
      })
    }
    bgmAudio
      .play()
      .then(() => {
        failStreak = 0
      })
      .catch(() => bindGestureResume())
  }
  function stopBgm() {
    bgmAudio?.pause()
    bgmAudio = null
    bgmUrl = ''
  }
  async function syncBgm() {
    if (!bgm.value) return stopBgm()
    playCurrent()
  }

  // 换曲(个人中心列表点选): 立即切到新曲播放(开着开关时)
  function setBgmTrack(id) {
    bgmTrackId.value = id || ''
    stopBgm()
    if (bgm.value) playCurrent()
  }
  // 个人中心拉取/增删自传曲目后同步进来
  function setUploads(list) {
    bgmUploads.value = Array.isArray(list) ? list : []
    // 正在播的自传曲被删了 -> 回默认曲
    if (bgmTrackId.value.startsWith('url:') && !resolveBgmSrc(bgmTrackId.value, bgmUploads.value)) {
      bgmTrackId.value = ''
      if (bgm.value) {
        stopBgm()
        playCurrent()
      }
    }
  }

  // ---- DOM 副作用: 动效档位 / 冷暖氛围 ----
  function applyDom() {
    const el = document.documentElement
    // 档位值是中文('低/适中/高'), 全局 CSS(App.vue) 只认 data-motion='low' 等英文键。
    // 之前直接写中文导致选「低」永远匹配不上, 低动效形同虚设、动画照跑 —— 这是页面卡的主因之一。
    el.dataset.motion = motion.value === '低' ? 'low' : motion.value === '高' ? 'high' : 'mid'
    el.dataset.tone = tone.value === '冷色' ? 'cool' : 'warm'
  }

  // 宠物活跃度系数: 低动效让宠物更懒, 高动效更活跃
  const petFactor = computed(() => (motion.value === '低' ? 2.2 : motion.value === '高' ? 0.55 : 1))

  // 从云端拉取偏好并生效; 未登录时停掉所有音频
  async function load() {
    const auth = useCloudAuthStore()
    if (!auth.isLogin) {
      bgm.value = false
      syncBgm()
      return
    }
    try {
      const s = await cloudApi.getSettings()
      if (!s) return
      bgm.value = !!s.bgm
      motion.value = s.motion || '适中'
      tone.value = s.tone || '暖色'
      bgmTrackId.value = s.bgm_track || ''
      applyDom()
      // 拉自传曲目(失败不阻塞, 大不了只有预置曲)
      try {
        const r = await cloudApi.listBgm()
        bgmUploads.value = r?.list || []
      } catch {}
      syncBgm()
    } catch (e) {
      console.error('加载空间偏好失败:', e.message)
    }
  }

  // 个人中心改完偏好: 立即全局生效(持久化由调用方负责)
  function apply(patch) {
    if (patch.bgm !== undefined) bgm.value = !!patch.bgm
    if (patch.motion) motion.value = patch.motion
    if (patch.tone) tone.value = patch.tone
    if (patch.bgmTrack !== undefined) bgmTrackId.value = patch.bgmTrack
    applyDom()
    syncBgm()
  }

  return { bgm, motion, tone, bgmTrackId, bgmUploads, petFactor, load, apply, applyDom, syncBgm, setBgmTrack, setUploads }
})

// dev 下让 store 定义可被热替换(详见 memories.js 里的说明)
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSpacePrefsStore, import.meta.hot))
}
