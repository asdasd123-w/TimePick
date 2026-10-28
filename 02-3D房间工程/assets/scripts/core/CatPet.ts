// CatPet.ts —— 3D 房间里的那只小猫
// ---------------------------------------------------------------------------
// 需求（原话）：
//   · 3D 猫只在房间里自由走动，但不许走出房间；
//   · 菜单只留三项：找小橘聊天 / 找找内容 / 取消动作（摸摸头等四项已按需求删掉）；
//   · 双击地板 → 走过去；双击房间外 → 冒一句「我出去会丢的」不走；
//     双击墙体/地板以上的空气 → 冒一句「我不会飞」不走；
//   · 「找找内容」：宿主搜到物品后发 tp:catGoto，猫走过去，到了再冒一句；
//   · 不要进场的跑场动作。
//
// 与 2D 猫的分工：AI 对话面板仍然在宿主页面里（room3d.vue），3D 这边只负责
// 猫本体、菜单触发和台词气泡的"锚点"（把猫的世界坐标投影成归一化屏幕坐标发给宿主）。
//
// ⚠ 猫默认是**运行时生成**的（resources/models/room/cat），场景里不用再放一只。
//   如果以后想直接在编辑器里摆，把节点命名为 cat 即可 —— create() 会优先复用它。
import {
  _decorator,
  Animation,
  AnimationClip,
  AnimationState,
  Camera,
  Component,
  director,
  geometry,
  instantiate,
  MeshRenderer,
  Node,
  Prefab,
  SkeletalAnimation,
  Vec3,
} from 'cc'
import { HostBridge } from './HostBridge'
import { SCENE_FLOOR_Y } from './RoomSpec'

const { ccclass } = _decorator

/**
 * 目标身高（世界单位）。房间约 7.36 × 8.90 世界单位 ≈ 3.3 × 4.0 米，
 * 1 世界单位 ≈ 0.45 米；猫模型原始高 0.85。
 *
 * ★ 用户反馈 0.55（≈25cm）在房间里还是显得偏大 —— 现在整体缩到原来的一半
 *   0.275 ≈ 12cm（小奶猫）。下面 CAT_RADIUS / STRIDE_PER_CYCLE / hop 高度
 *   都按同一个 0.5 系数跟着改过，改尺寸时这些要一起乘。
 * 想换大小只改这一个数（连带下面几个比例常量）。
 */
const CAT_HEIGHT = 0.275

/**
 * 走路速度（世界单位/秒）。
 *
 * ⚠ 原来写的是 1.9，用户反馈"移动速度太快、动作太慢"—— 1.9 单位/s ≈ 0.86 米/s，
 *   那已经是小跑；而走路动画还按原始步频播，看起来就是"贴着地面滑行"。
 *   现在降到 0.95 ≈ 0.43 米/s，是猫悠闲溜达的速度，和步频对得上。
 *   想再快/再慢只改这一个数（动画倍率会自动跟着算，见 STRIDE_PER_CYCLE）。
 */
const CAT_SPEED = 0.95
/** 转身速度（度/秒）：太小会走出"横着漂移"，太大会像陀螺 */
const TURN_SPEED = 420
/** 到点判定（世界单位） */
const ARRIVE = 0.1

/**
 * 一个完整走路循环（Walk 播一遍）里猫前进的距离（世界单位）。
 *
 * ★ 这一步是"移动与动作不匹配"的根治办法：
 *   以前的写法是 `动画倍率 = 地速 / 最大速度`，纯比例、和动画本身多长没关系 ——
 *   Walk 片段实测 1.33 秒一个循环，配上 1.9 单位/s 的地速，
 *   一步就跨出去 2.6 个单位（≈1.17 米，而这只猫才 25cm 高），肉眼看着就是"贴地滑行"。
 *
 *   改成**按步幅算**：每秒该迈几个循环 = 地速 / 步幅，再乘上片段时长换算成播放倍率。
 *   这样加速时腿不会打滑、减速时也不会拖步，换模型 / 改速度都不用重新调。
 *
 *   0.39 怎么来的：猫 0.275 单位高 ≈ 12cm，体长约 25cm，走路一个循环大致前进
 *   0.7 个体长 ≈ 0.17 米 ≈ 0.39 世界单位（整体缩半时这个数也要跟着减半）。
 *   觉得腿倒得太快就把它调大，太慢就调小。
 */
const STRIDE_PER_CYCLE = 0.39

/**
 * 模型自己的朝向修正（度）。
 *
 * ⚠ 这个数以前是 180，用户反馈"小猫的朝向与我点的方向反了"。
 *   原因：加成 180 的前提是「猫头朝局部 -Z」，但实测这只猫（StandingKitten）
 *   的**头朝局部 +Z**（猫脸/前胸在 +Z 那一侧），于是 180° 一加就整体掉了个头，
 *   走过去的时候是屁股朝前。现在改成 0 —— 也就是"局部 +Z 就是猫头方向"，
 *   与本组件的 yaw 约定（`setRotationFromEuler(0, yaw, 0)` 让局部 +Z 指向目标）一致。
 *   如果以后换了模型、发现猫倒着走，只改这一个数。
 */
const CAT_YAW_OFFSET = 0

/**
 * 地板可走范围（世界坐标）。
 * house_three 的世界包围盒是 x -4.09..3.27、z -4.21..4.69（放大 10 倍后），
 * 四周墙体/栏杆约 0.2~0.3 厚，再往里收半只猫身，避免穿墙。
 * 前侧（+Z）是敞开的阳台，也一起收进来 —— 用户要求"不可以走出房间"。
 */
const FLOOR_MIN_X = -3.45
const FLOOR_MAX_X = 2.7
const FLOOR_MIN_Z = -3.6
const FLOOR_MAX_Z = 3.95

/** 出生点（世界坐标，x/z）：房间中央偏前，避开书桌/床/柜子 */
const START_X = 0.1
const START_Z = 1.6

/**
 * 小猫的碰撞半径（世界单位）。
 * 0.07 ≈ 3cm（猫整体缩到一半后跟着减半）：贴着床沿/柜脚绕过去时不会插进模型里，
 * 也不会因为"太胖"卡在门口。
 */
