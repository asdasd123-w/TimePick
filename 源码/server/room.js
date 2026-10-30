// 3D 房间摆件模块（sg3d 与 TimePick 打通的核心数据层）
// ---------------------------------------------------------------------------
// 职责：
//   1) 为「记忆空间」(一个 space_id = 一间 3D 房间) 的每一条记忆生成一件家具摆放方案；
//   2) AI 摆件用已有的 DeepSeek（服务端密钥，不暴露给前端），失败自动退回规则兜底；
//   3) 数据落库到 room_prop 表；删除记忆时由外键 CASCADE 连带删除。
// 设计原则：本模块只做数据，不碰 HTTP 协议；所有入参都来自 index.js 的 handler。
import db from './db.js'
import { decideProp } from './propEmbed.js'

const now = () => Date.now()

// 13 种家具白名单（与 sg3d assets/resources/models/furniture/ 下的文件名一一对应）
export const FURNITURE_WHITELIST = [
  'bed', 'desk', 'chair', 'cabinet', 'computer', 'diary', 'cup',
  'camera_my', 'schoolbag', 'tableLamp', 'record', 'greenbook', 'yellowbook',
]
const FURNITURE_SET = new Set(FURNITURE_WHITELIST)

// room_prop.reason 只有两个合法取值，含义是「这行的摆位是自动生成的，还是人指定的」：
//   旧版本按内容分类挑家具时写前者，后来按标题+内容挑时写后者。repair 靠这两个值
//   筛出"可以安全重算"的行 —— 所以它**不能**拿来放"放在桌面上"这类展示文案，
//   摆放位置由 support 字段表达（前端据此显示「摆在书桌上 / 放进书架隔板」）。
const LEGACY_REASON = '按记忆类型自动摆放'
const RULE_REASON = '按标题与内容自动摆放'

// 房间可摆放范围。与 sg3d 的 RoomSpec.ts 严格对应：
//   house_three 原始 0.7356 × 0.3481 × 0.8897，在 Cocos 里整体放大 4.5 倍并居中到原点，
//   于是房间世界包围盒 = X ±1.6551、Y 0..1.5665、Z ±2.0018。
//   各轴再留出约 0.5 的家具半宽（最大的摆件约 1.0 宽），就是下面的可摆范围，
//   保证家具不会穿出墙体。
const ROOM_HALF_X = 1.15
const ROOM_HALF_Z = 1.5
const ROT_STEPS = [0, 90, 180, 270]

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0))
const clampX = (v) => clamp(v, -ROOM_HALF_X, ROOM_HALF_X)
const clampZ = (v) => clamp(v, -ROOM_HALF_Z, ROOM_HALF_Z)

// ---------------------------------------------------------------------------
// 摆放：槽位制 + 承托关系
// ---------------------------------------------------------------------------
// 原来用黄金角螺旋 + rot_y 按 count%4 轮转，毛病很明显（用户原话：摆放没规律、柜子放反了）：
//   · 所有家具都挤在半径 1.35 的一个圆里，谁挨着谁全看添加顺序，没有"靠墙/居中"的概念；
//   · rot_y 是 count%4 硬轮转的，跟它在哪、该朝哪毫无关系 —— 书柜拿到 180° 就正好背面朝人。
//
// 现在分三层：
//   1) 槽位表 —— 沿三面墙一圈的落地槽位（WALL_SLOTS）+ 房间中央一圈（FLOOR_SLOTS）。
//      每格只放一件，天然不重叠；每格带一个「墙外法线」，用来算朝向。
//   2) 朝向策略（FACING）——
//        书柜/桌子/显示器这类"正面看得出来"的：正面朝房间中心；
//        床：床头朝墙、床尾朝外（实测床模型的床头在局部 -z 端）；
//        平躺的书本、轴对称的杯子相机：固定 0°（跟着"朝中心"转只会变成一堆歪着的斜角）。
//   3) 承托关系（SURFACES）—— 桌上的东西摆桌面上、书塞进书架隔板，y 直接写支撑面高度。
//
// ★ 关键：3D 侧 `placeFurniture` 本来就是 `y = (p.y||0) + ROOM_FLOOR_Y`，
//   y 的语义一直是"离室内地板面多少米"。所以"放桌上/放柜里"**完全在后端算完即可，
//   Cocos 工程一行都不用改**。
//
// 朝向公式（已实测书柜正面在 rot_y=0 时朝 +Z）：绕 Y 转 θ 度后正面指向 (sin,0,cos)，
// 要它指向中心 (0,0) 就是 θ = atan2(-x, -z)（**注意负号**）。
// 床头朝墙同理：床头在局部 -z，Ry(θ)(0,0,-1) = (-sinθ,0,-cosθ) 要等于墙外法线 n，
// 于是 θ = atan2(-n.x, -n.z)。

/** 家具最终尺寸（米）= glb 原始尺寸 × FurnitureSpec 缩放。
 *  必须与 `sg3d/assets/scripts/core/FurnitureSpec.ts` 的注释表一致，改一处要同步改另一处。 */
const FURNITURE_SIZE = {
  bed: [0.24, 0.15, 0.34],
  desk: [0.33, 0.19, 0.17],
  chair: [0.2, 0.23, 0.11],
  cabinet: [0.19, 0.36, 0.08],
  computer: [0.27, 0.17, 0.27],
  record: [0.27, 0.21, 0.27],
  schoolbag: [0.24, 0.28, 0.24],
  tableLamp: [0.27, 0.38, 0.27],
  camera_my: [0.34, 0.1, 0.33],
  cup: [0.34, 0.23, 0.24],
  diary: [0.24, 0.06, 0.33],
  greenbook: [0.22, 0.05, 0.34],
  yellowbook: [0.22, 0.05, 0.34],
}

/**
 * 场景固定家具（床×2 / 书桌 / 椅子 / 柜×2 / 花×4 / 小柜 / 小桌）的**实际**世界尺寸。
 *
 * ★ 为什么单独一张表：它们在 main.scene 里是**预制体实例**，世界缩放 = 房间(10) × 局部 lscale，
 *   用户在编辑器里设的；而记忆家具的基准缩放是 0.34。两者缩放不同，blockSlotsUnder 必须按各自
 *   真实尺寸算，否则会按记忆家具的小尺寸去避让，结果床/桌明明占了很大地方，槽位却没被标记出来，
 *   小件就会塞到床底下。
 *   （尺寸单位：世界单位；y 分量不参与落地避让，仅占位。）
 */
const FIXED_SCENE_SIZE = {
  bed: [1.38, 0.86, 1.97],
  desk: [1.92, 1.14, 1.02],
  chair: [0.6, 1.28, 0.63],
  cabinet: [1.1, 2.12, 0.45],
  // 新增装饰（纯场景自带，纳入避让避免记忆小件重叠；尺寸为粗略占地，略放宽）
  // 用户新加的装饰地毯（vending.glb 改名后平铺在地面上）：几乎没厚度，只登记占地
  carpet: [2.36, 0.02, 2.38],
  flower_one: [0.4, 0.6, 0.4],
  flower_tow: [0.7, 1.4, 0.7],
  small_cupboard: [0.8, 1.4, 0.8],
  small_table: [0.9, 1.2, 0.9],
}

const DEG = 180 / Math.PI
function faceCenterRot(x, z) {
  return +Math.atan2(-x, -z) * DEG
}

/**
 * 落地槽位。n = 墙外法线（从家具指向墙外），只有贴墙槽位有；中央槽位为 null。
 * fit 用来做尺寸匹配：'deep' 是给长家具（床 1.53 长，得沿侧墙放）的位置，
 * 'wide' 是给宽家具（桌 1.2 宽）的位置。
 */
function slot(id, x, z, n, fit) {
  return { id, x: +x.toFixed(2), z: +z.toFixed(2), n, fit, rot_y: Math.round(faceCenterRot(x, z)) }
}
function flatSlot(x, z) {
  return { id: `f${x},${z}`, x: +x.toFixed(2), z: +z.toFixed(2), n: null, fit: null, rot_y: 0 }
}

