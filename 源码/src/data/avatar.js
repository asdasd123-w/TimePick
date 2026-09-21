// 默认用户头像（2026-10-27 用户指定）：一只橘猫，放在暖色渐变底上。
//
// 为什么单独抽一个文件而不是各页面写死路径：
//   · 以前没上传头像时，各处各自处理 —— 侧栏是一个粉橙渐变圆、广场是昵称首字、
//     个人中心是「照片预留」文字，同一个用户在不同页面长得完全不一样；
//   · 现在统一走 DEFAULT_AVATAR：**用户自己传过头像就用他传的**，
//     没传过才回落到这张猫。改图只改这里一处。
import DEFAULT_AVATAR from '@/assets/opt/avatar-default.webp'

export { DEFAULT_AVATAR }

/**
 * 取用户头像地址：有自定义头像用自定义的，否则用默认橘猫。
 * @param {{avatar?: string} | null | undefined} profile user 或 user_profile
 */
export function avatarOf(profile) {
  const url = profile && typeof profile === 'object' ? profile.avatar : ''
  const s = String(url || '').trim()
  return s || DEFAULT_AVATAR
}
