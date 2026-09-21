// 统一 API 客户端: 对接 uniCloud 云函数 (HTTP URL化)
// 约定: POST { action, params, token } -> { code, msg, data }, code=0 为成功
const TOKEN_KEY = 'tp_token'

let token = localStorage.getItem(TOKEN_KEY) || ''

export function getToken() {
  return token
}
export function setToken(next) {
  token = next || ''
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export async function call(action, params = {}) {
  const baseUrl = import.meta.env.VITE_CLOUD_API_BASE || 'http://localhost:8787/api'
  
  let res
  try {
    res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params, token }),
    })
  } catch {
    throw new Error('无法连接服务器')
  }
  
  if (!res.ok) throw new Error('服务异常(HTTP ' + res.status + '), 请稍后重试')
  
  let json
  try {
    json = await res.json()
  } catch {
    throw new Error('服务返回数据异常, 请稍后重试')
  }
  
  if (json.code === 401) setToken('')
  if (json.code !== 0) throw new Error(json.msg || '请求失败')
  return json.data
}

export const cloudApi = {
  // 系统
  health: () => call('system/health'),
  // AI(密钥在服务端, 前端只做代理转发)
  aiChat: (p) => call('ai/chat', p),
  // 记忆封面: 服务端用 DeepSeek 扩写画面描述, 再由智谱文生图, 返回封面地址
  aiCover: (p) => call('ai/cover', p),
  // 认证
  register: (p) => call('auth/register', p),
  login: (p) => call('auth/login', p),
  // 微信扫码登录/注册: 只传云服务的 accessToken, 身份由服务端向云端核实
  wechatLogin: (p) => call('auth/wechat-login', p),
  me: () => call('auth/me'),
  // 会话门禁: 让服务端验一次 token 真伪(而不是只信 localStorage)
  session: () => call('auth/session'),
  updateProfile: (p) => call('auth/profile/update', p),
  changePassword: (p) => call('auth/password/change', p),
  // 绑定 / 换绑手机号（微信扫码拿不到手机号时用这个补）
  bindPhone: (p) => call('auth/bind-phone', p),
  getSettings: () => call('settings/get'),
  updateSettings: (p) => call('settings/update', p),
  // 分享
  listShares: () => call('share/list'),
  createShare: (p) => call('share/create', p),
  updateShare: (p) => call('share/update', p),
  removeShare: (p) => call('share/remove', p),
  viewShare: (p) => call('share/view', p),
  // 删除所有数据
  deleteAllData: () => call('user/deleteAll'),
  deleteAccount: (p) => call('user/deleteAccount', p),
  // 导出我的记忆 (Markdown)
  exportMemories: () => call('user/export'),
  // 用户统计
  getUserStats: (p) => call('user/stats', p),
  recommendSpaces: () => call('space/recommend'),
  randomUsers: () => call('user/random'),
  listUserPublic: (p) => call('memory/user/public', p),
  // 记忆
  listSpaces: () => call('memory/space/list'),
  createSpace: (p) => call('memory/space/create', p),
  updateSpace: (p) => call('memory/space/update', p),
  removeSpace: (p) => call('memory/space/remove', p),
  clearSpace: (p) => call('memory/space/clear', p),
  listMyItems: () => call('memory/item/my'),
  listItems: (p) => call('memory/item/list', p),
  // 岛屿总览(我的记忆空间): 每条记忆自己是一座岛; 编辑悬停文案/外观; 删除 = 删该条记忆
  listIslands: () => call('memory/island/list'),
  updateIsland: (p) => call('memory/island/update', p),
  getSpace: (p) => call('memory/space/get', p),
  itemDetail: (p) => call('memory/item/detail', p),
  createItem: (p) => call('memory/item/create', p),
  updateItem: (p) => call('memory/item/update', p),
  removeItem: (p) => call('memory/item/remove', p),
  // 分享到拾光广场(公开) / 取消分享(只留在记忆空间)
  shareItem: (p) => call('memory/item/share', p),
  unshareItem: (p) => call('memory/item/unshare', p),
  // 共享记忆与评论
  listSharedItems: () => call('memory/shared/list'),
  listMemoryComments: (p) => call('memory/comment/list', p),
  createMemoryComment: (p) => call('memory/comment/create', p),
  removeMemoryComment: (p) => call('memory/comment/remove', p),
  likeMemory: (p) => call('memory/like', p),
  unlikeMemory: (p) => call('memory/unlike', p),
  checkMemoryLike: (p) => call('memory/checkLike', p),
  // 广场
  uploadMedia: (p) => call('media/upload', p),
  // 视频/音频上传(记忆与广场帖子附件)
  uploadMediaAv: (p) => call('media/upload-av', p),
  // AI 语音识别: 把录音(dataURL)转成文字
  aiAsr: (p) => call('ai/asr', p),
  // 背景音乐: 预置四首打包在前端, 这里管理用户自传曲目
  listBgm: () => call('bgm/list'),
  uploadBgm: (p) => call('bgm/upload', p),
  removeBgm: (p) => call('bgm/remove', p),
  listPosts: (p) => call('square/post/list', p),
  createPost: (p) => call('square/post/create', p),
  updatePost: (p) => call('square/post/update', p),
  postDetail: (p) => call('square/post/detail', p),
  removePost: (p) => call('square/post/remove', p),
  toggleLike: (p) => call('square/like/toggle', p),
  listComments: (p) => call('square/comment/list', p),
  createComment: (p) => call('square/comment/create', p),
  removeComment: (p) => call('square/comment/remove', p),
  // 收藏 / 关注
  toggleFavorite: (p) => call('favorite/toggle', p),
  listFavorites: (p) => call('favorite/list', p),
  toggleFollow: (p) => call('follow/toggle', p),
  checkFollow: (p) => call('follow/check', p),
  // 粉丝: 本人能拿到名单, 看别人只有数量(服务端强制区分, 不靠前端隐藏)
  listFollowers: (p) => call('follow/followers', p),
  listFollowing: () => call('follow/following'),
  // AI 会话
  listConversations: () => call('ai/conversation/list'),
  createConversation: (p) => call('ai/conversation/create', p),
  removeConversation: (p) => call('ai/conversation/remove', p),
  listMessages: (p) => call('ai/message/list', p),
  addMessage: (p) => call('ai/message/add', p),
  // AI 润色: 管理中心新建活动 / 发送通知时的 ✨ 按钮(仅管理员)
  // kind: 'activity' | 'notice'; 传 title + content 草稿, 拿回润色后的 { title, content }
  aiPolish: (p) => call('ai/polish', p),
  // 宠物
  getPet: () => call('pet/get'),
  updatePet: (p) => call('pet/update', p),
  interactPet: () => call('pet/interact'),
  // 反馈
  createFeedback: (p) => call('feedback/create', p),
  listFeedback: () => call('feedback/list'),
  removeFeedback: (p) => call('feedback/remove', p),
  replyFeedback: (p) => call('feedback/reply', p),
  // 举报
  createReport: (p) => call('report/create', p),
  // 活动
  listActivities: () => call('activity/list'),
  listActivityComments: (p) => call('activity/comment/list', p),
  createActivityComment: (p) => call('activity/comment/create', p),
  joinActivity: (p) => call('activity/join', p),
  unjoinActivity: (p) => call('activity/unjoin', p),
  checkActivityJoin: (p) => call('activity/checkJoin', p),
  likeActivity: (p) => call('activity/like', p),
  unlikeActivity: (p) => call('activity/unlike', p),
  checkActivityLike: (p) => call('activity/checkLike', p),
  // 通知
  listNotifications: () => call('notification/list'),
  sendNotification: (p) => call('notification/send', p),
  // 管理端通知列表: 走 admin/notification/list 而不是 notification/list ——
  // 后者是「我自己收到的」且只回最近 10 条(广场公告条用), 管理中心要能看到全部历史。
  adminListNotifications: () => call('admin/notification/list'),
  adminRemoveNotification: (p) => call('admin/notification/remove', p),
  // 私信(pm/* 为当前使用的实现)
  sendPm: (p) => call('pm/send', p),
  listPm: (p) => call('pm/list', p),
  markPmRead: (p) => call('pm/markRead', p),
  pmUnreadCount: () => call('pm/unreadCount'),
  deletePm: (p) => call('pm/delete', p),
  // 管理员
  adminListFeedback: (p) => call('admin/feedback/list', p),
  adminUpdateFeedback: (p) => call('admin/feedback/update', p),
  adminRemoveFeedback: (p) => call('admin/feedback/remove', p),
  adminListReports: (p) => call('admin/report/list', p),
  adminReportDetail: (p) => call('admin/report/detail', p),
  adminUpdateReport: (p) => call('admin/report/update', p),
  adminRemoveReport: (p) => call('admin/report/remove', p),
  adminListActivities: () => call('admin/activity/list'),
  adminCreateActivity: (p) => call('admin/activity/create', p),
  adminUpdateActivity: (p) => call('admin/activity/update', p),
  adminRemoveActivity: (p) => call('admin/activity/remove', p),
  adminListUsers: (p) => call('admin/user/list', p),
  adminResetUserPassword: (p) => call('admin/user/resetPassword', p),
  adminUpdateUser: (p) => call('admin/user/update', p),
  adminSetAdmin: (p) => call('admin/user/setAdmin', p),
  adminRemoveUser: (p) => call('admin/user/remove', p),
  // AI 使用管理: 总开关 + 单个用户权限
  adminGetAiConfig: () => call('admin/ai/config'),
  adminSetAiConfig: (p) => call('admin/ai/setConfig', p),
  // AI 密钥(只有超级管理员能调): 读回来的是掩码, 写进去立刻生效
  adminGetAiKeys: () => call('admin/ai/keys'),
  adminSetAiKey: (p) => call('admin/ai/keys/set', p),
  adminSetUserAiPerm: (p) => call('admin/user/setAiPerm', p),
  // AI 生成视频(图生视频): 提交任务 / 轮询结果
  aiVideoCreate: (p) => call('ai/video/create', p),
  aiVideoSync: (p) => call('ai/video/sync', p),
}