// 后墙（实墙，带窗那面）、左墙、右墙（含门），以及前侧两个角
//
// ★ 槽位坐标是「家具背面贴的那个面」，也就是**室内地板的边缘**，不是房间模型的外壳。
//   实测 house_three.glb（room_walls / walls2）：
//     后 z=-0.421(原始) p95高度 0.313 → 实墙
//     右 x=+0.327            p95高度 0.314 → 实墙
//     左 x=-0.409            p95高度 0.140 → **栏杆**
//     前 z=+0.469            p95高度 0.131 → **栏杆**
//   室内地板只有 |x|<1.125、|z|<1.44（原始 0.25/0.32 × 4.5）。
//   ★ 所以槽位必须落在地板边缘 —— 早先写 ±1.36 / -1.3 是按房间外壳给的，
//     placeFloor 再往里推半跨之后，家具背面就跑到地板外、悬在栏杆上（实测过）。
//   贴墙家具只有「右墙 / 后墙」两个方向可选；左侧和前方是栏杆，家具靠上去是"靠着栏杆"。
// 可摆放范围 = 房间包围盒（house_three × 10）再内收一点，
// 注意房间**不是左右对称**的（原始 x -0.4089..0.3267，中心偏 -0.041），所以边界也不对称。
// 之前按「室内地板原始 ±0.25/±0.32」估成 ±2.5/±3.2 偏小太多 —— 用户手搭的书桌左缘到 -3.61、
// 床后缘到 -3.58，都在那个范围之外，会把家具判成"超出地板"。
const FLOOR_MIN_X = -3.7
const FLOOR_MAX_X = 3.0
const FLOOR_MIN_Z = -3.8
const WALL_SLOTS = [
  slot('back', 0.0, FLOOR_MIN_Z, [0, -1], 'wide'),
  slot('backL', -2.4, -2.6, [-0.8, -0.6], 'wide'),
  slot('backR', 2.0, -2.6, [0.8, -0.6], 'wide'),
  slot('left', FLOOR_MIN_X, -0.5, [-1, 0], 'deep'),
  slot('right', FLOOR_MAX_X, -0.5, [1, 0], 'deep'),
  slot('leftF', -3.2, 2.2, [-0.7, 0.7], 'wide'),
  slot('rightF', 2.8, 2.2, [0.7, 0.7], 'wide'),
]
/**
 * 房间中央的落地槽位。
 *
 * ★ 这张表是**按"固定家具已占位"之后剩下的空地**排的，不能按通用房间想当然地摆：
 *   固定家具（床贴左+后、柜贴右+后、桌贴前）会吃掉大部分区域，
 *   剩下的主要是「书桌右侧 → 书柜前沿」那一块，15 件里桌/柜能承接 7 件、
 *   还有 8 件要落地。槽位少于 8 个，pickSlot 就会溢出到螺旋兜底、
 *   把家具丢到地板外（实测报过「超出地板」）。
 */
const FLOOR_SLOTS = [
  flatSlot(-1.5, -0.6),
  flatSlot(-0.75, -0.6),
  flatSlot(0.0, -0.6),
  flatSlot(0.75, -0.6),
  flatSlot(1.5, -0.6),
  flatSlot(-1.5, 0.2),
  flatSlot(-0.75, 0.2),
  flatSlot(0.0, 0.2),
  flatSlot(0.75, 0.2),
  flatSlot(1.5, 0.2),
  flatSlot(-1.5, 1.0),
  flatSlot(-0.75, 1.0),
  flatSlot(0.0, 1.0),
  flatSlot(0.75, 1.0),
  flatSlot(1.5, 1.0),
  flatSlot(-1.5, 1.8),
  flatSlot(-0.75, 1.8),
  flatSlot(0.0, 1.8),
  flatSlot(0.75, 1.8),
  flatSlot(1.5, 1.8),
  flatSlot(2.4, 0.2),
  flatSlot(2.4, 1.0),
  flatSlot(2.4, 1.8),
  flatSlot(-2.4, 0.2),
  flatSlot(-2.4, 1.0),
]

// 哪些家具算"落地大件"。
// ★ 注意 computer / record **不在这里**：显示器和唱片机是"优先摆到书桌上"的东西，
//   只有房间里有桌子时桌面放不下，才轮到它们落地。把它们当大件会有两个后果：
//   ① 它们会去抢墙上的槽位；② 桌面容量被日记/水杯这类先占满，显示器反而摆不上去。
const BIG_FURNITURE = new Set(['bed', 'desk', 'cabinet', 'chair'])

/**
 * 只允许摆在**桌面**上的小件。
 *
 * 需求原话：「这个柜子里面和桌子上都可以放东西（但电脑书包只可以放桌子上）」。
 * 所以电脑 / 书包这两件既不进柜子隔板、也不丢地上 —— 桌面满了也硬放桌上
 * （见 placeOnDesk 的 allowFull），否则"只可以放桌子上"就破了。
 */
const DESK_ONLY = new Set(['computer', 'schoolbag'])

// 朝向策略：'wall' = 床头朝墙（只有床）；'center' = 正面朝房间中心；'flat' = 固定 0°
const FACING = {
  bed: 'wall',
  desk: 'center',
  cabinet: 'center',
  computer: 'center',
  record: 'center',
  chair: 'center',
}

// 床/桌椅/柜子的槽位适配顺序（'deep' = 侧墙的长边位，'wide' = 靠后墙的宽位）
//
// ★ 布局是按房间尺寸倒推的（净宽 2.3 米 × 净深 3.0 米），别随手改：
//   床（1.53×1.07）长轴必须沿**深度**，所以它独占了正后方那个 'wide' 位 ——
//     沿宽度摆会占掉 2/3 的房间宽度，而且床头那半截必然伸到侧墙外、
//     直接穿出栏杆悬在房间外（踩过这个坑）。
//   书桌（1.2 宽）和书柜（0.71 宽）转到侧墙的 'deep' 位：长边顺着侧墙走，
//     既不跟床抢地方，也正好是"书桌靠墙、柜子贴墙"的常规布置。
//   一床 + 一桌 + 一柜正好把三面墙占满，是这个房间能容纳的上限。
const SLOT_FIT = {
  bed: ['wide'],
  desk: ['deep', 'wide'],
  cabinet: ['deep', 'wide'],
  chair: ['wide', 'deep'],
}

// ---------------------------------------------------------------------------
// 承托关系：柜子里放书、桌子上放电脑台灯
// ---------------------------------------------------------------------------
const DESK_CAP = 6 // 一张桌子最多压几件小东西（桌面 1.2×0.64，摆 6 件约 0.3 的小东西并不挤）

/**
 * 各家具在支撑面上的「有效占地半径」（米），**分横向 rx / 纵向 rz**。
 *
 * ★ 不等于外壳的一半 —— 外壳尺寸见 FURNITURE_SIZE，但：
 *   台灯 0.36 宽那是灯罩，底座其实很小；杯子 0.25 宽是杯身含把手，落在桌面上只占一小圈；
 *   显示器 0.67 深是**屏幕立起来**的深度，真正占桌面的是那块薄底座（约 0.2 深）。
 *   按外壳算的话，「显示器 + 台灯」永远放不上 1.2×0.64 的桌面（实测怎么摆都冲突）。
 */
const FOOTPRINT = {
  computer: { rx: 0.12, rz: 0.08 },
  record: { rx: 0.15, rz: 0.14 },
  tableLamp: { rx: 0.13, rz: 0.13 },
  cup: { rx: 0.09, rz: 0.09 },
  diary: { rx: 0.16, rz: 0.11 },
  greenbook: { rx: 0.15, rz: 0.11 },
  yellowbook: { rx: 0.15, rz: 0.11 },
  camera_my: { rx: 0.12, rz: 0.12 },
  schoolbag: { rx: 0.13, rz: 0.13 },
}
const DEFAULT_FOOT = { rx: 0.14, rz: 0.14 }

/**
 * 桌面候选点（**书桌局部坐标**，会随书桌朝向一起转）。
 * 书桌 1.92 × 1.02（用户场景单位），半宽 0.96 / 半深 0.51，候选点排在这之内。
 * 顺序即优先级：越靠前越"好位"—— 大件先占中央，小件往后排。
 */
const DESK_GRID = [
  [0, 0],
  [-0.35, 0],
  [0.35, 0],
  [-0.7, 0],
  [0.7, 0],
  [-0.35, -0.3],
  [0.35, -0.3],
  [-0.7, -0.3],
  [0.7, -0.3],
  [0, 0.3],
  [-0.35, 0.3],
  [0.35, 0.3],
  [-0.7, 0.3],
  [0.7, 0.3],
  [0, -0.42],
  [0, 0.42],
]

/** 在桌面上找一个不与已摆物件冲突的候选点；没有就返回 null（该件只能落地） */
function findDeskSpot(desk, furniture) {
  const r = FOOTPRINT[furniture] || DEFAULT_FOOT
  for (const c of DESK_GRID) {
    // 分轴矩形判重叠：桌上摆的都是平贴的物件，用欧氏距离会误判斜着挨着的两个
    const hit = desk._slots.some(
      (u) => Math.abs(u.x - c[0]) < u.rx + r.rx + 0.04 && Math.abs(u.z - c[1]) < u.rz + r.rz + 0.04,
    )
    if (!hit) return { spot: c, r }
  }
  return null
}

const SURFACES = {
  desk: {
    // ★ 桌面真实高度 = 0.51(原始) × 1.25(缩放) = **0.6375**，不是包围盒总高 0.71。
    //   离线解析 desk.glb 的顶点密度：y=0.51 那层顶点数最多(2497)，就是桌面。
    //   之前用 0.71，等于桌上所有东西都浮空 7 厘米（肉眼可见"悬在上面"）。
    top: 1.02, // desk.glb 桌面 y=0.51 × 家具缩放 2
    // 台灯/杯子/相机这类"底座小"的东西不限位置（走网格找空位）；
    // 显示器/唱片机这类"占地方"的优先用桌面的中央位。见 FOOTPRINT / DESK_GRID。
    slots: null,
  },
  cabinet: {
    // 书是"塞进隔板"，不是"放柜顶"。
    // ★ 隔板高度是实测的：cabinet.glb 的 y 层顶点峰值在
    //   0.06(柜底) / 0.31 / 0.49 / 0.66 / 0.84 / 1.06(柜顶)，×1.3 后就是下面这些板面。
    //   去掉最底(0.078)和最顶(1.378，柜顶板)——底下是柜体，顶上会挡视线。
    //
    // ★ 为什么柜里的书要用 scale 0.5（SHELF_BOOK_SCALE）：
    //   柜内腔只有 0.26 深、层间距只有 0.22 高，而书本平躺是 0.36×0.48。
    //   平躺穿柜子、竖起来（tilt 90°）穿上一层隔板 —— 两条路都走不通。
    //   所以柜里的书按小一号摆：0.18×0.045×0.24，正好塞进内腔（深度 0.24 < 0.26）。
    //   每层能放 3 本（柜内宽 0.71，0.18×3 + 间隙 够）。
    shelf: {
      levels: [0.62, 0.98, 1.32], // cabinet.glb 隔板 0.31/0.49/0.66 × 缩放 2
      xs: [[-0.22, 0], [0, 0], [0.22, 0]],
    },
  },
}
/** 塞进书架隔板的书要缩小一号（见上面 shelf 的说明） */
const SHELF_BOOK_SCALE = 1
/** 哪些家具能塞进书架隔板 */
const IN_SHELF = new Set(['diary', 'greenbook', 'yellowbook'])
/**
 * 内容里出现这些词时，这本书**优先**往书架隔板上放（注意：只是排序优先级，
 * 不是准入条件 —— 所有书本类家具都能进柜子）。
 * 为什么还要分优先级：`diary` 是"兜底默认家具"，什么记忆都可能落到它头上
 * （比如标题只有 "a'a" 的那条）。不加这层判断的话，满屋子不相干的日记本
 * 会一股脑塞进书架，看起来像"书柜里全是书"，其实语义完全不对。
 */
