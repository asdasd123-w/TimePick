/**
 * 语音输入（说完 → 转文字 → 交回给调用方填进输入框）
 *
 * 为什么不直接用 MediaRecorder：
 *   浏览器普遍只录 webm/opus，识别端对容器格式挑剔；这里自己采 PCM、自己编码 16kHz
 *   单声道 WAV，走哪儿都认，体积也最小（60s ≈ 1.9MB，base64 后 ≈ 2.6MB，服务端限 8MB）。
 *
 * 用法：
 *   const voice = useVoiceInput({ onText: (t) => { content.value += t } })
 *   voice.start() / voice.stop() / voice.cancel()
 *   voice.state  -> 'idle' | 'rec' | 'busy'
 *   voice.seconds-> 录音秒数（给按钮显示计时）
 *   voice.level  -> 0~1 实时音量（给按钮做呼吸动画，可选）
 *
 * 注意：ScriptProcessor 虽已标记废弃，但兼容性最好；它必须连到 destination 才会跑回调，
 * 所以这里用一个 0 增益节点接出去，不会真的把麦克风回放到扬声器（避免啸叫）。
 */
import { onBeforeUnmount, ref } from 'vue'
import { cloudApi } from '@/api/cloud'

export const VOICE_MAX_SEC = 60

/** Float32 PCM -> 16bit 单声道 WAV 的 base64（纯浏览器端编码，无外部依赖） */
export function floatPcmToWavBase64(samples, sampleRate) {
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
  // ArrayBuffer -> base64（分段，避免超长字符串压栈）
  const u = new Uint8Array(buf)
  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < u.length; i += CH) {
    bin += String.fromCharCode.apply(null, u.subarray(i, i + CH))
  }
  return btoa(bin)
}

/** 浏览器录音失败 -> 人话（"已允许"还报错十有八九是 Windows 系统级麦克风被关了） */
export function micErrorText(e) {
  const name = e?.name || ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '麦克风没打开：①地址栏左侧图标里把麦克风设为允许；②Windows 设置 > 隐私和安全性 > 麦克风，打开「麦克风访问」和「允许桌面应用访问」；③刷新页面再试'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '麦克风被别的程序占用了（会议软件/其他浏览器正在录音），关掉它们再试'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '没找到可用的麦克风，检查一下录音设备'
  }
  return '打不开麦克风' + (name ? `（${name}）` : '') + '，也可以直接打字'
}

export function useVoiceInput(options = {}) {
  const { transcribe, maxSec = VOICE_MAX_SEC, onText, onError } = options

  const state = ref('idle') // idle 未录 | rec 录音中 | busy 识别中
  const seconds = ref(0)
  const level = ref(0)

  let stream = null
  let ctx = null
  let source = null
  let node = null
  let sink = null
  let chunks = []
  let timer = 0
  let startAt = 0
  let disposed = false

  function release() {
    if (timer) clearInterval(timer)
    timer = 0
    try {
      node && node.disconnect()
      source && source.disconnect()
      sink && sink.disconnect()
      stream && stream.getTracks().forEach((t) => t.stop())
      ctx && ctx.close()
    } catch {
      /* 释放失败不影响主流程 */
    }
    node = source = sink = stream = ctx = null
    chunks = []
    level.value = 0
  }

  async function start() {
    if (state.value !== 'idle') return false
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.('这个浏览器不支持录音，换个浏览器或直接打字')
      return false
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      onError?.(micErrorText(e))
      return false
    }
    if (disposed) {
      release()
      return false
    }
    const AC = window.AudioContext || window.webkitAudioContext
    ctx = new AC()
    try {
      // 部分浏览器（Safari/移动端）AudioContext 需显式 resume
      if (ctx.state === 'suspended') await ctx.resume()
    } catch {
      /* 忽略 */
    }
    source = ctx.createMediaStreamSource(stream)
    node = ctx.createScriptProcessor(4096, 1, 1)
    sink = ctx.createGain()
    sink.gain.value = 0 // 静音，不回放
    chunks = []
    node.onaudioprocess = (e) => {
      const ch = e.inputBuffer.getChannelData(0)
      chunks.push(new Float32Array(ch))
      // RMS 当音量指示，给按钮做呼吸动画
      let sum = 0
      for (let i = 0; i < ch.length; i += 8) sum += ch[i] * ch[i]
      const rms = Math.sqrt(sum / Math.max(1, ch.length / 8))
      level.value = Math.min(1, rms * 6)
    }
    source.connect(node)
    node.connect(sink)
    sink.connect(ctx.destination)
    startAt = Date.now()
    seconds.value = 0
    timer = setInterval(() => {
      seconds.value = Math.floor((Date.now() - startAt) / 1000)
      if (seconds.value >= maxSec) finish()
    }, 1000)
    state.value = 'rec'
    return true
  }

  function cancel() {
    if (state.value !== 'rec') return
    release()
    state.value = 'idle'
    seconds.value = 0
  }

  async function finish() {
    if (state.value !== 'rec') return
    const sampleRate = ctx?.sampleRate || 44100
    const raw = chunks
    release()
    const total = raw.reduce((n, c) => n + c.length, 0)
    if (!total) {
      state.value = 'idle'
      return
    }
    state.value = 'busy'
    try {
      // 合并采样块并线性降采样到 16kHz（识别端标准采样率，数据量也最小）
      const merged = new Float32Array(total)
      let off = 0
      for (const c of raw) {
        merged.set(c, off)
        off += c.length
      }
      const ratio = sampleRate / 16000
      const outLen = Math.max(1, Math.floor(merged.length / ratio))
      const pcm = new Float32Array(outLen)
      for (let i = 0; i < outLen; i++) pcm[i] = merged[Math.floor(i * ratio)] || 0
      // 音量归一化：麦克风小音量时识别端容易只听成一个"嗯"，峰值拉到 0.9
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
      const text = transcribe
        ? await transcribe(dataUrl)
        : (await cloudApi.aiAsr({ dataUrl })).text
      state.value = 'idle'
      seconds.value = 0
      const clean = String(text || '').trim()
      if (!clean) {
        onError?.('没听清，靠近麦克风再说一次')
        return
      }
      onText?.(clean)
    } catch (e) {
      state.value = 'idle'
      seconds.value = 0
      onError?.('语音识别失败：' + (e?.message || '未知错误'))
    }
  }

  function toggle() {
    if (state.value === 'rec') return finish()
    if (state.value === 'busy') return undefined
    return start()
  }

  onBeforeUnmount(() => {
    disposed = true
    release()
  })

  return { state, seconds, level, start, stop: finish, cancel, toggle }
}
