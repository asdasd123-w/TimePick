<template>
  <!-- 下滑返回欢迎页: 只记录位置, 不再逐帧驱动页面跟手; 禁用原生拖拽避免手势被打断 -->
  <div class="index" @pointerdown="onPointerDown" @dragstart.prevent>
    <!-- 左侧文字区: 占 1 份 -->
    <aside class="index-side" :class="{ folded: !navOpen }">
      <!-- 收起/展开共用一个按钮: 收起后侧栏变图标栏(悬停图标有文字说明), 再点一次展开 -->
      <button
        class="nav-fold"
        type="button"
        :title="navOpen ? '收起导航：收起后只保留图标栏，鼠标悬停图标可查看功能说明' : '展开导航'"
        :aria-label="navOpen ? '收起导航' : '展开导航'"
        @click="toggleNav"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m14 6-6 6 6 6" />
        </svg>
      </button>

      <div class="brand">
        <span class="brand-logo">
          <svg viewBox="0 0 24 24" class="brand-icon" aria-hidden="true">
            <path
              d="M12 20s-7-4.6-7-9.4A4 4 0 0 1 12 7a4 4 0 0 1 7 3.6C19 15.4 12 20 12 20Z"
              fill="currentColor"
            />
          </svg>
          拾光
        </span>
        <span class="brand-sub">我的数字记忆空间</span>
      </div>

      <nav class="index-nav">
        <!-- ★ 「首页」这一项已按需求删除(2026-10-27)：home.vue 整页下线，
             进站直接落到「我的记忆空间」。 -->
        <button
          class="nav-item"
          :class="{ active: activeName === 'space' }"
          type="button"
          title="我的记忆空间"
          @click="go('space')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="m5 17 4.5-4.5 3 3L16 12l3 3" />
          </svg>
          我的记忆空间
        </button>

        <button
          class="nav-item"
          :class="{ active: activeName === 'memory' }"
          type="button"
          title="记忆库"
          @click="go('memory')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <ellipse cx="12" cy="6" rx="8" ry="3" />
            <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
            <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
          </svg>
          记忆库
        </button>

        <button
          class="nav-item"
          :class="{ active: activeName === 'square' }"
          type="button"
          title="拾光广场"
          @click="go('square')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
          </svg>
          拾光广场
        </button>

        <button
          class="nav-item"
          :class="{ active: activeName === 'privacy' }"
          type="button"
          title="隐私设置"
          @click="go('privacy')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path
              d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"
            />
          </svg>
          隐私设置
        </button>

        <button
          class="nav-item"
          :class="{ active: activeName === 'feedback' }"
          type="button"
          title="问题反馈"
          @click="go('feedback')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.7-3.4A8.5 8.5 0 1 1 21 11.5Z" />
            <path d="M12 8v4.5M12 15.5v.5" />
          </svg>
          问题反馈
        </button>

        <!-- 个人中心不再占导航位: 入口统一收进左下角账号区(点头像/昵称即进) -->

        <button
          v-if="isAdmin"
          class="nav-item"
          :class="{ active: activeName === 'admin' }"
          type="button"
          title="管理中心"
          @click="go('admin')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2Z" />
          </svg>
          管理中心
        </button>
      </nav>

      <!-- 左下角账号区 = 个人中心的唯一入口(导航栏里那一项已移除) -->
      <div class="side-user" title="个人中心" @click="go('profile')">
        <span class="avatar">
          <!-- 没上传头像时用默认橘猫（见 src/data/avatar.js），不再是一块空渐变 -->
          <img :src="avatarOf(auth.profile)" alt="" />
        </span>
        <div class="user-meta">
          <span class="user-name">{{ displayName }}</span>
          <span class="user-sub">个人中心</span>
        </div>
      </div>
    </aside>

    <!-- 右侧内容区: 占 4/5, 子路由页面仅在此切换, 左侧导航保持不变 -->
    <main class="index-main">
      <router-view v-slot="{ Component }">
        <!-- 不能用 mode="out-in": 实测它会卡住 —— 进出岛屿页后内容区停在空注释节点,
             且之后所有子路由切换都不再渲染(加 :key 也无效)。改成默认的交叉淡化,
             两个页面都是 absolute 铺满, 0.3s 重叠看不出来, 反而更顺。 -->
        <Transition name="sub">
          <component :is="Component" />
        </Transition>
      </router-view>
    </main>

    <!-- 右上角私信铃铛: 原先挂在左侧导航里, 现挪到右上角; 未读数仍走同一个 dmUnread -->
    <button
      v-if="auth.isLogin"
      class="idx-bell"
      :class="{ alert: dmUnread > 0 }"
      type="button"
      title="私信"
      aria-label="私信"
      @click="openDmPanel"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 8.5a6 6 0 1 0-12 0c0 6.4-2.6 8.5-2.6 8.5h17.2S18 14.9 18 8.5" />
        <path d="M13.8 20.5a2.1 2.1 0 0 1-3.6 0" />
      </svg>
      <span v-if="dmUnread > 0" class="idx-bell-badge">{{ dmUnread > 99 ? '99+' : dmUnread }}</span>
    </button>

    <!-- 全局常驻: AI 陪伴面板与游走宠物, 所有子页面共享 -->
    <div v-if="companion.showAi" class="ai-fixed" @pointerdown.stop>
      <AiCompanion @close="companion.closeAi" />
    </div>
    <PetCompanion v-if="companion.petEnabled" />

    <!-- 私信面板 -->
    <div v-if="showDmPanel" class="dm-overlay" @click.self="showDmPanel = false">
      <div class="dm-panel">
        <div class="dm-panel-head">
          <h3>私信</h3>
          <div class="dm-panel-actions">
            <button class="dm-action-btn" type="button" @click="confirmDeleteAll" title="删除全部">🗑 全部删除</button>
            <button class="dm-panel-close" type="button" @click="showDmPanel = false">&times;</button>
          </div>
        </div>
        <!-- 收发切换标签 -->
        <div class="dm-tabs">
          <button class="dm-tab" :class="{ active: dmTab === 'received' }" type="button" @click="dmTab = 'received'">收到的 ({{ receivedDmList.length }})</button>
          <button class="dm-tab" :class="{ active: dmTab === 'sent' }" type="button" @click="dmTab = 'sent'">发出的 ({{ sentDmList.length }})</button>
        </div>
        <div class="dm-panel-body">
          <div v-if="!filteredDmList.length" class="dm-empty">暂无私信</div>
          <div v-for="msg in filteredDmList" :key="msg.id" class="dm-msg" :class="{ unread: unreadIds.includes(msg.id) }">
            <div class="dm-msg-head">
              <span class="dm-msg-from"><i v-if="unreadIds.includes(msg.id)" class="dm-new">新</i>{{ dmTab === 'received' ? (msg.sender_nickname || msg.sender_username || '未知用户') : (msg.receiver_nickname || msg.receiver_username || '未知用户') }}</span>
              <span class="dm-msg-time">{{ fmtDmTime(msg.created_at) }}</span>
            </div>
            <p class="dm-msg-text">{{ msg.content }}</p>
            <div class="dm-msg-actions">
              <button class="dm-action-btn del" type="button" @click="deleteOnePm(msg.id)">删除</button>
              <button class="dm-action-btn reply" type="button" @click="openReply(msg)">回复</button>
            </div>
            <!-- 回复输入框 -->
            <div v-if="msg.replying" class="dm-reply-box">
              <input v-model="msg.replyText" type="text" placeholder="输入回复内容..." @keyup.enter="sendReply(msg)" />
              <button class="dm-reply-send" type="button" @click="sendReply(msg)">发送</button>
              <button class="dm-reply-cancel" type="button" @click="msg.replying = false">取消</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 自定义确认弹窗 -->
    <div v-if="confirmModal.show" class="dm-confirm-overlay" @click.self="confirmModal.show = false">
      <div class="dm-confirm">
        <p>{{ confirmModal.message }}</p>
        <div class="dm-confirm-foot">
          <button class="dm-confirm-btn cancel" type="button" @click="confirmModal.show = false">取消</button>
          <button class="dm-confirm-btn confirm" type="button" @click="executeConfirm">确定</button>
        </div>
      </div>
    </div>

    <!-- 新私信提示: 粘性横幅, 不自动消失 —— 收到后一直提醒, 直到点开私信或手动关掉。
         原来它和普通操作反馈共用 3.6 秒自动消失的 toast, 用户一低头就错过了。 -->
    <div v-if="dmNotice" class="idx-notice" role="status">
      <span class="idx-notice-dot"></span>
      <p>{{ dmNotice }}</p>
      <button type="button" class="idx-notice-go" @click="openDmPanel">查看</button>
      <button type="button" class="idx-notice-x" aria-label="关闭" @click="dmNotice = ''">
        ×
      </button>
    </div>

    <!-- 全局轻提示: 私信的收发/删除反馈 -->
    <p v-if="toast" class="idx-toast">{{ toast }}</p>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCompanionStore } from '@/stores/companion'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { useSpacePrefsStore } from '@/stores/spacePrefs'
