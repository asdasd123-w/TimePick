// RoomIsland.ts —— 房间底座「浮空小岛」
// ---------------------------------------------------------------------------
// 为什么要有这个文件：
//   main.scene 里那间房子（house_three）原本是摆在 `shiguang-island-only` 这座浮空岛上的，
//   岛 + 草 + 花 + 悬空的水面就是整张图的"地基"。有一次整理场景时岛节点被一起清掉了，
//   结果房间孤零零飘在云背景上（用户原话："底座小岛没了"）。场景文件里再加一份预制体实例
//   很容易在下一次整理时又被清掉，所以改成**运行时加载**：只要 assets 里有这个 glb，
//   岛就永远在，而且不会和场景里已有的岛重复（下面是幂等的）。
//
// 摆放规则（都按实测包围盒算，不写死数字）：
//   · 岛的中心对齐房间水平中心；
//   · 岛的"可用台面"（02_Usable_Top_Surface）刚好托住室内地板，草皮比地板低一点点，
//     这样房子的底板埋进岛里，不会看到悬空的缝；
//   · 岛的进深 = 房间进深 × ISLAND_DEPTH_RATIO，站远一点看四周才有一圈草地/悬崖。
//
// ★ 想调岛的大小：只改 ISLAND_DEPTH_RATIO（1.22 = 四周各多出 11% 草地）。
//   想整座岛上下挪：改 ISLAND_DROP。
import {
  Node,
  Prefab,
  Vec3,
  director,
  instantiate,
  MeshRenderer,
  resources,
} from 'cc'
import { SCENE_FLOOR_Y } from './RoomSpec'

/** resources 里岛模型的可实例化路径（glb 导进来会多一层同名目录，坑见 RoomBootstrap.loadPrefab） */
const ISLAND_PATHS = [
  'models/room/shiguang-island-only/shiguang-island-only',
  'models/room/shiguang-island-only',
]

/** 岛的进深 / 房间进深。1.42 = 房子四周各留约 21% 的草地（参考图里阳台外面有一大片草） */
const ISLAND_DEPTH_RATIO = 1.42
/** 岛往房间正前方（+Z）多挪一点，阳台外面就有一圈草地，不至于让阳台悬在崖边 */
const ISLAND_FRONT_SHIFT = 0.3
/** 草皮比室内地板低多少（世界单位）——低一点才不会和地板面 z-fighting */
const ISLAND_DROP = 0.02

function loadIslandPrefab(): Promise<Prefab | null> {
  return new Promise((resolve) => {
    const attempt = (i: number) => {
      if (i >= ISLAND_PATHS.length) {
        resolve(null)
        return
      }
      resources.load(ISLAND_PATHS[i], Prefab, (err: Error | null, asset: Prefab) => {
        if (!err && asset) resolve(asset)
        else attempt(i + 1)
      })
    }
    attempt(0)
  })
}

/** 自上而下强制刷新世界变换（父子顺序不能反，否则子节点用的是旧父矩阵） */
function forceWorld(root: Node) {
  root.updateWorldTransform()
  for (const c of root.children) forceWorld(c)
}

/**
 * 节点（含子节点）的**世界**包围盒：用 mesh.struct 的本地角点 × 世界矩阵算。
 *
 * ⚠ 不能用 MeshRenderer.model.worldBounds：那是渲染场景里的值，新 instantiate 出来的
 *   节点还没渲染过，读到的是全 0 的盒子（曾经因此把岛缩成了 1 倍、摆到了房间中间）。
 */
function worldBox(root: Node): { min: Vec3; max: Vec3 } | null {
  let min: Vec3 | null = null
  let max: Vec3 | null = null
  const tmp = new Vec3()
  for (const r of root.getComponentsInChildren(MeshRenderer)) {
    const mesh = r.mesh
    if (!mesh || !mesh.struct) continue
    const a = mesh.struct.minPosition
    const b = mesh.struct.maxPosition
    if (!a || !b) continue
    const m = r.node.worldMatrix
    for (let i = 0; i < 8; i++) {
      tmp.set(i & 1 ? b.x : a.x, i & 2 ? b.y : a.y, i & 4 ? b.z : a.z)
      Vec3.transformMat4(tmp, tmp, m)
      if (!min) {
        min = tmp.clone()
        max = tmp.clone()
      } else {
        min.x = Math.min(min.x, tmp.x)
        min.y = Math.min(min.y, tmp.y)
        min.z = Math.min(min.z, tmp.z)
        max!.x = Math.max(max!.x, tmp.x)
        max!.y = Math.max(max!.y, tmp.y)
        max!.z = Math.max(max!.z, tmp.z)
      }
    }
  }
  return min && max ? { min, max } : null
}

