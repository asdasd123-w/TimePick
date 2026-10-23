<template>
  <!-- card=true 时是一张独立卡片（旧布局用）；card=false 时只留弹窗，
       入口由调用方自己在列表里给（「我的 → 其他设置 → 拾光云备份」） -->
  <div v-if="card" class="cp-card">
    <div class="cp-card-head">
      <span class="cp-card-title">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.5 18.5h11a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.3 9.6a4.5 4.5 0 0 0-.8 8.9Z" />
        </svg>
        拾光云
      </span>
      <span class="cp-badge" :class="session ? 'on' : ''">{{ session ? '已连接' : '未连接' }}</span>
    </div>
    <span class="cp-card-sub">
      {{
        session
          ? `云账号 ${displayName}，记忆可以随时备份、换设备找回。`
          : '登录云账号，把记忆备份到云端，换一台设备也能找回。'
      }}
    </span>
    <button class="cp-enter" type="button" @click="openPanel">
      {{ session ? '管理云备份' : '登录云账号 / 备份' }}
    </button>
  </div>

  <div v-if="open" class="cp-overlay" @click.self="closePanel">
    <div class="cp-modal">
      <div class="cp-head">
        <div class="cp-head-text">
          <h3>拾光云</h3>
          <span>记忆云端备份 · 跨设备找回</span>
        </div>
        <button class="cp-close" type="button" @click="closePanel">&times;</button>
      </div>

      <!-- 云服务不可用（本地账号与其它功能不受影响） -->
      <div v-if="!cloudReady" class="cp-body">
        <p class="cp-tip">云服务暂时不可用，本地功能与账号不受影响。</p>
      </div>

      <!-- 未登录：手机号验证码 + 微信登录 -->
      <div v-else-if="!session" class="cp-body">
        <p class="cp-tip">用手机号或微信登录云账号。云账号只用于存放备份，不影响你现在的拾光账号。</p>

        <div class="cp-field">
          <label>手机号</label>
          <input
            v-model="phone"
            type="tel"
            inputmode="numeric"
            maxlength="11"
            placeholder="请输入 11 位手机号"
            autocomplete="tel"
            @input="onPhoneInput"
          />
        </div>
        <p v-if="phoneError" class="cp-err">{{ phoneError }}</p>

        <div class="cp-field cp-field-code">
          <label>验证码</label>
          <div class="cp-code-row">
            <input
              v-model="code"
              type="text"
              inputmode="numeric"
              maxlength="6"
              placeholder="6 位验证码"
              autocomplete="one-time-code"
            />
            <button
              class="cp-code-btn"
              type="button"
              :disabled="sending || countdown > 0"
              @click="sendCode"
            >
              {{ countdown > 0 ? countdown + 's' : sending ? '发送中…' : '获取验证码' }}
            </button>
          </div>
        </div>

        <button class="cp-primary" type="button" :disabled="verifying || !code" @click="submitCode">
          {{ verifying ? '登录中…' : '登录 / 注册' }}
        </button>

        <div class="cp-or"><span>或</span></div>

        <button class="cp-wechat" type="button" :disabled="oauthBusy" @click="loginByWechat">
          <svg class="cp-wx-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M9.2 3C5.2 3 2 5.7 2 9c0 1.9 1 3.5 2.7 4.7l-.7 2.2 2.5-1.3c.5.1 1 .2 1.6.2.3 0 .6 0 .9-.1a4.9 4.9 0 0 1-.2-1.3c0-3.1 2.9-5.6 6.5-5.6h.3C15 5 12.4 3 9.2 3Zm-2.4 3.2a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Zm4.8 0a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Z"
            />
            <path
              fill="currentColor"
              d="M22 13.2c0-2.7-2.6-4.8-5.8-4.8s-5.8 2.1-5.8 4.8 2.6 4.8 5.8 4.8c.7 0 1.3-.1 1.9-.3l2.1 1.1-.5-1.9c1.4-.9 2.3-2.2 2.3-3.7Zm-7.8-1.2a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Zm4.2 0a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Z"
            />
          </svg>
          {{ oauthBusy ? '正在跳转…' : '微信登录' }}
        </button>

        <p v-if="error" class="cp-err cp-err-block">{{ error }}</p>
      </div>

      <!-- 已登录 -->
      <div v-else class="cp-body">
        <div class="cp-user">
          <span class="cp-avatar">{{ displayName.slice(0, 1) }}</span>
          <div class="cp-user-text">
            <strong>{{ displayName }}</strong>
            <span>{{ maskId(session.user?.id) }}</span>
          </div>
          <button class="cp-logout" type="button" @click="logout">退出</button>
        </div>

        <button class="cp-primary" type="button" :disabled="backingUp" @click="doBackup">
          {{ backingUp ? '正在备份…' : '把当前记忆备份到云端' }}
        </button>

        <div v-if="lastBackup" class="cp-result">
          已备份 {{ lastBackup.row?.item_count ?? lastBackup.snapshot.items.length }} 条记忆 /
          {{ lastBackup.row?.space_count ?? lastBackup.snapshot.spaces.length }} 座岛屿
          <a v-if="lastBackup.downloadUrl" :href="lastBackup.downloadUrl" target="_blank" rel="noopener">
            下载备份文件
          </a>
        </div>

        <div class="cp-list-head">
          <span>云端备份（{{ listState }}）</span>
          <button class="cp-mini" type="button" :disabled="loadingList" @click="refreshList">
            {{ loadingList ? '刷新中…' : '刷新' }}
          </button>
        </div>

        <p v-if="!loadingList && !backups.length" class="cp-tip cp-empty">
          还没有云备份。点上面的按钮，把当前的记忆存一份到云端。
        </p>

        <ul v-else class="cp-list">
          <li v-for="b in backups" :key="b.id" class="cp-item">
            <div class="cp-item-main">
              <span class="cp-item-title">{{ b.title }}</span>
              <span class="cp-item-sub">
                {{ b.item_count }} 条记忆 / {{ b.space_count }} 座岛屿 ·
                {{ formatTime(b.created_at) }}
              </span>
            </div>
            <div class="cp-item-actions">
              <button class="cp-mini" type="button" :disabled="busyId === b.id" @click="doRestore(b)">
                {{ busyId === b.id ? '恢复中…' : '恢复' }}
              </button>
              <button class="cp-mini danger" type="button" :disabled="busyId === b.id" @click="doRemove(b)">
                删除
              </button>
            </div>
          </li>
        </ul>

        <p v-if="progressText" class="cp-progress">{{ progressText }}</p>
        <p v-if="error" class="cp-err cp-err-block">{{ error }}</p>
        <p v-if="notice" class="cp-ok">{{ notice }}</p>

        <p class="cp-foot">
          备份只存你亲手写下的文字与媒体地址，按云账号隔离；恢复会新建岛屿，不会覆盖已有记忆。
        </p>
      </div>

      <!-- 应用内确认框: 不再用浏览器原生 confirm(系统样式和站点风格完全不搭, 手机上还容易被拦) -->
      <div v-if="ask.show" class="cp-ask-mask" @click.self="closeAsk(false)">
        <div class="cp-ask-box">
          <p class="cp-ask-title">{{ ask.title }}</p>
          <p class="cp-ask-text">{{ ask.text }}</p>
          <div class="cp-ask-actions">
            <button class="cp-ask-btn" type="button" @click="closeAsk(false)">取消</button>
            <button
              class="cp-ask-btn primary"
              :class="{ danger: ask.danger }"
              type="button"
              @click="closeAsk(true)"
            >
              {{ ask.okText }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { cloud, cloudErrorText, cloudReady, currentSession } from '@/cloud/client'
import {
  createBackup,
  listBackups,
  removeBackup,
  restoreBackup,
} from '@/cloud/backup'

// false = 不渲染顶部卡片，只提供弹窗（入口由父组件列表给）
defineProps({
  card: { type: Boolean, default: true },
})
const emit = defineEmits(['state'])

const route = useRoute()

const open = ref(false)
const session = ref(null)
const error = ref('')
const notice = ref('')

// 手机号登录
const phone = ref('')
const phoneError = ref('')
const code = ref('')
const sending = ref(false)
const verifying = ref(false)
const countdown = ref(0)
const pendingOtp = ref(null) // { phone, verificationId, isExistingUser }
const oauthBusy = ref(false)

// 备份
const backingUp = ref(false)
const loadingList = ref(false)
const backups = ref([])
const listState = ref('未加载')
const lastBackup = ref(null)
const busyId = ref(null)
const progressText = ref('')
const listLoaded = ref(false)

let timer = null

const displayName = computed(() => {
  const u = session.value?.user
  return u?.name || u?.phone || u?.email || '拾光用户'
})

function maskId(id) {
  if (!id) return ''
  const s = String(id)
  return s.length <= 8 ? s : `${s.slice(0, 4)}…${s.slice(-4)}`
}

function formatTime(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
    2,
    '0',
  )}`
}

function onPhoneInput() {
  phoneError.value = ''
}

function openPanel() {
  open.value = true
  error.value = ''
  notice.value = ''
  if (session.value && !listLoaded.value) refreshList()
}

// 父组件（我的 → 其他设置）要在列表行上标「已连接 / 未连接」，所以把登录态抛出去
watch(
  session,
  (v) => {
    emit('state', { connected: !!v, name: displayName.value })
  },
  { immediate: true },
)

// card=false 时父组件用 ref 调这个方法打开弹窗
defineExpose({ openPanel })

function closePanel() {
  open.value = false
  // 去掉 ?cloud=1，避免刷新后又弹一次
  if (route.query.cloud) {
    const url = new URL(location.href)
    url.searchParams.delete('cloud')
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }
}

async function loadSession() {
  session.value = await currentSession()
  if (session.value) await refreshList()
}

function startCountdown() {
  countdown.value = 60
  clearInterval(timer)
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) clearInterval(timer)
  }, 1000)
}

async function sendCode() {
  error.value = ''
  notice.value = ''
  const value = String(phone.value || '').trim()
  if (!/^1\d{10}$/.test(value)) {
    phoneError.value = '请输入正确的 11 位手机号'
    return
  }
  phoneError.value = ''
  if (!cloud) {
    error.value = '云服务未就绪'
    return
  }
  sending.value = true
  try {
    // 发码与验码是两个动作：这里只借发送结果，提交时不再发新码
    const { data, error: err } = await cloud.auth.sendOtp({ phone: value })
    if (err) {
      error.value = cloudErrorText(err, '验证码发送失败，请稍后再试')
      return
    }
    pendingOtp.value = {
      phone: value,
      verificationId: data.verificationId,
      isExistingUser: !!data.isExistingUser,
    }
    notice.value = '验证码已发送，请查收短信'
    startCountdown()
  } catch (e) {
    error.value = e?.message || '验证码发送失败，请稍后再试'
  } finally {
    sending.value = false
  }
}

async function submitCode() {
  error.value = ''
  notice.value = ''
  const pending = pendingOtp.value
  const value = String(phone.value || '').trim()
  if (!pending || pending.phone !== value) {
    error.value = '请先获取当前手机号的验证码'
    return
  }
  if (!cloud) return
  verifying.value = true
  try {
    const { data, error: err } = await cloud.auth.verifyOtp({
      phone: pending.phone,
      verificationId: pending.verificationId,
      isExistingUser: pending.isExistingUser,
      token: String(code.value || '').trim(),
    })
    if (err) {
      error.value = cloudErrorText(err, '验证码不正确或已过期')
      return
    }
    session.value = data
    pendingOtp.value = null
    code.value = ''
    notice.value = '云账号已登录'
    await refreshList()
  } catch (e) {
    error.value = e?.message || '登录失败，请稍后再试'
  } finally {
    verifying.value = false
  }
}

async function loginByWechat() {
  error.value = ''
  if (!cloud) return
  oauthBusy.value = true
  try {
    // 回调必须落在站点根路径：静态托管没有 history fallback，子路径会 404 丢掉 code
    const { data, error: err } = await cloud.auth.signInWithOAuth({
      provider: 'wechat',
      redirectTo: location.origin,
    })
    if (err) {
      error.value = cloudErrorText(err, '微信登录暂不可用')
      return
    }
    if (data?.url) location.assign(data.url)
  } catch (e) {
    error.value = e?.message || '微信登录暂不可用'
  } finally {
    oauthBusy.value = false
  }
}

async function logout() {
  if (!cloud) return
  try {
    await cloud.auth.signOut()
  } catch {}
  session.value = null
  backups.value = []
  listLoaded.value = false
  lastBackup.value = null
  notice.value = '已退出云账号'
}

async function refreshList() {
  if (!session.value) return
  loadingList.value = true
  listState.value = '加载中'
  try {
    backups.value = await listBackups()
    listLoaded.value = true
    listState.value = backups.value.length ? `${backups.value.length} 份` : '暂无'
  } catch (e) {
    listState.value = '读取失败'
    error.value = e?.message || '备份列表读取失败'
  } finally {
    loadingList.value = false
  }
}

async function doBackup() {
  error.value = ''
  notice.value = ''
  backingUp.value = true
  try {
    const result = await createBackup({})
    lastBackup.value = result
    notice.value = '备份完成，已保存到云端'
    await refreshList()
  } catch (e) {
    error.value = e?.message || '备份失败，请稍后再试'
  } finally {
    backingUp.value = false
  }
}

// ---- 应用内确认框: 替代浏览器原生 confirm ----
const ask = ref({ show: false, title: '', text: '', okText: '确定', danger: false })
let askResolve = null
function confirmAsk({ title, text, okText = '确定', danger = false }) {
  return new Promise((resolve) => {
    askResolve = resolve
    ask.value = { show: true, title, text, okText, danger }
  })
}
function closeAsk(ok) {
  ask.value = { ...ask.value, show: false }
  const r = askResolve
  askResolve = null
  if (r) r(ok)
}

async function doRestore(row) {
  const go = await confirmAsk({
    title: '恢复云备份',
    text: `把「${row.title}」恢复到你的拾光里？恢复会新建岛屿，不会覆盖已有记忆。`,
    okText: '开始恢复',
  })
  if (!go) return
  error.value = ''
  notice.value = ''
  busyId.value = row.id
  progressText.value = '正在读取云端备份…'
  try {
    const r = await restoreBackup(row.id, ({ createdItems, totalItems }) => {
      progressText.value = `正在恢复记忆 ${createdItems}/${totalItems}`
    })
    progressText.value = ''
    notice.value = `恢复完成：新建 ${r.spaces} 座岛屿，写入 ${r.items} 条记忆${
      r.skipped ? `，${r.skipped} 条失败` : ''
    }`
  } catch (e) {
    progressText.value = ''
    error.value = e?.message || '恢复失败，请稍后再试'
  } finally {
    busyId.value = null
  }
}

async function doRemove(row) {
  const go = await confirmAsk({
    title: '删除云备份',
    text: `删除云备份「${row.title}」？删除后无法找回。`,
    okText: '删除',
    danger: true,
  })
  if (!go) return
  error.value = ''
  notice.value = ''
  busyId.value = row.id
  try {
    const ok = await removeBackup(row.id)
    if (!ok) error.value = '这条备份不属于当前云账号，未删除'
    else notice.value = '已删除该备份'
    // ★ 删掉的正是「刚备份」的那一条（或云端已经一条不剩）时，上面那行
    // 「已备份 X 条记忆 / X 座岛屿」必须一起清掉，否则会留在界面上骗人
    if (ok && (lastBackup.value?.row?.id === row.id || !backups.value.length)) {
      lastBackup.value = null
    }
    await refreshList()
    if (ok && !backups.value.length) lastBackup.value = null
  } catch (e) {
    error.value = e?.message || '删除失败，请稍后再试'
  } finally {
    busyId.value = null
  }
}

onMounted(async () => {
  // 回调失败时可以把原因带回来（见 cloud/client.js）
  const cbError = sessionStorage.getItem('tp_cloud_error')
  if (cbError) {
    sessionStorage.removeItem('tp_cloud_error')
    error.value = cbError
  }
  await loadSession()
  if (route.query.cloud) open.value = true
})
</script>

<style scoped>
.cp-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 253, 250, 0.92);
  box-shadow: 0 8px 20px rgba(120, 90, 60, 0.12);
}

.cp-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cp-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14.5px;
  font-weight: 700;
  color: #4a3f37;
}

.cp-card-title svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: #e0865a;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.cp-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: #a08063;
  background: rgba(224, 134, 90, 0.12);
}

.cp-badge.on {
  color: #2f7d5b;
  background: rgba(74, 168, 122, 0.16);
}

.cp-card-sub {
  font-size: 12px;
  line-height: 1.6;
  color: #a08063;
}

.cp-enter {
  align-self: flex-start;
  padding: 7px 14px;
  border: 0;
  border-radius: 999px;
  font-size: 12.5px;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, #e79a6c, #d97a4f);
  box-shadow: 0 6px 14px rgba(217, 122, 79, 0.28);
}

.cp-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(40, 30, 22, 0.42);
  backdrop-filter: blur(3px);
}

.cp-modal {
  width: min(460px, 100%);
  max-height: 82vh;
  overflow: auto;
  border-radius: 18px;
  background: #fffdfa;
  box-shadow: 0 24px 60px rgba(60, 40, 25, 0.28);
}

.cp-head {
  position: sticky;
  top: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 18px 12px;
  background: #fffdfa;
  border-bottom: 1px solid rgba(224, 134, 90, 0.14);
}

.cp-head-text h3 {
  margin: 0;
  font-size: 16px;
  color: #4a3f37;
}

.cp-head-text span {
  font-size: 12px;
  color: #a08063;
}

.cp-close {
  border: 0;
  background: none;
  font-size: 22px;
  line-height: 1;
  color: #b0937a;
  cursor: pointer;
}

.cp-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px 18px;
}

.cp-tip {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: #8d7761;
}

.cp-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.cp-field label {
  font-size: 12px;
  color: #a08063;
}

.cp-field input {
  height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(160, 128, 99, 0.28);
  border-radius: 10px;
  font-size: 13.5px;
  color: #4a3f37;
  background: #fff;
  outline: none;
}

.cp-field input:focus {
  border-color: #e0865a;
  box-shadow: 0 0 0 3px rgba(224, 134, 90, 0.14);
}

.cp-code-row {
  display: flex;
  gap: 8px;
}

.cp-code-row input {
  flex: 1;
}

.cp-code-btn {
  flex: 0 0 auto;
  padding: 0 14px;
  height: 38px;
  border: 1px solid rgba(224, 134, 90, 0.5);
  border-radius: 10px;
  font-size: 12.5px;
  color: #d97a4f;
  background: #fff;
  cursor: pointer;
}

.cp-code-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.cp-primary {
  height: 40px;
  border: 0;
  border-radius: 11px;
  font-size: 13.5px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, #e79a6c, #d97a4f);
  box-shadow: 0 8px 18px rgba(217, 122, 79, 0.25);
}

.cp-primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.cp-or {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  color: #b0937a;
}

.cp-or::before,
.cp-or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(160, 128, 99, 0.18);
}

.cp-wechat {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  border: 1px solid rgba(47, 160, 92, 0.32);
  border-radius: 11px;
  font-size: 13.5px;
  font-weight: 600;
  color: #2f7d5b;
  background: rgba(74, 168, 122, 0.08);
  cursor: pointer;
}

.cp-wx-ico {
  width: 17px;
  height: 17px;
  flex: none;
}

.cp-wechat:disabled {
  opacity: 0.6;
  cursor: default;
}

.cp-err {
  margin: 0;
  font-size: 12px;
  color: #c4523c;
}

.cp-err-block {
  padding: 8px 10px;
  border-radius: 9px;
  background: rgba(196, 82, 60, 0.08);
}

.cp-ok {
  margin: 0;
  padding: 8px 10px;
  border-radius: 9px;
  font-size: 12px;
  color: #2f7d5b;
  background: rgba(74, 168, 122, 0.12);
}

.cp-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(224, 134, 90, 0.08);
}

.cp-avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  font-size: 15px;
  color: #fff;
  background: linear-gradient(135deg, #e79a6c, #d97a4f);
}

.cp-user-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.cp-user-text strong {
  font-size: 13px;
  color: #4a3f37;
}

.cp-user-text span {
  font-size: 11px;
  color: #a08063;
}

.cp-logout {
  border: 0;
  background: none;
  font-size: 12px;
  color: #b0937a;
  cursor: pointer;
}

.cp-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: #4a3f37;
}

.cp-mini {
  padding: 4px 10px;
  border: 1px solid rgba(160, 128, 99, 0.3);
  border-radius: 999px;
  font-size: 11.5px;
  color: #8d7761;
  background: #fff;
  cursor: pointer;
}

.cp-mini.danger {
  color: #c4523c;
  border-color: rgba(196, 82, 60, 0.3);
}

.cp-mini:disabled {
  opacity: 0.55;
  cursor: default;
}

.cp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cp-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border-radius: 11px;
  background: rgba(255, 252, 247, 0.95);
  border: 1px solid rgba(160, 128, 99, 0.14);
}

.cp-item-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.cp-item-title {
  font-size: 12.5px;
  font-weight: 600;
  color: #4a3f37;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-item-sub {
  font-size: 11px;
  color: #a08063;
}

.cp-item-actions {
  display: flex;
  gap: 6px;
  flex: 0 0 auto;
}

.cp-result {
  padding: 8px 10px;
  border-radius: 9px;
  font-size: 12px;
  color: #2f7d5b;
  background: rgba(74, 168, 122, 0.1);
}

.cp-result a {
  margin-left: 6px;
  color: #2f7d5b;
  text-decoration: underline;
}

.cp-empty {
  padding: 12px;
  border-radius: 10px;
  text-align: center;
  background: rgba(160, 128, 99, 0.06);
}

.cp-progress {
  margin: 0;
  font-size: 12px;
  color: #d97a4f;
}

.cp-foot {
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: #b0937a;
}

/* ---- 应用内确认框 ---- */
.cp-ask-mask {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(52, 38, 26, 0.42);
  backdrop-filter: blur(2px);
  animation: cp-ask-in 0.18s ease both;
}

@keyframes cp-ask-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.cp-ask-box {
  width: 100%;
  max-width: 300px;
  padding: 20px 20px 16px;
  border-radius: 16px;
  background: #fffdfa;
  box-shadow: 0 18px 44px rgba(60, 44, 24, 0.3);
  text-align: center;
}

.cp-ask-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
  color: #5a4632;
}

.cp-ask-text {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.7;
  color: #8a7360;
}

.cp-ask-actions {
  display: flex;
  gap: 10px;
}

.cp-ask-btn {
  flex: 1;
  height: 38px;
  border: 1px solid rgba(160, 128, 99, 0.28);
  border-radius: 10px;
  background: #fff;
  font-size: 13.5px;
  color: #7d6753;
  cursor: pointer;
  transition: 0.16s;
}

.cp-ask-btn:hover {
  background: #f7f0e8;
}

.cp-ask-btn.primary {
  border-color: transparent;
  background: linear-gradient(135deg, #e8a87c, #d97a4f);
  color: #fff;
}

.cp-ask-btn.primary.danger {
  background: linear-gradient(135deg, #e88b7c, #d95f4f);
}
</style>