import { cloudApi } from '@/api/cloud'
import { avatarOf } from '@/data/avatar'
import AiCompanion from './aiCompanion.vue'
import PetCompanion from './petCompanion.vue'

const emit = defineEmits(['back'])

const companion = useCompanionStore()
const auth = useCloudAuthStore()
const spacePrefs = useSpacePrefsStore()

// 登录态/账号变化时拉取空间偏好并全局生效(动效/氛围/背景音乐/环境音)
// 顺带兜底: 只有 token 而没有 user(刷新页面后还没拉过资料)时补一次, 否则左下角昵称是空的
watch(
  [() => auth.isLogin, () => auth.user?.id],
  ([login, uid]) => {
    if (login && !uid) auth.refresh()
    spacePrefs.load()
  },
  { immediate: true },
)

// 管理员判断: 直接用 computed 追踪 auth.user.role, 避免 getter 异步不触发
const isAdmin = computed(() => !!(auth.user && auth.user.role))

const router = useRouter()
const route = useRoute()

// 当前子路由名, 用于左侧导航高亮
const activeName = computed(() => router.currentRoute.value.name)

// 左下角显示的昵称: 与个人中心同源(都读 auth.user), 在个人中心改完会立刻跟着变
const displayName = computed(
  () => auth.user?.nickname || auth.user?.username || '小拾光',
)