const CAT_RADIUS = 0.07
/** 寻路网格边长（世界单位）：0.12 → 房间约 51×63 格，A* 一次几毫秒 */
const GRID_STEP = 0.12
/** 到路点的判定半径（世界单位） */
const WAYPOINT_EPS = 0.09

/** 自主溜达的间隔（秒） */
const WANDER_MIN = 13
const WANDER_MAX = 26
/** 发呆时随机冒想法的间隔（秒） */
const THOUGHT_MIN = 26
const THOUGHT_MAX = 48

const WALK_CLIP = /walk/i

// ---- 台词：与 2D 猫保持一致的人设，换 3D 之后说话的仍是同一只猫 ----
// （摸摸头/打招呼/望望天/要抱抱这四组台词随菜单项一起删掉了）
const CHAT_LINE = '小橘醒啦, 一起聊天喵~'
/** 找找内容：走到目的地后说的话（物品就在眼前 / 摆在高处时够不着） */
const FIND_ARRIVE_LINES = ['找到了喵! 就是这个~', '在这儿呢, 喵~', '嗅嗅…找到了!']
/** 物品摆在桌子/柜子上，猫只能走到旁边 */
const FIND_NEARBY_THOUGHT = '就在这附近…（有点够不着喵）'
const THOUGHT_LINES = [
  '在想…今天有没有小鱼干的记忆。',
  '那朵云好像一条晒干的沙丁鱼。',
  '是在这里打个盹, 还是去那边呢?',
  '唔…地板晒得暖暖的。',
  '房间里的每件东西, 都藏着故事吧。',
  '尾巴今天也很听话, 真好。',
]
/** 双击地板以外的地方：两种"去不了"的理由 */
const LINE_OUTSIDE = '我出去会丢的…还是待在屋里吧。'
const LINE_AIR = '我不会飞呀。'
/** 被家具围死了（正常摆法下不会出现，兜底用） */
const LINE_NO_WAY = '这边…过不去喵。'

/** 双击落点的判定结果，方便 RoomBootstrap 打日志/做别的反馈 */
export type CatWalkResult = 'walk' | 'outside' | 'air'

/**
 * 家具的水平阻挡盒（世界坐标）。
 * 由 RoomBootstrap 用每件家具的真实包围盒算好传进来 —— 硬编码坐标会在换房间/挪家具后失效。
 */
export interface CatBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

const RAD2DEG = 180 / Math.PI

/** 角度差归一到 (-180, 180] */
function angleDiff(to: number, from: number): number {
  const d = ((to - from) % 360 + 540) % 360 - 180
  return d
}

@ccclass('CatPet')
export class CatPet extends Component {
  private cam: Camera | null = null
  /**
   * 家具的水平阻挡盒（世界坐标）。
   * ★ 以前这里是"每件家具一个点 + 0.85 半径"的避让球，只在**随机溜达**时筛落点，
   *   走起来照样直线冲过去 —— 这就是用户看到的"小猫能穿过床和柜子"。
   *   现在改成矩形盒 + 网格寻路：不仅选点避开，走路本身也绕。
   */
  private boxes: CatBox[] = []
  /** 当前路径（世界 x/z），由 A* 算出；走完就清空，直接朝 target 走 */
  private path: { x: number; z: number }[] = []
  private pathIdx = 0
  /** 寻路网格（首次寻路时构建，家具不会动，所以只需建一次） */
  private grid: { cols: number; rows: number; blocked: Uint8Array } | null = null

  private anim: Animation | null = null
  private walkState: AnimationState | null = null
  /**
   * 走路片段的原始时长（秒）。
   * 取一次存下来而不是每帧读 AnimationState.duration —— 后者是"状态"上的属性，
   * 万一哪天它跟播放倍率挂钩，按它算倍率就会变成自己算自己、越算越飘。
   */
  private clipDur = 1

  /** 当前朝向（度，绕 Y；0 = 局部 +Z 指向 +Z） */
  private yaw = 0
  /** 走向的目标点（世界坐标，y 忽略） */
  private target: Vec3 | null = null
  private speed = 0
  /** 到点后要执行的一次性回调（「找找内容」走到目的地再说话） */
  private onArrive: (() => void) | null = null

  /** 小跳：-1 = 没在跳；否则是已经跳了多久（秒） */
  private hopT = -1
  private hopHeight = 0.08

  /**
   * 当前正在显示的气泡。
   *
   * ★ 为什么要记状态而不只是"发一次消息"：以前 say() 只在说话的那一瞬间
   *   投影一次猫头坐标发给宿主，之后猫继续走（或相机被拖动），气泡却钉在原地 ——
   *   用户反馈"小猫的气泡没有跟随小猫移动"。现在把气泡存下来，说话期间
   *   每 BUBBLE_TICK 秒重新投影一次并重发，气泡就一直贴在猫头上。
   */
  private bubble: { text: string; kind: 'say' | 'thought' } | null = null
  /** 气泡剩余显示时间（秒）；归零后停止重发，宿主那侧的定时器会把它淡出 */
  private bubbleLeft = 0
  private bubbleTick = 0

  private wanderIn = WANDER_MIN
  private thoughtIn = THOUGHT_MIN
  /** 菜单打开时猫不动、并且每 0.2 秒回一次锚点（相机转的时候菜单跟着猫走） */
  private menuOpen = false
  private anchorTick = 0
  /** 菜单开了多久：太久没人点就自己收掉（和宿主的超时保持一致） */
  private menuAge = 0
  private t = 0

  // ------------------------------------------------------------------ 创建

