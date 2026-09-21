// 岛屿总览与室内页共用的静态配置。
// isle.webp (1536x1024) 里的岛不是等分格 —— 岛身/瀑布/花枝互相越过 512 边界,
// 下面是按 alpha 通道连通域实测的每座岛包围盒(left/top/width/height, 已含 8px 余量):
//   r1 樱花小屋   r1 灯塔海岛   r1 森林木屋
//   r2 雪屋      r2 秋日书屋   r2 石桥教堂
// 外观 key 与 server/index.js 的 ISLAND_ART_KEYS / db.js 回填保持一致。
import isleWebp from '@/assets/opt/isle.webp'
// 这 5 张原本单张 2.3~2.5MB, 已压到 200~290KB(src/assets/opt/, 由 scripts/_img_opt.cjs 生成)。
// ★ 2026-10-27：isle.webp（雪碧图）也换成 opt 版了 —— 先核对过两边尺寸**完全一致**
//   （1536×1024），岛身是按像素包围盒切分的，尺寸不变就不会错位；体积 2.14MB → 290KB。
import bgBlossom from '@/assets/opt/islandPart (2).webp'
import bgLagoon from '@/assets/opt/islandPart (3).webp'
import bgSnow from '@/assets/opt/islandPart (1).webp'
import bgDusk from '@/assets/opt/islandPart (4).webp'
import bgRoom from '@/assets/opt/spaceBackground.webp'

// 「所属空间」五个固定选项(总览页成岛顺序 = 用户添加记忆的先后)
export const ISLAND_OPTIONS = ['花信屿', '长昼屿', '拾穗屿', '眠雪屿', '暮光屿']

// 全部外观 key(前 5 个是主题默认外观, forest 是「更换小岛」多出来的备选)
export const ISLAND_ARTS = ['blossom', 'lagoon', 'forest', 'snow', 'amber', 'dusk']

// 主题名 -> 默认外观
export const DEFAULT_ART = {
  花信屿: 'blossom',
  长昼屿: 'lagoon',
  拾穗屿: 'amber',
  眠雪屿: 'snow',
  暮光屿: 'dusk',
}

// 外观 key -> 雪碧图上的真实包围盒(像素)。用 sharp 对 alpha 通道做连通域分析量出,
// 等分 3x2 会把邻岛的瀑布/花枝切进来, 别改回等分!
export const ART_SPRITE = {
  blossom: { left: 8, top: 24, w: 556, h: 502 },
  lagoon: { left: 556, top: 36, w: 508, h: 488 },
  forest: { left: 1076, top: 36, w: 452, h: 488 },
  snow: { left: 12, top: 534, w: 468, h: 482 },
  amber: { left: 492, top: 536, w: 524, h: 472 },
  dusk: { left: 1024, top: 540, w: 504, h: 468 },
}

// 岛的外观 key -> 室内背景。室内跟着「岛」走而不是跟空间名走:
// 自定义名字的空间也会分到一个岛(见后端 nextIslandArt), 点进去就有对应的室内,
// 「更换小岛」换外观的同时室内也会跟着换。
// islandPart 系列 4 张 + 原小屋共 5 张, forest(森林木屋)先借用绿植最多的海边小屋内景。
export const INTERIOR_BG = {
  blossom: bgBlossom,
  lagoon: bgLagoon,
  forest: bgLagoon,
  snow: bgSnow,
  amber: bgRoom,
  dusk: bgDusk,
}
const THEME_BG = { 花信屿: 'blossom', 长昼屿: 'lagoon', 拾穗屿: 'amber', 眠雪屿: 'snow', 暮光屿: 'dusk' }
export { THEME_BG }

// 各室内图里呼吸灯的落点(图片百分比坐标), kind 与记忆条目的 kind 对应。
// 按「岛的外观」取, 与 INTERIOR_BG 同一套 key。坐标按原图目测定位, 想微调只改这里。
export const LAMPS_BY_THEME = {
  // 花信屿(花房温室): 书桌摊开的日记本 / 右侧花架上的相框书堆 / 门口挂灯
  blossom: {
    memory: { x: 74, y: 60 },
    book: { x: 91.5, y: 22 },
    music: { x: 57, y: 47 },
  },
  // 长昼屿(海边小屋): 木桌上的手账 / 内侧书架 / 边几台灯
  lagoon: {
    memory: { x: 20, y: 70 },
    book: { x: 36, y: 17 },
    music: { x: 30.5, y: 41 },
  },
  // 拾穗屿(原小屋): 台灯下的日记本 / 高处书架 / 床头唱机(沿用旧坐标)
  amber: {
    memory: { x: 21.5, y: 66.2 },
    book: { x: 65, y: 23.1 },
    music: { x: 72, y: 45.4 },
  },
  // 眠雪屿(雪屋): 长桌摊开的书 / 壁炉旁书架 / 唱片机
  snow: {
    memory: { x: 59, y: 58 },
    book: { x: 23, y: 30 },
    music: { x: 86, y: 62 },
  },
  // 暮光屿(书房): 桌上摊开的笔记本 / 右侧高书架 / 单人沙发边几的灯
  dusk: {
    memory: { x: 27, y: 62 },
    book: { x: 92, y: 20 },
    music: { x: 88, y: 55 },
  },
}

export const LAMP_LABELS = { memory: '日记', book: '书架', music: '音乐' }

// 各室内图里「猫」的位置(图内百分比坐标) + 图片宽高比, 给想法气泡钉在猫头上用。
// 没画猫的室内图是 null —— 不显示气泡。
export const CAT_SPOTS = {
  amber: { x: 76, y: 55, ratio: 1556 / 1011 }, // 原小屋: 床上抬头的小橘
  snow: { x: 21, y: 73, ratio: 1672 / 941 }, // 雪屋: 地毯上睡觉的猫
  dusk: { x: 83, y: 70, ratio: 1672 / 941 }, // 书房: 地毯上睡觉的猫
  blossom: null, // 花房温室: 没有猫
  lagoon: null, // 海边小屋: 没有猫
  forest: null, // 森林木屋(暂借海边内景): 没有猫
}

export function islandWebp() {
  return isleWebp
}

// 岛屿在雪碧图上的 background-position/size, 按实测包围盒换算:
//   size% = 全图/格子, position% = left/(全图-格子) (CSS 百分比定位公式)
// 同时返回 aspectRatio, 让岛元素保持岛的真实形状而不是正方形。
export function islandSpriteStyle(art) {
  const key = ISLAND_ARTS.includes(art) ? art : 'blossom'
  const r = ART_SPRITE[key]
  return {
    backgroundImage: `url(${isleWebp})`,
    backgroundSize: `${((1536 / r.w) * 100).toFixed(4)}% ${((1024 / r.h) * 100).toFixed(4)}%`,
    backgroundPosition: `${((r.left / (1536 - r.w)) * 100).toFixed(4)}% ${((r.top / (1024 - r.h)) * 100).toFixed(4)}%`,
    aspectRatio: `${r.w} / ${r.h}`,
  }
}

// 岛的外观 key -> 室内背景图; 老数据没有外观字段时落回原小屋
export function interiorBgFor(art) {
  return INTERIOR_BG[art] || bgRoom
}

export function lampCoordsFor(art) {
  return LAMPS_BY_THEME[art] || LAMPS_BY_THEME.amber
}