const SHELF_HINT = /书|读|笔记|摘抄|小说|文学|诗词|课本|教材|阅读|诗集|名著|红楼|西游|三国|水浒|散文|手账|账本/

/** 宿主的局部偏移 → 世界偏移（跟随宿主朝向一起转，"放在它左手边"在任何朝向下都对） */
function localToWorld(dx, dz, rotDeg) {
  const a = (rotDeg * Math.PI) / 180 // 度 → 弧度
  const c = Math.cos(a)
  const s = Math.sin(a)
  // 绕 Y 旋转矩阵：worldX = dx·cosθ + dz·sinθ ; worldZ = -dx·sinθ + dz·cosθ
  return { x: dx * c + dz * s, z: -dx * s + dz * c }
}

/** 按家具类型决定 rot_y（'wall' 床头朝墙 / 'center' 正面朝中心 / 其余 0°） */
function facingRot(furniture, s) {
  const how = FACING[furniture] || 'flat'
  if (how === 'wall' && s.n) return Math.round(Math.atan2(-s.n[0], -s.n[1]) * DEG)
  if (how === 'center') return Math.round(faceCenterRot(s.x, s.z))
  return 0
}

/**
 * 落地家具的最终摆位 = 槽位 + 朝向，**并把中心从"贴墙面"挪到"家具中心"**。
 *
 * ★ 这个内移是必须的，否则两类家具都会穿墙：
 *   床   —— 槽位点是床头该贴的那个面，但床长 1.53 米；把*中心*放那儿，
 *           床头外那 0.76 米就伸到墙外，表现为床穿出栏杆悬在房间外的天空上（踩过）。
 *   桌柜 —— 槽位点是桌面/柜背该贴的那个面（深度 0.64 / 0.29），同理会溢出侧墙。
 * 所以统一沿「背离墙」的方向，内移「家具在该方向上的半跨度」。
 *
 * 半跨度用支撑函数算（不是简单取长/2）：把墙法线转到家具局部坐标，
 * 取 |宽·lx| + |深·lz| 的一半 —— 这样任意 rot_y 下都精确，斜墙槽位也对。
 */
function placeFloor(furniture, s) {
  const rot_y = facingRot(furniture, s)
  if (!s.n) return { x: s.x, z: s.z, rot_y } // 房间中央的槽位，本身就是中心
  const [sx, , sz] = FURNITURE_SIZE[furniture] || [0.5, 0.5, 0.5]
  const th = (rot_y * Math.PI) / 180
  const c = Math.cos(-th)
  const sn = Math.sin(-th)
  // 世界法线 n 转到家具局部（Ry(-θ)）
  const lx = s.n[0] * c + s.n[1] * sn
  const lz = -s.n[0] * sn + s.n[1] * c
  const half = (Math.abs(sx * lx) + Math.abs(sz * lz)) / 2
  const len = Math.hypot(s.n[0], s.n[1]) || 1
  const inx = -s.n[0] / len // 指向房间内侧的单位向量
  const inz = -s.n[1] / len
  return {
    x: +(s.x + inx * half).toFixed(2),
    z: +(s.z + inz * half).toFixed(2),
    rot_y,
  }
}

/** 家具旋转后的水平包围盒（x/z 跨度），用来判断它压住了哪些中央槽位 */
function floorAabb(x, z, rotDeg, size) {
  const [sx, , sz] = size
  const a = (rotDeg * Math.PI) / 180
  const c = Math.abs(Math.cos(a))
  const s = Math.abs(Math.sin(a))
  const w = sx * c + sz * s // 旋转后的 x 跨度
  const d = sx * s + sz * c // 旋转后的 z 跨度
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }
}

/**
 * 大件占地很大（床 1.53×1.07），它压住的那些「房间中央槽位」要一并标记为已占用 ——
 * 否则小件会照着槽位表摆进去，看起来就是日记本塞在床底下。
 * 槽位是抽象格子，不是点，所以这里按"槽位中心落在家具包围盒（含余量）内"判定。
 */
function blockSlotsUnder(furniture, row, used, margin = 0.5) {
  const size = FIXED_SCENE_SIZE[furniture] || FURNITURE_SIZE[furniture]
  if (!size) return
  const b = floorAabb(row.x, row.z, row.rot_y, size)
  // 余量：小件自己的占地半径也要算进去。
  // 地毯这类"薄而平"的装饰要传 0 —— 它本身就是一个明确的边界，
  // 再加 0.5 会把地毯外一圈的好位置也误伤掉。
  const M = margin
  for (const fs of FLOOR_SLOTS) {
    if (fs.x > b.minX - M && fs.x < b.maxX + M && fs.z > b.minZ - M && fs.z < b.maxZ + M) used.add(fs.id)
  }
}

// ---------------------------------------------------------------------------
// 场景固定家具（不来自记忆）
// ---------------------------------------------------------------------------
// 需求：「床×2、书桌、椅子、柜×2、花×4、小柜、小桌」这些是**房间自带的**，一进房间就该摆好，
// 不再由「每条记忆生成一件家具」这条规则产出。坐标见下方 FIXED_POS（直接解析 main.scene 得到）。
//
// ★ 方位全部来自对模型和截图的实测：房间 house_three.glb 只有两面实墙 —— 后(z-)与右(x+)；
//   左侧(-x)和前方(+z)是**栏杆**。对应到用户看到的画面：上=正面墙(带窗)、右=右侧墙(带门)、下与左=栏杆。
//
// 坐标是**最终世界坐标**（= main.scene 的 `_lpos` × 10，因为 house_three 是 Scene 直接子节点、
// origin(0,0,0)、scale 10，家具的 `_parent` 都指向它）。日后在编辑器里挪动家具，记得同步 FIXED_POS。
/**
 * 场景固定家具的位置（每个实例一条，便于床/柜双份都登记避让）。
 *
 * ★ 这些**由用户在 main.scene 里手工摆好**（house_three 缩放 10、家具世界缩放 = 10 × 局部 lscale），
 *   3D 侧不再创建它们（RoomBootstrap 只摆「每条记忆对应的那一件」）。
 *   这里保留坐标只有一个用途：**当承托宿主** ——
 *   算"电脑/台灯摆书桌哪里"、"书塞柜子哪层隔板"必须知道宿主在哪、朝哪；
 *   顺带用 blockSlotsUnder 把它们压住的落地槽位标记掉，避免小件塞到床/桌底下。
 *
 * 坐标系：世界坐标 = main.scene 里的 `_lpos` × 10（已实测 house_three 是 Scene 直接子节点、
 * origin(0,0,0)、scale 10，家具的 `_parent` 都指向它）。rot_y 取自 `_lrot` 的四元数换算。
 * 数值直接解析 main.scene 得到，**不是我们算的** —— 日后挪动场景里的家具，记得同步这里。
 */
const FIXED_POS = [
  // 床 ×2（用户有意双份）
  { furniture: 'bed', x: 1.65, z: -1.49, rot_y: -90 },
  { furniture: 'bed', x: 1.65, z: -0.20, rot_y: -90 },
  // 柜 ×2（cabinet 即原来的 bookcase，替换后一个仍在原墙角位）
  { furniture: 'cabinet', x: 2.47, z: 1.22, rot_y: -90 },
  { furniture: 'cabinet', x: 2.47, z: -2.99, rot_y: -90 },
  // 书桌 / 椅子（单一）
  { furniture: 'desk', x: -2.38, z: -3.10, rot_y: 0 },
  { furniture: 'chair', x: -1.58, z: -2.69, rot_y: 180 },
  // 新增装饰（纯场景自带，纳入避让避免记忆小件重叠）
  { furniture: 'flower_one', x: -1.85, z: 0.80, rot_y: 0 },
  { furniture: 'flower_one', x: -0.71, z: 0.91, rot_y: 0 },
  { furniture: 'flower_tow', x: 1.25, z: -3.08, rot_y: 0 },
  { furniture: 'flower_tow', x: -1.81, z: -3.08, rot_y: 0 },
  { furniture: 'small_cupboard', x: 0.46, z: -3.16, rot_y: 0 },
  { furniture: 'small_table', x: -1.27, z: 0.87, rot_y: 0 },
  // ★ 装饰地毯（节点名 vending，_lpos=(-2.164, 0.334, 2.638)、euler.y=21.318°、lscale=(2,0.5,2)）。
  //   它是**平铺在地上的纯装饰**，用户明确要求「地毯上不可以放物品」，
  //   所以它不参与承托，只负责把压住的中央槽位标记掉（见 planSpace 第 0 轮后面的 carpet 处理）。
  { furniture: 'carpet', x: -2.164, z: 2.638, rot_y: 21.318 },
]

