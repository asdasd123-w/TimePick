import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { cloudApi } from '@/api/cloud'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { generateMemoryCover, getLastCoverError, isPermissionDenied } from '@/api/aiCover'

// 筛选选项（记忆库列表顶部的下拉）
// 所属空间由用户自由输入, 筛选选项从已有数据动态生成
//
// ⚠ 原来这里还有一份 KIND_OPTIONS（日记/书籍/音乐）+ 弹窗里的「内容种类」选择，
//   以及「类型」下拉和「其他」自定义类型输入 —— 都已按需求删掉：
//   用户只写内容，标题由服务端 AI 生成。TYPE_OPTIONS 只留给「筛选历史数据」用。
export const TYPE_OPTIONS = ['全部类型', '旅游', '工作', '学习', '其他']
// 首项是「全部时间」而不是「时间」：原来那个单字下拉项语义不完整，
// 用户看不出它代表"不筛选"（验证报告 FIND-06）。
export const TIME_OPTIONS = ['全部时间', '今天', '本周', '本月']

// 服务器行 -> 前端条目形状(记忆库/首页/记忆空间三页共用)
function mapRow(r) {
  const media = Array.isArray(r.media) ? r.media : []
  // type: 1 = 图片(可多张) / 2 = 音频(最多一个) / 3 = 视频(最多一个)
  const photos = media.filter((m) => m.type === 1).map((m) => m.url)
  const video = media.find((m) => m.type === 3)
  const audio = media.find((m) => m.type === 2)
  return {
    id: r.id,
    kind: r.kind || 'memory',
    title: r.title,
    author: r.author || '',
    date: r.entry_date || '',
    space: r.space_name || '',
    // 小岛显示名（用户在记忆空间里改过的岛名）；与内部空间名分开，
    // 记忆库第二栏「小岛」筛选用它
    island: r.island_name || r.space_name || '',
    type: r.type || '其他',
    content: r.content || '',
    photo: photos[0] || '',
    photos,
    video: video?.url || '',
    videoName: video?.thumb || '',
    audio: audio?.url || '',
    audioName: audio?.thumb || '',
    // 旧 bug 时代落库的本地 Canvas 降级图(data: 开头)一律当作无封面:
    // 那是权限拦截生效前画的假图, 展示出来就像 AI 控制没生效。
    // 置空后补漏/详情页会按正常流程处理(有权限补真图, 无权限标 aiDenied)
    aiCover: String(r.ai_cover || '').startsWith('data:') ? '' : r.ai_cover || '',
    // 1 = 这条记忆是在「没有 AI 出图权限」期间创建的, 之后不再自动补封面
    aiDenied: !!r.ai_denied,
    // AI 生成的视频地址(/uploads/videos/xxx): 每条记忆只有一个, 生成即永久保存
    aiVideo: r.ai_video || '',
    // 视频还在生成中(服务端存着异步任务号)
    videoPending: !!r.ai_video_task,
    is_public: !!r.is_public,
    // 分享到广场的时间(0 = 未分享), 广场共享流按它排序
    shared_at: r.shared_at || 0,
    created_at: r.created_at,
  }
}

// 前端条目 -> 服务器参数; 媒体存入 memory_media(type 1 图片(可多张) / 2 音频 / 3 视频)
function toPayload(e) {
  const media = []
  // 兼容旧形状: 只填了 photo 单图时也收进 photos 数组
  const photos = Array.isArray(e.photos) && e.photos.length ? e.photos : e.photo ? [e.photo] : []
  photos.forEach((url) => {
    if (url) media.push({ type: 1, url })
  })
  if (e.audio) media.push({ type: 2, url: e.audio, thumb: e.audioName || '' })
  if (e.video) media.push({ type: 3, url: e.video, thumb: e.videoName || '' })
  // ⚠ 这里**故意不带** kind / author / type：
  //   弹窗里已经把「内容种类(日记·书籍·音乐) / 作者 / 类型」删掉了，表单里没有这三个键。
  //   而 updateCols 是"传了就覆盖"，写死默认值（kind:'memory' / author:'' / type:'其他'）
  //   会把历史数据里"这是一本书 / 作者是余华 / 类型是旅游"悄悄抹掉 ——
  //   首页的书籍架、音乐架正是靠 kind 分栏的，一改就空了。
  //   不传这三个键 = 后端保留原值；新建时由 SQL 默认值兜底（'memory' / '' / '其他'）。
  return {
    // 「已有岛屿」时带上 space_id: 后端据此精确落位, 不会按名字去新建空间
    space_id: e.space_id || undefined,
    space_name: e.space,
    title: e.title,
    entry_date: e.date || '',
    content: e.content || '',
    ai_cover: e.aiCover || '',
    ai_denied: e.aiDenied ? 1 : 0,
    is_public: e.is_public ? 1 : 0,
    media,
  }
}

