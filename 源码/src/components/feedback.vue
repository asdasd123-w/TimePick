<template>
  <div class="feedback">
    <div class="feedback-figure" :style="{ '--fb-bg': `url(${PAGE_BG})` }">
      <div class="feedback-figure-inner">
        <img
    class="feedback-bg"
    src="../assets/opt/feedbackBackground.webp"
    srcset="../assets/opt/feedbackBackground-sm.webp 1000w, ../assets/opt/feedbackBackground.webp 1308w"
    sizes="100vw"
    alt=""
    decoding="async"
  />

        <!-- 左上睡猫随机冒想法 -->
        <idle-thought :lines="CAT_THOUGHTS" left="33%" top="20%" />

        <!-- 左侧白卡: 反馈表单 -->
        <div class="fb-zone fb-form">
          <div class="fb-head">
            <b>写下你的想法</b>
            <span>选择类型, 描述你遇到的问题或建议</span>
          </div>
          <div class="fb-types">
            <button
              v-for="t in TYPES"
              :key="t"
              class="fb-type"
              :class="{ on: form.type === t }"
              type="button"
              @click="form.type = t"
            >
              {{ t }}
            </button>
          </div>
          <textarea
            v-model="form.content"
            class="fb-text"
            placeholder="详细描述你遇到的情况或期望, 我们会认真阅读每一条..."
          ></textarea>
          <input
            v-model="form.contact"
            class="fb-contact"
            type="text"
            placeholder="联系方式(选填): 邮箱 / 手机号"
          />
          <div class="fb-foot">
            <span v-if="okMsg" class="fb-ok">{{ okMsg }}</span>
            <button
              class="fb-submit"
              type="button"
              :disabled="!form.content.trim()"
              @click="submit"
            >
              提交反馈
            </button>
          </div>
        </div>

        <!-- 右侧白卡: 我的反馈记录, 超出滚动 -->
        <div class="fb-zone fb-list">
          <div class="fb-head">
            <b>我的反馈</b>
            <span>共 {{ history.length }} 条</span>
          </div>
          <div class="fb-rows">
            <div v-for="h in history" :key="h.id" class="fb-row">
              <div class="fb-row-head">
                <i class="fb-status" :class="statusClass(h.status)">{{ statusText(h.status) }}</i>
                <span class="fb-type-tag">{{ typeText(h.type) }}</span>
                <span v-if="h.contact" class="fb-contact-tag">{{ h.contact }}</span>
                <span class="fb-date">{{ fmtDate(h.created_at) }}</span>
                <button class="fb-del" type="button" @click="confirmRemove(h.id)" title="删除">&times;</button>
              </div>
              <p class="fb-row-text">{{ h.content }}</p>
              <p v-if="h.reply" class="fb-reply" :class="{ rejected: h.status === 3 }">
                {{ h.status === 3 ? '驳回原因' : '官方回复' }}: {{ h.reply }}
              </p>
              <div v-if="h.reply && h.status !== 3" class="fb-user-reply">
                <textarea v-model="h._userReply" class="fb-reply-input" placeholder="回复官方..." rows="2"></textarea>
                <button class="fb-reply-btn" type="button" @click="submitUserReply(h)" :disabled="!h._userReply?.trim()">发送</button>
              </div>
            </div>
            <div v-if="!history.length && !loading" class="fb-empty">还没有反馈, 快来提第一条吧~</div>
            <div v-if="loading" class="fb-empty">加载中...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 自定义确认弹窗 -->
    <div v-if="showConfirm" class="fb-confirm-overlay" @click.self="showConfirm = false">
      <div class="fb-confirm">
        <div class="fb-confirm-head">
          <h3>删除反馈</h3>
          <button class="fb-confirm-close" type="button" @click="showConfirm = false">&times;</button>
        </div>
        <div class="fb-confirm-body">
          <p>确定删除这条反馈吗？</p>
        </div>
        <div class="fb-confirm-foot">
          <button class="fb-confirm-btn cancel" type="button" @click="showConfirm = false">取消</button>
          <button class="fb-confirm-btn confirm" type="button" @click="executeRemove">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 问题反馈: 信箱背景 + 左表单右记录两张白卡, 接后端 API
import { onMounted, reactive, ref } from 'vue'
import { cloudApi } from '@/api/cloud'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import IdleThought from './idleThought.vue'
// ★ 2026-10-27：背景图在 CSS 里也要用一份（铺满用的模糊垫底层），所以显式 import 拿 URL
import PAGE_BG from '@/assets/opt/feedbackBackground.webp'

const auth = useCloudAuthStore()