/** 场景固定家具清单（前端据此显示"房间自带 N 件家具"） */
export function fixedPlacement() {
  return FIXED_POS.map((p) => ({
    furniture: p.furniture,
    x: p.x,
    y: 0,
    z: p.z,
    rot_y: p.rot_y,
  }))
}


/**
 * 给一件**落地**家具挑一个还没被占用的槽位。
 * used 是这个空间已占用的槽位集合（由调用方维护）—— 整间重排时必须先清空再从头分配，才能幂等。
 *
 * 大件与小件走完全不同的优先级：
 *   大件（床/桌/柜/…）按 SLOT_FIT 的尺寸适配挑墙上的位置（床要侧墙的长边位，桌子要后墙的宽位）；
 *   小件（日记本/杯子/…）**优先房间中央的平铺槽位**，别去抢墙 —— 否则一张床会把日记本顶到后墙正中。
 */
function pickSlot(used, furniture) {
  if (!BIG_FURNITURE.has(furniture)) {
    for (const s of [...FLOOR_SLOTS, ...WALL_SLOTS]) {
      if (!used.has(s.id)) return s
    }
    return spiralPosition(used.size)
  }
  const fitPref = SLOT_FIT[furniture] || ['wide', 'deep']
  // 按适配度过滤，再按槽位原顺序，保证"后墙正中优先给最该在那的大件"
  const walls = fitPref.flatMap((f) => WALL_SLOTS.filter((s) => s.fit === f))
  for (const s of [...walls, ...FLOOR_SLOTS, ...WALL_SLOTS]) {
    if (!used.has(s.id)) return s
  }
  return spiralPosition(used.size)
}

// 黄金角螺旋：按已有摆件数给出不重叠的坐标，保证每件都摆在房间里
function spiralPosition(count) {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const r = Math.min(1.35, 0.32 + 0.15 * Math.sqrt(count))
  const a = count * golden
  return {
    x: +clampX(Math.cos(a) * r).toFixed(2),
    z: +clampZ(Math.sin(a) * r).toFixed(2),
    rot_y: ROT_STEPS[count % ROT_STEPS.length],
  }
}

// 家具识别关键词表：**只依据「标题 + 内容」判断**。
// 刻意不看 kind / type：那是"内容分类"，同一分类下的记忆可能完全是两码事
// —— 例如分类为"照片"的记忆可能是旅行照（该给书包/相机），也可能是深夜随手拍，
// 按分类一刀切会张冠李戴。改成读标题和内容里的语义词，识别出来才准。
// 顺序即优先级：语义越具体的越靠前，命中即返回。
//
// ★ 这里**故意不含 bed / desk / cabinet / chair** —— 那四件是房间自带的固定家具
//   （见 fixedPlacement），不再由记忆产出。
//   以前「一条关于睡觉的记忆」会生成一张床，和场景里自带的床重复；而且房间只有
//   2.3×3.0 米，几条睡眠类记忆就会把房间塞满。现在它们的相关记忆改配日记本/黄皮书，
//   语义仍然对得上（"今天睡得很好" → 一本随手记），也不会挤爆房间。
// ★ 关键词来源：用户给的《3d对应的内容》清单（D:/桌面/文档管理/3d对应的内容.txt）。
//   每件家具列出的都是"这类内容会带出的抽象词"（相机=怀念/见证/纪实…，杯子=温暖/陪伴/思念…），
//   所以这张表比原来那版宽得多：一条"怀念外婆的下午"的记忆，以前落不到相机上，
//   现在能命中 camera_my；"一杯热茶陪我发呆"也能命中 cup。
//   每组的第二个元素是「一组同义词」，命中任意一个即可。
const FURNITURE_KEYWORDS = [
  // 相机：记忆 / 记录 / 见证 / 纪实 / 摄影
  [
    'camera_my',
    [
      '照片', '拍照', '摄影', '相机', '合影', '相册', '胶片', '镜头', '自拍', '风景照', '拍下',
      '记忆', '怀念', '时光', '观察', '凝视', '发现', '记录', '见证', '浪漫', '热爱生活',
      '讲述', '叙事', '真相', '证据', '历史', '视角', '立场', '新媒体', '传媒', '新闻',
      '记录生活', '探索', '纪实',
    ],
  ],
  // 电脑：连接 / 沟通 / 信息 / 创造 / 效率 / 数字世界
  [
    'computer',
    [
      '电脑', '编程', '代码', '游戏', '打游戏', '上网', '网站', '程序', '剪辑', '键盘', '开发',
      '调试', '算法', 'bug', '连接', '沟通', '信息', '知识', '创造', '远方', '梦想', '奔赴',
      '文明', '科技', '时代', '效率', '理性', '秩序', '互联网', '网络', '数字', '办公', '学习',
      '大数据', '信息化',
    ],
  ],
  // 杯子：温暖 / 陪伴 / 日常 / 思念 / 治愈
  [
    'cup',
    [
      '咖啡', '奶茶', '喝茶', '下午茶', '喝一杯', '饮品', '泡茶', '热可可', '拿铁', '喝水',
      '温暖', '陪伴', '慰藉', '安宁', '日常', '烟火', '平淡', '接纳', '包容', '等待', '牵挂',
      '思念', '治愈', '初心', '人情', '相聚', '别离', '珍惜', '独处', '静心', '待客', '平凡',
    ],
  ],
  // 唱片：旋律 / 声音 / 怀旧 / 氛围感
  [
    'record',
    [
      '音乐', '听歌', '歌单', '歌曲', '演唱会', '专辑', '电台', '唱片', '黑胶', '吉他', '钢琴',
      '乐队', 'k歌', '唱歌', '旋律', '耳机', '声音', '回忆', '旧时光', '情绪', '共鸣', '聆听',
      '诉说', '怀旧', '定格', '品味', '氛围', '岁月', '经典', '心声', '故事', '浪漫', '艺术',
    ],
  ],
  // 书包：成长 / 求学 / 旅途 / 青春
  [
    'schoolbag',
    [
      '旅行', '旅游', '出游', '出发', '旅途', '远行', '出差', '露营', '爬山', '徒步', '背包',
      '书包', '车站', '机场', '火车', '航班', '在路上', '成长', '求学', '行囊', '期许', '责任',
      '青春', '陪伴', '求知', '希望', '探索', '童年', '少年', '积攒',
    ],
  ],
  // 台灯：光明 / 指引 / 长夜 / 坚守 / 微光
  [
    'tableLamp',
    [
      '台灯', '灯下', '开灯', '关灯', '深夜', '夜里', '夜晚', '光明', '希望', '指引', '方向',
      '坚守', '清醒', '思索', '长夜', '照亮', '守护', '潜心', '理想', '力量', '信念', '微光',
      '独自前行', '守候', '迷茫', '治愈',
    ],
  ],
  // 书：知识 / 思想 / 传承 / 阅读（普通书、黄皮书、绿皮书随机 —— 见 pickBookKind）
  [
    'greenbook',
    [
      '读书', '看书', '阅读', '书籍', '小说', '散文', '诗集', '图书馆', '书单', '笔记', '手账',
      '记账', '账本', '清单', '备忘录', '待办', '知识', '思想', '文明', '传承', '眼界', '启迪',
      '沉淀', '孤独', '真理', '想象', '自由', '精神世界', '启蒙', '求索', '感悟', '学识', '信念',
    ],
  ],
  ['yellowbook', ['灵感', '点子', '想法', '创意', '随笔', '日记', '随手记', '碎碎念']],
]
/**
 * 兜底家具三选一：日记本 / 绿皮书 / 黄皮书。
 *
 * ★ 选哪本必须**由条目 id 决定**，不能随机 —— planSpace 是纯函数，
 *   同一份 items 算两次必须得到完全一样的结果（否则每次重排房间里的东西都在跳）。
 *   所以这里用 id 的确定性哈希取模，既不随机也不失效：
 *   同一条记忆永远拿到同一件，不同记忆之间又能均匀摊开。
 */
const FURNITURE_DEFAULTS = ['diary', 'greenbook', 'yellowbook']

// 这些家具由场景自带，不由记忆生成（AI 也不该指定，见 planSpace 的 forced 过滤）
const FIXED_FURNITURE = new Set(['bed', 'desk', 'cabinet', 'chair'])

/**
 * 每个空间最多几条记忆（= 最多几件 3D 物品，固定家具不计入）。
 * 房间净空只有 2.3×3.0 米，扣掉床/桌/椅/柜之后能摆小件的地方有限：
 * 两个柜子各 3 层×3 格 = 18 个隔板位、桌面 6 件，其余落地（中央槽位）。
 * 按需求把上限收紧到 **13**：超过 13 件画面就开始拥挤、且容易互相遮挡。
 * 达到上限后前端会提示用户换岛或新建岛屿（见 memory.vue）。
 */
export const MAX_ITEMS_PER_SPACE = 13