// 记忆库数据源: 每个用户一份, 存服务器 SQLite; 登录后按用户加载
export const useMemoriesStore = defineStore('memories', () => {
  const entries = ref([])
  const loading = ref(false)
  // 后台正在生成封面的任务数(可能同时有多条), 大于 0 即表示有任务在跑
  const coverJobs = ref(0)
  // 最近一次视频生成结果: { id, title, ok, error?, at }
  const lastVideoFinish = ref(null)
  const generatingCover = computed(() => coverJobs.value > 0)
  // 正在后台补封面的条目 id, 供列表/详情显示「封面生成中」
  const pendingCovers = ref([])
  // 视频生成是分钟级的异步任务: 记录哪些条目正在生成(按条目 id), 供页面轮询
  const pendingVideos = ref([])
  // 最近一次后台封面任务的完成事件 { id, title, ok, error, at }, 供页面提示用户
  const lastCoverFinish = ref(null)
  // AI 出图失败的原因(成功时为空), 供页面如实提示用户
  const lastCoverError = ref('')
  let loadedUid = null
  // 补漏是否已在本次会话跑过; 单批最多补几条(防止老用户一次刷掉大量额度)
  let repaired = false
  const REPAIR_BATCH = 3

  async function load(force = false) {
    const auth = useCloudAuthStore()
    if (!auth.isLogin) {
      entries.value = []
      loadedUid = null
      return
    }
    if (!auth.user) await auth.refresh()
    const uid = auth.user?.id
    if (!uid) return
    if (!force && loadedUid === uid) return
    // 换账号重新加载时, 允许再跑一次封面补漏
    if (loadedUid !== uid) {
      // ★ 换了账号必须先把上一个人的条目清掉 —— 否则列表会短暂(甚至一直)显示别人的记忆,
      //   用户看到「这个账号有记忆 / 另一个账号是空的」会以为数据丢了(2026-10-21 反馈)。
      entries.value = []
      repaired = false
    }
    loading.value = true
    try {
      const rows = await cloudApi.listMyItems()
      entries.value = (rows || []).map(mapRow)
      loadedUid = uid
      // 补漏: 上次生成封面时刷新/关闭了页面, 后台任务随内存一起丢失,
      // 这些条目会永久停留在「无封面」状态。这里重新捡起来补齐。
      repairMissingCovers()
      // 同理: 上次还在生成中的视频任务, 回来后接着轮询(顶部条会再次出现)
      resumePendingVideos()
    } finally {
      loading.value = false
    }
  }

  /**
   * 为「没有封面」的历史条目补生成封面。
   * 只在每次 load 后跑一次, 且限制单批数量, 避免老用户一进来就刷掉一堆生图额度。
   */
  function repairMissingCovers() {
    if (repaired) return
    repaired = true
    // 只补最近若干条: 更可能是用户刚创建、还没来得及出图的
    // aiDenied 的条目(当时无 AI 权限)跳过后不再补 —— 否则管理员一恢复权限,
    // 这些历史记忆会突然冒出一张 AI 图, 与「当时没用 AI」的事实不符
    const targets = entries.value
      .filter((e) => !e.aiCover && !e.aiDenied && !e.photos?.length && !e.photo)
      .slice(0, REPAIR_BATCH)
    for (const item of targets) generateCoverInBackground(item, true)
  }

  /**
   * 新增条目: 先落库再后台补封面。
   * AI 出图要 10s 左右, 若等它完成再返回, 用户点「保存」后会卡在弹窗里干等;
   * 这里改成条目立刻入库并出现在列表, 封面由后台任务生成后回填, 用户无需等待。
   */
  /**
   * opts.cover=false: 不要自动生成封面。
   * 用于「保存后弹 AI 选项」的流程 —— 由用户自己勾选要不要 AI 图片，
   * 这里就不要再偷偷画一张，否则会出现"用户没选图却有封面"的错位。
   */
  async function addEntry(entry, opts = {}) {
    // 调用方已自带封面时不再重复生成(如外部指定封面)
    const row = await cloudApi.createItem(toPayload({ ...entry, aiCover: entry.aiCover || '' }))
    const item = mapRow(row)
    entries.value.unshift(item)
    // 记住的可能是新建的岛 —— 让「我的记忆空间」立刻能浮出这座新岛
    loadIslands().catch(() => {})
    // 用户自己上传了照片就不再让 AI 画封面: 详情页直接展示用户图片
    const autoCover = opts.cover !== false
    if (autoCover && !item.aiCover && !item.photos.length) generateCoverInBackground(item)
    return item
  }

  /**
   * 后台为指定条目生成封面并回填; 不阻塞调用方, 失败也不会打断用户操作
   * (失败时条目保留空封面, 可在记忆详情里手动「重新生成封面」)。
   */
  function generateCoverInBackground(item, quiet = false) {
    const id = item.id
    coverJobs.value += 1
    pendingCovers.value = [...pendingCovers.value, id]
    void (async () => {
      let cover = ''
      try {
        cover = await generateMemoryCover(item.title, item.content)
        lastCoverError.value = getLastCoverError()
        // 权限类失败: 记下「这条记忆没用 AI」并落库, 以后不再自动补图
        const denied = !cover && isPermissionDenied(lastCoverError.value)
        if (cover || denied) {
          const idx = entries.value.findIndex((e) => e.id === id)
          // 只回写封面字段: 生图要 10s, 期间用户可能已经改过标题/图片,
          // 若用整条 payload 覆盖会把用户的新编辑回滚(甚至清空 media 数组)
          await cloudApi.updateItem({ id, ai_cover: cover || '', ai_denied: denied ? 1 : 0 })
          if (idx >= 0) {
            if (cover) entries.value[idx].aiCover = cover
            entries.value[idx].aiDenied = denied
          }
        }
      } catch {
        // 后台任务失败不弹错误打扰用户, 条目保持可用
      } finally {
        coverJobs.value -= 1
        pendingCovers.value = pendingCovers.value.filter((x) => x !== id)
        // 补漏任务(quiet)不打扰用户: 悄悄补上就行, 不用每次进来都弹一串提示
        if (!quiet) {
          lastCoverFinish.value = {
            id,
            title: item.title || '',
            ok: !!cover,
            error: lastCoverError.value || '',
            at: Date.now(),
          }
        }
      }
    })()
  }

  async function updateEntry(id, patch) {
    const idx = entries.value.findIndex((e) => e.id === id)
    const base = idx >= 0 ? entries.value[idx] : {}
    const merged = { ...base, ...patch }
    // 用户上传过照片: 不再让 AI 画/重画封面(展示用户图片即可)
    const hasUserPhotos = !!(merged.photos?.length || merged.photo)
    // 仅当标题或内容真正变化时重新生成封面, 否则沿用已有 aiCover
    const contentChanged =
      (patch.title !== undefined && patch.title !== base.title) ||
      (patch.content !== undefined && patch.content !== base.content)
    if (contentChanged && !hasUserPhotos) {
      coverJobs.value += 1
      try {
        merged.aiCover = await generateMemoryCover(merged.title, merged.content)
        lastCoverError.value = getLastCoverError()
        // 改内容后恰好处于「无 AI 权限」期间: 清掉旧封面并标记, 不再自动补
        merged.aiDenied = !merged.aiCover && isPermissionDenied(lastCoverError.value)
      } finally {
        coverJobs.value -= 1
      }
    } else {
      // 未改内容: 沿用已有封面; 但调用方显式传入新封面时(如手动「重新生成封面」)以传入的为准
      merged.aiCover = patch.aiCover || base.aiCover || ''
    }
    const row = await cloudApi.updateItem({ id, ...toPayload(merged) })
    const mapped = mapRow(row)
    if (idx >= 0) entries.value[idx] = mapped
    // 改「所属空间」等于把记忆搬到另一座岛: 原岛可能因此变空而被服务端删掉
    if (patch.space !== undefined && patch.space !== base.space) loadIslands().catch(() => {})
    return mapped
  }

  async function removeEntry(id) {
    await cloudApi.removeItem({ id })
    entries.value = entries.value.filter((e) => e.id !== id)
    // ★ 删掉的可能是某座岛的**最后一条**记忆 —— 服务端会把整座岛一起删掉,
    //   所以这里必须同步刷新岛屿总览, 否则退回「我的记忆空间」还挂着那座空岛。
    loadIslands().catch(() => {})
  }

  // ---------- 岛屿总览(我的记忆空间) ----------
  const islands = ref([])
  const islandsLoading = ref(false)

  // 一个「记忆空间」= 一座岛 = 一间 3D 房间; 服务端按空间聚合并按空间创建时间倒序
  async function loadIslands() {
    const auth = useCloudAuthStore()
    if (!auth.isLogin) {
      islands.value = []
      return
    }
    islandsLoading.value = true
    try {
      islands.value = await cloudApi.listIslands()
    } finally {
      islandsLoading.value = false
    }
  }

  // 编辑小岛(悬停文案/外观 key): 两者都在空间行上, 更新后行数据来自服务端
  async function updateIsland(patch) {
    const row = await cloudApi.updateIsland(patch)
    const idx = islands.value.findIndex((s) => s.id === row.id)
    if (idx >= 0) islands.value[idx] = { ...islands.value[idx], ...row }
    return row
  }

  // 删除小岛 = 删除整座岛(该空间连同里面的全部记忆)
  async function removeIsland(id) {
    await cloudApi.removeSpace({ id })
    islands.value = islands.value.filter((s) => s.id !== id)
  }

  /**
   * 分享到拾光广场 / 取消分享, 与记忆库卡片上的分享按钮一一对应。
   * 单独走专用 action 而不是 updateEntry: 后者会带整条 payload 提交,
   * 既有触发封面重生成的风险, 也会把「分享」这件事和普通编辑混在一起不好排查。
   */
  /**
   * 为一条记忆生成 AI 视频(图生视频)。
   * 服务端会保证「一条记忆只生成一个」: 已有成品直接报错, 已有任务则复用。
   * 生成完成后视频转存服务端 /uploads/videos/, 永久保存、不可更改或删除。
   */
  async function startVideo(id, duration) {
    if (pendingVideos.value.includes(id)) return
    pendingVideos.value = [...pendingVideos.value, id]
    try {
      await cloudApi.aiVideoCreate({ id, duration })
      const idx = entries.value.findIndex((e) => e.id === id)
      if (idx >= 0) entries.value[idx].videoPending = true
      syncVideo(id)
      return true
    } catch (e) {
      pendingVideos.value = pendingVideos.value.filter((x) => x !== id)
      throw e
    }
  }

  /**
   * 轮询一条记忆的视频任务: 成功则写入 aiVideo, 失败则清掉 pending 让用户可重试。
   * 页面卸载也没关系 —— 下次进来 load 时 videoPending 仍在, 会继续补查。
   */
  // 视频生成是分钟级任务: 8s 一查, 最长查 8 分钟(百炼一般 1~2 分钟出片)。
  // 偶发网络错误不清任务, 连续 3 次失败才判定任务丢失。
  const VIDEO_POLL_MS = 8000
  const VIDEO_POLL_MAX_MS = 8 * 60 * 1000

  function finishVideo(id, ok, extra = {}) {
    const idx = entries.value.findIndex((e) => e.id === id)
    const title = idx >= 0 ? entries.value[idx]?.title || '' : ''
    if (idx >= 0) {
      if (ok && extra.video) entries.value[idx].aiVideo = extra.video
      if (!ok) entries.value[idx].videoPending = false
    }
    if (ok || extra.final) pendingVideos.value = pendingVideos.value.filter((x) => x !== id)
    lastVideoFinish.value = { id, title, ok, error: extra.error || '', at: Date.now() }
  }

  async function syncVideo(id) {
    const startedAt = Date.now()
    let errors = 0
    while (true) {
      try {
        const r = await cloudApi.aiVideoSync({ id })
        errors = 0
        if (r?.status === 'done' && r.video) {
          finishVideo(id, true, { video: r.video })
          return true
        }
        if (r?.status === 'failed') {
          finishVideo(id, false, { final: true, error: r.message || '视频生成失败' })
          return false
        }
        // 还在生成: 超过最长等待就先放手(条目仍是 videoPending, 下次 load 会续查)
        if (Date.now() - startedAt > VIDEO_POLL_MAX_MS) return false
      } catch (e) {
        // 偶发网络错误: 不丢任务, 连续 3 次才放弃
        errors += 1
        if (errors >= 3) {
          finishVideo(id, false, { final: true, error: e?.message || '网络异常, 任务已停止' })
          return false
        }
      }
      await new Promise((res) => setTimeout(res, VIDEO_POLL_MS))
    }
  }

  // 登录加载后把「上辈子没等到结果」的视频任务捡回来继续查
  function resumePendingVideos() {
    const ids = entries.value.filter((e) => e.videoPending && !e.aiVideo).map((e) => e.id)
    for (const id of ids) {
      if (!pendingVideos.value.includes(id)) {
        pendingVideos.value = [...pendingVideos.value, id]
        syncVideo(id)
      }
    }
  }

  async function setShared(id, shared) {
    const row = shared ? await cloudApi.shareItem({ id }) : await cloudApi.unshareItem({ id })
    const mapped = mapRow(row)
    const idx = entries.value.findIndex((e) => e.id === id)
    if (idx >= 0) entries.value[idx] = mapped
    return mapped
  }

  return {
    entries,
    loading,
    generatingCover,
    pendingCovers,
    lastCoverFinish,
    lastCoverError,
    pendingVideos,
    lastVideoFinish,
    islands,
    islandsLoading,
    load,
    loadIslands,
    updateIsland,
    removeIsland,
    addEntry,
    updateEntry,
    removeEntry,
    setShared,
    startVideo,
    syncVideo,
    resumePendingVideos,
  }
})

// dev 下让 store 定义可被热替换。
// 不写这段时, 改动本文件会让引用它的组件热更新, 而 useMemoriesStore() 仍返回内存里的
// 旧实例 —— 页面上新加的方法会报 "store.setShared is not a function", 必须手动刷新才恢复。
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useMemoriesStore, import.meta.hot))
}
