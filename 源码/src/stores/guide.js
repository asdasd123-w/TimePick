// 新用户引导的状态机。
//
// 为什么进度放服务端（user_settings.guide_step）而不是 localStorage：
//   ① 换个浏览器、清一下缓存，不该又被从头讲一遍；
//   ② 「请教我」重放要真的把进度写回去，否则一刷新又跳回上次的位置；
//   ③ 引导是"这个人已经学会了"这件事，本来就该跟着账号走。
//
// 步骤编号（与 server/db.js 里 guide_step 的注释一一对应）：
//   0 = 没开始（刚注册，第一次进站）
//   1 = 已提示「写一篇日记」           —— 记忆库页，小猫走到「去写一篇日记」旁边
//   2 = 日记写好，提示「去我的记忆空间」 —— 小猫走到左侧导航那一项旁边
//   3 = 已到记忆空间，提示「记忆岛已生成」—— 小猫走到第一座岛旁边
//   4 = 已进 3D，提示「点我一下」        —— 3D 里的猫自己说（宿主发 tp:catAction: beckon）
//   5 = 已退出 3D，提示「以后点我选请教我」—— 2D 小猫原地招手
//   6 = 走完
//
// ★ 推进规则是「自动检测」：真的写了日记 / 真的进了空间页 / 真的进了 3D 才往前走。
//   所以每一步的检测点写在对应页面里（memory.vue、islandIndex.vue、room3d.vue），
//   这个 store 只负责"存 + 幂等地往前走"，不猜用户做了什么。
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { cloudApi } from '@/api/cloud'

// 每一步的提示语。第 4 步是 3D 里那只猫说的，宿主渲染不到（Cocos 有自己的台词），
// 这里留着是为了「请教我」重放时能说清楚下一步要干嘛。
export const GUIDE_TEXT = {
  1: '先写一篇日记吧～ 点这里，写下的会变成房间里的一件东西',
  2: '日记写好咯！去「我的记忆空间」看看它变成了什么',
  3: '你的记忆岛已经生成啦，点这座小岛进去逛一逛',
  4: '在房间里点我一下，我带你熟悉熟悉',
  5: '点我可以「找小橘聊天」，想说什么都行；想再学一遍就选「请教我」',
}
export const GUIDE_DONE = 6

// 本次会话里被用户主动关掉的步骤。
// 用 sessionStorage 而不是 localStorage：关掉只是"这次别念了"，下次打开网站还该提醒，
// 否则关一次等于永久放弃引导，而进度还停在半路。
const MUTE_KEY = 'tp:guide-muted'

function readMuted() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(MUTE_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n)) : []
  } catch {
    return []
  }
}

export const useGuideStore = defineStore('guide', () => {
  const step = ref(0)
  const loaded = ref(false)
  // 正在重放（「请教我」触发）：此时即使 step 已到 6 也要讲
  const replaying = ref(false)
  const muted = ref(readMuted())

  function persistMuted() {
    try {
      sessionStorage.setItem(MUTE_KEY, JSON.stringify(muted.value))
    } catch {}
  }

  /** 拉一次进度。幂等：已加载过就直接返回。 */
  async function load(force = false) {
    if (loaded.value && !force) return step.value
    try {
      const data = await cloudApi.getGuide()
      step.value = Number(data?.step) || 0
      loaded.value = true
    } catch (e) {
      // 后端不可达时不要卡住整个页面：按"已完成"处理，宁可这次不引导，
      // 也不要让新用户看到一堆报错。
      console.warn('[guide] 读取引导进度失败:', e.message)
      loaded.value = true
    }
    return step.value
  }

  /**
   * 往前走（幂等）。后端只允许前进，所以重复调用/并发调用都不会把进度打回去。
   * @param {number} to 目标步骤
   */
  async function advance(to) {
    if (to <= step.value) return step.value
    step.value = to
    try {
      const data = await cloudApi.setGuide(to)
      if (data && Number.isFinite(Number(data.step))) step.value = Number(data.step)
    } catch (e) {
      // 写失败就把本地也退回去，避免"这一步永远不再提示"，下次刷新还能重来
      console.warn('[guide] 保存引导进度失败:', e.message)
    }
    return step.value
  }

  /** 当前该讲哪一步；0=不讲了，已走完 / 本次被关掉都返回 0。 */
  function activeStep() {
    if (!loaded.value) return 0
    if (step.value <= 0 || step.value >= GUIDE_DONE) return 0
    // ★ 重放期间也要认 ×：replay() 已经把 muted 清空，所以这里不需要额外放行，
    //   否则用户在重放中关掉气泡，它还会继续挂着。
    if (muted.value.includes(step.value)) return 0
    return step.value
  }

  /**
   * 用户点了气泡上的 ×：这次别念了。
   *
   * ★ 静音的是"这次会话的全部步骤"，不是当前这一条。
   *   原因：关掉之后如果又写日记、又进空间，下一步照样会冒出来；
   *   用户点 × 的意思是"我现在不想被打扰"，不是"这条跳过、下条继续念"。
   *   进度仍然保留在服务端，下次打开网站还从没走完的那一步继续。
   *   想重看随时点小猫 →「请教我」（replay 会把静音清掉）。
   */
  function mute() {
    const all = []
    for (let i = 1; i < GUIDE_DONE; i++) all.push(i)
    muted.value = all
    persistMuted()
  }

  /** 每一步讲完就标记"这次讲过了"，避免同一页面里反复弹 */
  function done(s = step.value) {
    if (s + 1 <= GUIDE_DONE) advance(s + 1)
    // 走到终点就退出"重放模式"：之后再进来按正常进度判断，不再无视静音
    if (s + 1 >= GUIDE_DONE) replaying.value = false
  }

  /** 「请教我」：从第一步重讲。进度写回 1（允许回退），并清掉本次的静音。 */
  async function replay() {
    muted.value = []
    persistMuted()
    replaying.value = true
    step.value = 1
    try {
      await cloudApi.setGuide(1, true)
    } catch (e) {
      console.warn('[guide] 重放时写入进度失败:', e.message)
    }
    return 1
  }

  /** 重放结束后调用：以后就按正常进度走了 */
  function endReplay() {
    replaying.value = false
  }

  /** 退出登录：把本地状态清干净，换个人登录不会被上一个人的进度带着走 */
  function reset() {
    step.value = 0
    loaded.value = false
    replaying.value = false
    muted.value = []
    persistMuted()
  }

  return {
    step,
    loaded,
    replaying,
    muted,
    load,
    advance,
    activeStep,
    mute,
    done,
    replay,
    endReplay,
    reset,
  }
})
