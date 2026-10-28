// RoomBootstrap.ts —— 3D 房间主控
// 挂在场景里一个空节点上（建议同时作为 roomRoot 的父/兄弟）。职责：
//   1) 动态加载 house_three 房间模型
//   2) 拉取本记忆空间的布局数据（room/layout）
//   3) 按数据把每件家具（furniture/<名>.glb）实例化并摆到坐标/旋转/缩放
//   4) 监听点击，用相机射线拾取家具，命中则通过 HostBridge 通知宿主打开该记忆详情
import {
  _decorator,
  Component,
  Node,
  Prefab,
  instantiate,
  Vec3,
  geometry,
  MeshRenderer,
  Input,
  EventTouch,
  input,
  Camera,
  find,
  director,
  Director,
  resources,
  screen,
} from 'cc'
import { Net, RoomPropData } from './Net'
import { HostBridge } from './HostBridge'
import { FurnitureProp } from './FurnitureProp'
import { PropGlow } from './PropGlow'
import { CameraRig } from './CameraRig'
import { RoomGallery } from './RoomGallery'
import { CatPet, CatBox } from './CatPet'
import { RoomIsland } from './RoomIsland'
import { SCENE_FLOOR_Y } from './RoomSpec'
import { furnitureScale3 } from './FurnitureSpec'

const { ccclass, property } = _decorator

// 幂等锁：整个进程只允许 **一个** RoomBootstrap 真正跑起来。
//
// 为什么不嫌多余：这个组件会被「兜底补挂」机制多次 addComponent（见文件末尾
// ensureBootstrapped），而 Cocos 保存场景时会把这些组件一起写进 .scene。
// 曾经引擎里同时存在 16 个实例 —— 结果就是房间模型被 instantiate 16 次全部叠在原点、
// 家具重复摆放 16 遍、相机被 16 个 CameraRig 轮流设置，画面和性能一起炸。
// 有了这把锁，即便场景文件里又攒出多份，也只有第一个会真正执行。
let roomBootStarted = false

@ccclass('RoomBootstrap')
export class RoomBootstrap extends Component {
  // 家具/房间的父节点（在场景里建一个空节点 RoomRoot 拖进来）
  @property(Node)
  roomRoot: Node = null

  // 主相机（用于射线拾取；不填则自动找场景里的 Main Camera）
  @property(Camera)
  mainCamera: Camera = null

  private furnitureNodes: Node[] = []
  /** 3D 小猫（运行时生成；场景里已经有 cat 节点时会被复用，见 CatPet 顶部说明） */
  private cat: CatPet | null = null
  /** 房间本体（house_three）的世界包围盒 —— 取景 / 小岛对齐 / 障碍收集共用 */
  private roomMin = new Vec3(-3.7, 0, -3.7)
  private roomMax = new Vec3(3.7, 3.5, 3.7)
  /** 房间本体：双击时用它判断"这条射线是不是先打在墙上" */
  private houseNode: Node | null = null
  private downX = 0
  /** 按下点的 y（**左上原点**：转发给宿主页面用 —— 宿主是 CSS 坐标系，y 向下长） */
  private downY = 0
  /**
   * 按下点的 y（**左下原点**，即 `getLocationY()` 的原值）。
   *
   * ⚠ 为什么要存两份：踩过一次很隐蔽的坑。
   *   `EventTouch.getLocationY()` 是**左下原点**（GL 风格，y 往上长），
   *   而 `Camera.screenPointToRay(x, y)` 内部算的是
   *     `ndcY = (y - viewport.y) / viewportH * 2 - 1`
   *   —— y 越大对应 NDC 越靠上，也就是**它要的同样是左下原点**。
   *   早期误以为它跟 CSS 一样是左上原点，把翻转过的 y 传进去，
   *   射线整体上下颠倒：点上半屏的家具，射线却打向地板 ——
   *   表现就是"点击 3D 物品没有任何内容"，而且不报错，极难排查。
   *   现在两份各归各用，绝不混用。
   */
  private downYGL = 0
  private loaded = false

  // ---- 单击 / 双击区分 ----
  // 单击 = 打开这条记忆的详情；双击 = 让宿主页面里的宠物走到双击的位置
  //（"宠物在 3D 房间里也可以双击后移动"）。
  // 为什么要延迟：只按下一次时无法立刻判断用户会不会再点第二下，所以单击的开详单
  // 推迟 260ms 执行；中途来了第二下就取消，改成发双击消息。
  private tapTimer: ReturnType<typeof setTimeout> | null = null
  private lastTapAt = 0
  private lastTapNX = 0
  private lastTapNY = 0
  private doubleTapped = false
  private static readonly DBL_GAP_MS = 420
  private static readonly DBL_NEAR = 0.06 // 归一化坐标，约等于屏宽的 6%
  private static readonly TAP_DELAY_MS = 260

