// RoomBackdrop.ts —— 3D 房间的远景背景幕布
// ---------------------------------------------------------------------------
// 效果：相机正前方 distance 米处放一块「永远正对相机」的巨型画布，图片按 cover
// 方式铺满整个视口（不拉伸、不留边）。拖动视角时画布会横向/纵向轻微位移，
// 于是远处风景像真的在"缓缓掠过"，比一张贴死的图有层次感。
//
// 为什么不直接用 Cocos 的 Skybox：
//   Skybox 需要 CubeMap（6 张面）或经过特殊处理的 equirect 全景图，一张普通的
//   JPG/PNG 塞进去会几何畸变（上下两极挤成一团），而且改它得动 SceneGlobals。
//   用一块 billboard 画布则 1 张普通图就能出效果，颜色/远近/视差全在 Inspector 里调。
//
// ★ 关于 SpriteRenderer 的两个坑（引擎源码里核过，见 cc.SpriteRenderer）：
//   1) 它是 ModelRenderer（3D 渲染），尺寸 = 图片像素 / 100（pixelsToUnit）——
//      1670px 的图在 scale=1 时只有 16.7 个世界单位宽，靠 scale 缩放才合适；
//   2) 它的 model.visFlags 默认是 Layers.Enum.NONE（= 0），
//      任何相机的 visibility 都匹配不上，结果就是「图配好了却完全不显示」。
//      所以这里必须显式把 visibility 设成画布所在节点的 layer。
import {
  _decorator,
  Component,
  Node,
  Camera,
  SpriteRenderer,
  SpriteFrame,
  Material,
  Layers,
  builtinResMgr,
  resources,
  Vec3,
  view,
  screen,
  director,
  Director,
  find,
} from 'cc'

const { ccclass, property } = _decorator

const toRadian = (deg: number) => (deg * Math.PI) / 180
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// 复用临时对象：layout() 每帧都跑，避免频繁 new 造成 GC 抖动
const FWD = new Vec3(0, 0, -1)
const RIGHT = new Vec3(1, 0, 0)
const UP = new Vec3(0, 1, 0)
const _f = new Vec3()
const _r = new Vec3()
const _u = new Vec3()
const _p = new Vec3()

@ccclass('RoomBackdrop')
export class RoomBackdrop extends Component {
  @property({ tooltip: '背景画布所在节点；留空 = 本组件所在节点；本节点上没有 SpriteRenderer 时自动找场景里第一个' })
  board: Node = null

  @property({ tooltip: '主相机；留空自动找 Main Camera' })
  camera: Camera = null

  @property({
    tooltip: '画布离相机多远（米）。必须小于相机 Far 裁剪面（当前场景是 200），否则会被整个裁掉',
  })
  distance = 60

  @property({
    tooltip: '铺满余量：1 = 刚好铺满视口（转动时有露边风险）；1.3 = 四周多留 30%（推荐）',
  })
  cover = 1.3

  @property({
    tooltip:
      '位移视差：拖动视角时画布跟着平移的比例。0 = 纹丝不动像贴纸；0.15 = 明显的景深感（推荐）；别超过 0.4 会露边',
  })
  parallax = 0.15

  @property({
    tooltip:
      '常驻漂移幅度（相对画布半宽/半高的比例）。静止不拖动时背景也会缓缓流动 —— 0 = 死图；' +
      '0.05 = 一眼看得出在动又不会露边（推荐）；别超过 0.1，会顶到 cover 余量的边',
  })
  idleDrift = 0.05

  @property({
    tooltip: '常驻漂移一个完整来回的秒数。越小动得越急，22s 左右比较"云在走"而不晃眼',
  })
  idlePeriod = 22

  @property({
    tooltip: '常驻漂移时画布伴随的轻微翻滚角度（度），让远景不像一块被硬塞进去的板子',
  })
  idleRollDeg = 0.6

  @property({
    tooltip: '画布的图片资源路径（仅当画布上还没设 Sprite Frame 时用来兜底加载；不要带扩展名）',
  })
  texturePath = 'models/furniture/微信图片_20261013224332_581_106'

  private baseYaw = 0
  private basePitch = 0
  private ready = false
  private logged = false
  // 背景图在 scale=1 时的世界尺寸缓存（见 layout 里的说明）
  private cachedSf: SpriteFrame | null = null
  private cachedW = 1
  private cachedH = 1