// ---- 左侧导航收起/展开: 单按钮控制, 状态存 localStorage; 收起后是图标栏(悬停图标看说明) ----
const NAV_OPEN_KEY = 'tp:nav-open'
const navOpen = ref(localStorage.getItem(NAV_OPEN_KEY) !== '0')
function toggleNav() {
  navOpen.value = !navOpen.value
  try {
    localStorage.setItem(NAV_OPEN_KEY, navOpen.value ? '1' : '0')
  } catch {}
}

// 收起后的图标栏不需要任何动态装饰(原星屑粒子/云朵/底图已按要求移除)

// 切换右侧子路由页面
function go(name) {
  router.push({ name })
}

// 私信面板
const showDmPanel = ref(false)
const dmList = ref([])
const dmUnread = ref(0)
const dmTab = ref('received') // received | sent
// 打开面板那一刻仍然未读的消息 id: 用于在列表里标出"哪条是新的"
const unreadIds = ref([])

// 新私信提示: 粘性, 只有用户查看(打开私信面板)或手动关掉才消失
const dmNotice = ref('')

// 轻提示: 私信相关的操作反馈都走它(原来这些操作全是静默的, 用户不知道成没成); 自动消失
const toast = ref('')
let toastTimer = null
function tipGlobal(text) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 3600)
}

async function loadDmList() {
  if (!auth.isLogin) return
  try {
    const list = await cloudApi.listPm()
    dmList.value = list || []
    // 注意: 必须赶在 markRead 之前取未读 id, 否则列表里就再也标不出新消息了
    unreadIds.value = (list || [])
      .filter((m) => !m.is_read && m.receiver_id === auth.user?.id)
      .map((m) => m.id)
  } catch (e) {
    console.error('加载私信失败:', e.message)
  }
}

const receivedDmList = computed(() => dmList.value.filter((m) => m.receiver_id === auth.user?.id))
const sentDmList = computed(() => dmList.value.filter((m) => m.sender_id === auth.user?.id))
const filteredDmList = computed(() => (dmTab.value === 'received' ? receivedDmList.value : sentDmList.value))

// ---- 未读轮询: 别人发来私信时页面上要有提示 ----
// 原来只在 onMounted 拉一次, 之后收到新私信完全没有感知; 这里改成定时轮询,
// 且只在"登录 + 标签页可见"时跑, 后台标签页不必持续骚扰后端。
// ★ 2026-10-20 用户反馈"收到新消息没有提示 / 实时性太差":
//   间隔从 30s 压到 8s, 并且**窗口重新可见、切换路由回来时立刻刷一次**。
// ★ 2026-10-27 性能：8s → 15s。实时性的关键路径其实是"切回页面立即刷新"，
//   15s 的轮询在停留期间最多多等 7 秒，但请求量砍掉一半（这是全站常驻的定时器）。
const DM_POLL_MS = 15000
let dmTimer = null

function startDmPoll() {
  stopDmPoll()
  if (!auth.isLogin) return
  dmTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshDmUnread()
  }, DM_POLL_MS)
}

function stopDmPoll() {
  if (dmTimer) {
    clearInterval(dmTimer)
    dmTimer = null
  }
}