/** 某空间还能再放几条（给 handler 做前置校验用） */
export function remainingCapacity(spaceId) {
  const c = db.prepare('SELECT COUNT(*) AS c FROM memory_item WHERE space_id = ?').get(spaceId).c
  return Math.max(0, MAX_ITEMS_PER_SPACE - c)
}

/**
 * 「硬词」：一眼就能确定家具的具体物件名（咖啡 → 杯子、照片 → 相机、吉他 → 唱片…）。
 *
 * ★ 必须和上面那张 FURNITURE_KEYWORDS（抽象词）分级匹配，不能混成一张表：
 *   抽象词重合度很高（"陪伴"同时属于杯子/书包/"温暖"属于杯子/台灯），
 *   如果按表顺序"命中即返回"，那么几乎每条记忆都会先命中排在前面的相机/电脑，
 *   摆出来的房间会一边倒。所以：
 *     1) 先扫硬词 —— 有具体物件就听具体的；
 *     2) 没有硬词，再统计抽象词的命中次数，取命中最多的那一类（同分按表顺序）。
 */
const STRONG_KEYWORDS = [
  ['record', ['音乐', '听歌', '歌单', '歌曲', '唱片', '黑胶', '吉他', '钢琴', '乐队', '唱歌', 'k歌', '专辑', '演唱会', '耳机', '电台', '旋律']],
  ['camera_my', ['照片', '拍照', '摄影', '相机', '合影', '相册', '胶片', '镜头', '自拍', '拍下', '风景照']],
  ['computer', ['电脑', '编程', '代码', '游戏', '上网', '网站', '程序', '剪辑', '键盘', '开发', '调试', '算法', 'bug', '办公']],
  ['schoolbag', ['旅行', '旅游', '出游', '出发', '旅途', '远行', '出差', '露营', '爬山', '徒步', '背包', '书包', '车站', '机场', '火车', '航班']],
  ['cup', ['咖啡', '奶茶', '喝茶', '下午茶', '饮品', '泡茶', '热可可', '拿铁', '喝水', '喝一杯']],
  ['tableLamp', ['台灯', '灯下', '开灯', '关灯']],
  ['greenbook', ['读书', '看书', '阅读', '书籍', '小说', '散文', '诗集', '图书馆', '书单', '笔记', '手账', '记账', '账本', '清单', '备忘录', '待办']],
  ['yellowbook', ['灵感', '点子', '想法', '创意', '随笔', '日记']],
]

// 在一段文本里找家具；命中返回家具名，没命中返回 null
function matchFurnitureName(text) {
  // 1) 硬词：具体物件优先
  const strong = matchStrongFurniture(text)
  if (strong) return strong
  // 2) 抽象词：按命中次数投票，避免"排在前面的类别通吃"
  let best = null
  let bestHits = 0
  for (const [furniture, words] of FURNITURE_KEYWORDS) {
    let hits = 0
    for (const w of words) {
      if (text.includes(w)) hits++
    }
    if (hits > bestHits) {
      bestHits = hits
      best = furniture
    }
  }
  return best
}

/** 只扫「硬词」（具体物件名）—— 精确性最高的一层，媒体之后优先用它 */
function matchStrongFurniture(text) {
  for (const [furniture, words] of STRONG_KEYWORDS) {
    for (const w of words) {
      if (text.includes(w)) return furniture
    }
  }
  return null
}

/**
 * 由条目 id 挑兜底家具（FNV-1a 哈希 → 取模）。确定性、与顺序无关。
 * id 缺失时退回日记本，保证任何情况下都有值。
 */
function defaultFurnitureFor(item) {
  const id = Number(item.id)
  if (!Number.isFinite(id)) return 'diary'
  let h = 2166136261
  const s = String(id)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return FURNITURE_DEFAULTS[Math.abs(h) % FURNITURE_DEFAULTS.length]
}

/**
 * 按媒体类型直接定家具（用户上传了照片/视频/音频时的强约束）。
 * 优先级 视频 > 音频 > 照片：视频最稀有最具体，照片最容易随手带。
 * 返回 null 表示这条记忆没有任何媒体、交给关键词规则。
 */
function furnitureForMedia(mediaTypes) {
  if (!mediaTypes || !mediaTypes.size) return null
  if (mediaTypes.has(3)) return 'computer' // 视频
  if (mediaTypes.has(2)) return 'record' // 音频
  if (mediaTypes.has(1)) return 'camera_my' // 照片
  return null
}

/**
 * 规则兜底：按记忆选家具。
 *
 * 优先级：
 *   ① 用户上传的媒体 —— 「加了照片就是相机、加了视频就是电脑、加了音频就是唱片机」，
 *      这是用户主动的行为，比文字里的关键词更可信，所以压过关键词；
 *   ② 标题 + 内容里的语义关键词；
 *   ③ 都没命中 → 日记本 / 绿皮书 / 黄皮书 三选一（由 id 哈希决定，保证幂等）。
 */
function ruleFurnitureForItem(item) {
  // ① 已被「数据检索」判定过的（memory_item.prop_furniture）：直接沿用。
  //    ★ 这一条是幂等性的关键 —— planSpace 是纯函数，而这个字段是落库的，
  //      同一份 items 无论算多少次、重启多少次，结果都一样。检索（向量）本身是
  //      异步的，不能塞进同步的 planSpace 里，所以先落库再规划。
  const stored = String(item.prop_furniture || '')
  if (FURNITURE_SET.has(stored) && !FIXED_FURNITURE.has(stored)) return stored
  // ② 用户上传了照片/视频/音频 —— 这比任何文字线索都可信
  const media = furnitureForMedia(item.mediaTypes)
  if (media) return media
  // ③ 字面检索（同步兜底：向量服务不可用、或检索还没跑过的老数据）
  const title = String(item.title || '').toLowerCase()
  const content = String(item.content || '').toLowerCase()
  return matchFurnitureName(title) || matchFurnitureName(content) || defaultFurnitureFor(item)
}

/**
 * 异步版：媒体 > 硬词 > 向量+字面检索 > 兜底。
 * 返回 { furniture, via, confident, score, hits } 或 null（null = 什么都没命中，走兜底本子）。
 *
 * 之所以要区分 confident：检索没把握时，有 DeepSeek 就再问一次大模型，
 * 没把握又不问，就按兜底本子来 —— 不要让"半信半疑"的结果决定房间长什么样。
 */
async function decideItemProp(item) {
  const media = furnitureForMedia(item.mediaTypes)
  if (media) return { furniture: media, via: 'media', confident: true, score: 1, hits: [] }
  const title = String(item.title || '')
  const content = String(item.content || '')
  const strong = matchStrongFurniture(`${title}\n${content}`.toLowerCase())
  if (strong) return { furniture: strong, via: 'keyword', confident: true, score: 1, hits: [strong] }
  const d = await decideProp(`${title} ${content}`.slice(0, 1200), { title })
  if (d && FURNITURE_SET.has(d.furniture)) return d
  return null
}

// 曾经有个「防重叠」函数（沿螺旋往外挪坐标），现在已经不需要了：
// 槽位表保证同一空间内一格一件，而承托关系要求坐标必须精确落在宿主表面
// —— 夹一次就会把「书在书架隔板上」变成「书飘在书架旁边」。留在这里只会误导后来人。

// ---- AI 摆件（DeepSeek）----
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

