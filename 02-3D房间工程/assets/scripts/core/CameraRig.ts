// CameraRig.ts —— 3D 房间的相机（默认斜前方 45° 看房子，可拖拽/滑动转动视角）
// ---------------------------------------------------------------------------
// 操作方式对齐 Cocos Creator 的「场景编辑器」（用户要求：鼠标滑动 + 键盘移动 + 二者结合）：
//   · 左键拖动 / 单指拖动  = 绕焦点转视角（上下拖 = 俯仰）
//   · 右键拖动 / 中键拖动  = 平移视角（沿相机右/上方向，像编辑器里推画布）
//   · 滚轮                 = 缩放（拉近/拉远）
//   · WASD / 方向键        = 平移视角（W/S 往房间深处，A/D 左右）
//   · Q / E                = 键盘转视角
//   · ★ 按住右键 + WASD    = 沿视线方向"飞"（W 会真的往上/往下走，不只是水平平移）
//   · Shift                = 加速（2.2 倍）
//   · F                    = 回到初始机位（编辑器里的"聚焦"手感）
//
// 现状（四个能力叠在一起）：
//   1) 默认机位：正面偏左（yawDeg=-45）、俯角 pitchDeg 度看房间；
//   2) 自动取景：按房间的世界包围盒 + 当前画面宽高比算出精确距离，
//      让房子尽可能铺满屏幕（fill 控制留白），横屏、竖屏都不会跑出画面；
//   3) 拖拽旋转：按住画面左右拖 = 绕房子转（±yawRange 度内），上下拖 = 调俯仰
//      （pitchMin~pitchMax 度），松手带惯性滑行。想关掉就取消勾选 allowRotate。
//   4) 平移 + 缩放：观察焦点**不夹范围** —— 用户要求「移除碰撞检测」，
//      可以一直往前走，走到房间外、绕到任意位置都行；滚轮一格缩放一档，
//      越接近上下限步长越小（渐进阻尼）。想关掉分别取消 allowPan / allowZoom。
//
//   ★ 想换"默认朝向"只改一个数：yawDeg 就是"相机的水平方位角" ——
//     0 = 正对房间开口正面，正数 = 往右绕（右前方），负数 = 往左绕（左前方），
//     ±45 的取景完全相同（只是左右镜像），±90 = 绕到正侧面，180 = 绕到背面。
//     拖拽的范围是以这个值为中心、左右各 yawRange 度。
//
// 取景算法：把包围盒 8 个角点分别投影到相机的三个基向量上，反解出「所有角点都
// 落在视锥内」所需的最小距离，而不是简单用包围球 —— 包围球对"扁而深"的房间会
// 过度保守（会把房子推得很远、显得小）。
import {
  _decorator,
  Component,
  Node,
  Vec3,
  Camera,
  view,
  screen,
  input,
  Input,
  EventTouch,
  EventMouse,
  EventKeyboard,
  KeyCode,
  SystemEvent,
  systemEvent,
  find,
  sys,
  game,
} from 'cc'
import { roomWorldBounds, SCENE_ROOM_SCALE } from './RoomSpec'

/** 滚轮缩放上下限 */
const ZOOM_MIN = 0.55
const ZOOM_MAX = 1.9
/**
 * 每格滚轮的缩放步长（zoomScale 单位，与 0.55~1.9 同一量纲）。
 * 为什么按"格"而不是按像素：Cocos 把浏览器 wheel 的 deltaY 乘 5 后塞进
 * getScrollY()（setScrollData(5*deltaX, -5*deltaY)），Chrome 一格 deltaY≈100
 * → scrollY≈±500。按像素乘系数时，同一个数在 Chrome 上每格跳 0.3、整个区间
 * 两三格就滚完，在 deltaY=3 的浏览器上又几乎不动 —— 用户两次反馈"幅度太大"
 * 根因就在这。现在一次事件只认方向，步长固定，跨浏览器手感一致。
 */
const ZOOM_STEP = 0.03
/** WASD 平移速度（场景单位/秒）—— 会再乘一个「随缩放变化」的系数，见 panByKeys */
const PAN_SPEED = 3.6
/**
 * Q / E 键盘转视角的角速度（度/秒）。
 * 之前只能用鼠标拖，键盘党想微调角度只能拖一下再松手 —— 加一对键更顺手。
 */
const KEY_ROT_SPEED = 55
/**
 * 起步 / 收尾的时间常数（秒）。指数逼近平滑：
 *   · 0.07 ≈ 70ms 从静止加到全速（按下去立刻有响应，但不会"一顿一顿"地窜）
 *   · 0.12 ≈ 120ms 松手后停稳（不带硬刹车的顿挫感）
 * 这两个数是"跟随手感"的核心：给 0 就是原来的瞬时启停（用户反馈"一卡一卡的"），
 * 给太大（>0.25）会明显延迟、像拖着东西走。
 */
const PAN_ACCEL_TAU = 0.07
const PAN_STOP_TAU = 0.12
/**
 * 右键/中键拖动平移的灵敏度：1 = 画面跟手（鼠标移多少像素，房间在屏幕上就移多少像素）。
 * 之所以按像素换算而不是写死速度：这样的手感和 Cocos 场景编辑器的"抓手平移"一致，
 * 而且缩放远近都一样跟手。
 */
const PAN_DRAG_GAIN = 1
/** 按住右键时 WASD 的"飞行"速度倍率（沿视线，含上下） */
const FLY_GAIN = 1
/** 按住 Shift 的加速倍率（编辑器里也是按住 Shift 加速漫游） */
const SPEED_BOOST = 2.2
/**
 * 平移时的自动凑近系数。
 *
 * ★ 现在是 1（关闭）。以前是 0.62 —— 一边平移一边把相机往前拉，
 *   于是"按着 W 往前走"的同时画面还在放大，手感像**被什么东西拽住/有阻力**，
 *   用户反馈的"移动时有阻力"就是它。想找回来把这个数改小即可（0.9 很轻微）。
 */
const PAN_DOLLY = 1

const { ccclass, property } = _decorator