async function refreshDmUnread() {
  if (!auth.isLogin) return
  const before = dmUnread.value
  try {
    const { count } = await cloudApi.pmUnreadCount()
    dmUnread.value = count
    if (count > before) {
      // 面板开着: 说明用户正盯着, 直接刷列表并顺手标记已读(看完就没有"新"了)
      if (showDmPanel.value) {
        await loadDmList()
        await clearDmUnread()
      } else {
        // 面板关着: 挂一条粘性提示(不会自己消失, 避免错过)
        dmNotice.value = `收到 ${count - before} 条新私信`
      }
    }
  } catch (e) {
    // 轮询失败不打扰用户, 只留日志
    console.error('加载未读失败:', e.message)
  }
}

async function loadDmUnread() {
  if (!auth.isLogin) return
  try {
    const { count } = await cloudApi.pmUnreadCount()
    dmUnread.value = count
  } catch (e) {
    console.error('加载未读失败:', e.message)
  }
}

// 打开私信面板: 先把未读 id 记下来, 再标记已读
async function openDmPanel() {
  showDmPanel.value = true
  dmTab.value = 'received'
  // 打开了就是看过了: 粘性提示在这里撤掉
  dmNotice.value = ''
  await loadDmList()
  clearDmUnread()
}

async function clearDmUnread() {
  if (!auth.isLogin) return
  try {
    await cloudApi.markPmRead({ user_id: 0 }) // 标记所有为已读
    dmUnread.value = 0
  } catch (e) {
    console.error('清除未读失败:', e.message)
  }
}

function fmtDmTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const pointerId = ref(null)
const startY = ref(0)
let lastY = 0
// 向下拖动超过屏幕高度的比例即返回欢迎页(不做跟手位移, 只在松手时判定)
const SWIPE_THRESHOLD = 0.22

function onPointerDown(event) {
  pointerId.value = event.pointerId
  startY.value = event.clientY
  lastY = event.clientY
  // 拖动过程中子元素可能被替换导致 pointerup 派发到 body, 所以在 window 上收尾
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onEnd)
  window.addEventListener('pointercancel', onEnd)
}

// 仅记录当前位置供松手判定, 不做任何视觉跟手
function onMove(event) {
  if (pointerId.value === event.pointerId) lastY = event.clientY
}

function onEnd(event) {
  if (pointerId.value !== event.pointerId) return
  cleanup()
  // 手机上纵向滚动列表会派发 pointercancel(内容区是 touch-action: pan-y),
  // 这不是返回手势, 必须忽略 —— 否则滚着滚着就被踢回欢迎页了。
  if (event.type === 'pointercancel') return
  // 触摸手势阈值放宽: 手指幅度天然比鼠标大, 免得误触
  const need = event.pointerType === 'touch' ? 0.38 : SWIPE_THRESHOLD
  // 只响应向下滑动
  if (lastY - startY.value >= window.innerHeight * need) {
    emit('back')
  }
}

function cleanup() {
  pointerId.value = null
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onEnd)
  window.removeEventListener('pointercancel', onEnd)
}

onUnmounted(() => {
  cleanup()
  stopDmPoll()
  clearTimeout(toastTimer)
  window.removeEventListener('visibilitychange', onDmVisibility)
  window.removeEventListener('focus', onDmFocus)
})

// 切回标签页 / 窗口重新获得焦点时马上刷一次未读, 不用等下一个轮询周期
function onDmVisibility() {
  if (document.visibilityState === 'visible') refreshDmUnread()
}
function onDmFocus() {
  refreshDmUnread()
}

// 页面加载: 拉一次未读, 并开始轮询新私信
onMounted(() => {
  refreshDmUnread()
  startDmPoll()
  window.addEventListener('visibilitychange', onDmVisibility)
  window.addEventListener('focus', onDmFocus)
})

// 左侧导航来回切换: index.vue 是常驻布局, 子路由切换不会重跑上面的 onMounted,
// 所以这里监听路由变化补一次刷新 —— 否则从别的页面切回来, 红点还是旧的。
watch(
  () => route.fullPath,
  () => {
    if (auth.isLogin) refreshDmUnread()
  },
)

// 登录/退出时启停轮询, 避免未登录也一直打接口
watch(
  () => auth.isLogin,
  (on) => {
    if (on) {
      startDmPoll()
      return
    }
    // 退出登录后不该残留上一个人的未读提醒
    stopDmPoll()
    dmNotice.value = ''
    dmUnread.value = 0
    unreadIds.value = []
  },
)

// 私信删除
async function deleteOnePm(id) {
  try {
    await cloudApi.deletePm({ id })
    dmList.value = dmList.value.filter((m) => m.id !== id)
    unreadIds.value = unreadIds.value.filter((x) => x !== id)
    tipGlobal('已删除这条私信')
  } catch (e) {
    tipGlobal(e.message || '删除失败')
  }
}

// 回复私信
function openReply(msg) {
  msg.replying = true
  msg.replyText = msg.replyText || ''
}

