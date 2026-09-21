// DeepSeek 大模型对接入口
// 密钥只保存在服务端(server/.env 或部署平台环境变量), 前端统一经自建后端 action `ai/chat` 代理,
// 因此这里不再持有任何 VITE_ 前缀的密钥, 浏览器与 dist 产物中都拿不到 key。
// 未配置密钥 / 未登录 / 调用失败时, 调用方使用本地占位内容, 不影响界面联调。
import { cloudApi, getToken } from '@/api/cloud'

// 实际模型由服务端决定, 这里仅用于界面展示
export const DEEPSEEK_MODEL = 'deepseek-chat'

// null=尚未探测, true/false=已探测结果
let aiEnabled = null
// 文生图是否可用(需服务端同时配置 DeepSeek 与智谱密钥)
let imageEnabled = null
// 当前用户的 AI 生效权限(总开关 && 用户级开关): { reply, image } | null(未登录)
let aiPerm = null

// 探测服务端是否配置了 AI: 只需一次, 结果缓存
export async function refreshAiStatus(force = false) {
  if (aiEnabled !== null && !force) return aiEnabled
  try {
    const h = await cloudApi.health()
    aiEnabled = !!h?.ai
    imageEnabled = !!h?.aiImage
    // 服务端按「总开关 && 用户级开关」算好的生效权限; 未登录时为 null
    aiPerm = h?.aiPerm || null
  } catch {
    aiEnabled = false
    imageEnabled = false
    aiPerm = null
  }
  return aiEnabled
}

// 当前用户的 AI 生效权限(需先 refreshAiStatus); image=true 才展示「添加 AI 生图」入口,
// video=true 才展示「生成 AI 视频」入口(总开关 × 用户级开关, 服务端算好的)
export function aiPermInfo() {
  return aiPerm || { reply: false, image: false, video: false }
}

export function deepSeekReady() {
  return aiEnabled === true && !!getToken()
}

// 服务端是否具备「真出图」能力(智谱文生图)
export function imageReady() {
  return imageEnabled === true && !!getToken()
}

// messages: OpenAI 格式 [{ role: 'system' | 'user' | 'assistant', content }]
export async function chatWithDeepSeek(messages) {
  const data = await cloudApi.aiChat({ messages })
  return data?.content ?? ''
}