  /**
   * 生成（或接管）小猫。
   * @param prefab  cat 的 Prefab（RoomBootstrap 用统一的 loadPrefab 加载）
   * @param cam     主相机（投影锚点用）
   * @param props   房间里的摆件（只用 x/z 做避让，落点会再被网格筛一遍）
   * @param boxes   家具的水平阻挡盒（RoomBootstrap 用真实包围盒算好）
   */
  static async create(
    prefab: Prefab | null,
    cam: Camera | null,
    props: { x?: number; z?: number }[] = [],
    boxes: CatBox[] = [],
  ): Promise<CatPet | null> {
    const scene = director.getScene()
    if (!scene) return null

    // 场景里已经有名叫 cat 的节点 → 直接接管它，不再生成第二只
    let node = CatPet.findSceneCat()
    if (node) {
      console.log('[CatPet] 复用场景里的 cat 节点')
    } else {
      if (!prefab) {
        console.warn('[CatPet] 没有拿到 cat 预制体，跳过小猫')
        return null
      }
      node = instantiate(prefab)
      node.name = 'cat'
      node.parent = scene
    }

    // ★ 摘到场景根节点下。
    //   用户是把猫摆进房间模型里的（cat 挂在 house_three 底下），而 house_three 的
    //   scale 是 **10** —— 留在里面就会继承 10 倍缩放：世界缩放 6.48、世界坐标被推到
    //   (1, 3.5, 16) 的房外，而本组件里所有距离/夹取用的都是节点局部坐标
    //   （局部 == 世界 才成立）。摘出来并把继承来的缩放/旋转清掉，init() 再按包围盒
    //   重新定尺寸，猫才会正好站在地板上。
    if (node.parent !== scene) {
      node.setParent(scene)
      node.setRotationFromEuler(0, 0, 0)
      node.setScale(1, 1, 1)
    }

    const pet = node.addComponent(CatPet)
    pet.cam = cam
    // props 已经不需要单独处理：落地的摆件会被 RoomBootstrap 的 collectObstacles 收进 boxes，
    // 摆在桌面/柜子上的则按高度被筛掉（猫本来就绕开柜子本身了）。
    pet.boxes = boxes || []
    pet.init()
    return pet
  }

  private init() {
    this.node.updateWorldTransform()
    // 刚 setParent 过，子节点缓存的世界矩阵可能还是旧的（meshBox 读的就是它），
    // 这里自上而下强制刷一遍，否则量到的身高会偏大/偏小，猫的比例就跟着错。
    CatPet.forceWorld(this.node)

    // 按真实包围盒缩放到目标身高：模型原始 0.85 高（含耳朵/尾巴），
    // 直接写死 scale 会因为换模型而大小失控。
    const box = CatPet.meshBox(this.node)
    let k = 1
    if (box) {
      const h = box.max.y - box.min.y
      const cur = this.node.worldScale.x || 1
      if (h > 1e-4) k = (CAT_HEIGHT / h) * cur
    }
    this.node.setScale(k, k, k)

    // 脚底正好在模型 y=0，所以直接踩在地板面上
    this.node.setPosition(START_X, SCENE_FLOOR_Y, START_Z)
    this.yaw = this.faceCameraYaw()
    this.applyPose(0)

    this.setupAnimation()
    this.wanderIn = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN)
    this.thoughtIn = THOUGHT_MIN + Math.random() * (THOUGHT_MAX - THOUGHT_MIN)

