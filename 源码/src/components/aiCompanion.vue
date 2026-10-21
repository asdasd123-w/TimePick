<template>
  <!-- 整个面板可按住标题栏拖动(translate 偏移, 拖动范围限制在视口内) -->
  <div class="ai-panel" :style="panelDragStyle">
    <header class="ai-head" @pointerdown="onPanelDragStart">
      <!-- 小橘头像: 当前宠物精灵图 -->
      <span v-if="companion.hasSprite" class="avatar-box head-avatar"><pet-sprite :height="36" /></span>
      <span v-else class="avatar-slot head-avatar">图</span>
      <div class="head-text">
        <div class="head-line">
          <span class="ai-name">小橘</span>
          <span class="ai-badge">◆ AI记忆伙伴</span>
        </div>
        <span class="ai-sub">陪你回望每一段时光</span>
      </div>
      <span class="head-spark">✦</span>
      <button
        class="head-clear"
        type="button"
        title="清空聊天记录"
        aria-label="清空聊天记录"
        @click="clearChat"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13M10 11v6m4-6v6" />
        </svg>
      </button>
      <button class="ai-close" type="button" aria-label="关闭" @click="emit('close')">×</button>
    </header>

    <div ref="listRef" class="ai-list">
      <template v-for="m in messages" :key="m.id">
        <!-- 记忆卡片消息: 封面图预留位 -->
        <div v-if="m.role === 'memories'" class="mem-row">
          <div v-for="it in m.items" :key="it" class="mem-card">
            <span class="img-slot mem-thumb">图</span>
            <span class="mem-cap">{{ it }}</span>
          </div>
        </div>
        <div v-else class="msg" :class="m.role">
          <!-- 对话头像: 左侧宠物精灵图 / 右侧用户 -->
          <span v-if="m.role === 'ai' && companion.hasSprite" class="avatar-box"><pet-sprite :height="24" /></span>
          <span v-else class="avatar-slot" :class="m.role">图</span>
          <p class="bubble">{{ m.text }}</p>
        </div>
      </template>
      <div v-if="thinking" class="msg ai">
        <span v-if="companion.hasSprite" class="avatar-box"><pet-sprite :height="24" /></span>
        <span v-else class="avatar-slot ai">图</span>
        <p class="bubble">
          小橘正在想<span class="dot">·</span><span class="dot">·</span><span class="dot">·</span>
        </p>
      </div>
    </div>

    <div class="ai-input">
      <!-- 录音中: 红点脉动 + 计时 + 完成/取消 -->
      <template v-if="recState !== 'idle'">
        <span class="rec-dot" :class="{ pulse: recState === 'rec' }"></span>
        <span class="rec-label">
          {{ recState === 'rec' ? `正在聆听… ${recSec}s` : '小橘正在转文字…' }}
        </span>
        <button
          class="rec-btn rec-cancel"
          type="button"
          :disabled="recState !== 'rec'"
          @click="cancelRecord"
        >
          取消
        </button>
        <button
          class="rec-btn rec-done"
          type="button"
          :disabled="recState !== 'rec'"
          @click="finishRecord"
        >
          完成
        </button>
      </template>
      <template v-else>
        <button
          class="mic-btn"
          type="button"
          aria-label="语音输入"
          title="点击说话, 说完点「完成」自动发给小橘"
          @click="startRecord"
        >
          <svg class="mic" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
          <span class="mic-ripple" aria-hidden="true"></span>
        </button>
        <input v-model="draft" type="text" placeholder="和小橘说点什么..." @keyup.enter="send()" />
        <button class="send-btn" type="button" aria-label="发送" @click="send()">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 3 10 14M21 3l-7 18-4-7-7-4Z" />
          </svg>
        </button>
      </template>
    </div>

  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { chatWithDeepSeek, deepSeekReady, refreshAiStatus } from '@/api/deepseek'
import { cloudApi } from '@/api/cloud'
import { useMemoriesStore } from '@/stores/memories'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { useCompanionStore } from '@/stores/companion'
import petSprite from './petSprite.vue'

const emit = defineEmits(['close'])

