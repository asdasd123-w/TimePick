import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
// ★★ 两套图，别混用（2026-10-29 修）：
//   src   = 原尺寸高清图（1536×2288 那种）。**帧表坐标就是它的像素坐标**，
//           宠物本体（桌面 140×178、手机 92×117）必须用它：换 1/3 小图后
//           每帧只有 63×69 个像素被拉到 146px 宽，实测糊成一片。
//   small = 原图的 1/3（512×763）。只给「肉眼 24~48px」的小头像和 52px 的
//           跑酷 canvas 用，省的是解码内存而不是画质。
//   ★ 两者坐标系差 3 倍：canvas 里 drawImage 的 source 矩形必须乘
//     sheetRatio()，写死比例会在重新压图后悄悄切到隔壁格子（跑酷小猫乱码就是它）。
import sheetOrange from '../assets/spritesheet.webp'
import sheetCalico from '../assets/cat-calico.webp'
import sheetTabby from '../assets/cat-tabby.webp'
import sheetTuxedo from '../assets/cat-tuxedo.webp'
import sheetWhite from '../assets/cat-white.webp'
import sheetOrangeS from '../assets/pet/cat-orange-s.webp'
import sheetCalicoS from '../assets/pet/cat-calico-s.webp'
import sheetTabbyS from '../assets/pet/cat-tabby-s.webp'
import sheetTuxedoS from '../assets/pet/cat-tuxedo-s.webp'
import sheetWhiteS from '../assets/pet/cat-white-s.webp'
import { PET_FRAMES, PET_CONTENT } from '../data/petFrames'

// 每张花色的逐帧裁剪窗口都不同: 虽然是同一套动作的换色素材, 但画布尺寸、
// 帧在格子里的落位、甚至同一个动作的行高都有 ±10px 的抖动(三花/虎斑的
// 猫身还比橘猫大约 4%)。早期按"橘猫网格等比换算"的做法会把耳尖、尾巴切掉,
// 所以现在改成逐张实测的帧表(src/data/petFrames.js), 渲染时直接取素材像素坐标。
export const SHEET_BASE_W = 1536
export const SHEET_BASE_H = 2288

// w/h 是**原始素材**的逻辑尺寸（帧表就是按这个坐标系实测的）。
// small 是同一张图的 1/3，尺寸信息这里不重复写 —— 用 sheetRatio() 现算。
export const PET_SHEETS = {
  橘猫: { src: sheetOrange, small: sheetOrangeS, w: 1536, h: 2288 },
  三花猫: { src: sheetCalico, small: sheetCalicoS, w: 1027, h: 1532 },
  虎斑猫: { src: sheetTabby, small: sheetTabbyS, w: 1027, h: 1531 },
  黑白猫: { src: sheetTuxedo, small: sheetTuxedoS, w: 1024, h: 1536 },
  白猫: { src: sheetWhite, small: sheetWhiteS, w: 1024, h: 1536 },
}

// 帧表坐标(按 w/h) → 某张实际图片的像素坐标，差一个比例。
// 高清图是 1，1/3 小图是 0.333；从 naturalWidth 现算，换图不会错位。
export function sheetRatio(sheet, img) {
  const nw = img && img.naturalWidth
  return sheet && nw ? nw / sheet.w : 1
}

// 各花色的帧表 + 猫身内容的真实尺寸(用来折算统一的显示大小)
export { PET_FRAMES, PET_CONTENT }

// 取某花色的逐帧裁剪窗口(素材像素坐标)
export function petRows(type) {
  return PET_FRAMES[normalizePetType(type)]
}

// 猫身内容的尺寸: 不能拿窗口宽折算 —— 窗口边界取的是"整格宽"(为了在相邻帧之间
// 留出透明间隔), 比猫身宽一截, 用它算 SCALE 会让不同素材的猫差 5% 大。
export function petMetrics(type) {
  const key = normalizePetType(type)
  if (PET_CONTENT[key]) return PET_CONTENT[key]
  const rows = PET_FRAMES[key]
  let fw = 0
  let fh = 0
  for (const r of rows) {
    fh = Math.max(fh, r.y[1] - r.y[0] + 1)
    for (const [a, b] of r.f) fw = Math.max(fw, b - a + 1)
  }
  return { w: fw, h: fh }
}

// 全部宠物都有精灵图(旧的"布偶猫/黑猫"占位项已由新素材替换)
export const PET_TYPES = Object.keys(PET_SHEETS)
export const PET_WITH_SPRITE = PET_TYPES.reduce((m, k) => ((m[k] = true), m), {})
export const DEFAULT_PET_TYPE = '橘猫'

// 花色的本地缓存: 服务端那份是权威的, 但读取是异步的, 而且 PetCompanion 可能在
// 登录前就挂载了(主页与欢迎页同时在 DOM 里)。没有缓存时, 每次进站都会先显示默认的
// 橘猫再跳变, 服务端不可达/还没登录时更是整场都是橘猫 —— 用户看到的就是
// "昨天选的猫第二天变成第一只"。所以本地存一份, 首帧就直接用, 服务端回来再覆盖。
const PET_TYPE_KEY = 'timepick-pet-type'

function readPetTypeCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(PET_TYPE_KEY) || 'null')
    if (raw && typeof raw.type === 'string') return raw
  } catch (e) {
    /* localStorage 不可用时忽略 */
  }
  return null
}

function writePetTypeCache(type, uid) {
  try {
    localStorage.setItem(
      PET_TYPE_KEY,
      JSON.stringify({ uid: Number(uid) || 0, type: normalizePetType(type) })
    )
  } catch (e) {
    /* 忽略 */
  }
}

// 退出登录时必须清掉: 否则下一个账号会先闪一下上一个人的花色
export function clearPetTypeCache() {
  try {
    localStorage.removeItem(PET_TYPE_KEY)
  } catch (e) {
    /* 忽略 */
  }
}

// 老数据里的 'cat'/未知值/已下线的花色, 一律回落到橘猫, 避免前端拿到无素材的名字
export function normalizePetType(type) {
  return PET_SHEETS[type] ? type : DEFAULT_PET_TYPE
}

export function petSheet(type) {
  return PET_SHEETS[normalizePetType(type)]
}

// AI 陪伴面板的全局开关: 记忆空间双击小猫 / 宠物菜单"找小橘聊天" 共用同一个面板
export const useCompanionStore = defineStore('companion', () => {
  const showAi = ref(false)
  const petEnabled = ref(true)
  // 首帧就用本地缓存的花色, 避免"先橘猫再跳变"
  const petType = ref(normalizePetType(readPetTypeCache()?.type))
  const hasSprite = computed(() => !!PET_WITH_SPRITE[petType.value])

  function openAi() {
    showAi.value = true
  }

  function closeAi() {
    showAi.value = false
  }

  function setPetEnabled(enabled) {
    petEnabled.value = enabled
  }

  // uid 可选: 传了就把缓存绑定到该账号, 便于排查"换账号后花色串了"
  function setPetType(type, uid) {
    petType.value = normalizePetType(type)
    writePetTypeCache(type, uid)
  }

  return { showAi, petEnabled, petType, hasSprite, openAi, closeAi, setPetEnabled, setPetType }
})

// dev 下让 store 定义可被热替换(详见 memories.js 里的说明)
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCompanionStore, import.meta.hot))
}