    // 宿主 → 猫：点菜单按钮做动作 / 收起菜单 / 搜到东西后走过去
    HostBridge.onMessage((msg) => {
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'tp:catAction') this.doAction(String(msg.action || ''))
      else if (msg.type === 'tp:catMenuClose') this.closeMenu()
      else if (msg.type === 'tp:catGoto') {
        const x = Number(msg.x)
        const z = Number(msg.z)
        if (!Number.isFinite(x) || !Number.isFinite(z)) return
        const itemId = Number(msg.itemId)
        this.goto(x, z, Number(msg.stop) || 0, msg.near === true, Number.isFinite(itemId) ? itemId : 0)
      }
    })
    console.log('[CatPet] 小猫已就位', { scale: k.toFixed(3), clips: this.anim ? this.anim.clips.map((c) => c.name) : [] })
  }

  private setupAnimation() {
    // 蒙皮模型用 SkeletalAnimation（Animation 的子类）；两样都试一遍，
    // 万一将来换成立方体猫也不会因为找不到组件而整个不转。
    this.anim =
      this.node.getComponentInChildren(SkeletalAnimation) ||
      this.node.getComponentInChildren(Animation) ||
      this.node.getComponent(Animation)

    if (!this.anim) {
      console.warn('[CatPet] 猫模型上没有 Animation 组件，将只做位移（不影响走动）')
      return
    }
    const clips = this.anim.clips || []
    const clip = clips.find((c) => WALK_CLIP.test(c.name)) || clips[0]
    if (!clip) {
      console.warn('[CatPet] 猫模型没有动画片段，将只做位移')
      return
    }
    this.anim.play(clip.name)
    const st = this.anim.getState(clip.name)
    if (!st) return
    st.wrapMode = AnimationClip.WrapMode.Loop
    st.speed = 0
    st.pause() // 站着的时候不要空蹬腿
    this.walkState = st
    this.clipDur = clip.duration || 1
    console.log(`[CatPet] 播放走路动画: ${clip.name} (${clip.duration.toFixed(2)}s)`)
  }

  // ------------------------------------------------------------------ 每帧

  update(dt: number) {
    const step = Math.min(Math.max(dt, 0), 0.1)
    this.t += step

    // 小跳的计时（原来是"小跳 / 仰头 / 摇摆"三件套，后两组随菜单项一起删了）
    let lift = 0
    if (this.hopT >= 0) {
      this.hopT += step
      const p = this.hopT / 0.42
      if (p >= 1) this.hopT = -1
      else lift = Math.sin(Math.PI * p) * this.hopHeight
    }

    // 移动
    let moving = false
    if (this.target && !this.menuOpen) {
      const pos = this.node.position
      // 1) 取当前要追的点：路径上第一个还没走到的路点；路径走完就直接追终点
      let tx = this.target.x
      let tz = this.target.z
      while (this.pathIdx < this.path.length) {
        const wp = this.path[this.pathIdx]
        if (Math.hypot(wp.x - pos.x, wp.z - pos.z) < WAYPOINT_EPS) {
          this.pathIdx++
          continue
        }
        tx = wp.x
        tz = wp.z
        break
      }
      const onLastLeg = this.pathIdx >= this.path.length
      const dx = tx - pos.x
      const dz = tz - pos.z
      const dist = Math.hypot(dx, dz)
      // 2) 到点：只有走到**最后一段**时才算到达（中途路点之间不能触发回调）
      if (onLastLeg && dist < ARRIVE) {
        this.target = null
        this.path = []
        this.pathIdx = 0
        this.speed = 0
        const cb = this.onArrive
        this.onArrive = null
        if (cb) {
          console.log(`[CatPet] 到达 (${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})，执行到点回调`)
          cb()
        }
      } else if (dist > 1e-4) {
        const want = Math.atan2(dx, dz) * RAD2DEG + CAT_YAW_OFFSET
        const d = angleDiff(want, this.yaw)
        const maxTurn = TURN_SPEED * step
        this.yaw += Math.max(-maxTurn, Math.min(maxTurn, d))
        // 到点前减速；转身时也降一点速，看起来不是"横着滑过去"
        const align = Math.max(0.25, Math.cos(Math.min(Math.PI / 2, Math.abs(d) / RAD2DEG)))
        const wantSpeed = Math.min(CAT_SPEED, dist / 0.3) * align
        this.speed += (wantSpeed - this.speed) * Math.min(1, step / 0.12)
        const nx = pos.x + (dx / dist) * this.speed * step
        const nz = pos.z + (dz / dist) * this.speed * step
        // 3) 最后一道保险：这一帧要去的位置如果压在家具上，就按轴分开滑一下，
        //    实在两边都被挡住就停下来重新找路（正常情况 A* 已经绕开了，走不到这里）。
        const np = this.slide(nx, nz, pos.x, pos.z)
        this.node.setPosition(this.clampX(np.x), SCENE_FLOOR_Y, this.clampZ(np.z))
        moving = this.speed > 0.05
      }
    } else {
      this.speed = 0
    }

    // 走路动画：地速 → 播放速度；站住就暂停（避免原地空蹬）
    //
    // ★ 倍率 =（地速 / 步幅）× 片段时长。
    //   地速/步幅 = 每秒要走几个完整循环；再乘片段时长（播放一遍要几秒）
    //   就换算成 AnimationState.speed 这个"播放倍率"。
    //   这样起步加速、到点减速时步频都跟着变，不会出现"脚底下打滑"。
    if (this.walkState) {
      if (moving) {
        if (this.walkState.isPaused) this.walkState.resume()
        this.walkState.speed = Math.min(4, (this.speed / STRIDE_PER_CYCLE) * this.clipDur)
      } else if (!this.walkState.isPaused) {
        this.walkState.pause()
      }
    }

    this.applyPose(lift + (moving ? Math.abs(Math.sin(this.t * 9)) * 0.003 : 0))

    // 气泡跟随：说话期间周期性重投猫头坐标，猫走到哪气泡跟到哪。
    // 放在移动之后 —— 用的是这一帧刚更新过的位置，气泡才不会慢半拍。
    this.tickBubble(step)

    // 菜单打开时跟着猫走：相机转动/猫被挤动都能让菜单不掉队
    if (this.menuOpen) {
      this.menuAge += step
      if (this.menuAge > 20) this.closeMenu()
      this.anchorTick -= step
      if (this.anchorTick <= 0) {
        this.anchorTick = 0.2
        this.postMenu()
      }
      return
    }

    // 自主溜达 + 偶尔冒个想法（都是"没事干"的时候才做）
    //
    // ★ 第三个条件 onArrive：正在执行「找找内容」这类带回调的任务时不能溜达。
    //   实测踩到过：搜到东西后猫往柜子走，走到一半溜达计时器到点，
    //   walkTo() 会把 target 换成随机点、并把 onArrive 清成 null ——
    //   于是猫拐了个弯就走了，永远不会冒出「就在这附近」那句话。
    if (!this.target && this.hopT < 0 && !this.onArrive) {
      this.wanderIn -= step
      if (this.wanderIn <= 0) {
        this.wanderIn = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN)
        const p = this.pickWanderPoint()
        if (p) this.walkTo(p.x, p.z)
      }
      this.thoughtIn -= step
      if (this.thoughtIn <= 0) {
        this.thoughtIn = THOUGHT_MIN + Math.random() * (THOUGHT_MAX - THOUGHT_MIN)
        this.say(THOUGHT_LINES[Math.floor(Math.random() * THOUGHT_LINES.length)], 'thought')
      }
    }
  }

  /** 摆姿态：位置 y = 地板 + 小跳高度；旋转 = 朝向 */
  private applyPose(lift: number) {
    const p = this.node.position
    this.node.setPosition(p.x, SCENE_FLOOR_Y + lift, p.z)
    this.node.setRotationFromEuler(0, this.yaw, 0)
  }

  /** 气泡跟随：每隔一小会儿把猫头顶重新投影一次并发给宿主 */
  private static readonly BUBBLE_TICK = 0.12

  private tickBubble(step: number) {
    if (!this.bubble) return
    this.bubbleLeft -= step
    if (this.bubbleLeft <= 0) {
      this.bubble = null
      return
    }
    this.bubbleTick -= step
    if (this.bubbleTick > 0) return
    this.bubbleTick = CatPet.BUBBLE_TICK
    // 把"还剩多久"一起发过去：宿主每次收到都会重设定时器，
    // 这里停发之后宿主那侧的定时器最多再等一个 tick 就把它淡出。
    this.postBubble()
  }

  private clampX(x: number) {
    return Math.min(FLOOR_MAX_X, Math.max(FLOOR_MIN_X, x))
  }
  private clampZ(z: number) {
    return Math.min(FLOOR_MAX_Z, Math.max(FLOOR_MIN_Z, z))
  }

  // ------------------------------------------------------------------ 交互

  /**
   * 点击是否落在小猫身上（单击开菜单）。
   * @param sx 物理像素，x 向右
   * @param sy 物理像素，**左下原点、y 向上**（与 EventTouch.getLocationY 一致）
   *
   * ★ 不能用 meshBox + rayAABB 判：猫是**蒙皮网格**（skinned mesh），
   *   `StandingKitten_OriginalMesh` 节点的 worldMatrix 在蒙皮后并不代表实际位置 ——
   *   实测它的世界包围盒还停在 (-0.59..-0.39, 0.35..0.77, -0.38..0.14)，
   *   而猫其实站在 (0.1, 0.35, 1.6)，两者差了半个房间，AABB 永远打不中，
   *   于是"点猫没反应"。
   *   改成屏幕空间判定：把猫的中胸点投影到屏幕，用「半身高的像素」当半径。
   *   手感还更宽容一点（不用精确点到模型表面）。
   */
  /**
   * 点击命中判定：把猫在屏幕上的投影当成一个**竖椭圆**，而不是一个圆。
   *
   * ★ 以前用「半身高 ×1.6」的圆形，判在身高 45% 的位置：
   *   猫在画面里本来就小，圆形上下都够不到 —— 用户点耳朵、点脚边都判不到，
   *   手感就是"点了没反应"。改成椭圆后：
   *     · 纵向覆盖 脚底 → 头顶（再往上下各留一点余量，尾巴/耳朵都能点中）；
   *     · 横向按身高的一半算，最小也给 26px，保证猫很小的时候仍然好点。
   */
  hitTest(sx: number, sy: number): boolean {
    if (!this.cam || !this.cam.camera) return false
    const p = this.node.worldPosition
    const feet = new Vec3(p.x, p.y, p.z)
    const top = new Vec3(p.x, p.y + CAT_HEIGHT, p.z)
    const a = new Vec3()
    const b = new Vec3()
    this.cam.worldToScreen(feet, a)
    this.cam.worldToScreen(top, b)
    // a = 脚底投影，b = 头顶投影（相机俯视时 b.y < a.y，所以取 min/max）
    const topY = Math.min(a.y, b.y)
    const botY = Math.max(a.y, b.y)
    const h = Math.max(30, botY - topY)
    const cy = (topY + botY) / 2
    const cx = (a.x + b.x) / 2
    const rx = Math.max(26, h * 0.62)
    // 纵向多给 22%：头顶的耳朵、脚边的前爪都在椭圆外沿
    const ry = Math.max(30, (h / 2) * 1.22)
    const nx = (sx - cx) / rx
    const ny = (sy - cy) / ry
    return nx * nx + ny * ny <= 1
  }

  /**
   * 双击：算出射线落在地板上的位置，决定能不能走。
   *
   * 判定顺序（对应用户要的三句话）：
   *   1. 射线朝天 / 地板平面在身后            → 「我不会飞」（点的是头顶的空气）
   *   2. 射线先撞在**房间壳体**上（墙/栏杆）  → 「我不会飞」（点的是墙）
   *   3. 落点在地板矩形外                    → 「我出去会丢的」（点的是门外的云）
   *   4. 落点在地板内、但没有打到地板（悬空）  → 「我不会飞」（点的是地板上面那片空气）
   *   5. 其余                                → 走过去
   *
   * ★ 遮挡只认"壳体"（house_three 里体积最大的那块 mesh = 地板+墙+栏杆）。
   *   一开始用的是整棵 house_three，结果**挂在墙上的大相框**（rahmen1，1.65 高）
   *   正好挡在房间中间，点地板时射线先打到相框，整片房间都被判成"空气"，
   *   双击哪儿猫都不动。家具/相框这些道具不能算遮挡。
   */
  tryWalkTo(ray: geometry.Ray, house: Node | null): CatWalkResult {
    this.closeMenu()

    const fy = SCENE_FLOOR_Y
    const tFloor = Math.abs(ray.d.y) > 1e-6 ? (fy - ray.o.y) / ray.d.y : -1
    if (tFloor <= 0) {
      this.say(LINE_AIR, 'thought')
      return 'air'
    }

    const px = ray.o.x + ray.d.x * tFloor
    const pz = ray.o.z + ray.d.z * tFloor
    const inside = px >= FLOOR_MIN_X && px <= FLOOR_MAX_X && pz >= FLOOR_MIN_Z && pz <= FLOOR_MAX_Z

    // 壳体：墙/栏杆会挡在到达地板平面之前；地板本身正好在 tFloor 附近。
    const tShell = house ? CatPet.rayHitShell(ray, house) : -1
    const EPS = 0.3
    const hitWall = tShell > 0 && tShell < tFloor - EPS
    if (hitWall) {
      this.say(LINE_AIR, 'thought')
      return 'air'
    }

    if (!inside) {
      this.say(LINE_OUTSIDE, 'thought')
      return 'outside'
    }

    // 落点在房间内，却什么都没打到（或打到的是地板下方较远的裙边）→ 悬空
    const hitFloor = tShell > 0 && tShell <= tFloor + EPS
    if (!hitFloor) {
      this.say(LINE_AIR, 'thought')
      return 'air'
    }

    // 落点在家具上（双击床/柜子/书桌）：走到离那件家具最近的空地上，
    // 而不是直接穿过模型 —— 用户反馈的"小猫穿过床和柜子"就是这里没判断。
    const free = this.nearestFree(px, pz)
    if (!free) {
      this.say(LINE_NO_WAY, 'thought')
      return 'air'
    }
    this.walkTo(free.x, free.z)
    return 'walk'
  }

  /** 单击小猫：停住、面向相机、通知宿主把菜单摆到猫头上 */
  openMenu() {
    this.target = null
    this.path = []
    this.pathIdx = 0
    this.onArrive = null
    this.speed = 0
    this.menuOpen = true
    this.anchorTick = 0
    this.menuAge = 0
    this.yaw = this.faceCameraYaw()
    this.applyPose(0)
    this.postMenu()
  }

  closeMenu() {
    if (!this.menuOpen) return
    this.menuOpen = false
    HostBridge.post({ type: 'tp:catMenuClose' })
  }

  /**
   * 宿主点菜单按钮。
   *
   * 只剩三项（摸摸头/打招呼/望望天/要抱抱已按需求删掉）：
   *   · chat  找小橘聊天 —— AI 面板在宿主那边，3D 这边只负责蹦一下 + 说句话
   *   · find  找找内容  —— 输入框也在宿主那边，这里不用做任何事（菜单照常收起）
   *   · stop  取消动作  —— 停住、清气泡
   */
  doAction(action: string) {
    this.menuOpen = false
    HostBridge.post({ type: 'tp:catMenuClose' })
    this.target = null
    this.path = []
    this.pathIdx = 0
    this.onArrive = null
    this.speed = 0

    switch (action) {
      case 'chat':
        this.faceCamera()
        this.hop(0.08)
        this.say(CHAT_LINE)
        break
      case 'stop':
        // 取消动作：停下来、清掉气泡（宿主收不到气泡就自己淡出）
        this.bubble = null
        this.bubbleLeft = 0
        break
      default:
        // find 走这里：菜单已经收起，宿主会自己弹搜索框
        break
    }
  }

  /**
   * 「找找内容」搜到东西后由宿主调用（tp:catGoto）。
   * @param x,z     目标物品的世界坐标
   * @param stop    在离目标多远处停住（物品摆在桌上/柜子里时别贴上去，留半个身位）
   * @param near    是不是"只能走到旁边"（桌面/隔板上的东西猫够不着）
   */
  goto(x: number, z: number, stop = 0, near = false, itemId = 0) {
    this.menuOpen = false
    const p = this.node.position
    let tx = this.clampX(x)
    let tz = this.clampZ(z)
    if (stop > 0) {
      const dx = tx - p.x
      const dz = tz - p.z
      const d = Math.hypot(dx, dz)
      // 比 stop 还近就不退了，退了反而会"倒着走开"
      if (d > stop) {
        tx = this.clampX(p.x + (dx / d) * (d - stop))
        tz = this.clampZ(p.z + (dz / d) * (d - stop))
      }
    }
    // 目标可能正好落在柜子/桌子里面（物品在柜内），挪到最近的空点再走过去
    const free = this.nearestFree(tx, tz) || { x: tx, z: tz }
    tx = free.x
    tz = free.z
    // ★ 走 walkTo 而不是直接写 target：它会把路径算好，猫才会绕着柜子走
    this.walkTo(tx, tz)
    console.log(
      `[CatPet] goto 目标(${x.toFixed(2)}, ${z.toFixed(2)}) stop=${stop} near=${near}` +
        ` → 实际走点(${tx.toFixed(2)}, ${tz.toFixed(2)})，当前(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`,
    )
    this.onArrive = () => {
      if (near) {
        // 摆在桌子/柜子上的东西：走到旁边，冒一句"就在这附近"的想法
        this.faceCamera()
        this.say(FIND_NEARBY_THOUGHT, 'thought', 3200)
      } else {
        this.hop(0.09)
        this.say(FIND_ARRIVE_LINES[Math.floor(Math.random() * FIND_ARRIVE_LINES.length)])
      }
      // ★ 需求：「小猫走过去后自动打开内容详情」。
      //   先让它说那句话、跳一下（0.9s），再通知宿主弹出这条记忆的详情 ——
      //   立刻弹的话，气泡还没看清就被浮层盖住了。
      if (itemId > 0) {
        this.scheduleOnce(() => {
          HostBridge.post({ type: 'tp:openMemory', itemId })
        }, 0.9)
      }
    }
  }

  // ------------------------------------------------------------------ 工具

  private hop(h: number) {
    this.hopT = 0
    this.hopHeight = h
  }

  private walkTo(x: number, z: number) {
    const p = this.node.position
    const tx = this.clampX(x)
    const tz = this.clampZ(z)
    this.target = new Vec3(tx, SCENE_FLOOR_Y, tz)
    this.menuOpen = false
    // 上一次"到了之后要做的事"作废：普通走动不该顺带执行上一个任务的回调
    this.onArrive = null
    // ★ 先算一条绕开家具的路；算不出来（被围死）就退回直线走，
    //   至少不会因为找不到路原地不动 —— 滑动保险会挡住真正的穿模。
    this.path = this.findPath(p.x, p.z, tx, tz)
    this.pathIdx = 0
    if (this.path.length) {
      console.log(`[CatPet] 路径 ${this.path.length} 段 → (${tx.toFixed(2)}, ${tz.toFixed(2)})`)
    }
  }

  // ---------------------------------------------------------------- 碰撞 / 寻路

  /** 这个点是否压在家具上（盒子已按猫的半径向外扩） */
  private solid(x: number, z: number): boolean {
    const r = CAT_RADIUS
    for (const b of this.boxes) {
      if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true
    }
    return false
  }

  /**
   * 走位保险：想去 (nx,nz)，被挡住就分别试「只走 x」「只走 z」，让猫贴着家具边缘滑过去。
   * 两边都堵住就原地不动（下一帧 A* 会给新路）。
   */
  private slide(nx: number, nz: number, ox: number, oz: number): { x: number; z: number } {
    if (!this.solid(nx, nz)) return { x: nx, z: nz }
    if (!this.solid(nx, oz)) return { x: nx, z: oz }
    if (!this.solid(ox, nz)) return { x: ox, z: nz }
    this.speed = 0
    return { x: ox, z: oz }
  }

  /** 建一次可走网格（家具是静态的，建一次就够） */
  private ensureGrid(): { cols: number; rows: number; blocked: Uint8Array } {
    if (this.grid) return this.grid
    const cols = Math.max(1, Math.round((FLOOR_MAX_X - FLOOR_MIN_X) / GRID_STEP))
    const rows = Math.max(1, Math.round((FLOOR_MAX_Z - FLOOR_MIN_Z) / GRID_STEP))
    const blocked = new Uint8Array(cols * rows)
    for (let r = 0; r < rows; r++) {
      const z = FLOOR_MIN_Z + (r + 0.5) * GRID_STEP
      for (let c = 0; c < cols; c++) {
        const x = FLOOR_MIN_X + (c + 0.5) * GRID_STEP
        blocked[r * cols + c] = this.solid(x, z) ? 1 : 0
      }
    }
    this.grid = { cols, rows, blocked }
    return this.grid
  }

  private cellOf(x: number, z: number, cols: number, rows: number): { c: number; r: number } {
    const c = Math.min(cols - 1, Math.max(0, Math.floor((x - FLOOR_MIN_X) / GRID_STEP)))
    const r = Math.min(rows - 1, Math.max(0, Math.floor((z - FLOOR_MIN_Z) / GRID_STEP)))
    return { c, r }
  }

  private cellCenter(c: number, r: number): { x: number; z: number } {
    return { x: FLOOR_MIN_X + (c + 0.5) * GRID_STEP, z: FLOOR_MIN_Z + (r + 0.5) * GRID_STEP }
  }

  /** 两点之间是否没有家具挡着（给路径做平滑用，采样判点） */
  private lineClear(x0: number, z0: number, x1: number, z1: number): boolean {
    const d = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.max(1, Math.ceil(d / (GRID_STEP * 0.5)))
    for (let i = 1; i <= n; i++) {
      const t = i / n
      if (this.solid(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false
    }
    return true
  }

  /**
   * A* 寻路（8 邻域，斜走要求两个正交格都空）。
   * 返回**平滑后**的路点（不含起点；终点在最后）。找不到路返回空数组。
   */
  private findPath(
    sx: number,
    sz: number,
    tx: number,
    tz: number,
  ): { x: number; z: number }[] {
    if (!this.boxes.length) return []
    if (this.lineClear(sx, sz, tx, tz)) return [] // 直线能走，不用绕
    const g = this.ensureGrid()
    const { cols, rows, blocked } = g
    const s = this.cellOf(sx, sz, cols, rows)
    const t = this.cellOf(tx, tz, cols, rows)
    const start = s.r * cols + s.c
    const goal = t.r * cols + t.c
    if (start === goal) return []
    // 终点在家具里：不找路，外层已经把它挪到最近的空点了
    if (blocked[goal]) return []

    const total = cols * rows
    const gScore = new Float32Array(total).fill(Infinity)
    const fScore = new Float32Array(total).fill(Infinity)
    const came = new Int32Array(total).fill(-1)
    const closed = new Uint8Array(total)
    gScore[start] = 0
    fScore[start] = Math.hypot(t.c - s.c, t.r - s.r)

    // 小顶堆（A* 的 open 表；房间只有几千格，手写堆足够）
    const heap: number[] = []
    const push = (i: number) => {
      heap.push(i)
      let k = heap.length - 1
      while (k > 0) {
        const p = (k - 1) >> 1
        if (fScore[heap[p]] <= fScore[heap[k]]) break
        const tmp = heap[p]
        heap[p] = heap[k]
        heap[k] = tmp
        k = p
      }
    }
    const pop = (): number => {
      const top = heap[0]
      const last = heap.pop() as number
      if (heap.length) {
        heap[0] = last
        let k = 0
        for (;;) {
          const l = k * 2 + 1
          const r = l + 1
          let m = k
          if (l < heap.length && fScore[heap[l]] < fScore[heap[m]]) m = l
          if (r < heap.length && fScore[heap[r]] < fScore[heap[m]]) m = r
          if (m === k) break
          const tmp = heap[m]
          heap[m] = heap[k]
          heap[k] = tmp
          k = m
        }
      }
      return top
    }
    push(start)

    const DIRS = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]
    let guard = 0
    let found = false
    while (heap.length && guard++ < 6000) {
      const cur = pop()
      if (cur === goal) {
        found = true
        break
      }
      if (closed[cur]) continue
      closed[cur] = 1
      const cc = cur % cols
      const cr = (cur / cols) | 0
      for (const [dc, dr] of DIRS) {
        const nc = cc + dc
        const nr = cr + dr
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
        const ni = nr * cols + nc
        if (closed[ni] || blocked[ni]) continue
        // 斜走不许"擦角"：两侧正交格必须都能过
        if (dc && dr && (blocked[cr * cols + nc] || blocked[nr * cols + cc])) continue
        const step = dc && dr ? 1.4142 : 1
        const ng = gScore[cur] + step
        if (ng < gScore[ni]) {
          gScore[ni] = ng
          came[ni] = cur
          fScore[ni] = ng + Math.hypot(t.c - nc, t.r - nr)
          push(ni)
        }
      }
    }
    if (!found) return []

    // 回溯成格子序列
    const cells: { x: number; z: number }[] = []
    for (let i = goal; i !== -1; i = came[i]) {
      cells.push(this.cellCenter(i % cols, (i / cols) | 0))
      if (i === start) break
    }
    cells.reverse()

    // 平滑：从当前点出发，能直线到的最远路点就直接连过去（省掉锯齿，走路更自然）
    const out: { x: number; z: number }[] = []
    let cx = sx
    let cz = sz
    let i = 1
    while (i < cells.length) {
      let j = cells.length - 1
      while (j > i && !this.lineClear(cx, cz, cells[j].x, cells[j].z)) j--
      out.push(cells[j])
      cx = cells[j].x
      cz = cells[j].z
      i = j + 1
    }
    // 终点用真实点击位置（格子中心会有半格误差）
    if (out.length) out[out.length - 1] = { x: tx, z: tz }
    return out
  }

  /** 找一个离 (x,z) 最近的、猫站得下的点（双击床/柜子时走过去站边上） */
  private nearestFree(x: number, z: number): { x: number; z: number } | null {
    if (!this.solid(x, z)) return { x, z }
    for (let r = GRID_STEP; r <= 1.8; r += GRID_STEP) {
      for (let a = 0; a < 16; a++) {
        const th = (a / 16) * Math.PI * 2
        const nx = this.clampX(x + Math.cos(th) * r)
        const nz = this.clampZ(z + Math.sin(th) * r)
        if (!this.solid(nx, nz)) return { x: nx, z: nz }
      }
    }
    return null
  }

  private faceCameraYaw(): number {
    const c = this.cam ? this.cam.node.worldPosition : new Vec3(0, 1.6, 6)
    const p = this.node.position
    return Math.atan2(c.x - p.x, c.z - p.z) * RAD2DEG + CAT_YAW_OFFSET
  }

  private faceCamera() {
    this.yaw = this.faceCameraYaw()
  }

  /** 随机找一个能走的点：别钻进家具里、也别离当前太近 */
  private pickWanderPoint(): { x: number; z: number } | null {
    for (let i = 0; i < 24; i++) {
      const x = FLOOR_MIN_X + Math.random() * (FLOOR_MAX_X - FLOOR_MIN_X)
      const z = FLOOR_MIN_Z + Math.random() * (FLOOR_MAX_Z - FLOOR_MIN_Z)
      if (Math.hypot(x - this.node.position.x, z - this.node.position.z) < 1.0) continue
      // ★ 用矩形盒 + 猫半径判断：以前是"离家具中心 0.85"，床又长又窄，
      //   它的中心 0.85 以外其实还在床上 —— 于是溜达点会选到床中间，猫就走上去了。
      if (this.solid(x, z)) continue
      return { x, z }
    }
    return null
  }

  /** 猫头顶 → 归一化屏幕坐标（0..1，y 向下），宿主拿它摆菜单/气泡 */
  private anchor(): { nx: number; ny: number } {
    const p = this.node.position
    const head = new Vec3(p.x, p.y + CAT_HEIGHT * 0.95, p.z)
    if (!this.cam) return { nx: 0.5, ny: 0.5 }
    const out = new Vec3()
    // ⚠ Camera「组件」的签名是 worldToScreen(worldPos, out?)，与 scene.Camera 的 (out, worldPos) 相反
    this.cam.worldToScreen(head, out)
    const rc = this.cam.camera
    const w = rc ? rc.width : 1280
    const h = rc ? rc.height : 720
    if (!(w > 0) || !(h > 0)) return { nx: 0.5, ny: 0.5 }
    // 夹在画面内一点：猫走到边上时菜单/气泡不要飞出屏幕
    const nx = Math.min(0.92, Math.max(0.08, out.x / w))
    const ny = Math.min(0.9, Math.max(0.08, 1 - out.y / h))
    return { nx, ny }
  }

  private postMenu() {
    const a = this.anchor()
    HostBridge.post({ type: 'tp:catMenu', nx: a.nx, ny: a.ny })
  }

  /**
   * 说句话 / 冒个想法。
   *
   * ★ 存进 this.bubble 之后由 tickBubble 持续重发锚点 —— 这样猫（或镜头）动起来时
   *   气泡是跟着走的，而不是钉在说话那一刻的位置上。
   */
  private say(text: string, kind: 'say' | 'thought' = 'say', ms = 2600) {
    if (!text) return
    this.bubble = { text, kind }
    this.bubbleLeft = ms / 1000
    this.bubbleTick = 0
    this.postBubble()
  }

  private postBubble() {
    if (!this.bubble) return
    const a = this.anchor()
    // ms = 剩余毫秒：宿主每收到一次就重置淡出定时器，这里一停发，气泡最多再活一个 tick。
    // 取值下限 1，免得 0 被宿主当成"没给时长"而退回默认的 2.6 秒。
    const ms = Math.max(1, Math.round(this.bubbleLeft * 1000))
    HostBridge.post({
      type: 'tp:catBubble',
      text: this.bubble.text,
      kind: this.bubble.kind,
      nx: a.nx,
      ny: a.ny,
      ms,
    })
  }

  // ---- 几何工具 ----

  /** 场景里是否已经有一只叫 cat 的节点（用户在编辑器里手工摆的） */
  private static findSceneCat(): Node | null {
    const scene = director.getScene()
    if (!scene) return null
    const stack: Node[] = [...scene.children]
    while (stack.length) {
      const n = stack.pop() as Node
      if (/^cat$/i.test(n.name)) return n
      for (const c of n.children) stack.push(c)
    }
    return null
  }

  /** 自上而下强制刷新世界变换（父子顺序不能反，否则子节点用的是旧父矩阵） */
  private static forceWorld(root: Node) {
    root.updateWorldTransform()
    for (const c of root.children) CatPet.forceWorld(c)
  }

  /** 节点（含子节点）的世界包围盒：用 mesh.struct 的本地角点 × 世界矩阵，最稳。 */
  static meshBox(root: Node): { min: Vec3; max: Vec3 } | null {
    const renders = root.getComponentsInChildren(MeshRenderer)
    let min: Vec3 | null = null
    let max: Vec3 | null = null
    const tmp = new Vec3()
    for (const r of renders) {
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

  /**
   * 房间壳体（地板/墙/栏杆）的渲染器。
   *
   * house_three 底下是「一块大壳体 + 一堆家具/相框」的结构，壳体没有固定名字
   * （子节点叫 node_0），所以按**水平面积最大**来认它。
   *
   * ⚠ 两个坑（都是实测踩出来的）：
   *   1) 不能用**体积**：猫也是 house_three 的孩子（用户把它摆进了房间模型里），
   *      它模型包围盒的体积 33.34 恰好比房间壳体的 33.07 大一点点，一按体积选
   *      就选中了猫 —— 于是射线永远"打不到墙"，点地板全被判成空气。
   *   2) 要跳过猫：就算按水平面积选（壳体 23.6 > 猫 11.5），也顺手把 cat 排除，
   *      免得以后换只更大的猫又翻车。
   */
  private static shellCache = new WeakMap<Node, MeshRenderer | null>()

  private static underCat(n: Node): boolean {
    let p: Node | null = n
    while (p) {
      if (/^cat$/i.test(p.name)) return true
      p = p.parent
    }
    return false
  }

  private static shellRenderer(house: Node): MeshRenderer | null {
    if (CatPet.shellCache.has(house)) return CatPet.shellCache.get(house) || null
    let best: MeshRenderer | null = null
    let bestArea = 0
    for (const r of house.getComponentsInChildren(MeshRenderer)) {
      if (!r.model || CatPet.underCat(r.node)) continue
      const b = r.model.worldBounds
      if (!b) continue
      const he = b.halfExtents
      const area = he.x * he.z
      if (area > bestArea) {
        bestArea = area
        best = r
      }
    }
    CatPet.shellCache.set(house, best)
    return best
  }

  /** 射线打到房间壳体的最近距离；没打到返回 -1 */
  static rayHitShell(ray: geometry.Ray, house: Node): number {
    const r = CatPet.shellRenderer(house)
    if (!r || !r.model) return -1
    const d = geometry.intersect.rayModel(ray, r.model)
    return d > 0 ? d : -1
  }
}