// ---- 面板拖动: 按住标题栏拖动(标题栏里的按钮不参与), 偏移限制在视口内 ----
const panelDrag = ref({ x: 0, y: 0 })
let panelDragState = null
const panelDragStyle = ref({})
function onPanelDragStart(e) {
  if (e.target.closest('button')) return
  panelDragState = {
    sx: e.clientX,
    sy: e.clientY,
    ox: panelDrag.value.x,
    oy: panelDrag.value.y,
  }
  window.addEventListener('pointermove', onPanelDragMove)
  window.addEventListener('pointerup', onPanelDragEnd)
}
function onPanelDragMove(e) {
  if (!panelDragState) return
  const el = document.querySelector('.ai-fixed')
  let x = panelDragState.ox + (e.clientX - panelDragState.sx)
  let y = panelDragState.oy + (e.clientY - panelDragState.sy)
  // 粗略夹取: 面板主体留在视口内(宽高未知, 用 360/420 经验值)
  if (el) {
    const r = el.getBoundingClientRect()
    const w = r.width || 360
    const h = r.height || 420
    x = Math.min(Math.max(x, -(r.right - 90)), window.innerWidth - r.left - 90)
    y = Math.min(Math.max(y, -(r.top - 60)), window.innerHeight - r.top - 90)
    void w
    void h
  }
  panelDrag.value = { x, y }
  panelDragStyle.value = { transform: `translate(${x}px, ${y}px)` }
}
function onPanelDragEnd() {
  panelDragState = null
  window.removeEventListener('pointermove', onPanelDragMove)
  window.removeEventListener('pointerup', onPanelDragEnd)
}
onBeforeUnmount(onPanelDragEnd)

const memoriesStore = useMemoriesStore()
const auth = useCloudAuthStore()
const companion = useCompanionStore()

// ---- 对话记录: 每人一份, 存在服务端 ----
// 原先存在 localStorage 的固定 key 里 —— 那台浏览器上换个人登录, 上一个人的聊天记录
// 会原样留在这里, AI 就顺着别人的上下文接着聊。现在改成后端 ai_conversation /
// ai_message(查询时带 user_id 归属校验), 换账号就换一份, 互相看不到。
const GREETING = '你好呀, 我是小橘。今天想从哪一段记忆聊起?'
const convId = ref(0) // 0 = 未登录或还没拿到会话
let seq = 0
const messages = ref([])

function push(m) {
  seq += 1
  messages.value.push({ id: seq, ...m })
  persist(m)
}

// 落库是「尽力而为」: 写失败不该打断聊天(断网时本地照样能看), 只记一条日志
function persist(m) {
  if (!convId.value || m.role === 'memories') return
  cloudApi
    .addMessage({
      conversation_id: convId.value,
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text,
    })
    .catch((e) => console.error('保存 AI 消息失败:', e.message))
}

// 取(或建)当前用户的会话: 一个用户只用一份, 取最近更新的那条
async function ensureConversation() {
  try {
    const list = await cloudApi.listConversations()
    if (Array.isArray(list) && list.length) {
      convId.value = list[0].id
      return
    }
    const c = await cloudApi.createConversation({ title: '小橘的对话' })
    convId.value = c?.id || 0
  } catch (e) {
    console.error('加载 AI 会话失败:', e.message)
    convId.value = 0
  }
}

async function loadHistory() {
  if (!convId.value) return
  try {
    const rows = (await cloudApi.listMessages({ conversation_id: convId.value })) || []
    messages.value = rows.map((r) => ({
      id: Number(r.id),
      role: r.role === 'assistant' ? 'ai' : r.role === 'user' ? 'user' : 'ai',
      text: r.content || '',
    }))
    // seq 必须比历史里的最大 id 还大, 否则新消息会和老消息撞 key
    seq = messages.value.reduce((m, x) => Math.max(m, x.id), 0)
  } catch (e) {
    console.error('加载 AI 聊天记录失败:', e.message)
  }
}

// 换账号 = 换一份对话: 清空本地, 重新从服务端拉
let boundUid = null
async function resetForUser(uid) {
  boundUid = uid
  convId.value = 0
  messages.value = []
  seq = 0
  if (uid) {
    await ensureConversation()
    await loadHistory()
  }
  // 没有历史就给一句开场白(未登录时也走这里, 此时只留在内存里)
  if (!messages.value.length) push({ role: 'ai', text: GREETING })
  await loadUserMemories()
  scrollEnd()
}

const draft = ref('')
const thinking = ref(false)
const listRef = ref(null)

// 每次请求携带的最近对话条数(超出部分不发送给模型)
const HISTORY_WINDOW = 20

// 用户记忆上下文
const userMemories = ref({ diaries: [], books: [], music: [] })

// AI 与记忆权限(隐私设置): 控制小橘能否读取/跨切片关联/生成阶段性总结
const aiPerms = ref({ read: true, cross: true, summary: true })