async function sendReply(msg) {
  const text = (msg.replyText || '').trim()
  if (!text) return
  if (!auth.isLogin) {
    auth.openAuth()
    return
  }
  try {
    await cloudApi.sendPm({ receiver_id: msg.sender_id, content: text })
    msg.replying = false
    msg.replyText = ''
    tipGlobal('回复已发送')
    // 重新拉一遍: 让「发出的」页签立刻能看到刚发出去的这条
    loadDmList()
  } catch (e) {
    tipGlobal(e.message || '回复失败')
  }
}

// 自定义确认弹窗
const confirmModal = ref({ show: false, message: '', action: null })

function confirmDeleteAll() {
  const dirLabel = dmTab.value === 'received' ? '收到的' : '发出的'
  confirmModal.value = {
    show: true,
    message: `确定要删除所有${dirLabel}私信吗？`,
    action: async () => {
      try {
        const direction = dmTab.value
        await cloudApi.deletePm({ id: 0, direction })
        dmList.value = dmList.value.filter((m) =>
          direction === 'received' ? m.receiver_id !== auth.user?.id : m.sender_id !== auth.user?.id
        )
        if (direction === 'received') {
          // 收件箱清空后未读自然归零, 列表里的「新」标记也一并撤掉
          dmUnread.value = 0
          unreadIds.value = []
        }
        tipGlobal(`已删除全部${dirLabel}私信`)
      } catch (e) {
        tipGlobal(e.message || '删除失败')
      }
    },
  }
}

function executeConfirm() {
  if (confirmModal.value.action) confirmModal.value.action()
  confirmModal.value.show = false
}
</script>

<style scoped>
/* 让 padding 计入宽度, 保证左右严格 1:4 */
.index,
.index * {
  box-sizing: border-box;
}

.index {
  position: absolute;
  inset: 0;
  display: flex;
  overflow: hidden;
  touch-action: none;
  background: #f7f8fa;
}

/* 左侧文字区: 占 1/5 */
.index-side {
  flex: 0 0 15%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 28px 20px;
  background: #fbfcfe;
  border-right: 1px solid #eef0f4;
}

.brand {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #2b3440;
}

.brand-icon {
  width: 20px;
  height: 20px;
  color: #ff9db1;
}

.brand-sub {
  font-size: 14.5px;
  letter-spacing: 1px;
  color: #9aa3af;
}