// 背景图左上睡猫的随机想法
const CAT_THOUGHTS = [
  '有建议…尽管投进信箱…',
  '我会好好看着每一条的…',
  '写反馈的人最温柔了…',
  '嗯…问题会一个一个解决的…',
  '呼噜…呼噜…',
]

const TYPES = ['功能建议', '问题反馈', '体验优化', '其他']
const TYPE_MAP = { 1: '功能建议', 2: '问题反馈', 3: '体验优化' }
const STATUS_MAP = { 0: '待处理', 1: '已采纳', 2: '已解决', 3: '已驳回' }

const form = reactive({ type: '功能建议', content: '', contact: '' })
const okMsg = ref('')
const history = ref([])
const loading = ref(false)
const showConfirm = ref(false)
const pendingRemoveId = ref(null)
let okTimer = null

function typeText(t) { return TYPE_MAP[t] || '其他' }
function statusText(s) { return STATUS_MAP[s] || '未知' }
function statusClass(s) { return s === 1 ? 'ok' : s === 2 ? 'done' : s === 3 ? 'rejected' : 'wait' }
function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function loadHistory() {
  if (!auth.isLogin) return
  loading.value = true
  try {
    history.value = await cloudApi.listFeedback()
  } catch (e) {
    console.error('加载反馈失败:', e.message)
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (!auth.isLogin) {
    auth.openAuth()
    return
  }
  const typeNum = TYPES.indexOf(form.type) + 1 || 1
  try {
    await cloudApi.createFeedback({ type: typeNum, content: form.content.trim(), contact: form.contact.trim() })
    form.content = ''
    form.contact = ''
    okMsg.value = '反馈已收到, 谢谢你!'
    clearTimeout(okTimer)
    okTimer = setTimeout(() => { okMsg.value = '' }, 2400)
    await loadHistory()
  } catch (e) {
    alert(e.message || '提交失败')
  }
}

function confirmRemove(id) {
  pendingRemoveId.value = id
  showConfirm.value = true
}

async function executeRemove() {
  if (!pendingRemoveId.value) return
  try {
    await cloudApi.removeFeedback({ id: pendingRemoveId.value })
    await loadHistory()
  } catch (e) {
    alert(e.message || '删除失败')
  } finally {
    showConfirm.value = false
    pendingRemoveId.value = null
  }
}

async function submitUserReply(h) {
  const text = h._userReply?.trim()
  if (!text) return
  try {
    await cloudApi.replyFeedback({ id: h.id, content: text })
    h._userReply = ''
    // 重新加载以获取最新数据
    await loadHistory()
  } catch (e) {
    alert(e.message || '回复失败')
  }
}

async function removeItem(id) {
  // This function is no longer used - confirmRemove handles it
}

onMounted(() => { loadHistory() })
</script>

<style scoped>
.feedback,
.feedback * {
  box-sizing: border-box;
}

.feedback {
  position: absolute;
  inset: 0;
}

.feedback-figure {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  container-type: size;
  background: #e7dccd;
}

/* ★ 2026-10-27 用户反馈「问题反馈背景要铺满」：与隐私设置同一套做法 ——
   底下垫一层同图的 cover + 模糊，contain 图保留下来的比例留白就看不见了。 */
.feedback-figure::before {
  content: '';
  position: absolute;
  inset: -40px;
  background-image: var(--fb-bg, none);
  background-size: cover;
  background-position: center;
  filter: blur(26px) saturate(1.06);
  opacity: 0.96;
  pointer-events: none;
}

/* 与 contain 绘制出的图片区域同比例同位置 */
/* ★ 内层框必须和 object-fit:contain 画出来的图片区域**完全重合**。
   老写法是 width:100% + aspect-ratio + max-height:100%：容器比图更宽时，
   max-height 把高度卡住、宽度却还是 100%，比例就破了 —— 卡片按 % 定位会整体往外偏，
   换个屏幕比例（比如 16:9 笔记本接到 4:3 投影）看起来就是"排版乱了"。
   现在用容器查询单位算出 contain 盒的真实宽高，两种极端都能对上。
   （不支持容器查询的旧浏览器仍走上面那组老声明，行为与以前一致。） */
.feedback-figure-inner {
  position: relative;
  z-index: 1;
  aspect-ratio: 1308 / 1024;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  /* 精确的 contain 盒：宽度取「容器宽」与「按高换算的宽」的较小者 */
  width: min(100cqw, calc(100cqh * 1308 / 1024));
  height: min(100cqh, calc(100cqw * 1024 / 1308));
  max-width: none;
  max-height: none;
}

.feedback-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

/* 两张烘焙白卡的内容区 */
.fb-zone {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 26px 30px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #d8c4b4 transparent;
}

.fb-zone::-webkit-scrollbar {
  width: 6px;
}

.fb-zone::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: #d8c4b4;
}