async function loadAiPerms() {
  if (!auth.isLogin) return
  try {
    const s = await cloudApi.getSettings()
    if (s) {
      aiPerms.value = {
        read: !!s.ai_read_memory,
        cross: !!s.ai_cross_space,
        summary: !!s.ai_summary,
      }
    }
  } catch (e) {
    console.error('加载 AI 权限设置失败:', e.message)
  }
}

async function scrollEnd() {
  await nextTick()
  listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' })
}

// 加载用户记忆数据(按隐私权限过滤: 禁读取则不加载; 禁跨切片只保留最近一个切片)
async function loadUserMemories() {
  if (!auth.isLogin || !aiPerms.value.read) return
  try {
    await memoriesStore.load(true) // 强制刷新获取最新数据
    let pool = memoriesStore.entries
    if (!aiPerms.value.cross) {
      const curSpace = pool[0]?.space
      pool = pool.filter((m) => m.space === curSpace)
    }
    const recentMemories = pool.slice(0, 10) // 最近 10 条
    userMemories.value = {
      diaries: recentMemories.filter((m) => m.kind === 'memory'),
      books: recentMemories.filter((m) => m.kind === 'book'),
      music: recentMemories.filter((m) => m.kind === 'music'),
    }
  } catch (e) {
    console.error('加载记忆数据失败:', e.message)
  }
}

// 构建系统提示词(受隐私设置约束)
function buildSystemPrompt() {
  const { diaries, books, music } = userMemories.value

  let prompt = `你是小橘，一个温暖的 AI 记忆伙伴。你的任务是陪伴用户回顾记忆，分析用户的心情状态。`

  // 未授权读取记忆: 不附带任何记忆内容, 并禁止引用
  if (!aiPerms.value.read) {
    prompt += `
用户未允许 AI 读取记忆内容。不要在回复中引用、回顾或分析用户的任何记忆, 像朋友一样陪伴当下对话即可。`
    return prompt
  }

  prompt += `

以下是用户最近的记录：
`

  if (diaries.length > 0) {
    prompt += '\n【日记】\n'
    diaries.forEach((d) => {
      const content = d.content.length > 100 ? d.content.substring(0, 100) + '...' : d.content
      prompt += `- ${d.date || '未知日期'}: ${content}\n`
    })
  }

  if (books.length > 0) {
    prompt += '\n【书籍】\n'
    books.forEach((b) => {
      prompt += `- 《${b.title}》${b.author ? `- ${b.author}` : ''}\n`
    })
  }

  if (music.length > 0) {
    prompt += '\n【音乐】\n'
    music.forEach((m) => {
      prompt += `- 《${m.title}》${m.author ? `- ${m.author}` : ''}\n`
    })
  }

  if (diaries.length === 0 && books.length === 0 && music.length === 0) {
    prompt += '\n用户还没有任何记录。'
  }

  prompt += `
请基于这些记录，用温暖、理解的语气与用户对话。当用户询问心情分析时，结合这些记忆内容给出有洞察力的回应。
如果用户没有记录，就鼓励用户开始记录生活。`

  if (!aiPerms.value.cross) {
    prompt += `
用户未允许跨切片寻找记忆关联: 以上记录仅来自同一个切片, 不要做跨切片的联系分析。`
  }
  if (!aiPerms.value.summary) {
    prompt += `
用户未允许生成阶段性总结: 若用户要求学期/年度回顾、情绪变化或兴趣趋势等总结, 温和说明该权限未开启, 仅陪伴当下对话。`
  }

  return prompt
}

// 未对接 DeepSeek 时的本地占位回复
function localReply(text) {
  return `我把"${text}"记在小本本上啦。 (AI 尚未就绪: 请在 server/.env 或部署平台配置 DEEPSEEK_API_KEY 并登录后重试。)`
}

// 清空聊天记录: 服务端的会话连同消息一起删掉, 再开一个新的
async function clearChat() {
  if (thinking.value) return
  // 必须先删掉旧会话再建新的: 直接 ensureConversation() 会又把最近更新的那条(就是旧的)捞回来
  const old = convId.value
  convId.value = 0
  messages.value = []
  seq = 0
  if (old) {
    try {
      await cloudApi.removeConversation({ id: old })
    } catch (e) {
      console.error('清空 AI 会话失败:', e.message)
    }
  }
  await ensureConversation()
  push({ role: 'ai', text: '聊天记录清空啦。想从哪一段记忆开始重新收藏?' })
  scrollEnd()
}

