// RoomSpec.ts —— 房间模型 house_three 的几何规格（单一数据源）
// ---------------------------------------------------------------------------
// 这些数字不是拍脑袋来的：离线解析 house_three.glb 的全部 POSITION 顶点得到。
//   X: -0.4089 .. 0.3267   （宽 0.7356）
//   Y:  0.0000 .. 0.3481   （高 0.3481，地面正好在 y=0）
//   Z: -0.4212 .. 0.4685   （深 0.8897，+Z 一侧是开口「正面」，顶点数最少）
//
// 为什么要放大 4.5 倍：13 件家具模型的尺寸都在 0.6~1.1 之间（如书桌 0.96、
// 书架 1.06、台灯 1.11），而房间原始只有 0.35 高 —— 家具比房子还高，显然不成立。
// 把房子按 4.5 倍放大后：约 3.31m 宽 × 1.57m 高 × 4.00m 深，家具正好按 1 倍
// 摆进房间，比例协调（书桌约占房间宽度 1/3）。
import { Vec3 } from 'cc'

/** house_three.glb 的原始包围盒（未缩放、未平移；已是 Y-up） */
export const ROOM_SRC_MIN = new Vec3(-0.4089, 0, -0.4212)
export const ROOM_SRC_MAX = new Vec3(0.3267, 0.3481, 0.4685)

// ---------------------------------------------------------------------------
// ★ 场景由用户在编辑器里手工搭建在 main.scene 中，本工程不再动态加载房间
// ---------------------------------------------------------------------------
// main.scene 里已经放好了一个 house_three 实例，实测参数（解析 main.scene 得到）：
//   _lpos = (0, 0, 0)，_lscale = (10, 10, 10)，未居中到原点。
// 固定的四件家具（bed / bookcase / desk / chair）也在场景里，缩放统一是 2。
//
// 因此下面这些常量描述的是**用户那套场景**，不是原来「代码动态加载时」的参数：
//   · 房间缩放 10（原来动态加载用的是 4.5）
//   · 室内地板上表面 = 0.035(原始) × 10 + 0(节点 y) = 0.350
//   · 1 世界单位 ≈ 0.45 米（房间宽 7.356 单位 ≈ 3.31 米），家具坐标按这个比例换算
//
// 后端 room.js 算摆位时用的是「米」，下发前会乘 SCENE_UNIT_PER_METER 换成这里的单位。
export const SCENE_ROOM_SCALE = 10
export const SCENE_ROOM_Y = 0
/** 室内地板上表面的世界高度 —— 家具的 y 一律叠在这个值之上 */
export const SCENE_FLOOR_Y = 0.035 * SCENE_ROOM_SCALE + SCENE_ROOM_Y // 0.350
/** 1 米 = 多少世界单位（= 10 / 4.5，因为后端的「米」是按 4.5 倍房间推出来的） */
export const SCENE_UNIT_PER_METER = 10 / 4.5

/** 室内净高（地板面到墙顶）——摆高件（书柜）时用它判断会不会顶穿屋顶 */
export const ROOM_INNER_HEIGHT = (ROOM_SRC_MAX.y - 0.035) * SCENE_ROOM_SCALE // 约 1.409

/** 房间摆到 RoomRoot 下之后的半宽 / 高度 / 半深（RoomRoot 即原点） */
export const ROOM_HALF_X = ((ROOM_SRC_MAX.x - ROOM_SRC_MIN.x) * SCENE_ROOM_SCALE) / 2 // 1.6551
export const ROOM_HEIGHT = (ROOM_SRC_MAX.y - ROOM_SRC_MIN.y) * SCENE_ROOM_SCALE // 1.5665
export const ROOM_HALF_Z = ((ROOM_SRC_MAX.z - ROOM_SRC_MIN.z) * SCENE_ROOM_SCALE) / 2 // 2.0018

/**
 * 把房间模型摆到「居中到原点、地面贴 y=0」所需的局部坐标。
 * 这样 room_prop 里以原点为中心的坐标（x/z 对称）才和房间对得上。
 */
export function roomLocalPosition(): Vec3 {
  const cx = (ROOM_SRC_MIN.x + ROOM_SRC_MAX.x) / 2
  const cz = (ROOM_SRC_MIN.z + ROOM_SRC_MAX.z) / 2
  return new Vec3(-cx * SCENE_ROOM_SCALE, -ROOM_SRC_MIN.y * SCENE_ROOM_SCALE, -cz * SCENE_ROOM_SCALE)
}

/**
 * 房间的世界包围盒。
 *
 * ★ origin 是**房间模型节点的原点**（不是它的中心）—— main.scene 里手搭的 house_three
 *   位于 (0, 0.096, 0)、没有居中到原点，所以这里按「原始包围盒 × 缩放 + 原点」算，
 *   不能按「原点 ± 半宽」算（那会把机位偏掉半个房间，房间只露一半）。
 *   原始包围盒 x 中心 -0.0411 / z 中心 0.0236，偏心就是这么来的。
 */
export function roomWorldBounds(origin: Vec3, scale = SCENE_ROOM_SCALE): { min: Vec3; max: Vec3 } {
  return {
    min: new Vec3(
      origin.x + ROOM_SRC_MIN.x * scale,
      origin.y + ROOM_SRC_MIN.y * scale,
      origin.z + ROOM_SRC_MIN.z * scale,
    ),
    max: new Vec3(
      origin.x + ROOM_SRC_MAX.x * scale,
      origin.y + ROOM_SRC_MAX.y * scale,
      origin.z + ROOM_SRC_MAX.z * scale,
    ),
  }
}