.index-nav {
  margin-top: 36px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #5a6472;
  font-size: 17px;
  letter-spacing: 1px;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.nav-item svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-item:hover {
  background: #f1f4f8;
}
/* 点击 nav-item 时, 背景和文字颜色变深, 字体加粗 */
.nav-item.active {
  background: #e8f1fd;
  color: #3d7bfd;
  font-weight: 600;
}

/* 右上角私信铃铛(原先挂在左侧导航里, 现移到右上角) */
.idx-bell {
  /* 下移避开首页右上角的「相伴第 X 天」徽标(原 22px 与其重叠) */
  position: fixed;
  top: 64px;
  right: 28px;
  z-index: 900;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(61, 123, 253, 0.16);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: #5b6b86;
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s,
    transform 0.2s;
}

.idx-bell:hover {
  color: #3d7bfd;
  border-color: rgba(61, 123, 253, 0.45);
  transform: translateY(-1px);
}

.idx-bell svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 有未读时变暖色并轻轻摆动, 比单纯一个红点更容易被注意到 */
.idx-bell.alert {
  color: #e0865a;
  border-color: rgba(224, 134, 90, 0.45);
}

.idx-bell.alert svg {
  animation: bellShake 2.4s ease-in-out infinite;
  transform-origin: 50% 12%;
}

@keyframes bellShake {
  0%,
  70%,
  100% {
    transform: rotate(0);
  }
  75% {
    transform: rotate(9deg);
  }
  80% {
    transform: rotate(-8deg);
  }
  85% {
    transform: rotate(6deg);
  }
  90% {
    transform: rotate(-4deg);
  }
  95% {
    transform: rotate(2deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .idx-bell.alert svg {
    animation: none;
  }
}

.idx-bell-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border: 2px solid #fff;
  border-radius: 9px;
  background: #f05050;
  color: #fff;
  font-size: 12px;
  line-height: 13px;
  text-align: center;
}

.side-user {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd9a0, #ff9db1);
  overflow: hidden;
  flex: none;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-meta {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 15.5px;
  color: #2b3440;
}

.user-sub {
  font-size: 13px;
  color: #9aa3af;
}

/* 右侧内容区: 占满侧栏之外的剩余空间(侧栏收起时自动变宽) */
.index-main {
  flex: 1 1 auto;
  position: relative;
  min-width: 0;
  overflow: hidden;
  /* 与背景图上下边缘色调接近, 完整显示时的留边能自然融入 */
  background: linear-gradient(180deg, #cfe2f6 0%, #f6e7ea 100%);
}

/* 子路由切换: 淡入+轻微上浮/沉降, 替代硬切 */
.sub-enter-active,
.sub-leave-active {
  transition:
    opacity 0.3s cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.sub-enter-from {
  opacity: 0;
  transform: translateY(18px) scale(0.99);
}

.sub-leave-to {
  opacity: 0;
  transform: translateY(-14px) scale(0.99);
}

/* AI 陪伴面板: 布局层固定悬浮, 各页面呼出位置一致 */
.ai-fixed {
  position: fixed;
  right: 3%;
  top: 8%;
  z-index: 70;
  width: 30%;
  height: 72%;
}

/* ---- 导航收起/唤出 ---- */
.index-side {
  position: relative;
  transition: flex-basis 0.32s ease;
}

.nav-fold {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  /* 收起按钮之前是 26px 的透明方块, 贴在白底侧栏里几乎看不见 */
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  border: 1px solid rgba(61, 123, 253, 0.18);
  background: rgba(255, 255, 255, 0.94);
  color: #3d7bfd;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(31, 45, 61, 0.1);
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.nav-fold:hover {
  background: #eef4ff;
  color: #2f6bef;
  transform: translateY(-1px);
}

.nav-fold svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.index-side.folded .nav-fold svg {
  transform: rotate(180deg);
}

/* 收起态: 侧栏变窄成图标栏; 品牌区隐藏, 导航与账号区只留图标(悬停有文字说明) */
.index-side.folded {
  flex-basis: 68px;
}

.index-side.folded .brand {
  display: none;
}

.index-side.folded .index-nav {
  margin-top: 32px;
  align-items: center;
  gap: 6px;
}

/* font-size:0 隐藏裸文字节点, 只剩定宽 svg 图标; 悬停 title 提供功能说明 */
.index-side.folded .nav-item {
  font-size: 0;
  gap: 0;
  justify-content: center;
  width: 44px;
  padding: 11px 0;
  border-radius: 12px;
}

.index-side.folded .nav-item svg {
  width: 20px;
  height: 20px;
}

/* 悬停提示: 原生 title 要等约 1 秒才弹且常被浏览器吞掉, 收起态改用自绘气泡, 悬停立即显示 */
.index-side.folded .nav-item,
.index-side.folded .side-user {
  position: relative;
}

.index-side.folded .nav-item:hover::after,
.index-side.folded .nav-item:focus-visible::after,
.index-side.folded .side-user:hover::after {
  content: attr(title);
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  translate: 0 -50%;
  z-index: 60;
  padding: 7px 14px;
  border-radius: 9px;
  border: 1px solid rgba(61, 123, 253, 0.22);
  background: rgba(255, 255, 255, 0.97);
  color: #3a4656;
  font-size: 13px;
  letter-spacing: 1px;
  white-space: nowrap;
  box-shadow: 0 6px 18px rgba(31, 45, 61, 0.16);
  pointer-events: none;
  animation: nav-tip-in 0.16s ease;
}

@keyframes nav-tip-in {
  from {
    opacity: 0;
    translate: -4px -50%;
  }

  to {
    opacity: 1;
    translate: 0 -50%;
  }
}

.index-side.folded .side-user {
  justify-content: center;
  padding-bottom: 10px;
}

.index-side.folded .user-meta {
  display: none;
}

/* 字号调大后导航项不换行, 防止侧栏被撑变形 */
.nav-item {
  white-space: nowrap;
}

/* 窄屏: 左侧导航折叠为图标栏, 避免 15% 侧栏文字被裁切
   ★ 2026-10-28 手机整改：断点统一到 767.98（原来是 760，跟 App.vue 的 760 差一像素口径，
     760~768 之间会两边都不生效）。核心问题是**图标栏里的按钮只有 24×38**：
     `.index-side` 的 align-items:center 让 `.index-nav` 收缩到内容宽，按钮的 width:100%
     于是只剩图标宽 —— 指尖点十次中三次。这里把导航列撑满、按钮做成 44×44 的标准热区。 */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  .index-side {
    flex: 0 0 56px;
    align-items: center;
    padding: 14px 6px calc(14px + env(safe-area-inset-bottom));
    /* 横屏刘海机: 左侧安全区 */
    padding-left: max(6px, env(safe-area-inset-left));
  }

  .brand {
    align-items: center;
  }

  /* 品牌名和副标题在 56px 里放不下, 只留那颗心形图标当锚点 */
  .brand-logo {
    font-size: 0;
    gap: 0;
    justify-content: center;
  }

  .brand-icon {
    width: 22px;
    height: 22px;
  }

  .brand-sub,
  .user-meta {
    display: none;
  }

  /* ★ 关键：让导航列撑满侧栏宽度，按钮的 width:100% 才有意义 */
  .index-nav {
    width: 100%;
    margin-top: 12px;
    align-items: center;
    gap: 6px;
  }

  .nav-item {
    width: 44px;
    height: 44px;
    padding: 0;
    justify-content: center;
    font-size: 0;
    gap: 0;
    border-radius: 12px;
  }

  .nav-item svg {
    width: 22px;
    height: 22px;
  }

  .nav-fold {
    width: 44px;
    height: 44px;
    flex: none;
  }

  /* 私信铃铛：桌面固定在右上角（top 64 / right 28），手机上正好压在各页标题条和
     管理中心的 Tab 上。这里挪进左侧图标栏、沉到底部（头像上方），彻底让开内容区。
     同理 App.vue 里那条 top:14/right:14 的全局规则也被这里的 scoped 优先级覆盖。 */
  .idx-bell {
    left: 6px;
    right: auto;
    top: auto;
    bottom: calc(78px + env(safe-area-inset-bottom));
    width: 44px;
    height: 44px;
  }

  /* 私信铃铛：桌面固定在右上角（top 64 / right 28），手机上正好压在各页标题条和
     管理中心的 Tab 上。这里挪进左侧图标栏、沉到底部（头像上方），彻底让开内容区。
     同理 App.vue 里那条 top:14/right:14 的全局规则也被这里的 scoped 优先级覆盖。 */
  .idx-bell {
    left: 6px;
    right: auto;
    top: auto;
    bottom: calc(78px + env(safe-area-inset-bottom));
    width: 44px;
    height: 44px;
  }

  .side-user {
    justify-content: center;
    margin-top: auto;
    padding: 6px 0;
  }

  /* 悬停气泡在触屏上是"点一下才消失"的遮挡物, 手机上关掉（title 仍在，长按可看） */
  .index-side.folded .nav-item:hover::after,
  .index-side.folded .nav-item:focus-visible::after,
  .index-side.folded .side-user:hover::after {
    content: none;
  }
}

/* 确认弹窗: z-index 必须高于私信面板(2000), 否则它会被整个盖住 —— 
   之前这里没有样式, 于是点「全部删除」后确认框既没定位又被遮住, 用户以为按钮坏了 */
.dm-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.dm-confirm {
  width: 88%;
  max-width: 320px;
  padding: 22px 20px 16px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;
}

.dm-confirm p {
  margin: 0 0 18px;
  color: #4a3f37;
  font-size: 17px;
  line-height: 1.6;
}

.dm-confirm-foot {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.dm-confirm-btn {
  flex: 1;
  padding: 8px 0;
  border: none;
  border-radius: 999px;
  font-size: 15.5px;
  cursor: pointer;
}

.dm-confirm-btn.cancel {
  background: #f4efe9;
  color: #8a7a6d;
}

.dm-confirm-btn.confirm {
  background: #f0917c;
  color: #fff;
}

.dm-confirm-btn.confirm:hover {
  background: #e57e67;
}

/* 私信面板 */
.dm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dm-panel {
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  max-height: 70vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cpath d='M100 20 L100 180 M100 60 Q70 40 60 70 Q50 100 70 110 Q60 130 80 140 Q70 160 90 170 M100 80 Q130 60 140 90 Q150 120 130 130 Q140 150 120 160 Q130 180 110 190' stroke='%23d4c5b0' stroke-width='2' fill='none' opacity='0.3'/%3E%3C/svg%3E");
  background-position: bottom right;
  background-size: 150px;
  background-repeat: no-repeat;
}

.dm-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0ebe5;
}

.dm-panel-head h3 {
  margin: 0;
  font-size: 17.5px;
  color: #4a3f37;
}

.dm-panel-close {
  border: none;
  background: transparent;
  font-size: 24px;
  color: #b3a79b;
  cursor: pointer;
  padding: 0 4px;
}

.dm-panel-close:hover {
  color: #8a7a6d;
}

.dm-panel-body {
  padding: 16px 20px;
  max-height: 50vh;
  overflow-y: auto;
}

.dm-tabs {
  display: flex;
  gap: 8px;
  padding: 0 20px;
}

.dm-tab {
  flex: 1;
  padding: 7px 16px;
  border: 1px solid #eadfd2;
  border-radius: 999px;
  background: #fff;
  color: #8a7a6d;
  font-size: 14.5px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.dm-tab.active {
  background: #f0917c;
  color: #fff;
  border-color: #f0917c;
}

.dm-empty {
  text-align: center;
  padding: 30px 0;
  color: #b3a79b;
  font-size: 15.5px;
}

.dm-msg {
  padding: 12px 0;
  border-bottom: 1px solid #f5f0eb;
}

/* 未读的私信: 打开面板时标出来, 让用户知道刚收到的哪条是新的 */
.dm-msg.unread {
  padding-left: 10px;
  border-radius: 8px;
  background: #fff7f0;
  box-shadow: inset 3px 0 0 #f0917c;
}

.dm-new {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #f0917c;
  color: #fff;
  font-size: 12px;
  font-style: normal;
  vertical-align: 1px;
}

/* 新私信提示: 粘性横幅(不自动消失), 停在底部居中, 层级与私信面板之上 */
.idx-notice {
  position: fixed;
  left: 50%;
  bottom: 104px;
  z-index: 2400;
  display: flex;
  align-items: center;
  gap: 10px;
  transform: translateX(-50%);
  padding: 10px 12px 10px 16px;
  border-radius: 999px;
  background: #fffdf9;
  box-shadow: 0 14px 34px rgba(90, 70, 40, 0.3);
  animation: idx-toast-in 0.24s ease both;
}

.idx-notice-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f0917c;
  animation: idx-notice-blink 1.4s ease-in-out infinite;
}

@keyframes idx-notice-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.25;
  }
}

.idx-notice p {
  margin: 0;
  color: #4a3f37;
  font-size: 15.5px;
  letter-spacing: 1px;
}

.idx-notice-go {
  padding: 5px 14px;
  border: none;
  border-radius: 999px;
  background: #f0917c;
  color: #fff;
  font-size: 14.5px;
  cursor: pointer;
}

.idx-notice-go:hover {
  background: #e0865a;
}

.idx-notice-x {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #b3a396;
  font-size: 17.5px;
  line-height: 1;
  cursor: pointer;
}

.idx-notice-x:hover {
  color: #e0865a;
}

/* 全局轻提示 */
.idx-toast {
  position: fixed;
  left: 50%;
  bottom: 54px;
  z-index: 2200;
  transform: translateX(-50%);
  margin: 0;
  padding: 10px 18px;
  border-radius: 999px;
  background: rgba(74, 63, 55, 0.92);
  color: #fff;
  font-size: 15.5px;
  box-shadow: 0 12px 30px rgba(60, 48, 38, 0.28);
  animation: idx-toast-in 0.24s ease both;
}

@keyframes idx-toast-in {
  from {
    opacity: 0;
    transform: translate(-50%, 10px);
  }

  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.dm-msg:last-child {
  border-bottom: none;
}

.dm-msg-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.dm-msg-from {
  font-size: 14.5px;
  font-weight: 600;
  color: #4a3f37;
}

.dm-msg-time {
  font-size: 12px;
  color: #b3a79b;
}

.dm-msg-text {
  margin: 0;
  font-size: 14.5px;
  color: #6b5d52;
  line-height: 1.5;
}

.dm-msg-title {
  font-size: 12px;
  color: #a08060;
  background: #f5ebe0;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
}

.dm-msg.saved {
  background: #faf6f0;
  border-left: 3px solid #d4a574;
}

.dm-msg-reply {
  margin-top: 6px;
  padding: 6px 10px;
  background: #f0ebe4;
  border-radius: 6px;
  font-size: 13px;
  color: #8b7355;
}

.reply-label {
  font-weight: 600;
  margin-right: 4px;
}

.dm-msg-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.dm-action-btn {
  padding: 3px 10px;
  font-size: 12px;
  border: 1px solid #d4c4b0;
  background: #fff;
  color: #8b7355;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.dm-action-btn:hover {
  background: #f5ebe0;
  border-color: #c4a882;
}

.dm-action-btn.del {
  color: #c75b5b;
  border-color: #e8c4c4;
}

.dm-action-btn.del:hover {
  background: #fdf0f0;
}

.dm-reply-input {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.dm-reply-input input {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid #d4c4b0;
  border-radius: 4px;
  background: #fff;
  outline: none;
}

.dm-reply-input input:focus {
  border-color: #c4a882;
}

.dm-reply-send {
  padding: 6px 12px;
  font-size: 13px;
  background: #d4a574;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.dm-reply-send:hover {
  background: #c4945f;
}

.dm-reply-cancel {
  padding: 6px 12px;
  font-size: 13px;
  background: #e8e0d8;
  color: #6b5d52;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.dm-reply-cancel:hover {
  background: #d8d0c8;
}
</style>