/** 一组机位参数（补间的端点） */
interface ViewPose {
  panX: number
  panY: number
  panZ: number
  zoom: number
  yaw: number
  pitch: number
}

/**
 * 视角预设表。
 *
 * ★ 坐标是**世界坐标**（房间 x -4.09~3.27、z -4.21~4.69），由 main.scene 实测得来：
 *   书桌 (-2.38, -3.10) 与后端 room.js 的 FIXED_POS 是同一套数据。
 *   x/z 传 null 表示"对准房间中心"，这样房间挪动或尺寸变化时仍然是正的。
 *
 * 用法：宿主点按钮 → postMessage { type:'tp:view', name } → RoomBootstrap → focusPreset(name)
 */
const VIEW_PRESETS: {
  [key: string]: { x: number | null; z: number | null; zoom: number; yaw: number | null; pitch: number }
} = {
  // 小屋：整座房子的外观（默认机位，就是 F 键复位的那一版）
  house: { x: null, z: null, zoom: 1, yaw: null, pitch: 35 },
  // 室内：镜头推进屋里，压低俯角，看家具和地板
  indoor: { x: null, z: 0.1, zoom: 0.58, yaw: -14, pitch: 20 },
  // 花园：画面下方压一片花草、房子在后，像站在露台上往外看
  garden: { x: -2.0, z: 3.2, zoom: 0.8, yaw: 15, pitch: 22 },
  // 书桌：对准房间左后角那张书桌（桌+椅在画面中间偏左，能看清桌面上的东西）
  desk: { x: -2.38, z: -3.1, zoom: 0.45, yaw: -45, pitch: 38 },
  // 岛体：拉远俯瞰整座岛（1.9 会退到云里，1.35 刚好让岛占满中间）
  island: { x: null, z: null, zoom: 1.35, yaw: null, pitch: 46 },
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
// 注意：Cocos 3.8 的 'cc' 并不导出 MathUtils（类型检查会报 TS2305），
// 直接用弧度换算，避免因编译失败导致整个脚本类注册不上。
const toRadian = (deg: number) => (deg * Math.PI) / 180

@ccclass('CameraRig')
export class CameraRig extends Component {
  /** 观察目标节点；留空则按 targetName 自动查找 */
  @property(Node)
  target: Node = null

  @property({ tooltip: 'target 为空时按此节点名自动查找（默认 RoomRoot）' })
  targetName = 'RoomRoot'

  @property({ tooltip: '水平方位角（度）：0=正对房间开口；正数=往右绕，负数=往左绕。当前 -45=左前方' })
  yawDeg = -45

  @property({ tooltip: '仰/俯角（度）：0 = 完全平视，越大越俯视（越能看到房间地面和里面的家具）' })
  pitchDeg = 35

  @property({ tooltip: '视线焦点的高度（米）：负责上下构图。仰角越高，这个值要越小才不会把房间顶出画面' })
  lookAtHeight = 0.02

  @property({ tooltip: '画面占比：1 = 刚好吃满取景框；0.95 = 四周留 5% 空白' })
  fill = 0.95

  @property({ tooltip: '允许拖拽/滑动旋转视角（按住画面左右拖动 = 绕房子转，上下拖动 = 调俯仰）' })
  allowRotate = true

  @property({ tooltip: '允许滚轮/双指缩放' })
  // 默认开启：滚轮拉近拉远是浏览房间的基本操作
  allowZoom = true

  @property({ tooltip: '允许 WASD / 方向键平移视角（A=左 D=右 W=上 S=下，沿屏幕方向移动观察焦点）' })
  // 默认开启：键盘浏览房间的基本操作（触屏设备没有键盘，自动无副作用）
  allowPan = true

  // ---- 拖拽手感（都做成参数，方便不出编辑器就能调） ----

  @property({
    tooltip: '左右可转范围（度）：以启动时的 yawDeg 为基准 ±这个值。调大能看到房间侧面，太大可能转到没有墙的背面',
  })
  yawRange = 55

  @property({ tooltip: '俯仰角下限（度）：越小越平视，看到的天花板/空处越多' })
  pitchMin = 12

  @property({ tooltip: '俯仰角上限（度）：越大越像在看沙盘模型' })
  pitchMax = 58

  @property({ tooltip: '灵敏度：手指/鼠标拖过整个屏幕宽度，对应的旋转角度（度）' })
  dragRange = 170

  @property({ tooltip: '松手后的惯性衰减：0.93 = 会滑很久，0.75 = 很快就停' })
  inertiaDamping = 0.9

  @property({ tooltip: '上下拖拽的灵敏度倍数（相对左右），1 = 一样，0.5 = 俯仰慢一半' })
  pitchGain = 0.5

  // ---- 拖拽方向（手感不对时只翻这两个开关，不用改代码）----
  // 浏览器里 getLocationY() 的 Y 轴方向与直觉相反，所以默认上下要翻一下：
  //   上拖 → 俯仰角变大（视角抬得更高、更俯视房间）；下拖 → 压平视角。
  // 左右默认也翻：右拖 → 相机往右绕（房间跟着往左转），符合"拖动画布"的直觉。
  @property({ tooltip: '左右拖拽方向反转（默认开：右拖 = 视角往右绕）' })
  dragInvertX = true

  @property({ tooltip: '上下拖拽方向反转（默认开：上拖 = 俯仰角变大）' })
  dragInvertY = true

  private min = new Vec3()
  private max = new Vec3()
  private hasBounds = false
  private lastAspect = 0
  private dragging = false
  private lastX = 0
  private lastY = 0
  /** 滚轮缩放的上下限（0.55 ~ 1.9）—— 放到 3 倍会穿进模型里，缩到 0.3 又像在看蚂蚁 */
  private zoomScale = 1
  private boundInput = false

  // ---- WASD 平移 ----
  // keys：当前按住的键码集合（KEY_DOWN 加入、KEY_UP 移除，lateUpdate 里按 dt 积分，
  //   比依赖系统的按键重复事件更稳，速度也不受帧率影响）。
  // panX/panZ：观察焦点相对房间中心的偏移（世界单位），apply() 时叠加到目标点上；
  //   **不夹范围**（"移除相机碰撞检测"）—— 焦点可以一直往外推，房间外也能走。
  // panVX/panVZ：**平滑后的**平移速度（世界单位/秒）。按键只决定"目标速度"，
  //   实际速度用指数逼近平滑过去 —— 这样起步/收尾都不会"啪"地一下切换。
  private keys = new Set<number>()
  private panX = 0
  private panY = 0
  private panZ = 0
  private panVX = 0
  private panVY = 0
  private panVZ = 0
  /** 键盘转视角：-1 / 0 / +1（Q / E） */
  private rotKey = 0
  /** 右键 / 中键是否按着（编辑器式：右键拖动平移；右键 + WASD 沿视线飞） */
  private rmb = false
  private mmb = false
  private lastMX = 0
  private lastMY = 0
  /** Shift 加速 */
  private boost = false
  /** 初始机位（F 键复位用） */
  private initYaw = -45
  private initPitch = 35
  /** 默认缩放下的取景距离（算平移速度系数用）与当前距离 */
  private fitDist = 0
  private curDist = 0

  // 拖拽相关：baseYaw 是"滑动范围"的基准（启动时的 yawDeg，之后不再变），
  // velYaw/velPitch 是松手后惯性滑行的角速度（度/帧）。
  private baseYaw = -45
  private basePitch = 20
  private velYaw = 0
  private velPitch = 0

  // ---- 视角预设的补间（小屋 / 室内 / 花园 / 书桌 / 岛体）----
  // null = 没有进行中的补间。from/to 都是"一整组机位参数"，t 从 0 走到 1。
  private viewFrom: ViewPose | null = null
  private viewTo: ViewPose | null = null
  private viewT = 0
  private static readonly VIEW_DUR = 0.75

  /**
   *   浏览器预览时在地址栏后面加参数即可（改完刷新）：
   *     index.html?pitch=30&yaw=-45&lookAt=0
   *   也可以写 localStorage，之后每次预览都生效：
   *     localStorage.setItem('tp_pitch','30')
   *     localStorage.setItem('tp_yaw','-45')
   *     localStorage.setItem('tp_lookAt','0')
   * 没传参数时完全不影响正式构建 —— 用的是场景里存的值。
   */
  private applyOverrides() {
    // 注意：Cocos 3.8 里 sys.Platform.WEB 根本不存在（恒 undefined），必须用 sys.isBrowser。
    if (!sys.isBrowser) return
    let search = ''
    try {
      search = location.search || ''
    } catch (e) {
      return
    }
    const read = (key: string): number | null => {
      let raw: string | null = null
      try {
        raw = new URLSearchParams(search).get(key)
      } catch (e) {
        raw = null
      }
      if (raw === null || raw === '') {
        try {
          raw = localStorage.getItem('tp_' + key)
        } catch (e) {
          raw = null
        }
      }
      if (raw === null || raw === '') return null
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    }
    const yaw = read('yaw')
    const pitch = read('pitch')
    const lookAt = read('lookAt')
    if (yaw !== null) this.yawDeg = yaw
    if (pitch !== null) this.pitchDeg = clamp(pitch, 1, 80)
    if (lookAt !== null) this.lookAtHeight = lookAt
    if (yaw !== null || pitch !== null || lookAt !== null) {
      console.log(
        `[CameraRig] 使用临时参数: yaw=${this.yawDeg} pitch=${this.pitchDeg} lookAt=${this.lookAtHeight}` +
          `（想恢复默认值，执行 localStorage.removeItem('tp_yaw') 等三个键后刷新）`,
      )
    }
  }

  onLoad() {
    this.applyOverrides()
    // 基准取「应用过 URL/localStorage 覆盖之后」的值：用户用 ?yaw=-70 试出来的角度，
    // 应当成为下一次滑动时"左右各能转 yawRange 度"的中心。
    this.baseYaw = this.yawDeg
    this.basePitch = this.pitchDeg
    // F 键复位用：记住启动时的机位（含 URL 覆盖后的值）
    this.initYaw = this.yawDeg
    this.initPitch = this.pitchDeg

    if (this.allowRotate || this.allowZoom) {
      input.on(Input.EventType.TOUCH_START, this.onDown, this)
      input.on(Input.EventType.TOUCH_MOVE, this.onMove, this)
      input.on(Input.EventType.TOUCH_END, this.onUp, this)
      input.on(Input.EventType.TOUCH_CANCEL, this.onUp, this)
      input.on(Input.EventType.MOUSE_WHEEL, this.onWheel, this)
      this.boundInput = true
    }
    // 编辑器式操作：右键/中键拖动平移（左键仍然是触摸事件那套"转视角"）
    if (this.allowPan) {
      input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this)
      input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this)
      input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this)
      // 右键拖动时浏览器会弹右键菜单，必须屏蔽（只屏蔽画布，不影响页面其它区域）
      const canvas = game.canvas as HTMLCanvasElement | null
      if (canvas) canvas.addEventListener('contextmenu', this.blockContextMenu)
    }
    // 键盘平移走 systemEvent（3.3 起的正统入口；input 上的 KEY_DOWN 已标记 deprecated）。
    // 注意：iframe 里的画布要先获得焦点（点一下房间）才会收到按键 —— 点击家具时
    // 天然就聚焦了，所以"点一下再按 WASD"的体验是连贯的。
    // 键盘：WASD/方向键平移 + Q/E 转视角 + Shift 加速 + F 复位。两者任一开启就要监听
    if (this.allowPan || this.allowRotate) {
      systemEvent.on(SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this)
      systemEvent.on(SystemEvent.EventType.KEY_UP, this.onKeyUp, this)
    }
    // 先用默认房间尺寸摆一次机位：这样即使 RoomBootstrap 还没加载完模型，
    // 编辑器/预览里看到的也是正确的正面构图，而不是相机停在原点。
    if (!this.hasBounds) this.fitToRoom()
  }

  private blockContextMenu = (e: Event) => {
    e.preventDefault()
  }

  start() {
    if (!this.target) this.target = find(this.targetName)
    if (!this.target && !this.hasBounds) {
      console.warn(`[CameraRig] 找不到节点 '${this.targetName}'，暂用默认房间尺寸取景`)
    }
  }

  /** 按房间的世界包围盒锁定机位（RoomBootstrap 加载完房间后会调用） */
  fitTo(min: Vec3, max: Vec3) {
    this.min.set(min)
    this.max.set(max)
    this.hasBounds = true
    // 重新取景时把焦点拉回房间中心：否则残留的平移偏移会让"自动构图"对不准
    this.panX = 0
    this.panY = 0
    this.panZ = 0
    this.panVX = 0
    this.panVY = 0
    this.panVZ = 0
    this.apply()
  }

  /**
   * 按房间的世界包围盒锁定机位。
   *
   * origin = 房间节点的世界坐标；roomScale = 房间模型的缩放
   * （main.scene 里手搭的那份 house_three 是 **10** 倍，默认值 10 正好对上）。
   */
  fitToRoom(origin?: Vec3, roomScale = SCENE_ROOM_SCALE) {
    const o = origin || (this.target ? this.target.worldPosition : Vec3.ZERO)
    const b = roomWorldBounds(o, roomScale)
    this.fitTo(b.min, b.max)
  }

  // ---- 拖拽/滑动旋转（allowRotate 控制开关；缩放见 onWheel） ----
  private onDown(e: EventTouch) {
    this.cancelView()
    this.dragging = true
    this.lastX = e.getLocationX()
    this.lastY = e.getLocationY()
    // 按下就掐断上一次的惯性，否则会出现"刚按住画面自己还在滑"
    this.velYaw = 0
    this.velPitch = 0
  }

  private onMove(e: EventTouch) {
    if (!this.dragging || !this.allowRotate) return
    // ★ 右键/中键按住时这一拖是"平移"，不能再转视角 —— 桌面端鼠标按下会被引擎
    //   同时派发成 TOUCH_START/MOVE，不加这个判断的话右键平移会顺带把镜头抬高
    //   （实测向上拖 100px 会额外转了 ~11°）。
    if (this.rmb || this.mmb) return
    const dx = e.getLocationX() - this.lastX
    const dy = e.getLocationY() - this.lastY
    this.lastX = e.getLocationX()
    this.lastY = e.getLocationY()

    // 按屏幕尺寸归一化：不管窗口多大、手机是几倍屏，"拖过整屏宽"都对应 dragRange 度，
    // 手感一致（直接拿 px 乘系数的话，高分屏上会变得极难拖）。
    //
    // 坐标系要对上：touch/mouse 事件的 getLocationX() 返回的是**物理像素**
    // （引擎内部 clientX × devicePixelRatio），所以基准也要用 screen.windowSize
    // （同为物理像素）；用 view.getVisibleSize()（设计分辨率，如 960x640）会差 1~2 倍。
    const { w, h } = this.getScreenSize()
    // 原始方向（按事件坐标系的自然增长方向得出），再按 dragInvertX/Y 决定是否翻转。
    // 之所以把"翻转"抽成两个勾选项：不同浏览器/设备上事件坐标 Y 轴朝向有过差异，
    // 用户在编辑器里一勾就能校正，不必回来改代码再重新构建。
    const rawYaw = -(dx / w) * this.dragRange
    const rawPitch = (dy / h) * this.dragRange * this.pitchGain
    const dYaw = (this.dragInvertX ? -1 : 1) * rawYaw
    const dPitch = (this.dragInvertY ? -1 : 1) * rawPitch

    const lo = this.baseYaw - this.yawRange
    const hi = this.baseYaw + this.yawRange
    const nextYaw = clamp(this.yawDeg + dYaw, lo, hi)
    const nextPitch = clamp(this.pitchDeg + dPitch, this.pitchMin, this.pitchMax)

    // 撞到边界就不给惯性（否则松手后会在边界上一直"顶"着）
    this.velYaw = Math.abs(nextYaw - this.yawDeg) > 1e-6 ? dYaw : 0
    this.velPitch = Math.abs(nextPitch - this.pitchDeg) > 1e-6 ? dPitch : 0
    this.yawDeg = nextYaw
    this.pitchDeg = nextPitch
    this.apply()
  }

  private onUp() {
    this.dragging = false
  }

  /**
 * 滚轮缩放（按格计步 + 渐进阻尼）。
 *
 * 用户两次反馈「滚一次效果太大」——根因是量纲：Cocos 把浏览器 wheel 的 deltaY
 * 乘 5 塞进 getScrollY()，Chrome 一格约 ±500，按像素乘固定系数时每格能跳 0.3，
 * 整个缩放区间两三格就滚完。现在一次滚轮事件 = 一格，只取方向、步长固定
 * ZOOM_STEP，再按「离上下限的余量」打折 —— 越接近某一端步长越短，平滑收敛，
 * 也满足"建筑物越靠近（放得越大）幅度越小"的手感要求。
 */