async function send(preset) {
  const text = (preset ?? draft.value).trim()
  if (!text || thinking.value) return
  draft.value = ''
  push({ role: 'user', text })
  await scrollEnd()
  thinking.value = true
  await scrollEnd()
  try {
    let reply
    // 每次发送前探测一次服务端 AI 状态(已配置密钥且已登录才算可用)
    await refreshAiStatus()
    if (deepSeekReady()) {
      // 只带最近 HISTORY_WINDOW 轮对话, 避免上下文与 token 成本随聊天无限增长
      const history = messages.value
        .filter((m) => m.role !== 'memories')
        .slice(-HISTORY_WINDOW)
        .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }))
      // 添加系统提示词作为第一条消息
      const messagesWithSystem = [
        { role: 'system', content: buildSystemPrompt() },
        ...history,
      ]

      reply = await chatWithDeepSeek(messagesWithSystem)
    } else {
      await new Promise((r) => setTimeout(r, 600))
      reply = localReply(text)
    }
    push({ role: 'ai', text: reply })
  } catch {
    push({ role: 'ai', text: '小橘打了个小盹, 连接中断了, 再试一次好吗?' })
  } finally {
    thinking.value = false
    await scrollEnd()
  }
}

// ---- 语音输入: 麦克风采集 PCM -> 浏览器内转 16kHz 单声道 WAV -> 服务端 qwen3-asr 转文字 -> 自动发送 ----
// 不用 MediaRecorder 是因为浏览器普遍录出 webm/opus, 识别端支持差; 自己编码的 WAV 走哪儿都认。
const recState = ref('idle') // idle 未录 | rec 录音中 | busy 识别中
const recSec = ref(0)
let recStream = null
let recCtx = null
let recSource = null
let recNode = null
let recChunks = []
let recTimer = null
const REC_MAX_SEC = 60

async function startRecord() {
  if (recState.value !== 'idle') return
  if (!navigator.mediaDevices?.getUserMedia) {
    push({ role: 'ai', text: '这个浏览器不支持录音, 直接打字给我吧' })
    return
  }
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    // 按失败原因给不同的指引; 浏览器里"已允许"还报 NotAllowedError 时,
    // 十有八九是 Windows 系统级麦克风访问被关了(设置>隐私和安全性>麦克风)
    const name = e?.name || ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      push({
        role: 'ai',
        text: '麦克风还是打不开。三步排查: ①浏览器地址栏左侧图标里麦克风=允许; ②Windows 设置>隐私和安全性>麦克风, 打开「麦克风访问」和「允许桌面应用访问」; ③都开完后把页面刷新一下再点话筒',
      })
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      push({
        role: 'ai',
        text: '麦克风被别的程序占用了(比如其他浏览器/会议软件正在录音), 关掉它们再试试',
      })
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      push({ role: 'ai', text: '没有找到可用的麦克风设备, 检查电脑录音设备后再试试吧' })
    } else {
      push({
        role: 'ai',
        text: '打不开麦克风(' + (name || '未知原因') + (e?.message ? ': ' + e.message : '') + '), 直接打字给我也可以哦',
      })
    }
    return
  }
  recCtx = new (window.AudioContext || window.webkitAudioContext)()
  recSource = recCtx.createMediaStreamSource(recStream)
  recNode = recCtx.createScriptProcessor(4096, 1, 1)
  recChunks = []
  recNode.onaudioprocess = (e) => {
    recChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  }
  recSource.connect(recNode)
  recNode.connect(recCtx.destination) // 静音直连也可, ScriptProcessor 必须接到终点才工作
  const recStartAt = Date.now()
  recSec.value = 0
  recTimer = setInterval(() => {
    recSec.value = Math.floor((Date.now() - recStartAt) / 1000)
    if (recSec.value >= REC_MAX_SEC) finishRecord()
  }, 1000)
  recState.value = 'rec'
}

function stopCapture() {
  clearInterval(recTimer)
  recTimer = null
  try {
    recNode && recNode.disconnect()
    recSource && recSource.disconnect()
    recStream && recStream.getTracks().forEach((t) => t.stop())
    recCtx && recCtx.close()
  } catch {
    /* 忽略释放失败 */
  }
  recNode = recSource = recStream = recCtx = null
}

function cancelRecord() {
  if (recState.value !== 'rec') return
  stopCapture()
  recChunks = []
  recState.value = 'idle'
}