  /**
   * 量出背景图的世界尺寸，只在换了图时才真的读 mesh。
   * 读成功返回 true；失败返回 false（调用方保持现状不动，别用一个瞎猜的尺寸去缩放画布）。
   */
  private measure(sf: SpriteFrame): boolean {
    if (this.cachedSf === sf) return true
    try {
      sf.ensureMeshData()
      const st = sf.mesh && sf.mesh.struct
      if (!st || !st.maxPosition) return false
      this.cachedW = Math.abs(st.maxPosition.x - st.minPosition.x) || 1
      this.cachedH = Math.abs(st.maxPosition.y - st.minPosition.y) || 1
      this.cachedSf = sf
      return true
    } catch (e) {
      console.warn('[RoomBackdrop] 读取图片尺寸失败，暂不调整画布:', e)
      return false
    }
  }

  onLoad() {
    this.resolveRefs()
    this.ensureSprite()
  }

  start() {
    // 基准朝向要在 CameraRig.applyOverrides() 跑完之后取（它可能被 URL 参数改过），
    // 所以放在 start 而不是 onLoad。视差量是相对这个基准算的。
    const cam = this.camera || this.findCamera()
    if (cam) {
      const e = cam.node.eulerAngles
      this.baseYaw = e.y
      this.basePitch = -e.x
    }
    this.ready = true

    // ★ 关掉天空盒渲染：整屏都被这块幕布挡住了，画它纯属白烧像素。
    //   实测（Intel UHD / 2.6M 像素画布）：关掉 57fps，开着 49fps，画面完全一样。
    //   场景文件里也把它关了（cc.SkyboxInfo._enabled=false），这里是双保险：
    //   万一以后谁在编辑器里又勾上，运行时也会被关掉。
    //   ⚠ 只关“渲染”，envmap 仍然挂在场景上给 PBR 材质做环境光，所以材质亮度不变。
    try {
      const globals = director.getScene() ? director.getScene().globals : null
      const sky = globals ? globals.skybox : null
      if (sky && sky.enabled) {
        sky.enabled = false
        console.log('[RoomBackdrop] 已关闭天空盒渲染（背景幕布已铺满全屏，省一整个全屏 pass）')
      }
    } catch (e) {
      console.warn('[RoomBackdrop] 关闭天空盒失败（不影响房间显示）:', e)
    }
  }

  private findCamera(): Camera | null {
    const scene = director.getScene()
    const cn = find('Main Camera') || (scene ? scene.getComponentInChildren(Camera)?.node : null)
    return cn ? cn.getComponent(Camera) : null
  }

  /** 找到画布节点与相机（都支持留空自动查找） */
  private resolveRefs() {
    const scene = director.getScene()
    if (!this.board) {
      if (this.node.getComponent(SpriteRenderer)) {
        this.board = this.node
      } else {
        const sr = scene ? scene.getComponentInChildren(SpriteRenderer) : null
        this.board = sr ? sr.node : this.node
      }
    }
    if (!this.camera) this.camera = this.findCamera()
  }

  /** 确保画布上有 SpriteRenderer、可见性正确、材质有效、并且确实有图 */
  private ensureSprite() {
    const board = this.board
    if (!board) return
    let sr = board.getComponent(SpriteRenderer)
    if (!sr) {
      sr = board.addComponent(SpriteRenderer)
      console.warn('[RoomBackdrop] 画布节点上没有 SpriteRenderer，已自动补上')
    }
    // ★ 必须显式设：SpriteRenderer 的 visFlags 默认 Layers.Enum.NONE(0)，
    //   相机的 visibility 与之按位与恒为 0 => 模型根本不会提交渲染（"配了图也不显示"）。
    sr.visibility = board.layer || Layers.Enum.DEFAULT

    // ★★ 材质这一步不能省，否则整屏洋红。
    //    SpriteRenderer 的 _materials 为空时，引擎会退到内置的 `missing-material`，
    //    而它的 mainColor 写死是 #ff00ff —— 于是画布（铺满整个视口）会变成一大块洋红，
    //    看着就像"背景图丢了/背景坏了"。
    //    编辑器里手摆的 SpriteRenderer 有材质是因为场景序列化了
    //    db://internal/default_materials/default-sprite-renderer-material.mtl；
    //    而运行期 new 出来的没有，只能这里补。
    if (!this.ensureMaterial(sr)) {
      // 连内置材质都拿不到（一般是因为场景里没有任何地方引用它，构建把它摇树丢了），
      // 那就宁可不显示背景，也不能让整屏洋红 —— 直接停掉画布。
      board.active = false
      return
    }

    if (sr.spriteFrame) return

    const p = (this.texturePath || '').trim()
    if (!p) {
      console.warn('[RoomBackdrop] 画布上没有 Sprite Frame，且未配置 texturePath —— 背景不会显示')
      return
    }
    // 先按「整张 image 资源」加载，再退回「spriteFrame 子资源」写法（两种都兼容）
    resources.load(p, SpriteFrame, (err: Error | null, sf: SpriteFrame) => {
      if (!err && sf) {
        sr.spriteFrame = sf
        return
      }
      resources.load(`${p}/spriteFrame`, SpriteFrame, (e2: Error | null, sf2: SpriteFrame) => {
        if (e2 || !sf2) {
          console.error(`[RoomBackdrop] 背景图加载失败: ${p}（已试过 ${p} 与 ${p}/spriteFrame）`, e2 || err)
          return
        }
        sr.spriteFrame = sf2
      })
    })
  }