private onWheel(e: EventMouse) {
    if (!this.allowZoom) return
    this.cancelView()
    const sy = e.getScrollY()
    if (!sy) return // 个别浏览器会发滚动量为 0 的事件，别当成一格
    // scrollY > 0 = 滚轮向前 = 放大（zoomScale 变小、相机靠近）
    const zoomIn = sy > 0
    const room = zoomIn
      ? (this.zoomScale - ZOOM_MIN) / (1 - ZOOM_MIN) // 离"最近"还有多少余量
      : (ZOOM_MAX - this.zoomScale) / (ZOOM_MAX - 1) // 离"最远"还有多少余量
    const damp = Math.max(0.2, Math.min(1, room)) // 留 20% 地板，别让最后一点变成"怎么滚都不动"
    const step = ZOOM_STEP * damp
    this.zoomScale = clamp(this.zoomScale + (zoomIn ? -step : step), ZOOM_MIN, ZOOM_MAX)
    this.apply()
  }

  // ---- 右键 / 中键拖动平移（对齐 Cocos 场景编辑器的"抓手"）----
  private onMouseDown(e: EventMouse) {
    const b = e.getButton()
    this.lastMX = e.getLocationX()
    this.lastMY = e.getLocationY()
    if (b === EventMouse.BUTTON_RIGHT) this.rmb = true
    else if (b === EventMouse.BUTTON_MIDDLE) this.mmb = true
  }

  private onMouseMove(e: EventMouse) {
    const x = e.getLocationX()
    const y = e.getLocationY()
    // ★ 这里**不能**加 `&& !this.dragging`：桌面端按下右键，引擎会同时派发
    //   TOUCH_START（onDown 里把 dragging 置成 true），加了就永远进不来，
    //   右键/中键拖动平移整个失效（实测拖 100px 相机只挪 0.1，残量还是上一次的惯性）。
    //   左侧的 (rmb || mmb) 已经足够区分"这一拖是平移还是转视角"：
    //   onMove() 在 rmb/mmb 时会 return，所以不会和平移打架。
    if (this.rmb || this.mmb) {
      this.panByDrag(x - this.lastMX, y - this.lastMY)
    }
    this.lastMX = x
    this.lastMY = y
  }

  private onMouseUp(e: EventMouse) {
    const b = e.getButton()
    if (b === EventMouse.BUTTON_RIGHT) this.rmb = false
    if (b === EventMouse.BUTTON_MIDDLE) this.mmb = false
  }

  /**
   * 按像素平移：鼠标移动多少像素，房间在屏幕上就跟着移动多少像素（和编辑器一致）。
   *
   * 换算：焦平面上 1 像素 ≈ 2·D·tan(fov/2) / 屏幕高。
   * 位移方向取相机的右向量 / 上向量（上向量带俯仰），所以斜着看的时候
   * "往上拖"仍然是画面里的上，而不是世界 Y。
   */
  private panByDrag(dxPx: number, dyPx: number) {
    if (!dxPx && !dyPx) return
    const { h } = this.getScreenSize()
    const cam = this.getComponent(Camera)
    if (!cam || h <= 0 || this.curDist <= 0) return
    const worldPerPx = (2 * this.curDist * Math.tan(toRadian(cam.fov) / 2)) / h
    const yaw = toRadian(this.yawDeg)
    const pitch = toRadian(this.pitchDeg)
    // 相机基向量（与 apply() 同一套）
    const rx = Math.cos(yaw)
    const rz = -Math.sin(yaw)
    const ux = -Math.sin(yaw) * Math.sin(pitch)
    const uy = Math.cos(pitch)
    const uz = -Math.cos(yaw) * Math.sin(pitch)
    const k = worldPerPx * PAN_DRAG_GAIN
    // "抓着画布拖"：鼠标往右 → 房间跟着往右 → 相机（焦点）往左退
    this.panX += (-dxPx * rx - dyPx * ux) * k
    this.panY += -dyPx * uy * k
    this.panZ += (-dxPx * rz - dyPx * uz) * k
    // 手动拖动时不要再叠键盘的速度残量
    this.panVX = 0
    this.panVY = 0
    this.panVZ = 0
    this.apply()
  }

  // ---- WASD / 方向键平移 ----
  // 方向映射（用户要求"左上下右"）：A=左、D=右、W=上、S=下。
  // "上/下"沿相机视线在水平面的投影推焦点（W = 往房间深处看 = 视野上移），
  // "左/右"沿相机右向量推焦点。这样不管当前拖到什么角度，按 W 永远是"视野往上"。
  private static readonly PAN_KEYS: { [code: number]: [number, number] } = {
    [KeyCode.KEY_A]: [-1, 0],
    [KeyCode.KEY_D]: [1, 0],
    [KeyCode.KEY_W]: [0, 1],
    [KeyCode.KEY_S]: [0, -1],
    [KeyCode.ARROW_LEFT]: [-1, 0],
    [KeyCode.ARROW_RIGHT]: [1, 0],
    [KeyCode.ARROW_UP]: [0, 1],
    [KeyCode.ARROW_DOWN]: [0, -1],
  }

  private onKeyDown(e: EventKeyboard) {
    this.cancelView()
    const dir = CameraRig.PAN_KEYS[e.keyCode]
    if (dir) {
      this.keys.add(e.keyCode)
      return
    }
    // Q = 往左绕，E = 往右绕（和拖拽同一个方向语义）
    if (e.keyCode === KeyCode.KEY_Q) this.rotKey = -1
    else if (e.keyCode === KeyCode.KEY_E) this.rotKey = 1
    // Shift = 加速漫游（编辑器里也是这个手感）
    else if (e.keyCode === KeyCode.SHIFT_LEFT || e.keyCode === KeyCode.SHIFT_RIGHT) this.boost = true
    // F = 回到初始机位（对齐编辑器里的"聚焦"）
    else if (e.keyCode === KeyCode.KEY_F) this.resetView()
  }

  private onKeyUp(e: EventKeyboard) {
    this.keys.delete(e.keyCode)
    if (e.keyCode === KeyCode.KEY_Q || e.keyCode === KeyCode.KEY_E) this.rotKey = 0
    if (e.keyCode === KeyCode.SHIFT_LEFT || e.keyCode === KeyCode.SHIFT_RIGHT) this.boost = false
  }

  /** F：回到启动时的机位（角度、缩放、平移全部复位） */
  private resetView() {
    this.yawDeg = this.initYaw
    this.pitchDeg = this.initPitch
    this.zoomScale = 1
    this.panX = 0
    this.panY = 0
    this.panZ = 0
    this.panVX = 0
    this.panVY = 0
    this.panVZ = 0
    this.velYaw = 0
    this.velPitch = 0
    this.apply()
  }

  /**
   * 平滑切到某个预设视角（宿主点「小屋/室内/花园/书桌/岛体」时调用）。
   *
   * 做法：把当前机位和目标机位都摊成一组参数（平移偏移 + 缩放 + 偏航 + 俯仰），
   * 在 lateUpdate 里按 0.75s 的 easeInOutCubic 插值 —— 直接赋值会"瞬移"，
   * 平滑过去用户才看得出镜头是"飞过去"的。
   */
  focusPreset(name: string) {
    const p = this.presetOf(name)
    if (!p) {
      console.warn(`[CameraRig] 未知的视角预设: ${name}`)
      return
    }
    // 房间包围盒还没量出来时先不动：pan 的基准是房间中心
    if (!this.hasBounds) this.fitToRoom()
    const cx = (this.min.x + this.max.x) / 2
    const cz = (this.min.z + this.max.z) / 2
    const tx = p.x === null ? cx : p.x
    const tz = p.z === null ? cz : p.z
    this.viewFrom = {
      panX: this.panX,
      panY: this.panY,
      panZ: this.panZ,
      zoom: this.zoomScale,
      yaw: this.yawDeg,
      pitch: this.pitchDeg,
    }
    this.viewTo = {
      panX: tx - cx,
      panY: 0,
      panZ: tz - cz,
      zoom: clamp(p.zoom, ZOOM_MIN, ZOOM_MAX),
      yaw: clamp(
        p.yaw === null ? this.initYaw : p.yaw,
        this.baseYaw - this.yawRange,
        this.baseYaw + this.yawRange,
      ),
      pitch: clamp(p.pitch, this.pitchMin, this.pitchMax),
    }
    this.viewT = 0
    // 清掉所有残留的惯性/按键速度，否则补间会被上一帧的滑动带偏
    this.velYaw = 0
    this.velPitch = 0
    this.panVX = 0
    this.panVY = 0
    this.panVZ = 0
    this.keys.clear()
    console.log(`[CameraRig] 视角 → ${name}`, this.viewTo)
  }

  /**
   * 取某个预设（带**调试覆盖**）。
   *
   * 调机位很费时间：改一行代码就要重新构建一次（约 3 分钟）。所以这里和相机那几个
   * yaw/pitch 一样留了一个运行期覆盖入口 —— 在浏览器控制台里执行：
   *   localStorage.setItem('tp_view_island', '-, -, 1.45, -, 50')
   *   // 五段：x, z, zoom, yaw, pitch；写 '-' 表示"用默认的（房间中心 / 初始角度）"
   * 刷新后点「岛体」就按这套参数飞。调好之后把数字写回 VIEW_PRESETS 即可。
   * 不写 localStorage 时完全等同于 VIEW_PRESETS，正式环境无副作用。
   */
  private presetOf(name: string) {
    const base = VIEW_PRESETS[name]
    if (!base) return null
    if (!sys.isBrowser) return base
    let raw: string | null = null
    try {
      raw = localStorage.getItem('tp_view_' + name)
    } catch {
      raw = null
    }
    if (!raw) return base
    const parts = raw.split(',').map((t) => t.trim())
    if (parts.length < 5) return base
    const num = (t: string, d: number) => (t === '-' || t === '' ? d : Number(t))
    const numOrNull = (t: string, d: number | null) => (t === '-' || t === '' ? d : Number(t))
    const x = numOrNull(parts[0], base.x)
    const z = numOrNull(parts[1], base.z)
    const zoom = num(parts[2], base.zoom)
    const yaw = numOrNull(parts[3], base.yaw)
    const pitch = num(parts[4], base.pitch)
    if (![zoom, pitch].every((n) => Number.isFinite(n as number))) return base
    return {
      x: x !== null && Number.isFinite(x) ? x : base.x,
      z: z !== null && Number.isFinite(z) ? z : base.z,
      zoom: zoom as number,
      yaw: yaw !== null && Number.isFinite(yaw) ? yaw : base.yaw,
      pitch: pitch as number,
    }
  }

  /** 用户一动手就中断补间（不然"我拖了一下它又自己飞回去"） */
  private cancelView() {
    if (!this.viewFrom) return
    this.viewFrom = null
    this.viewTo = null
    this.viewT = 0
  }

  /**
   * 平移带来的自动凑近系数（1 = 不收缩）。
   * 按焦点偏离房间中心的归一化距离算，越靠边角收缩越多（最多到 PAN_DOLLY 倍）。
   */
  private panDolly(): number {
    if (!this.hasBounds || PAN_DOLLY >= 1) return 1
    const hx = (this.max.x - this.min.x) / 2
    const hz = (this.max.z - this.min.z) / 2
    if (!(hx > 0) || !(hz > 0)) return 1
    const t = Math.min(1, Math.hypot(this.panX / hx, this.panZ / hz))
    return 1 - (1 - PAN_DOLLY) * t
  }

  /**
   * 每帧按当前按住的键平移焦点。
   *
   * 三件事决定了"好不好控制"：
   *   1) **速度平滑**：按键只给目标速度，实际速度按 PAN_ACCEL_TAU / PAN_STOP_TAU 逼近，
   *      起步和松手都有几十毫秒的过渡（不会有"猛一下/急刹"的顿挫）。
   *   2) **屏幕速度恒定**：世界速度 × (当前取景距离 / 默认取景距离)。
   *      否则缩远之后同样按一秒，画面里只挪一点点，主观上就是"有阻力、推不动"。
   *   3) **斜向不加速**：W+A 同时按时方向归一化，不会比单向快 1.41 倍。
   */
  private panByKeys(dt: number) {
    let rx = 0
    let rz = 0
    if (this.hasBounds && this.keys.size) {
      for (const code of this.keys) {
        const dir = CameraRig.PAN_KEYS[code]
        if (!dir) continue
        rx += dir[0]
        rz += dir[1]
      }
    }

    let tx = 0
    let ty = 0
    let tz = 0
    if (rx || rz) {
      const len = Math.hypot(rx, rz) || 1
      // 相机基向量（与 apply() 里同一套）：
      //   r(右) = (cos yaw, 0, -sin yaw)
      //   f(前) = (-sin yaw·cos pitch, -sin pitch, -cos yaw·cos pitch)
      // 不按右键时只用 f 的**水平投影**（保持原来的"上下平移"手感）；
      // 按住右键时用完整的 f —— 这就是编辑器里"右键 + W 往前飞"的效果，能真的升高/降低。
      const yaw = toRadian(this.yawDeg)
      const pitch = toRadian(this.pitchDeg)
      const sy = Math.sin(yaw)
      const cy = Math.cos(yaw)
      const sp = Math.sin(pitch)
      const cp = Math.cos(pitch)
      const k =
        this.fitDist > 0 && this.curDist > 0 ? clamp(this.curDist / this.fitDist, 0.45, 2.4) : 1
      const speed = PAN_SPEED * k * (this.boost ? SPEED_BOOST : 1) * (this.rmb ? FLY_GAIN : 1)
      const right = rx / len
      const fwd = rz / len
      tx = (cy * right - sy * cp * fwd) * speed
      tz = (-sy * right - cy * cp * fwd) * speed
      ty = this.rmb ? -sp * fwd * speed : 0
    }

    // 指数逼近：dt 越大（掉帧）一步走得越多，帧率高低不影响最终手感
    const tau = tx || ty || tz ? PAN_ACCEL_TAU : PAN_STOP_TAU
    const s = 1 - Math.exp(-Math.max(dt, 0) / tau)
    this.panVX += (tx - this.panVX) * s
    this.panVY += (ty - this.panVY) * s
    this.panVZ += (tz - this.panVZ) * s
    if (!tx && Math.abs(this.panVX) < 0.004) this.panVX = 0
    if (!ty && Math.abs(this.panVY) < 0.004) this.panVY = 0
    if (!tz && Math.abs(this.panVZ) < 0.004) this.panVZ = 0
    if (!this.panVX && !this.panVY && !this.panVZ) return

    // ★ 不做任何范围限制（用户要求「把相机的碰撞检测移除掉」）：
    //   焦点可以推到房间外任意位置，相机跟着走 —— 想看哪个角落就走到哪个角落。
    //   想恢复"只能在屋里平移"的老行为，在这里重新夹一次 clamp 即可。
    this.panX += this.panVX * dt
    this.panY += this.panVY * dt
    this.panZ += this.panVZ * dt
    this.apply()
  }

  /** Q / E 键盘转视角（同样帧率无关，并且每次都被夹在允转范围内） */
  private rotateByKeys(dt: number) {
    if (!this.rotKey) return
    const lo = this.baseYaw - this.yawRange
    const hi = this.baseYaw + this.yawRange
    const next = clamp(this.yawDeg + this.rotKey * KEY_ROT_SPEED * dt, lo, hi)
    if (next === this.yawDeg) return
    this.yawDeg = next
    this.velYaw = 0
    this.apply()
  }

  // 画面宽高比变化（浏览器窗口/iframe 尺寸变了）时重新取景，保证房子始终铺满
  lateUpdate(dt: number) {
    // 切标签页回来时 dt 可能是好几秒，直接积分会让视角"瞬移"；按 100ms 封顶
    const step = Math.min(Math.max(dt, 0), 0.1)

    // 视角预设补间（优先级最高：这一帧在飞的过程中不吃拖拽惯性）
    if (this.viewFrom && this.viewTo) {
      this.viewT = Math.min(1, this.viewT + step / CameraRig.VIEW_DUR)
      const t = this.viewT
      // easeInOutCubic：起步和收尾都软，中段快
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      const f = this.viewFrom
      const o = this.viewTo
      const mix = (a: number, b: number) => a + (b - a) * e
      this.panX = mix(f.panX, o.panX)
      this.panY = mix(f.panY, o.panY)
      this.panZ = mix(f.panZ, o.panZ)
      this.zoomScale = mix(f.zoom, o.zoom)
      this.yawDeg = mix(f.yaw, o.yaw)
      this.pitchDeg = mix(f.pitch, o.pitch)
      if (t >= 1) {
        this.viewFrom = null
        this.viewTo = null
      }
      this.apply()
    }

    // 松手后的惯性滑行
    if (!this.viewFrom && !this.dragging && !this.rotKey && this.allowRotate &&
        (Math.abs(this.velYaw) > 0.02 || Math.abs(this.velPitch) > 0.02)) {
      const lo = this.baseYaw - this.yawRange
      const hi = this.baseYaw + this.yawRange
      const y0 = this.yawDeg
      const p0 = this.pitchDeg
      this.yawDeg = clamp(this.yawDeg + this.velYaw, lo, hi)
      this.pitchDeg = clamp(this.pitchDeg + this.velPitch, this.pitchMin, this.pitchMax)
      if (this.yawDeg === y0) this.velYaw = 0
      if (this.pitchDeg === p0) this.velPitch = 0
      // ★ 惯性衰减要按**时间**算，不能按帧：原来每帧乘 0.9，30fps 下会滑两倍久，
      //   低帧时松手像是"黏住不放"，这也是"卡顿/有阻力"的一部分来源。
      const damp = Math.pow(this.inertiaDamping, step * 60)
      this.velYaw *= damp
      this.velPitch *= damp
      this.apply()
    }

    // WASD 平移（放在惯性之后：这一帧的焦点偏移会一并反映在构图里）
    if (this.allowPan) this.panByKeys(step)
    // Q / E 键盘转视角
    if (this.allowRotate) this.rotateByKeys(step)

    if (!this.hasBounds) return
    const a = this.getAspect()
    if (Math.abs(a - this.lastAspect) > 0.01) this.apply()
  }

  /**
   * 渲染窗口的像素尺寸（物理像素）。
   * 用 screen.windowSize 而不是 view.getVisibleSize()：
   *   - 前者与 input 事件坐标（getLocationX）同一坐标系，灵敏度才算得准；
   *   - 后者是设计分辨率（如 960x640），拿它当基准会让不同机器手感差 1~2 倍。
   */
  private getScreenSize(): { w: number; h: number } {
    const ws = screen.windowSize
    if (ws && ws.width > 0 && ws.height > 0) return { w: ws.width, h: ws.height }
    const vs = view.getVisibleSize()
    if (vs && vs.width > 0 && vs.height > 0) return { w: vs.width, h: vs.height }
    return { w: 1280, h: 720 }
  }

  private getAspect(): number {
    const { w, h } = this.getScreenSize()
    return h > 0 ? w / h : 16 / 9
  }

  /**
   * 固定机位核心：算出「让房间 8 个角点刚好都进画面」的相机位置。
   *
   * 设相机基向量 f(前,指向目标) / r(右) / u(上)，目标点 T，距离 D：
   *   相机位置 P = T - f·D
   *   角点 Q 在相机坐标系： 深度 a = (Q-T)·f + D
   *                        横偏 x = (Q-T)·r， 纵偏 y = (Q-T)·u
   *   要落进视锥：|x| ≤ a·tanH 且 |y| ≤ a·tanV
   *   → D ≥ |x|/tanH - (Q-T)·f  以及  D ≥ |y|/tanV - (Q-T)·f
   *   对所有角点取最大即可（fill 直接把 tanH/tanV 缩小，等价于四周留白）。
   */
  private apply() {
    const cam = this.getComponent(Camera)
    if (!cam) return

    const aspect = this.getAspect()
    this.lastAspect = aspect

    const yaw = toRadian(this.yawDeg)
    const pitch = toRadian(this.pitchDeg)
    const sy = Math.sin(yaw)
    const cy = Math.cos(yaw)
    const sp = Math.sin(pitch)
    const cp = Math.cos(pitch)

    // 基向量（世界系）：yaw=0、pitch>0 时 f 指向 -Z 且向下，即从正前方略高处看房间
    const fx = -sy * cp
    const fy = -sp
    const fz = -cy * cp
    const rx = cy
    const ry = 0
    const rz = -sy
    // u = r × f
    const ux = -sy * sp
    const uy = cp
    const uz = -cy * sp

    // 视锥半角正切（fill 越小 → tan 越小 → 画面里留白越多）
    const tanHalf = Math.tan(toRadian(cam.fov) / 2)
    const horizontalFov = ((cam as any).fovAxis === 1) // CameraFOVAxis.HORIZONTAL
    let tanV = horizontalFov ? tanHalf / aspect : tanHalf
    let tanH = horizontalFov ? tanHalf : tanHalf * aspect
    tanV *= this.fill
    tanH *= this.fill

    // 焦点：房间中心 + 平移偏移（panY 让右键/中键上下拖动、以及"沿视线飞"也能改高度）
    const T = new Vec3(
      (this.min.x + this.max.x) / 2 + this.panX,
      this.lookAtHeight + this.panY,
      (this.min.z + this.max.z) / 2 + this.panZ,
    )

    // ★ 取景距离**只按房间中心算，不能跟着平移偏移走**。
    //   平移之前这里传的是 T（含 panX/panZ/panY）：焦点一挪，8 个角点相对画面就偏心了，
    //   为了把它们都塞回视锥，解出来的 D 必然变大 —— 于是"右拖 100px"的同时相机
    //   自动往后退（实测距离 13.11 → 16.68），画面跟着缩小。
    //   这正是用户反馈"移动时有阻力/画面自己在缩放"的另一半原因
    //   （另一半是 PAN_DOLLY，已经关掉了）：平移的语义是"把画布挪过去"，
    //   缩放只归滚轮管，平移不该反过来改缩放。
    const C = new Vec3(
      (this.min.x + this.max.x) / 2,
      this.lookAtHeight,
      (this.min.z + this.max.z) / 2,
    )

    let D = 0.1
    for (let i = 0; i < 8; i++) {
      const qx = i & 1 ? this.max.x : this.min.x
      const qy = i & 2 ? this.max.y : this.min.y
      const qz = i & 4 ? this.max.z : this.min.z
      const dx = qx - C.x
      const dy = qy - C.y
      const dz = qz - C.z
      const xc = dx * rx + dy * ry + dz * rz
      const yc = dx * ux + dy * uy + dz * uz
      const a0 = dx * fx + dy * fy + dz * fz
      D = Math.max(D, Math.abs(xc) / tanH - a0, Math.abs(yc) / tanV - a0)
    }
    // 记录两个距离：
    //   fitDist = 「房间刚好吃满画面」的距离（只跟房间尺寸/画面比例有关）
    //   curDist = 实际用的距离（再乘缩放）
    // 平移速度按 curDist/fitDist 缩放，画面里的移动速度才不会随缩放变化。
    const baseD = Math.max(0.2, D)
    this.fitDist = baseD
    // zoomScale = 滚轮缩放；panDolly() = 平移到边角时自动凑近（见 PAN_DOLLY 注释）
    D = Math.max(0.2, baseD * this.zoomScale * this.panDolly())
    this.curDist = D

    // 用「局部位置 + 欧拉角」直接摆机位，不用 lookAt：
    // lookAt 内部读的是节点世界位置，同帧内刚 setWorldPosition 后可能拿到旧值；
    // 而欧拉角 (-pitch, yaw, 0) 对应的相机前向恰好是 (-sin y·cos p, -sin p, -cos y·cos p)，
    // 与上面算 D 时用的基向量 f 完全一致（当前配置对应场景里存的 -14°,-45°,0）。
    this.node.setPosition(T.x - fx * D, T.y - fy * D, T.z - fz * D)
    this.node.setRotationFromEuler(-this.pitchDeg, this.yawDeg, 0)
  }

  onDestroy() {
    // 按键集合先清空：组件销毁时万一还有键没收到 KEY_UP（切窗口等场景），
    // 留着会在日志里变成一个"永远按着"的幽灵键
    this.keys.clear()
    this.rotKey = 0
    this.boost = false
    this.rmb = false
    this.mmb = false
    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this)
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this)
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this)
    const canvas = game.canvas as HTMLCanvasElement | null
    if (canvas) canvas.removeEventListener('contextmenu', this.blockContextMenu)
    if (!this.boundInput) return
    input.off(Input.EventType.TOUCH_START, this.onDown, this)
    input.off(Input.EventType.TOUCH_MOVE, this.onMove, this)
    input.off(Input.EventType.TOUCH_END, this.onUp, this)
    input.off(Input.EventType.TOUCH_CANCEL, this.onUp, this)
    input.off(Input.EventType.MOUSE_WHEEL, this.onWheel, this)
    if (this.allowPan || this.allowRotate) {
      systemEvent.off(SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this)
      systemEvent.off(SystemEvent.EventType.KEY_UP, this.onKeyUp, this)
    }
  }
}