function extractJson(text) {
  if (!text) return null
  // 去掉 ```json ... ``` 代码围栏
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  try {
    return JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

/**
 * 给 AI 的「家具 → 语义」对照表。
 * 内容取自用户给的《3d对应的内容》清单：每件家具代表的不只是物件，而是一类情绪/主题。
 * 有了它，「怀念外婆的下午」这类没有具体物件的记忆也能被正确分到相机，而不是随手丢个日记本。
 */
const FURNITURE_HINTS =
  '相机(camera_my)=记忆/怀念/时光/记录/见证/纪实/摄影/真相/视角；\n' +
  '电脑(computer)=连接/沟通/信息/知识/创造/梦想/科技/互联网/效率/办公/学习/编程；\n' +
  '杯子(cup)=温暖/陪伴/慰藉/日常/烟火/牵挂/思念/治愈/独处/相聚别离/珍惜；\n' +
  '书(greenbook / yellowbook)=知识/思想/文明/传承/阅读/成长/启迪/孤独/自由/感悟；\n' +
  '唱片(record)=旋律/声音/旧时光/怀旧/浪漫/共鸣/聆听/经典/故事；\n' +
  '书包(schoolbag)=成长/求学/远方/青春/旅途/行囊/责任/童年；\n' +
  '台灯(tableLamp)=光明/希望/指引/坚守/长夜/思索/守护/微光/驱散迷茫。\n'

async function planRoomPropAI(item) {
  if (!DEEPSEEK_API_KEY) return null
  const content = String(item.content || '').slice(0, 200)
  const messages = [
    {
      role: 'system',
      content:
        '你是「拾光」记忆App的3D房间布置助手。用户每写一条记忆, 我们就在3D房间里放一件家具来代表它。\n' +
        '可用家具(只能选这些英文名之一): ' + FURNITURE_WHITELIST.join(', ') + '。\n' +
        '只输出 JSON, 不要任何多余文字, 格式: {"furniture":"<英文名>","reason":"<一句中文说明>"}\n' +
        // 坐标/朝向/承托一律由程序按规则算（见 planSpace），AI 只负责"这段记忆该用哪件家具"。
        // 早先还让 AI 输出 x/z/rotY，但它摆出来的房间和规则算的完全两样，也不跟同房间的其它家具对齐，
        // 反而破坏了「靠墙成排、柜里放书、桌上放台灯」的规律，所以坐标不再交给 AI。
        '**不要输出坐标、朝向或高度** —— 位置由程序按固定规则分配（贴墙成排、小件放桌上/柜里），你只负责选家具。\n' +
        // 选家具的唯一依据是"标题 + 内容"的语义词, 不要依赖任何"内容分类/标签":
        // 同一分类下的记忆往往差别很大(比如"照片"分类里可能是旅行照, 该给书包/相机;
        // 也可能是深夜随手拍, 该给台灯), 只看分类会张冠李戴。
        '选家具时**只能依据记忆的标题和内容里表达出的语义**(在做什么、和什么有关), ' +
        '绝对不要依据内容的分类/类型/标签来判断。\n' +
        '下面是每件家具代表的语义（内容多、情绪浓时优先按这张表去对）：\n' +
        FURNITURE_HINTS +
        '举例:「怀念外婆的下午」→ camera_my；「一个人喝茶发呆」→ cup；' +
        '「通宵改代码」→ computer 或 tableLamp；「毕业那天的火车」→ schoolbag。',
    },
    {
      role: 'user',
      content: `这条记忆: 标题=${item.title || ''} 日期=${item.entry_date || ''} 内容=${content}`,
    },
  ]
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 120,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`AI 服务异常(${res.status})`)
  const data = await res.json()
  const j = extractJson(data?.choices?.[0]?.message?.content)
  if (!j || !FURNITURE_SET.has(j.furniture)) return null
  return { furniture: j.furniture, reason: String(j.reason || '').slice(0, 120) }
}

/**
 * 在**任意一个**还有空位的柜子隔板里找一个位子。
 *
 * ★ 为什么不是只找第一个柜子：场景里现在有**两个** cabinet（用户摆了两件）。
 *   老代码 `hosts.find(h => h.furniture === 'cabinet')` 永远返回第一个，
 *   第二个柜子从头到尾空着、东西全堆进第一个 —— 明明有 18 个隔板位却只用 9 个。
 */
function findCabinetShelf(hosts) {
  const sh = SURFACES.cabinet.shelf
  const cap = sh.levels.length * sh.xs.length
  for (const h of hosts) {
    if (h.furniture === 'cabinet' && h._slots.length < cap) return h
  }
  return null
}

/** 把一件东西塞进柜子隔板，返回摆放行；没有空位返回 null */
function placeOnShelf(f, hosts) {
  const h = findCabinetShelf(hosts)
  if (!h) return null
  const sh = SURFACES.cabinet.shelf
  const n = h._slots.length
  h._slots.push(n)
  const li = Math.floor(n / sh.xs.length)
  const xi = n % sh.xs.length
  const w = localToWorld(sh.xs[xi][0], sh.xs[xi][1], h.rot_y)
  return {
    ...f,
    x: +(h.x + w.x).toFixed(2),
    y: sh.levels[li],
    z: +(h.z + w.z).toFixed(2),
    rot_y: h.rot_y,
    scale: SHELF_BOOK_SCALE,
    support: 'cabinet',
    reason: RULE_REASON, // reason 是「自动生成」标记；摆在哪由 support 表达（见 repair 的筛选条件）
  }
}

/**
 * 把一件东西放到桌面，返回摆放行；放不下返回 null。
 *
 * allowFull=true（电脑/书包专用）：桌面候选点全被占了也要硬放上去 ——
 * 这两件"只可以放桌子上"，宁可和别的东西挤一点，也不能掉到地上或塞进柜子。
 */
function placeOnDesk(f, hosts, allowFull) {
  const desk = hosts.find((h) => h.furniture === 'desk')
  if (!desk) return null
  if (!allowFull && desk._slots.length >= DESK_CAP) return null
  let found = findDeskSpot(desk, f.furniture)
  if (!found && allowFull) found = { spot: DESK_GRID[0], r: FOOTPRINT[f.furniture] || DEFAULT_FOOT }
  if (!found) return null
  desk._slots.push({ x: found.spot[0], z: found.spot[1], rx: found.r.rx, rz: found.r.rz })
  const w = localToWorld(found.spot[0], found.spot[1], desk.rot_y)
  return {
    ...f,
    x: +(desk.x + w.x).toFixed(2),
    y: SURFACES.desk.top,
    z: +(desk.z + w.z).toFixed(2),
    rot_y: desk.rot_y, // 跟着宿主转，才像"摆在这张桌上"
    scale: 1,
    support: 'desk',
    reason: RULE_REASON,
  }
}

// ---------------------------------------------------------------------------
// 整间规划（唯一的摆放入口）
// ---------------------------------------------------------------------------
// 为什么必须"整间一起算"：承托关系是**相对的** —— 一本书要放桌上，前提是先知道桌子在哪、朝哪；
// 而"新增一条记忆"也必然要动整间（要把新件插进已有的桌面/书架里）。所以不能沿用
// "一次只算一件"的旧结构。好处是幂等天然成立：同一个 items 列表算两次结果完全一样。
//
// items: [{ id, title, content, forced? }]（已按 created_at 排序；forced = AI 指定的家具类型）
// 返回: [{ itemId, furniture, x, y, z, rot_y, scale, support, reason }]
export function planSpace(items) {
  const list = items.map((it) => {
    // ★ 媒体优先于一切：用户上传了照片/视频/音频，就必须是相机/电脑/唱片机，
    //   连 AI 的 forced 也不能覆盖 —— 否则"加了照片自动加相机"会被 AI 选的家具顶掉。
    const mediaF = furnitureForMedia(it.mediaTypes)
    const f = mediaF
      ? mediaF
      : it.forced && FURNITURE_SET.has(it.forced) && !FIXED_FURNITURE.has(it.forced)
        ? it.forced
        : ruleFurnitureForItem(it)
    return {
      itemId: it.id,
      furniture: f,
      // 只有"书本类家具 + 内容确实和书有关"才允许进书架隔板
      shelfable: IN_SHELF.has(f) && SHELF_HINT.test(`${it.title || ''} ${it.content || ''}`),
    }
  })

  const used = new Set()
  const out = []
  const hosts = [] // 可当支撑面的家具（含它们各自的朝向与已用槽位计数）

  // 第 0 轮：场景固定家具（床 / 书桌 / 椅子 / 书柜）。
  // 它们不来自记忆，但要先把槽位占住、并把书柜登记成承托宿主（书要放进它的隔板），
  // 否则记忆家具会把这些位置抢走，或者书找不到柜子放。
  for (const fx of fixedPlacement()) {
    const row = { ...fx, _slots: [] }
    // 地毯：不加余量，按它的实际占地把槽位全部标记掉（「地毯上不可以放物品」）
    blockSlotsUnder(fx.furniture, row, used, fx.furniture === 'carpet' ? 0 : 0.5)
    if (SURFACES[fx.furniture]) hosts.push(row)
  }

  // 地毯的实际占地（含朝向）。槽位表之外还有"黄金角螺旋"兜底摆放，
  // 那条路径不查槽位表，所以最后要拿这个盒子再过滤一次，确保没有东西落在地毯上。
  const carpetBox = (() => {
    const c = fixedPlacement().find((f) => f.furniture === 'carpet')
    if (!c) return null
    return floorAabb(c.x, c.z, c.rot_y, FIXED_SCENE_SIZE.carpet)
  })()
  const onCarpet = (x, z) =>
    !!carpetBox && x > carpetBox.minX && x < carpetBox.maxX && z > carpetBox.minZ && z < carpetBox.maxZ

  // 第一轮：记忆落地的大件 —— 先占剩下的墙位
  for (const f of list.filter((x) => BIG_FURNITURE.has(x.furniture))) {
    const s = pickSlot(used, f.furniture)
    used.add(s.id)
    const pf = placeFloor(f.furniture, s)
    const row = {
      ...f,
      x: pf.x,
      y: 0,
      z: pf.z,
      rot_y: pf.rot_y,
      scale: 1,
      support: '',
      reason: '按标题与内容自动摆放',
      _slots: [], // 桌面上已占用的点 [{x, z, r}]（临时字段，不入库）
    }
    out.push(row)
    if (SURFACES[f.furniture]) hosts.push(row)
    blockSlotsUnder(f.furniture, row, used)
  }

  // 第二轮：小件。
  //
  // ★ 要按"谁更该占这个位置"显式排序，处理两类抢占：
  //   ① 桌面：早先谁先来谁占，一件日记本会抢走桌面中央那个最好的位置，
  //      后面真正典型的桌面物件（显示器/台灯）反而摆不上去、只能掉在地上。
  //      现在按 DESK_PRIORITY 排，显示器优先占中央。
  //   ② 书架：书本类先试隔板（它们在隔板和桌面上都能待，但隔板才是书该待的地方），
  //      所以排在最后 —— 隔板满了才轮到它们去桌面/落地。
  const smalls = list.filter((x) => !BIG_FURNITURE.has(x.furniture))
  const DESK_PRIORITY = ['computer', 'record', 'tableLamp', 'cup', 'camera_my', 'schoolbag']
  const rankOf = (f) => {
    // 书本类整体排在最前（第一选择是书架隔板，不是桌面）；内容像读书/笔记的再往前一档
    if (IN_SHELF.has(f.furniture)) return f.shelfable ? -20 : -10
    const i = DESK_PRIORITY.indexOf(f.furniture)
    return i < 0 ? 50 : i
  }
  const ordered = [...smalls].sort((a, b) => rankOf(a) - rankOf(b))

  // 兜底落地（桌面/隔板都放不下时用）
  const dropToFloor = (f) => {
    const s = pickSlot(used, f.furniture)
    used.add(s.id)
    const pf = placeFloor(f.furniture, s)
    const row = {
      ...f,
      x: pf.x,
      y: 0,
      z: pf.z,
      rot_y: pf.rot_y,
      scale: 1,
      support: '',
      reason: '按标题与内容自动摆放',
    }
    out.push(row)
    blockSlotsUnder(f.furniture, row, used)
  }

  for (const f of ordered) {
    // ① 电脑 / 书包：只允许摆在桌面上（不进柜子、不落地；桌面满了也硬放桌面）
    if (DESK_ONLY.has(f.furniture)) {
      const row = placeOnDesk(f, hosts, true)
      if (row) {
        out.push(row)
        continue
      }
      // 房间里连书桌都没有（场景自带书桌, 正常不会发生）——只能落地兜底
      dropToFloor(f)
      continue
    }

    // ② 书本类：优先塞进柜子隔板（隔板才是书该待的地方）
    let row = IN_SHELF.has(f.furniture) ? placeOnShelf(f, hosts) : null
    // ③ 其次桌面
    if (!row) row = placeOnDesk(f, hosts, false)
    // ④ 其余小件也可以进柜子 —— 需求：「柜子里面和桌子上都可以放东西」
    if (!row) row = placeOnShelf(f, hosts)
    if (row) {
      out.push(row)
      continue
    }
    // ⑤ 都放不下 → 落地兜底
    dropToFloor(f)
  }

  // ★ 最后一道"别踩地毯"的保险：落地件（support 为空）如果落在装饰地毯的占地里，
  //   换一个空槽位重摆。前面已经按槽位表标记过地毯覆盖的格子，只有"黄金角螺旋"兜底
  //   那条路径可能绕开槽位表，所以这里再校验一次。
  for (const r of out) {
    if (r.support) continue // 摆在桌上/柜里的不算落地，高度离地毯很远
    if (!onCarpet(r.x, r.z)) continue
    const s2 = pickSlot(used, r.furniture)
    used.add(s2.id)
    const pf = placeFloor(r.furniture, s2)
    // 换到的位置如果又压在地毯上（极端情况：房间被占满），就退到房间另一侧的空地
    const nx = onCarpet(pf.x, pf.z) ? -pf.x : pf.x
    r.x = nx
    r.z = pf.z
    r.rot_y = pf.rot_y
  }

  // 临时字段不出库
  for (const r of out) delete r._slots
  return out
}

/** 把某个空间的 items 按 planSpace 算出的方案写进 room_prop（幂等：同一份数据写多少次都一样） */
function writePlan(spaceId, uid, items, reason) {
  const owner =
    uid ||
    db.prepare('SELECT user_id FROM memory_space WHERE id = ?').get(spaceId)?.user_id ||
    db.prepare('SELECT user_id FROM memory_item WHERE space_id = ? LIMIT 1').get(spaceId)?.user_id
  if (!owner) return []
  const plan = planSpace(items)
  const t = now()
  const upsert = db.prepare(
    `INSERT INTO room_prop (user_id, space_id, item_id, furniture, x, y, z, rot_y, scale, support, reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       furniture=excluded.furniture, x=excluded.x, y=excluded.y, z=excluded.z,
       rot_y=excluded.rot_y, scale=excluded.scale, support=excluded.support,
       reason=excluded.reason, updated_at=excluded.updated_at`,
  )
  for (const p of plan) {
    upsert.run(owner, spaceId, p.itemId, p.furniture, p.x, p.y, p.z, p.rot_y, p.scale || 1, p.support || '', p.reason || reason || '', t, t)
  }
  return plan
}

/**
 * 取某空间的记忆（按创建时间），整间规划的输入。
 *
 * ★ 必须把媒体类型也带出来：需求是「加了照片就配相机、加了视频配电脑、加了音频配唱片机」，
 *   而这一步只看得到 memory_item 的标题/内容，看不到 memory_media ——
 *   以前只 SELECT id/title/content，于是不管传了什么媒体都只会走关键词。
 *   这里用子查询 GROUP_CONCAT 一次把每条记忆的媒体类型拼出来（1=图 2=音频 3=视频）。
 */
function spaceItems(spaceId) {
  const rows = db
    .prepare(
      `SELECT i.id, i.title, i.content, i.prop_furniture,
              (SELECT GROUP_CONCAT(m.type) FROM memory_media m WHERE m.memory_id = i.id) AS media_types
         FROM memory_item i
        WHERE i.space_id = ?
        ORDER BY i.created_at`,
    )
    .all(spaceId)
  for (const r of rows) {
    r.mediaTypes = new Set(
      String(r.media_types || '')
        .split(',')
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n)),
    )
    delete r.media_types
  }
  return rows
}