  async start() {
    // 重复实例直接自裁：场景里可能被攒了多份（见上面的幂等锁注释），
    // 只有第一个实例往下走，其余的把自己从节点上摘掉，避免房间被重复创建。
    if (roomBootStarted) {
      try {
        this.node.removeComponent(this)
      } catch {
        /* 摘不掉就算了, 至少没有往下执行 */
      }
      return
    }
    roomBootStarted = true

    // ★ 房间在场景根下（用户手搭），家具也挂在场景根 —— roomRoot 保留字段只为兼容旧场景，
    //   不再拿它当家具的父节点，否则家具会和房间错开一个父级的变换。
    if (!this.roomRoot) this.roomRoot = find('RoomRoot') || this.node

    // 1) 房间与背景都已经在场景里，这里只做一次体检，缺了就大声报出来。
    //    （之前这个脚本会自己 loadPrefab('models/room','house_three') 再摆一次，
    //      会和用户手搭的房间重叠成两份；现在改成「只检查、不创建」。）
    const houseNode = find('house_three')
    this.houseNode = houseNode
    if (!houseNode) {
      console.error('[RoomBootstrap] 场景里找不到 house_three —— 房间本体必须先在 main.scene 里手工放好。')
    }

    // 1.5) 量房间的真实世界包围盒：取景 / 小岛对齐 / 小猫活动范围全用它，
    //      不再靠 RoomSpec 里那组手抄的常量（场景一动，常量就对不上了）。
    if (houseNode) {
      const rb = this.rawWorldAABB(houseNode)
      if (rb) {
        this.roomMin.set(
          rb.center.x - rb.halfExtents.x,
          rb.center.y - rb.halfExtents.y,
          rb.center.z - rb.halfExtents.z,
        )
        this.roomMax.set(
          rb.center.x + rb.halfExtents.x,
          rb.center.y + rb.halfExtents.y,
          rb.center.z + rb.halfExtents.z,
        )
        console.log(
          `[RoomBootstrap] 房间包围盒 x ${this.roomMin.x.toFixed(2)}..${this.roomMax.x.toFixed(2)}, ` +
            `z ${this.roomMin.z.toFixed(2)}..${this.roomMax.z.toFixed(2)}`,
        )
      }
    }

    // 1.6) 底座小岛：摆在房子下面（运行时加载，场景里已经有一座就复用）
    await RoomIsland.ensure(this.roomMin, this.roomMax)

    // 2) 拉布局数据
    let layout: {
      room: string
      space_id: number
      props: RoomPropData[]
      // 场景自带家具（床/书桌/椅子/书柜），不属于任何记忆
      fixed?: { furniture: string; x: number; y: number; z: number; rot_y: number }[]
      max_items?: number
      // 墙面陈设：AI 封面进相框 / AI 视频点亮电视机（server 端 galleryOf 算好送来）
      gallery?: { cover?: string; video?: string; videoCount?: number }
    } = { room: 'house_three', space_id: 0, props: [], fixed: [] }
    const q = Net.getQuery()
    if (!q.spaceId) {
      // 编辑器预览（或手输地址）没带 spaceId —— 这不是故障, 只是拿不到真实数据。
      // 用 warn 而不是 error, 免得预览时控制台一片红, 看不出真正的问题。
      console.warn(
        '[RoomBootstrap] 未指定 spaceId（编辑器预览时属正常现象）：本次按「空房间」显示。\n' +
          '  想看真实数据：在控制台执行 localStorage.setItem("tp_space_id","<岛屿ID>") 后刷新；\n' +
          '  正式嵌入时由 TimePick 的 room3d.vue 自动带上 ?spaceId=…&token=…',
      )
    } else {
      try {
        layout = (await Net.fetchLayout(q.spaceId, q.token, q.apiBase)) as any
      } catch (e) {
        console.error('[RoomBootstrap] 布局数据获取失败(将显示空房间):', e)
      }
    }

    // 3) 先准备相机：光晕/照片面片要朝它，必须在摆家具**之前**就拿到
    if (!this.mainCamera) {
      const camNode = find('Main Camera') || director.getScene().getComponentInChildren(Camera)?.node
      this.mainCamera = camNode ? camNode.getComponent(Camera) : null
    }

    // 3.5) 墙面陈设：相框贴 AI 封面 / 电视机有 AI 视频就点亮。
    //      ★ 不 await：封面是远程图（可能是很大的 dataURL），让它自己慢慢下载，
    //        房间该摆家具摆家具，不能卡在这里。
    void RoomGallery.apply(layout.gallery, this.mainCamera ? this.mainCamera.node : null)
    // 轮询：用户之后又生成了新的 AI 视频/封面时，房间不刷新也能自己亮电视、换照片
    RoomGallery.startWatch(q.spaceId || 0)

    // 4) 摆家具
    //    ★ 房间本体、背景板、以及床/书桌/椅子/柜子这些固定家具，
    //      全部来自用户在 main.scene 里手工搭好的节点，本脚本**不再重复创建**。
    //      这里只负责把「每条记忆对应的那一件」摆进这个已经建好的场景，
    //      并给每件挂上「标题牌 + 呼吸高亮」。
    for (const p of layout.props || []) {
      await this.placeFurniture(p)
    }

    // 5) 固定机位：让已经搭好的房间铺满屏幕
    this.fitCamera()

    // 5.2) 收集障碍：床/柜子/书桌/椅子/花盆/落地的记忆物品，
    //      小猫走动时必须绕开它们（以前只夹房间矩形，于是能直接穿过床和柜子）。
    const obstacles = this.collectObstacles()

    // 6) 输入（放在"通知宿主就绪"之前：房间一出现就能拖动、点击）
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this)
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this)

    // 6.5) 宿主 → 3D：镜头视角快捷定位（小屋 / 室内 / 花园 / 书桌 / 岛体）。
    //      宿主上那一排按钮点一下就发一条 tp:view，这里转给 CameraRig 平滑补间过去。
    HostBridge.onMessage((msg) => {
      if (!msg || typeof msg !== 'object') return
      if (msg.type !== 'tp:view') return
      const name = String(msg.name || '')
      if (!this.rig) {
        console.warn('[RoomBootstrap] 收到视角切换但没有 CameraRig')
        return
      }
      this.rig.focusPreset(name)
    })

    // ===== 三层加载的「第 2 层」到此完成：房间主体 + 必要材质 + 核心物件 =====
    //   ★ 先告诉宿主"可以收起加载页了"，再去加载**装饰层**（小猫 / 墙面陈设）。
    //     以前是等猫也加载完才发 tp:ready，用户在小猫那 1~2 秒里只能盯着加载条；
    //     现在房间一到位就先给画面，猫随后自己走进来（陈设见 3.5 的 void RoomGallery.apply，
    //     本来就是后台加载，墙面照片/AI 视频会晚一拍亮起）。
    this.loaded = true
    HostBridge.post({ type: 'tp:ready' })
    console.log(`[RoomBootstrap] 房间就绪，已摆放 ${this.furnitureNodes.length} 件家具（小猫随后加载）`)

    // ===== 第 3 层：装饰 —— 小猫 =====
    //   必须放在相机就位之后（它要把自己投影成屏幕坐标给宿主摆菜单）。
    //   ★ 不再有"进场跑场"——用户明确要求进场动作去掉，它就在房间里待着。
    try {
      const catPrefab = await this.loadPrefab('models/room', 'cat')
      this.cat = await CatPet.create(catPrefab, this.mainCamera, layout.props || [], obstacles)
    } catch (e) {
      console.error('[RoomBootstrap] 小猫创建失败（房间其余部分不受影响）:', e)
    }
  }

  /**
   * 从 resources 包里取一个 glb 资源。
   *
   * 关键坑：glb 导入 Cocos 后**不能**按源码文件名直接加载。导入器会生成一层同名
   * 子目录，真正可实例化的 Prefab 子资源路径是 `<dir>/<name>/<name>`，
   * 直接写 `models/room/house_three` 会报
   * `Bundle resources doesn't contain models/room/house_three`。
   *
   * 加载顺序：
   *   1) `<dir>/<name>/<name>`（正确路径，已从 resources/config.json 核实）
   *   2) `<dir>/<name>`（旧写法兜底）
   *   3) 枚举该目录下真实资源路径再按名匹配（应对将来导入器改命名）
   * 全部失败时把目录里所有可用路径打到控制台，方便一次性定位。
   */
  private loadPrefab(dir: string, name: string): Promise<Prefab | null> {
    // glb 导入 Cocos 后，真正可实例化的 Prefab 子资源路径是 <dir>/<name>/<name>
    // —— 已从预览服务器的 resources/config.json 里核实（paths 记录：
    //    "models/room/house_three/house_three" -> cc.Prefab；
    //    "models/furniture/bed/bed"           -> cc.Prefab）
    const tried = [`${dir}/${name}/${name}`, `${dir}/${name}`]

    // 兜底：枚举该目录下真实存在的资源路径再按名匹配（应对将来导入器改命名）
    const enumFallback = (): Promise<Prefab | null> =>
      new Promise((resolve) => {
        let paths: string[] = []
        try {
          paths = resources.getDirWithPath(dir).map((i) => i.path)
        } catch (e) {
          console.warn(`[RoomBootstrap] 枚举目录 '${dir}' 失败:`, e)
        }
        const cand = paths.filter((p) => {
          const segs = String(p).split('/')
          const last = segs[segs.length - 1] || ''
          const prev = segs[segs.length - 2] || ''
          return last === name || last === `${name}.prefab` || prev === name
        })
        console.warn(
          `[RoomBootstrap] 常规路径均未命中（${tried.join(' / ')}）；` +
            `目录 '${dir}' 下可用资源 ${paths.length} 个:`, paths,
        )
        if (!cand.length) {
          resolve(null)
          return
        }
        resources.load(cand[0], Prefab, (e2: Error | null, a2: Prefab) => {
          if (e2 || !a2) {
            console.error(`[RoomBootstrap] 回退路径也加载失败: ${cand[0]}`, e2)
            resolve(null)
          } else {
            console.log(`[RoomBootstrap] 已用回退路径加载: ${cand[0]}`)
            resolve(a2)
          }
        })
      })

    return new Promise((resolve) => {
      const attempt = (i: number) => {
        if (i >= tried.length) {
          enumFallback().then(resolve)
          return
        }
        resources.load(tried[i], Prefab, (err: Error | null, asset: Prefab) => {
          if (!err && asset) resolve(asset)
          else attempt(i + 1)
        })
      }
      attempt(0)
    })
  }

  /**
   * 让相机按房间真实尺寸锁定固定机位（正面、房子铺满屏幕）。
   * 相机脚本挂在 Main Camera 上；找不到就静默跳过（CameraRig 自己会用默认尺寸兜一次）。
   */
  private fitCamera() {
    try {
      const scene = director.getScene()
      const camNode = find('Main Camera') || (scene ? scene.getComponentInChildren(Camera)?.node : null)
      const rig = camNode ? camNode.getComponent(CameraRig) : null
      this.rig = rig
      if (!rig) {
        console.warn('[RoomBootstrap] 未找到 CameraRig（Main Camera 上），跳过自动取景')
        return
      }
      // ★ 用**实测**的房间包围盒再往外放一圈（FRAME_MARGIN）：
      //   只按房间取景的话，房子会把画面塞满，底座小岛的花草全被裁掉 ——
      //   用户反馈的"猫看着变大了"其实就是镜头贴太近。
      //   ★ 不要把岛的悬崖也算进取景框：岛往下有 8 个单位，算进去相机会退到天上去。
      const margin = RoomBootstrap.FRAME_MARGIN
      const cx = (this.roomMin.x + this.roomMax.x) / 2
      const cz = (this.roomMin.z + this.roomMax.z) / 2
      const hx = ((this.roomMax.x - this.roomMin.x) / 2) * margin
      const hz = ((this.roomMax.z - this.roomMin.z) / 2) * margin
      rig.fitTo(
        new Vec3(cx - hx, this.roomMin.y - 0.1, cz - hz),
        new Vec3(cx + hx, this.roomMax.y + 0.05, cz + hz),
      )
      console.log('[RoomBootstrap] 相机已按房间尺寸取景（正面固定机位）')
    } catch (e) {
      console.warn('[RoomBootstrap] 自动取景失败:', e)
    }
  }

  /** 取景框相对房间的放大倍数（1.22 = 四周多留 22%，刚好露出一圈草地） */
  private static readonly FRAME_MARGIN = 1.22

  /** Main Camera 上的相机脚本（视角快捷定位用；fitCamera 时顺便存下来） */
  private rig: CameraRig | null = null

  /**
   * 世界包围盒（**原样**，不做 MIN_PICK 放大）。
   *
   * ★ 用 mesh.struct 的本地角点 × 世界矩阵，而不是 MeshRenderer.model.worldBounds：
   *   后者是"渲染场景"里的缓存，场景里那些预制体实例在 start() 这一拍还没提交过渲染，
   *   worldBounds 全是 0 —— 于是家具障碍一个都收不到（实测只有刚 new 出来的那件能收到），
   *   猫照样穿过床和柜子。
   */
  private rawWorldAABB(n: Node): geometry.AABB | null {
    let min: Vec3 | null = null
    let max: Vec3 | null = null
    const tmp = new Vec3()
    n.updateWorldTransform()
    for (const r of n.getComponentsInChildren(MeshRenderer)) {
      const mesh = r.mesh
      if (!mesh || !mesh.struct) continue
      const a = mesh.struct.minPosition
      const b = mesh.struct.maxPosition
      if (!a || !b) continue
      r.node.updateWorldTransform()
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
    if (!min || !max) return null
    // ⚠ 3.8 的 AABB 构造是 6 个数字 (cx,cy,cz,hw,hh,hd)，不是 (Vec3, Vec3)
    return new geometry.AABB(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2,
      (max.x - min.x) / 2,
      (max.y - min.y) / 2,
      (max.z - min.z) / 2,
    )
  }

  /**
   * 收集小猫要绕开的家具（水平包围盒）。
   *
   * ★ 关键：床/柜子/书桌这些**不是场景根节点**，它们全都挂在 house_three 底下
   *   （用户在编辑器里是把模型拖进房间节点里的，连猫都在里面）。所以不能只遍历
   *   scene.children —— 第一版就是这么写的，结果一件家具都没收到，猫照穿不误。
   *   现在自顶向下走：遇到"自己带 MeshRenderer"的节点就把它整件当成一个障碍，
   *   不再往它内部拆（内部是零件，拆开只会得到一堆碎片盒子）。
   *
   * 过滤规则（都是实测踩出来的）：
   *   · 房间壳体（地板+墙+栏杆）占地 20+ 平方单位，用面积上限排除；
   *   · 底面高于地板+0.5 的（电视、书本摆在桌面上）不算障碍 ——
   *     猫本来就够不着，算进去会把整张桌子周围封死；
   *   · 太扁的（地毯/纸片，高度 < 0.12）也不算；
   *   · 猫自己、底座小岛、背景板都跳过。
   */
  private collectObstacles(): CatBox[] {
    const out: CatBox[] = []
    const scene = director.getScene()
    if (!scene) return out

    const measure = (n: Node): CatBox | null => {
      if (/^cat$/i.test(n.name) || /island/i.test(n.name) || /backdrop/i.test(n.name)) return null
      const box = this.rawWorldAABB(n)
      if (!box) return null
      const minY = box.center.y - box.halfExtents.y
      const maxY = box.center.y + box.halfExtents.y
      const w = box.halfExtents.x * 2
      const d = box.halfExtents.z * 2
      if (maxY - SCENE_FLOOR_Y < 0.12) return null
      if (minY > SCENE_FLOOR_Y + 0.5) return null
      if (w * d > 8) return null
      return {
        minX: box.center.x - box.halfExtents.x,
        maxX: box.center.x + box.halfExtents.x,
        minZ: box.center.z - box.halfExtents.z,
        maxZ: box.center.z + box.halfExtents.z,
      }
    }

    const visit = (n: Node) => {
      // 整棵子树都跳过：底座小岛（花草会被当成障碍物）、猫自己、背景幕布
      if (/island/i.test(n.name) || /^cat$/i.test(n.name) || /backdrop/i.test(n.name)) return
      if (n.getComponent(MeshRenderer) || n.getComponents(MeshRenderer).length) {
        const b = measure(n)
        if (b) out.push(b)
        return // 内部的网格是这件家具的零件，不再往里拆
      }
      for (const c of n.children) visit(c)
    }

    for (const n of scene.children) {
      if (n === this.node) continue
      visit(n)
    }
    console.log(
      `[RoomBootstrap] 小猫障碍 ${out.length} 个:`,
      out.map((b) => `${(b.maxX - b.minX).toFixed(2)}×${(b.maxZ - b.minZ).toFixed(2)}`).join(' '),
    )
    return out
  }

  /**
   * 摆「一条记忆对应的那件家具」。
   *
   * 房间本体、背景板、床/书桌/椅子/书柜这四件固定家具**都在场景里**了，这里不碰。
   *
   * 坐标约定（务必和 RoomSpec.ts 的注释一起看）：
   *   · 父节点是**场景根**，不是 RoomRoot —— 用户把 house_three 挂在场景根下，
   *     家具要和它共用同一个坐标系，才能直接用世界坐标摆。
   *   · p.y 是「离室内地板面多少米」（放桌上/柜里就是该支撑面的高度），
   *     叠上 SCENE_FLOOR_Y 得到世界 y。
   *   · p.x / p.z 后端已经换算成用户场景的单位（1 米 = SCENE_UNIT_PER_METER 个单位）。
   *   · 缩放用 furnitureScale3：统一 2 倍（与场景里那四件一致），椅子是非等比 (1,1.5,1)。
   */
  private async placeFurniture(p: RoomPropData) {
    try {
      const prefab = await this.loadPrefab('models/furniture', p.furniture)
      if (!prefab) return
      const node = instantiate(prefab)
      node.parent = director.getScene()
      node.setPosition(new Vec3(p.x || 0, (p.y || 0) + SCENE_FLOOR_Y, p.z || 0))
      node.setRotationFromEuler(0, p.rot_y || 0, 0)
      // 先按 FurnitureSpec 的基准缩放（与场景自带家具一致），再乘后端可选的微调 scale
      const [sx, sy, sz] = furnitureScale3(p.furniture)
      const k = p.scale || 1
      node.setScale(sx * k, sy * k, sz * k)
      const fp = node.addComponent(FurnitureProp)
      fp.itemId = p.item_id
      fp.prop = p
      this.furnitureNodes.push(node)

      // 物品世界坐标：光晕以它为中心
      const worldPos = new Vec3(p.x || 0, (p.y || 0) + SCENE_FLOOR_Y, p.z || 0)
      const camNode = this.mainCamera ? this.mainCamera.node : null

      // 灯光呼吸高亮：一圈柔光围住物品（不覆盖物体正面）。
      // ★ 不再挂 3D 标题牌（PropLabel）：柜子隔板上的物品间距只有 0.22 世界单位，
      //   牌子会互相叠在一起"串成一排"，用户反馈看不清 —— 标题改由右侧列表承载。
      try {
        const glowNode = new Node('GlowTag')
        glowNode.parent = node
        const glow = glowNode.addComponent(PropGlow)
        // 这里给的是**最小**直径：PropGlow 会拿家具自己的世界包围盒再校准一次
        // （0.36 那版在暖色柜子里几乎看不见，用户反馈"高亮也没有"，所以整体调大一档）。
        // 电脑/书包本体更大，光圈基准也更大。
        const big = p.furniture === 'computer' || p.furniture === 'schoolbag'
        glow.init(camNode, worldPos, big ? 0.8 : 0.5)
      } catch (e) {
        console.warn('[RoomBootstrap] 呼吸光晕创建失败:', e)
      }
    } catch (e) {
      console.error(`[RoomBootstrap] 家具加载失败: ${p.furniture}`, e)
    }
  }

  // 事件坐标（左下原点）→ 屏幕「左上原点」的物理像素坐标。
  //
  // ★ 只给**宿主页面**用：宿主的 getBoundingClientRect() 是 CSS 坐标系（y 往下长）。
  //   直接用 getLocationY() 会整体上下颠倒，而且错得很"像对的"：
  //   实测点画面 (200,420)、视口高 625，宠物却走到 y=208 —— 正好是 625-420+3。
  //   ⚠ 射线拾取（screenPointToRay）**不要**用它 —— 那头要的是左下原点，见 downYGL 的注释。
  private static toTopLeftY(locationY: number): number {
    const h = screen.windowSize ? screen.windowSize.height : 0
    return h > 0 ? h - locationY : locationY
  }

  private onTouchStart(e: EventTouch) {
    this.downX = e.getLocationX()
    // 原点样：给宿主转发坐标用（后面归一化 + 双击判定都基于它）
    this.downY = RoomBootstrap.toTopLeftY(e.getLocationY())
    // 左下原点的原值：射线拾取专用
    this.downYGL = e.getLocationY()

    // 归一化坐标（0..1，y 向下）—— 用 screen.windowSize 而不是 view.getVisibleSize()：
    // getLocationX/Y 给的是**物理像素**，只有 windowSize 才是同一个坐标系。
    // 给宿主传归一化值，可以彻底绕开 devicePixelRatio / iframe 尺寸的换算坑。
    const ws = screen.windowSize
    const nx = ws.width > 0 ? this.downX / ws.width : 0
    const ny = ws.height > 0 ? this.downY / ws.height : 0

    const dt = performance.now() - this.lastTapAt
    const near =
      Math.abs(nx - this.lastTapNX) < RoomBootstrap.DBL_NEAR &&
      Math.abs(ny - this.lastTapNY) < RoomBootstrap.DBL_NEAR

    if (dt < RoomBootstrap.DBL_GAP_MS && near) {
      // 第二下：这是一次双击 —— 取消掉第一下排队的"打开记忆"，改让小猫走过去
      this.doubleTapped = true
      if (this.tapTimer) {
        clearTimeout(this.tapTimer)
        this.tapTimer = null
      }
      this.walkCatTo(this.downX, this.downYGL)
    } else {
      this.doubleTapped = false
    }
    this.lastTapAt = performance.now()
    this.lastTapNX = nx
    this.lastTapNY = ny
  }

  /**
   * 取节点（含子节点）在世界空间的包围盒。
   * 注意：Node 上没有 getWorldBoundingBox()（那是旧 API），3.x 要从 MeshRenderer 的
   * model.worldBounds 拿，并把同一件家具的多个网格合并成一个盒子。
   */
  private worldAABB(n: Node): geometry.AABB | null {
    const renderers = n.getComponentsInChildren(MeshRenderer)
    let out: geometry.AABB | null = null
    for (let i = 0; i < renderers.length; i++) {
      const model = renderers[i].model
      const b = model ? model.worldBounds : null
      if (!b) continue
      out = out ? geometry.AABB.merge(out, out, b) : geometry.AABB.clone(b)
    }
    if (!out) return null
    // ★ 给一个「最小可点尺寸」：家具缩到 0.34 之后，一本日记本只有 0.24 单位宽，
    //   AABB 比一个像素还细，射线几乎不可能命中 —— 用户反馈「点家具没反应」就是这个。
    //   这里把太小的半边撑到 MIN_PICK/2，中心不变，视觉上看不出差别，手感却好很多。
    //
    //   ⚠⚠ 3.8 的 geometry.AABB 是 **center + halfExtents** 结构，根本没有 min/max
    //   字段（那是 2.x 的老结构）。第一版按老结构写成了 out.min.x，一点击就崩：
    //     "Uncaught TypeError: Cannot read properties of undefined (reading 'x')
    //        at u.worldAABB ... at u.pickAndOpen"
    //   要拿角点只能用 getBoundary(minPos, maxPos) 现算，别直接读属性。
    //   out 是 AABB.clone/AABB.merge 产出的新对象（不是 model.worldBounds 本体），
    //   所以放心改 halfExtents，不会污染模型自己的包围盒。
    const MIN_PICK = 0.5
    const he = out.halfExtents
    out.halfExtents.set(
      Math.max(he.x, MIN_PICK / 2),
      Math.max(he.y, MIN_PICK / 2),
      Math.max(he.z, MIN_PICK / 2),
    )
    return out
  }

  // 只有"点一下没怎么拖动"才算点击（避免误触）
  private onTouchEnd(e: EventTouch) {
    if (!this.loaded || !this.mainCamera) return
    if (this.doubleTapped) {
      // 第二下抬起：这次是双击，已经发过宠物移动消息，不要再开记忆详情
      this.doubleTapped = false
      return
    }
    const dx = e.getLocationX() - this.downX
    // 两边都用左下原点的原值，直接相减即可（翻转过的 y 与未翻转的 y 不能混用）
    const dy = e.getLocationY() - this.downYGL
    if (dx * dx + dy * dy > 144) return // 移动超过 12px 视为拖拽，不拾取

    // 推迟一拍再开详情：万一是双击（第一下抬起在这里），第二下按下时会把定时器取消掉，
    // 于是双击不会顺带弹出记忆浮层，只让宠物走过去。
    const x = this.downX
    // ★ 必须是 downYGL（左下原点）：screenPointToRay 要的就是这一套坐标系
    const y = this.downYGL
    if (this.tapTimer) clearTimeout(this.tapTimer)
    this.tapTimer = setTimeout(() => {
      this.tapTimer = null
      this.pickAndOpen(x, y)
    }, RoomBootstrap.TAP_DELAY_MS)
  }

  /**
   * 双击：让小猫走到射线落点。
   * ★ 这件事现在完全在 3D 里做 —— 原来是把归一化坐标 postMessage 给宿主，
   *   让宿主页面上的 2D 宠物走过去；现在 2D 猫已经不在 3D 房间出现了。
   */
  private walkCatTo(x: number, y: number) {
    if (!this.cat || !this.mainCamera) return
    const ray = this.mainCamera.screenPointToRay(x, y)
    const r = this.cat.tryWalkTo(ray, this.houseNode)
    if (r !== 'walk') {
      console.log(`[RoomBootstrap] 双击(${Math.round(x)},${Math.round(y)}) → ${r}（小猫不动）`)
    }
  }

  /**
   * 射线拾取：小猫优先，其次家具。命中家具则通知宿主打开对应记忆。
   * @param x 物理像素，x 向右
   * @param y 物理像素，**左下原点、y 向上**（与 EventTouch.getLocationY() 一致）
   */
  private pickAndOpen(x: number, y: number) {
    if (!this.loaded || !this.mainCamera) return
    const ray = this.mainCamera.screenPointToRay(x, y)

    // 小猫优先：点它 = 打开互动菜单（不该顺带弹出家具详情）
    if (this.cat && this.cat.hitTest(x, y)) {
      this.cat.openMenu()
      return
    }
    // 点在任何别的地方 → 收起小猫菜单（和 2D 页面点空白收菜单的手感一致）
    this.cat?.closeMenu()

    let best: Node | null = null
    let bestDist = Infinity
    for (const n of this.furnitureNodes) {
      const aabb = this.worldAABB(n)
      if (!aabb) continue
      // 关键：rayAABB 未命中时返回的是 0（不是 null/undefined），所以必须显式要求 > 0，
      // 否则任何一次点击都会"命中"列表里的第一件家具。
      const hit = geometry.intersect.rayAABB(ray, aabb)
      if (hit > 0 && hit < bestDist) {
        bestDist = hit
        best = n
      }
    }
    if (best) {
      const fp = best.getComponent(FurnitureProp)
      if (fp && fp.itemId) HostBridge.post({ type: 'tp:openMemory', itemId: fp.itemId })
    } else {
      // 留一行日志：以后再遇到"点了没反应"，一眼就能分清是
      // 「射线没打中（这里会打印）」还是「打中了但宿主没数据（看宿主页的提示）」
      console.log(
        `[RoomBootstrap] 点击(${x},${y}) 未命中任何家具（共 ${this.furnitureNodes.length} 件）`,
      )
    }
  }

  onDestroy() {
    if (this.tapTimer) clearTimeout(this.tapTimer)
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this)
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this)
    RoomGallery.stopWatch()
  }
}