  /**
   * 保证画布上的材质是有效的（有 pass 才算数）。
   * 有效 -> true；补上内置的 default-sprite-renderer-material -> true；实在没有 -> false。
   */
  private ensureMaterial(sr: SpriteRenderer): boolean {
    const cur = sr.getMaterial(0)
    if (cur && cur.passes && cur.passes.length > 0) return true

    const builtin = builtinResMgr.get<Material>('default-sprite-renderer-material')
    if (builtin) {
      sr.setMaterial(builtin, 0)
      console.warn(
        '[RoomBackdrop] 画布没有有效材质，已补上内置的 default-sprite-renderer-material' +
          '（不补的话引擎会退到 missing-material，它的 mainColor 是 #ff00ff，整屏变洋红）',
      )
      const again = sr.getMaterial(0)
      return !!(again && again.passes && again.passes.length > 0)
    }

    // 2D 精灵材质兜底：视觉效果一致，只是渲染队列不同
    const fallback = builtinResMgr.get<Material>('ui-sprite-material')
    if (fallback) {
      sr.setMaterial(fallback, 0)
      console.warn('[RoomBackdrop] 没找到 default-sprite-renderer-material，已退用 ui-sprite-material')
      const again = sr.getMaterial(0)
      return !!(again && again.passes && again.passes.length > 0)
    }

    console.error(
      '[RoomBackdrop] 拿不到任何可用的精灵材质（default-sprite-renderer-material / ui-sprite-material 都没有）。' +
        '多半是 .scene 里的背景节点被删了，构建把内置材质摇树丢掉了 —— 先停掉画布，避免整屏洋红。' +
        '修法：把 `微信图片_20261013224332_581_106` 那个 cc.SpriteRenderer 节点放回 main.scene。',
    )
    return false
  }

  // 必须和 CameraRig.getAspect() 用同一个来源，否则背景铺满的程度会和实际视锥对不上
  private getAspect(): number {
    const ws = screen.windowSize
    if (ws && ws.height > 0) return ws.width / ws.height
    const vs = view.getVisibleSize()
    if (vs && vs.height > 0) return vs.width / vs.height
    return 16 / 9
  }

  // 放在 lateUpdate：这时 CameraRig 那一帧的机位已经摆好，背景能对齐同一帧的相机
  lateUpdate() {
    this.layout()
  }