.fb-form {
  left: 11%;
  top: 31.6%;
  width: 43%;
  height: 48.7%;
}

.fb-list {
  left: 55.75%;
  top: 31.6%;
  width: 40.5%;
  height: 48.7%;
}

.fb-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.fb-head b {
  font-size: 16.5px;
  color: #4a3f37;
}

.fb-head span {
  font-size: 12.5px;
  color: #a89c90;
}

.fb-types {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.fb-type {
  padding: 5px 14px;
  border: 1px solid #eadfd2;
  border-radius: 999px;
  background: #fff;
  color: #8a7a6d;
  font-size: 13px;
  cursor: pointer;
}

.fb-type.on {
  border-color: #f0917c;
  background: #fdeae2;
  color: #e0705a;
  font-weight: 600;
}

.fb-text {
  flex: 1;
  min-height: 120px;
  padding: 10px 12px;
  border: 1px solid #eadfd2;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.85);
  color: #4a3f37;
  font-size: 14.5px;
  line-height: 1.6;
  font-family: inherit;
  outline: none;
  resize: none;
}

.fb-contact {
  padding: 8px 12px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.85);
  color: #4a3f37;
  font-size: 14px;
  outline: none;
}

.fb-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.fb-ok {
  color: #67a767;
  font-size: 13px;
}

.fb-submit {
  padding: 8px 22px;
  border: none;
  border-radius: 999px;
  background: #f0917c;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}

.fb-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 记录列表 */
.fb-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fb-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
}

.fb-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fb-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-style: normal;
}

.fb-status.wait {
  background: #fdf1df;
  color: #d89a4e;
}

.fb-status.ok {
  background: #e3edf8;
  color: #5b87c7;
}

.fb-status.done {
  background: #e5f5e5;
  color: #67a767;
}

.fb-status.rejected {
  background: #fde8e8;
  color: #c75b5b;
}

.fb-type-tag {
  font-size: 12px;
  color: #8a7a6d;
}

.fb-date {
  margin-left: auto;
  font-size: 11.5px;
  color: #b3a79b;
}

.fb-del {
  margin-left: 4px;
  padding: 0 6px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #c4b8aa;
  font-size: 17px;
  cursor: pointer;
  line-height: 1;
}

.fb-del:hover {
  background: #fde8e8;
  color: #e05050;
}

.fb-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: #b3a79b;
}

.fb-row-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #6b5d52;
}

.fb-reply {
  margin: 0;
  padding: 6px 10px;
  border-left: 3px solid #f0b28a;
  border-radius: 6px;
  background: #fdf6ee;
  color: #a07048;
  font-size: 12.5px;
  line-height: 1.5;
}

.fb-user-reply {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  align-items: flex-end;
}

.fb-reply-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #e0d8d0;
  border-radius: 8px;
  font-size: 13px;
  resize: vertical;
  min-height: 32px;
  font-family: inherit;
}

.fb-reply-input:focus {
  outline: none;
  border-color: #f0b28a;
}

.fb-reply-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: #f0b28a;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.fb-reply-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fb-reply.rejected {
  border-left-color: #c75b5b;
  background: #fde8e8;
  color: #c75b5b;
}

.fb-contact-tag {
  font-size: 11px;
  color: #5b87c7;
  background: #e3edf8;
  padding: 1px 6px;
  border-radius: 999px;
}

/* 自定义确认弹窗 */
.fb-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.fb-confirm {
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 340px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.fb-confirm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0ebe5;
}

.fb-confirm-head h3 {
  margin: 0;
  font-size: 17.5px;
  color: #4a3f37;
}

.fb-confirm-close {
  border: none;
  background: transparent;
  font-size: 24px;
  color: #b3a79b;
  cursor: pointer;
  padding: 0 4px;
}

.fb-confirm-close:hover {
  color: #8a7a6d;
}

.fb-confirm-body {
  padding: 20px;
}

.fb-confirm-body p {
  margin: 0;
  font-size: 17px;
  color: #4a3f37;
}

.fb-confirm-foot {
  display: flex;
  gap: 10px;
  padding: 0 20px 20px;
  justify-content: flex-end;
}

.fb-confirm-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  font-size: 15.5px;
  cursor: pointer;
}

.fb-confirm-btn.cancel {
  background: #f0ebe5;
  color: #8a7a6d;
}

.fb-confirm-btn.cancel:hover {
  background: #e5ddd5;
}

.fb-confirm-btn.confirm {
  background: #f0917c;
  color: #fff;
}

.fb-confirm-btn.confirm:hover {
  background: #e0705a;
}
</style>