/**
 * 兜底自启（双保险）
 *
 * 背景：脚本组件在场景里是用「脚本 uuid 的压缩串」序列化的（引擎 data/class.ts 里
 * `js._setClassId(frame.uuid, cls)`，并用它顶掉了类名映射）。所以一旦场景里的
 * __type__ 与脚本 uuid 对不上（例如脚本被重新导入、uuid 变了），组件会被引擎判定为
 * corrupted 并移除，表现为 "Can not find class 'XXX'"。
 *
 * 这里在任意场景启动后做一次「幂等补挂」：
 *   - 保证存在 RoomRoot（房间与家具的父节点）
 *   - 保证 Bootstrap 节点上挂了 RoomBootstrap
 *   - 保证 Main Camera 上挂了 CameraRig
 * 已经挂好的情况下什么都不做，因此不会重复摆放家具。
 */
// 补挂也只允许做一次：否则每次场景 launch 都往节点上加一份，
// 攒够几份之后 .scene 一保存就固化下来，下次打开又继续加（那 16 份就是这么来的）。
let bootstrapEnsured = false

function ensureBootstrapped() {
  if (bootstrapEnsured) return
  const scene = director.getScene()
  if (!scene) return
  bootstrapEnsured = true

  if (!find('RoomRoot')) scene.addChild(new Node('RoomRoot'))

  let boot = find('Bootstrap')
  if (!boot) {
    boot = new Node('Bootstrap')
    scene.addChild(boot)
  }
  if (!boot.getComponent(RoomBootstrap)) boot.addComponent(RoomBootstrap)

  const camNode = find('Main Camera') || scene.getComponentInChildren(Camera)?.node || null
  if (camNode && !camNode.getComponent(CameraRig)) camNode.addComponent(CameraRig)
}

director.on(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
  try {
    ensureBootstrapped()
  } catch (e) {
    console.error('[RoomBootstrap] 兜底自启失败:', e)
  }
})