async function finishRecord() {
  if (recState.value !== 'rec') return
  const sampleRate = recCtx?.sampleRate || 44100
  stopCapture()
  const total = recChunks.reduce((n, c) => n + c.length, 0)
  if (!total) {
    recState.value = 'idle'
    return
  }
  recState.value = 'busy'
  try {
    // 合并采样块并线性降采样到 16kHz(识别端标准采样率, 也把数据量压到最小)
    const merged = new Float32Array(total)
    let off = 0
    for (const c of recChunks) {
      merged.set(c, off)
      off += c.length
    }
    recChunks = []
    const ratio = sampleRate / 16000
    const outLen = Math.max(1, Math.floor(merged.length / ratio))
    const pcm = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) pcm[i] = merged[Math.floor(i * ratio)] || 0
    // 音量归一化: 麦克风采集音量偏小时, 识别端容易只听成一个"嗯", 这里把峰值增益到 0.9
    let peak = 0
    for (let i = 0; i < pcm.length; i++) {
      const a = Math.abs(pcm[i])
      if (a > peak) peak = a
    }
    if (peak > 0.0001 && peak < 0.9) {
      const gain = 0.9 / peak
      for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-1, Math.min(1, pcm[i] * gain))
    }
    const dataUrl = 'data:audio/wav;base64,' + floatPcmToWavBase64(pcm, 16000)
    const { text } = await cloudApi.aiAsr({ dataUrl })
    recState.value = 'idle'
    const clean = (text || '').trim()
    if (!clean) {
      push({ role: 'ai', text: '没有听清你说什么, 靠近一点再说一次好吗?' })
      return
    }
    // 识别结果只有一两个字(比如"嗯")时, 大概率是没说清楚或麦克风音量太小,
    // 不自动发送, 放回输入框让你确认/补全后再发, 避免莫名其妙发出一个"嗯"
    const stripped = clean.replace(/[。.,,!?！？、~\s]/g, '')
    if (stripped.length <= 1) {
      draft.value = clean
      push({ role: 'ai', text: '我只听清了「' + clean + '」, 好像有点短。先帮你放进输入框啦, 靠近麦克风说完整一句话, 识别会更准' })
      await scrollEnd()
      return
    }
    draft.value = clean
    send()
  } catch (e) {
    recState.value = 'idle'
    push({ role: 'ai', text: '语音识别失败了: ' + (e.message || '未知错误') })
  }
}

// Float32 PCM -> 16bit 单声道 WAV 的 base64(纯浏览器端编码, 无外部依赖)
function floatPcmToWavBase64(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const wstr = (offset, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i))
  }
  wstr(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  wstr(8, 'WAVE')
  wstr(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // 单声道
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  wstr(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  let o = 44
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  // ArrayBuffer -> base64(分段, 避免超长字符串压栈)
  const u = new Uint8Array(buf)
  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < u.length; i += CH) {
    bin += String.fromCharCode.apply(null, u.subarray(i, i + CH))
  }
  return btoa(bin)
}

onBeforeUnmount(() => {
  if (recState.value === 'rec') cancelRecord()
  else if (recState.value === 'busy') stopCapture()
})

// 加载当前宠物类型(用于头像图)
async function loadPet() {
  if (!auth.isLogin) return
  try {
    const cfg = await cloudApi.getPet()
    if (cfg && cfg.pet_type) companion.setPetType(cfg.pet_type, auth.user?.id)
  } catch (e) {
    console.error('加载宠物配置失败:', e.message)
  }
}

// 组件挂载时先读权限设置, 再按权限加载用户记忆; 会话随登录账号切换
onMounted(async () => {
  await loadAiPerms()
  loadPet()
  await resetForUser(auth.user?.id || 0)
})

// 挂载时可能还没登录(用户点开面板才去登录) —— 盯着 uid, 一旦拿到就换成本人的那份对话
watch(
  () => auth.user?.id || 0,
  (uid) => {
    if (!uid || uid === boundUid) return
    resetForUser(uid)
  },
)
</script>

<style scoped>
.ai-panel,
.ai-panel * {
  box-sizing: border-box;
}

.ai-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 14px 16px;
  border-radius: 18px;
  background: linear-gradient(165deg, rgba(255, 249, 241, 0.97), rgba(250, 235, 221, 0.95));
  box-shadow: 0 18px 50px rgba(90, 65, 45, 0.28);
}

/* 头像/图片预留位 */
.img-slot,
.avatar-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed #d8c9b8;
  background: #faf6ef;
  color: #c9bbae;
}

.avatar-slot {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 11px;
}

.head-avatar {
  width: 44px;
  height: 44px;
  font-size: 12px;
}