  /** 把画布摆成「永远正对相机、铺满视口」的状态 */
  private layout() {
    if (!this.ready) return
    const cam = this.camera
    const board = this.board
    if (!cam || !board) return
    const sr = board.getComponent(SpriteRenderer)
    const sf = sr ? sr.spriteFrame : null
    // 图还没加载好（异步）—— 先别动画布，保持编辑器里摆的样子，免得闪一下
    if (!sf) return

    // 画布在 scale=1 时的真实世界尺寸：直接读 spriteFrame 的 mesh 包围盒，
    // 不自己算「像素 / 100」（pixelsToUnit 是引擎私有值，写死会错）。
    //
    // ★ 缓存：这个量对同一张图是**恒定的**，而 layout() 每帧都跑。
    //   原先每帧都在 ensureMeshData() + 读 mesh.struct（还要 try/catch），
    //   这在拖动视角时是纯浪费 —— 尺寸算出来跟上一帧一模一样。
    //   现在只在 spriteFrame 换了图时才重算一次。
    if (!this.measure(sf)) return

    const wWorld = this.cachedW
    const hWorld = this.cachedH

    const camNode = cam.node
    const rot = camNode.worldRotation
    Vec3.transformQuat(_f, FWD, rot) // 相机前向（从相机指向被看的东西）
    Vec3.transformQuat(_r, RIGHT, rot) // 相机右向
    Vec3.transformQuat(_u, UP, rot) // 相机上向
    const camPos = camNode.worldPosition

    // 1) 尺寸：距离处视锥截面的高/宽，再乘 cover 余量
    const aspect = this.getAspect()
    const tanHalf = Math.tan(toRadian(cam.fov) / 2)
    const horiz = (cam as any).fovAxis === 1 // CameraFOVAxis.HORIZONTAL
    const tanV = horiz ? tanHalf / aspect : tanHalf
    const tanH = horiz ? tanHalf : tanHalf * aspect
    const needH = 2 * this.distance * tanV * this.cover
    const needW = 2 * this.distance * tanH * this.cover

    // 等比缩放：取较大的那个，保证两个方向都盖住（是 cover，不是 contain）
    const s = Math.max(needW / wWorld, needH / hWorld) || 1
    board.setWorldScale(s, s, s)
    const halfW = (wWorld * s) / 2
    const halfH = (hWorld * s) / 2

    // 2) 视差：按「相对基准朝向转过的角度」把画布在相机局部坐标里平移一点。
    //    平移量用画布半宽/半高的比例表示 —— 无论画布多大都不会把边露出来。
    const e = camNode.eulerAngles
    const yaw = e.y
    const pitch = -e.x
    const yawRatio = clamp((yaw - this.baseYaw) / 90, -1, 1)
    const pitchRatio = clamp((pitch - this.basePitch) / 90, -1, 1)
    let shiftX = -yawRatio * this.parallax * halfW
    let shiftY = pitchRatio * this.parallax * halfH * 0.6

    // 2b) 常驻漂移：不拖动时也让远景缓缓流动 —— 否则背景就是一张贴死的图，
    //     跟会转的相机、会动的宠物完全是"两个世界"。两条不同周期的正弦叠起来，
    //     轨迹不会短期内重复；幅度都按画布半宽/半高算，永远只吃 cover 留的余量，不会露边。
    let idleRoll = 0
    if (this.idleDrift > 0) {
      const t = director.getTotalTime() / 1000
      const ph = (t / Math.max(1, this.idlePeriod)) * Math.PI * 2
      shiftX += Math.sin(ph) * this.idleDrift * halfW
      shiftY += Math.sin(ph * 0.73 + 1.1) * this.idleDrift * halfH * 0.45
      idleRoll = Math.sin(ph * 0.61) * this.idleRollDeg
    }

    // 3) 摆位置（相机正前方 distance 米）+ 摆朝向（与相机完全相同 => 法线正对镜头）
    _p.set(
      camPos.x + _f.x * this.distance + _r.x * shiftX + _u.x * shiftY,
      camPos.y + _f.y * this.distance + _r.y * shiftX + _u.y * shiftY,
      camPos.z + _f.z * this.distance + _r.z * shiftX + _u.z * shiftY,
    )
    board.setWorldPosition(_p)
    board.setWorldRotationFromEuler(-pitch, yaw, idleRoll)

    if (!this.logged) {
      this.logged = true
      console.log(
        `[RoomBackdrop] 背景幕布就位：原图在 scale=1 时 ${wWorld.toFixed(2)}x${hWorld.toFixed(2)} 单位，` +
          `现缩放 x${s.toFixed(2)} => ${(wWorld * s).toFixed(1)}x${(hWorld * s).toFixed(1)} 米，` +
          `距相机 ${this.distance} 米（视差 ${this.parallax}，余量 ${this.cover}）`,
      )
    }
  }
}

/**
 * 兜底自启：保证场景里有一块背景画布，并给它挂上本组件。
 *
 * 为什么不写进 .scene：
 *   1) 脚本组件在 .scene 里是用「脚本 uuid 的压缩串」序列化的，uuid 未定时写进场景容易出错；
 *   2) 更实际的原因 —— 场景节点曾因为一次 .scene 保存被删掉，背景整片消失了一段时间。
 * 所以这里不光"找到就挂"，还"没有就建"：画布节点由代码创建，图片由 texturePath 兜底加载。
 */
let backdropEnsured = false

function ensureBackdrop() {
  if (backdropEnsured) return
  const scene = director.getScene()
  if (!scene) return
  backdropEnsured = true

  const sr = scene.getComponentInChildren(SpriteRenderer)
  if (!sr) {
    // 场景里没有画布节点 —— 曾经因为一次 .scene 保存把那个节点删掉过，结果背景整片消失。
    // 现在改成"没有就自己建一个"：不依赖 .scene 里存在这个节点，图片由 texturePath 兜底加载。
    const board = new Node('RoomBackdropBoard')
    board.layer = Layers.Enum.DEFAULT
    scene.addChild(board)
    board.addComponent(RoomBackdrop)
    console.log('[RoomBackdrop] 场景里没有画布节点，已自动新建 RoomBackdropBoard（背景照常生效）')
    return
  }
  if (!sr.node.getComponent(RoomBackdrop)) sr.node.addComponent(RoomBackdrop)
}

director.on(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
  try {
    ensureBackdrop()
  } catch (e) {
    console.error('[RoomBackdrop] 兜底自启失败:', e)
  }
})