/** 整间重算并落库（新增记忆 / 手动重排 / 存量修复都走它） */
export function replanByRule(spaceId, uid) {
  const items = spaceItems(spaceId)
  if (!items.length) return []
  return writePlan(spaceId, uid, items)
}

// 确保某条记忆在 room_prop 里有方案。
//
// ★ 结构改成"整间一起规划"：承托关系（桌上放台灯、柜里放书）必须先知道宿主在哪、朝哪，
//   而新增一条记忆也必然要把新件插进已有的桌面/书架里，所以不能只算单件。
//   planSpace 是纯函数（同样的 items 必得同样的结果），因此这里依然幂等。
//
// AI 的定位也收窄了：**只用它选家具类型**，坐标/朝向/承托一律走规则。
//   原来是把 AI 给的整包坐标直接写库，那会绕过槽位表与承托关系 ——
//   摆出来的房间和规则算的完全两样，且和同房间其它家具对不齐。
export async function ensureRoomProp(uid, item) {
  const spaceId = item.space_id
  // ① 数据检索决定"这条记忆该是哪件物品"（媒体 > 硬词 > 向量+字面），落库后
  //    planSpace 就是纯同步的了 —— 同一份数据怎么重算都不会变。
  let decided = null
  try {
    const fresh = spaceItems(spaceId).find((it) => it.id === item.id) || item
    decided = await decideItemProp(fresh)
    if (decided?.furniture && FURNITURE_SET.has(decided.furniture)) {
      db.prepare('UPDATE memory_item SET prop_furniture = ? WHERE id = ?').run(decided.furniture, item.id)
    }
  } catch (e) {
    console.warn('[room/plan] 摆件检索失败, 走字面规则:', e.message)
  }

  // ② 检索没把握时，有 DeepSeek 就再问一次大模型（它比检索更会"理解"）。
  //    以前是反过来：每次都先问 AI，慢且贵；现在检索先给出答案，只有含糊时才升级。
  if (DEEPSEEK_API_KEY && (!decided || !decided.confident)) {
    try {
      const ai = await planRoomPropAI(item)
      if (ai && ai.furniture && FURNITURE_SET.has(ai.furniture)) {
        db.prepare('UPDATE memory_item SET prop_furniture = ? WHERE id = ?').run(ai.furniture, item.id)
      }
    } catch (e) {
      console.warn('[room/plan] AI 选家具失败, 走规则:', e.message)
    }
  }

  replanByRule(spaceId, uid)
  return db.prepare('SELECT * FROM room_prop WHERE item_id = ?').get(item.id)
}

// 删除某条记忆的摆件（记忆删除时连带调用；外键 CASCADE 也会兜底，这里显式清一次）
export function removeRoomProp(itemId) {
  db.prepare('DELETE FROM room_prop WHERE item_id = ?').run(itemId)
}

/**
 * 存量补全：给还没有 prop_furniture 的老记忆跑一遍检索并落库（启动时后台执行）。
 *
 * 为什么需要它：检索是这次新加的，老数据这一列全是空串，planSpace 只能走老的字面规则 ——
 * 不补的话「语义检索」只对新写的记忆生效，用户翻旧房间看不出任何变化。
 * 为什么放后台：要调向量接口，绝不能挡住启动；失败也只是没补上，不影响任何功能。
 * 幂等：只处理空串的行，跑完再跑就是空转。
 */
export async function backfillPropFurniture(limit = 400) {
  const rows = db
    .prepare(
      `SELECT i.id, i.space_id, i.title, i.content
         FROM memory_item i
        WHERE (i.prop_furniture IS NULL OR i.prop_furniture = '')
        ORDER BY i.id LIMIT ?`,
    )
    .all(limit)
  if (!rows.length) return { items: 0, changed: 0, spaces: 0 }
  const spaces = new Set()
  let done = 0
  for (const it of rows) {
    const mediaTypes = new Set(
      String(
        db
          .prepare('SELECT GROUP_CONCAT(type) t FROM memory_media WHERE memory_id = ?')
          .get(it.id)?.t || '',
      )
        .split(',')
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0),
    )
    try {
      const d = await decideItemProp({ ...it, mediaTypes })
      if (d?.furniture && FURNITURE_SET.has(d.furniture)) {
        db.prepare('UPDATE memory_item SET prop_furniture = ? WHERE id = ?').run(d.furniture, it.id)
        spaces.add(it.space_id)
        done++
      }
    } catch (e) {
      console.warn('[room/prop] 补检索失败(跳过该条):', e.message)
    }
  }
  // 逐空间重排一次（planSpace 会读新写进去的 prop_furniture）
  let changed = 0
  for (const spaceId of spaces) {
    const before = new Map(
      db.prepare('SELECT item_id, furniture FROM room_prop WHERE space_id = ?').all(spaceId).map((p) => [p.item_id, p.furniture]),
    )
    replanByRule(spaceId, null)
    for (const p of db.prepare('SELECT item_id, furniture FROM room_prop WHERE space_id = ?').all(spaceId)) {
      if (before.has(p.item_id) && before.get(p.item_id) !== p.furniture) changed++
    }
  }
  return { items: done, changed, spaces: spaces.size }
}