/** 场景里是否已经有一座岛（用户在编辑器里手摆的，或者本组件上一轮建的） */
function findIslandNode(): Node | null {
  const scene = director.getScene()
  if (!scene) return null
  const stack: Node[] = [...scene.children]
  while (stack.length) {
    const n = stack.pop() as Node
    if (/island/i.test(n.name)) return n
    for (const c of n.children) stack.push(c)
  }
  return null
}

/** 在子树里按名字找节点（岛的子节点名可能带序号/后缀，用正则更稳） */
function findByName(root: Node, re: RegExp): Node | null {
  const stack: Node[] = [...root.children]
  while (stack.length) {
    const n = stack.pop() as Node
    if (re.test(n.name)) return n
    for (const c of n.children) stack.push(c)
  }
  return null
}

export class RoomIsland {
  /**
   * 确保场景里有一座岛，并把它摆到房间下面。已经存在就直接返回，不重复创建。
   * @param roomMin/roomMax 房间（house_three）的世界包围盒
   */
  static async ensure(roomMin: Vec3, roomMax: Vec3): Promise<Node | null> {
    const existing = findIslandNode()
    if (existing) {
      console.log('[RoomIsland] 场景里已有小岛节点，跳过创建:', existing.name)
      return existing
    }
    const scene = director.getScene()
    if (!scene) return null

    const prefab = await loadIslandPrefab()
    if (!prefab) {
      console.error(
        '[RoomIsland] 找不到岛模型（resources/models/room/shiguang-island-only）——' +
          '房间会像"飘在空中"一样留在云里。检查 assets/resources/models/room 下这个 glb 还在不在。',
      )
      return null
    }

    const island = instantiate(prefab)
    island.name = 'shiguang-island'
    island.parent = scene
    // 先归零：量出来的盒子才是"模型自己的尺寸"，不受预制体里留下的变换影响
    island.setPosition(0, 0, 0)
    island.setRotationFromEuler(0, 0, 0)
    island.setScale(1, 1, 1)
    forceWorld(island)

    const box = worldBox(island)
    if (!box) {
      console.error('[RoomIsland] 岛模型没有任何网格，已放弃摆放')
      return null
    }

    const sizeX = box.max.x - box.min.x
    const sizeZ = box.max.z - box.min.z
    const depth = roomMax.z - roomMin.z
    // 岛的进深对齐房间进深（再放大一点留草地）；宽高按同一个比例走，保持原比例不变形
    const k = (depth * ISLAND_DEPTH_RATIO) / Math.max(1e-4, sizeZ)

    // 台面高度：优先用 02_Usable_Top_Surface（建模时它就是"可以站东西的面"）
    const topNode = island.getChildByName('02_Usable_Top_Surface') || findByName(island, /Usable_Top/i)
    const topBox = topNode ? worldBox(topNode) : null
    const topY = topBox ? topBox.max.y : box.max.y

    const cx = (box.min.x + box.max.x) / 2
    const cz = (box.min.z + box.max.z) / 2
    const roomCx = (roomMin.x + roomMax.x) / 2
    const roomCz = (roomMin.z + roomMax.z) / 2

    island.setScale(k, k, k)
    island.setPosition(
      roomCx - cx * k,
      SCENE_FLOOR_Y - ISLAND_DROP - topY * k,
      roomCz - cz * k + ISLAND_FRONT_SHIFT,
    )
    forceWorld(island)

    console.log(
      `[RoomIsland] 小岛就位：原尺寸 ${sizeX.toFixed(2)}×${sizeZ.toFixed(2)} → 缩放 x${k.toFixed(3)}` +
        `，台面 y=${(SCENE_FLOOR_Y - ISLAND_DROP).toFixed(2)}`,
      `（房间 ${(roomMax.x - roomMin.x).toFixed(2)}×${depth.toFixed(2)}）`,
    )
    return island
  }
}