/* 宠物精灵图头像容器 */
.avatar-box {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #faf6ef;
  overflow: hidden;
}

.avatar-box.head-avatar {
  width: 44px;
  height: 44px;
}

/* 插画位: 无边框纯展示 */
.sprite-box {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---- 头部 ---- */
.ai-head {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.ai-head:active {
  cursor: grabbing;
}

.head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.head-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-name {
  font-size: 17.5px;
  font-weight: 700;
  color: #4a3f37;
}

.ai-badge {
  padding: 3px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ffb27a, #f6a45c);
  color: #fff;
  font-size: 12px;
  letter-spacing: 1px;
}

.ai-sub {
  font-size: 13px;
  color: #a08063;
}

.head-spark {
  margin-left: auto;
  color: #f2c14e;
  font-size: 17px;
}

.head-clear {
  display: flex;
  border: none;
  background: transparent;
  color: #b3a79c;
  cursor: pointer;
}

.head-clear:hover {
  color: #e0865a;
}

.head-clear svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ai-close {
  border: none;
  background: transparent;
  color: #b3a79c;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

/* ---- 消息列表 ---- */
.ai-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: #d8c9b8 transparent;
}

.ai-list::-webkit-scrollbar {
  width: 4px;
}

.ai-list::-webkit-scrollbar-thumb {
  border-radius: 4px;
  background: #d8c9b8;
}

.msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.msg.user {
  flex-direction: row-reverse;
}

.bubble {
  max-width: 78%;
  margin: 0;
  padding: 8px 12px;
  border-radius: 12px;
  background: #fff;
  font-size: 14.5px;
  line-height: 1.6;
  color: #5c4f45;
  box-shadow: 0 4px 10px rgba(120, 90, 60, 0.08);
}

.msg.user .bubble {
  background: #fbe3c6;
}

.dot {
  animation: blink 1.2s infinite;
}

.dot:nth-child(2) {
  animation-delay: 0.2s;
}

.dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  0%,
  100% {
    opacity: 0.2;
  }
  50% {
    opacity: 1;
  }
}

/* 记忆卡片行 */
.mem-row {
  display: flex;
  gap: 8px;
  padding-left: 38px;
}

.mem-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 5px 5px 4px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 4px 10px rgba(120, 90, 60, 0.1);
}

.mem-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 7px;
}

.mem-cap {
  font-size: 12px;
  color: #5c4f45;
}

/* ---- 输入行 ---- */
.ai-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 12px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 6px 16px rgba(120, 90, 60, 0.12);
}

.mic {
  flex: none;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: #b3a79c;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 语音输入按钮: 点击时缩放特效, 录音中持续向外扩散涟漪 */
.mic-btn {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: transform 0.12s ease;
}

.mic-btn:hover {
  background: #f6ede2;
}

.mic-btn:active {
  transform: scale(0.82);
}

.mic-ripple {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid #e0705a;
  opacity: 0;
  pointer-events: none;
}

.mic-btn.recording .mic-ripple,
.mic-btn:active .mic-ripple {
  animation: mic-ripple 0.9s ease-out infinite;
}

@keyframes mic-ripple {
  from {
    opacity: 0.75;
    transform: scale(0.7);
  }

  to {
    opacity: 0;
    transform: scale(1.9);
  }
}

/* 录音状态行 */
.rec-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e0705a;
}

.rec-dot.pulse {
  animation: rec-pulse 1s ease-in-out infinite;
}

@keyframes rec-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(224, 112, 90, 0.5);
    opacity: 1;
  }

  50% {
    box-shadow: 0 0 0 6px rgba(224, 112, 90, 0);
    opacity: 0.55;
  }
}

.rec-label {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  color: #a05f4c;
}

.rec-btn {
  flex: none;
  padding: 6px 14px;
  border: none;
  border-radius: 999px;
  font-size: 13.5px;
  cursor: pointer;
}

.rec-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.rec-cancel {
  background: #f1e7db;
  color: #8a7a6d;
}

.rec-done {
  background: linear-gradient(135deg, #ffb27a, #f6a45c);
  color: #fff;
}

.ai-input input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14.5px;
  color: #5c4f45;
}

.ai-input input::placeholder {
  color: #c9bbae;
}

.send-btn {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffb27a, #f6a45c);
  cursor: pointer;
}

.send-btn svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: #fff;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 右下角探出的猫咪插画预留位 */
/* 右下角猫咪插画已按需求移除(会挡住录音完成按钮) */
</style>