// 重新规划整个空间的摆件（手动「重排」用，ai/room/plan 触发）
// ★ 重排 = 重新检索每一件物品，所以这里必须逐条重跑检索（而不是沿用库里的结论），
//   否则用户按了「重排」却发现家具一件没变，会以为按钮坏了。
export async function replanSpace(uid, spaceId) {
  const items = spaceItems(spaceId)
  for (const it of items) {
    try {
      const d = await decideItemProp(it)
      if (d?.furniture && FURNITURE_SET.has(d.furniture)) {
        db.prepare('UPDATE memory_item SET prop_furniture = ? WHERE id = ?').run(d.furniture, it.id)
      }
    } catch (e) {
      console.warn('[room/plan] 重排检索失败(该条走字面规则):', e.message)
    }
  }
  replanByRule(spaceId, uid)
  return db.prepare('SELECT * FROM room_prop WHERE space_id = ? ORDER BY id').all(spaceId)
}

// 取某空间的房间布局：返回 room 模型名 + 每件记忆的摆件与媒体信息。
// 缺摆件行、或行里的坐标不是当前规则算出来的（老数据）时，整间重算一次 —— 幂等，顺带把
// 「柜里放书 / 桌上放台灯」这类承托关系补齐。planning 是纯规则、不调 AI，进房间不会卡。
export function getRoomLayout(spaceId, uid) {
  const items = db
    .prepare('SELECT i.*, s.user_id AS owner_id FROM memory_item i JOIN memory_space s ON s.id = i.space_id WHERE i.space_id = ? ORDER BY i.created_at')
    .all(spaceId)
  let props = db.prepare('SELECT * FROM room_prop WHERE space_id = ?').all(spaceId)
  const has = new Set(props.map((p) => p.item_id))
  // 缺行 -> 整间重算（一次搞定所有缺失，不要挨个补）
  if (items.some((it) => !has.has(it.id)) && items.length) {
    replanByRule(spaceId, uid)
    props = db.prepare('SELECT * FROM room_prop WHERE space_id = ?').all(spaceId)
  }
  const propByItem = new Map(props.map((p) => [p.item_id, p]))
  const result = []
  for (const it of items) {
    const p = propByItem.get(it.id) || {
      furniture: 'diary', x: 0, y: 0, z: 0, rot_y: 0, scale: 1, reason: '', support: '',
    }
    const media = db
      .prepare('SELECT type, url, thumb, duration FROM memory_media WHERE memory_id = ? ORDER BY sort ASC')
      .all(it.id)
      .map((m) => ({ type: m.type, url: m.url, thumb: m.thumb, duration: m.duration }))
    result.push({
      item_id: it.id,
      title: it.title,
      kind: it.kind,
      type: it.type,
      content: it.content,
      entry_date: it.entry_date,
      furniture: p.furniture,
      x: p.x,
      y: p.y,
      z: p.z,
      rot_y: p.rot_y,
      scale: p.scale,
      support: p.support || '',
      reason: p.reason,
      media,
      // ---- 这条记忆的 AI 产出：点开 3D 物品详情时要一起展示 ----
      //   之前只看 memory_media，于是「AI 生成的封面 / 视频」在详情里完全看不到，
      //   用户以为功能没做。这里原样带下去（相对路径，前端按同源处理）。
      ai_cover: it.ai_cover || '',
      ai_video: it.ai_video || '',
    })
  }
  return {
    room: 'house_three',
    space_id: spaceId,
    // 场景自带家具（床/书桌/椅子/书柜）：不属于任何记忆，由 3D 侧初始化时直接摆
    fixed: fixedPlacement(),
    props: result,
    max_items: MAX_ITEMS_PER_SPACE,
    // ---- 墙面陈设：给 3D 场景里那两个「装饰节点」用的数据 ----
    //   用户的 main.scene 里手工摆了一件 rahmen（相框）和一件 television（电视机），
    //   它们不对应任何一条记忆，但要跟着房间的「AI 产出」联动：
    //     · 相框 → 显示本岛最新一张 AI 封面图
    //     · 电视机 → 本岛只要生成过 AI 视频就点亮（呼吸光晕）
    //   这里统一算好传过去，3D 侧不必再逐个翻 props。
    gallery: galleryOf(items),
  }
}

/**
 * 汇总本岛的「AI 产出」，供场景里的相框 / 电视机使用。
 *
 * ★ 只认 **已生成成功** 的产物：
 *   · ai_video 为空但 ai_video_task 非空 = 还在排队生成，此时电视机**不亮**，
 *     等任务回来把列写上了才会亮（where portrait）。
 *   · ai_cover 为空同理。
 *
 * 「最新」按 room_prop / memory_item 的 created_at（items 已按它升序排好），
 *   倒着找第一个非空的值 —— 比再查一次 SQL 便宜。
 */
function galleryOf(items) {
  let cover = ''
  let video = ''
  let videoCount = 0
  // 用户偏好「看最新的」，所以从后往前找；找到最后一个生成的那张
  for (let i = items.length - 1; i >= 0; i--) {
    if (!cover && items[i].ai_cover) cover = items[i].ai_cover
    if (!video && items[i].ai_video) video = items[i].ai_video
  }
  for (const it of items) if (it.ai_video) videoCount++
  return { cover, video, videoCount }
}

// ---------------------------------------------------------------------------
// 存量数据修复（一次性，幂等）
// ---------------------------------------------------------------------------
// 背景分两代：
//   旧版按记忆的「内容分类」（kind / type）挑家具，同一分类下所有记忆都拿到同一件家具
//   —— 现网里就是"三条毫不相干的记忆，房间里全是书包"，reason 是 '按记忆类型自动摆放'。
//   再后来的版本改成按「标题 + 内容」挑家具，reason 变成 '按标题与内容自动摆放'，
//   但摆位还是黄金角螺旋 + rot_y 按 count%4 轮转 —— 于是"柜子背面朝人、
//   书柜孤零零杵在房间正中"（用户反馈原话）。
//
// 现在按当前规则**整间重算**（而不是一行一行改），这样承托关系才能一起建立：
//   1) 需要处理的空间 = ①含「自动摆放」reason 的行（两代旧文案都算）②有记忆却没有摆件行的。
//      手工指定的摆件 reason 文案不同，所在空间若无其它自动行则不会被碰到。
//   2) 每个空间调一次 writePlan（= planSpace + upsert）。planSpace 是纯函数，
//      所以同一份数据跑第二遍得到完全一样的结果 —— 幂等。
//   3) 重算内容包括 furniture / x / y / z / rot_y / support，顺带把「柜里放书、桌上放台灯」补齐。

export function repairLegacyRoomProps() {
  const out = { scanned: 0, reMatched: 0, moved: 0, resupported: 0, backfilled: 0, spaces: 0, detail: [] }

  const spaces = new Set(
    db
      // ★ 除了两代「自动摆放」文案，**家具是那四件固定的行也必须纳入**。
      //   它们是旧关键词表（曾含 bed/desk/cabinet/chair）留下的产物；现在这些家具由场景自带，
      //   如果不重算，一条「今天睡得很好」的记忆就会继续顶着一张床，
      //   房间既多一张床、又没有正确落位。
      .prepare(
        `SELECT DISTINCT space_id FROM room_prop
          WHERE reason IN (?, ?)
             OR furniture IN ('bed', 'desk', 'cabinet', 'chair')`,
      )
      .all(LEGACY_REASON, RULE_REASON)
      .map((r) => r.space_id),
  )
  for (const r of db
    .prepare(`SELECT DISTINCT i.space_id AS space_id FROM memory_item i LEFT JOIN room_prop p ON p.item_id = i.id WHERE p.item_id IS NULL`)
    .all()) {
    spaces.add(r.space_id)
  }

  for (const spaceId of spaces) {
    const items = spaceItems(spaceId)
    if (!items.length) continue
    const before = new Map(
      db.prepare('SELECT * FROM room_prop WHERE space_id = ?').all(spaceId).map((p) => [p.item_id, p]),
    )
    const plan = writePlan(spaceId, null, items)
    out.spaces++
    for (const p of plan) {
      const o = before.get(p.itemId)
      out.scanned++
      if (!o) {
        out.backfilled++
        out.detail.push(`${spaceId}#${p.itemId} 补齐 ${p.furniture}（${items.find((i) => i.id === p.itemId)?.title || '无标题'}）`)
        continue
      }
      if (o.furniture !== p.furniture) {
        out.reMatched++
        out.detail.push(`${spaceId}#${p.itemId} ${o.furniture}→${p.furniture}`)
      }
      if (o.x !== p.x || o.z !== p.z || o.rot_y !== p.rot_y || Math.abs((o.y || 0) - p.y) > 0.001) out.moved++
      if ((o.support || '') !== (p.support || '')) out.resupported++
    }
  }
  return out
}
