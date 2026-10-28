// RoomGallery.ts —— 场景里那两件「装饰件」的联动
//
// 用户在 main.scene 里手工摆的两个模型（它们不对应任何一条记忆）：
//   · rahmen     相框（挂在 house_three 下）  → 显示本岛最新一张 AI 封面图
//   · television 电视机（挂在场景根下）       → 本岛只要生成过 AI 视频就点亮呼吸光晕
//
// 设计要点（踩坑总结，改之前先看）：
//  1) **照片面片挂在模型自己的节点下**，但不是用局部坐标摆 —— 用 setWorldPosition/
//     setWorldRotation 定位，父节点怎么缩放旋转都不影响。
//  2) ★ 这两个 glb 的根节点带 **+90° 的 X 旋转**（glTF Y-up → 引擎坐标）：
//     模型的"高"在局部是 Z 轴、"厚度"在局部是 Y 轴。
//     所以**不能**拿局部包围盒的 X/Y 当宽高（上一版就是这么写的，结果照片只有
//     0.8 × 0.07，贴在相框下边框上成了一条细缝，看起来就是"没贴上"）。
//     现在一律用**世界空间**包围盒：三轴里最薄的一根 = 相框法线，另外两根 = 画面平面。
//  3) 模型是一个整块 mesh + 一个材质，**没有独立的"屏幕"子网格**，
//     所以不能改模型材质的贴图（那样整台电视机都会变成照片）。
//     只能额外贴一张面片 —— 顺带这也是最省的做法（一个 quad = 2 个三角形）。
//
// ============================================================================
// ★ 想微调就改这几个常量（用户要求：不要自作主张降画质/改效果，参数留在这里）
// ============================================================================
import {
  ImageAsset,
  Material,
  MeshRenderer,
  Node,
  Quat,
  Texture2D,
  Vec3,
  Color,
  primitives,
  utils,
  director,
} from 'cc'
import { PropGlow } from './PropGlow'
import { Net } from './Net'

/** 面片相对模型正面的外移量（世界单位，防止和模型表面 Z-fighting 闪面） */
const FACE_OUTSET = 0.012
/**
 * 照片占满相框"内框"的比例。
 *
 * ★ 用户要求「照片要铺满相框」：现在是 **cover**（先把图片按内框比例裁一刀，再整幅铺满），
 *   不再是原来的 contain（整张图塞进去，四周留白 —— 16:9 的图放进方相框会变成中间一条）。
 *   0.80 = 正好贴到相框内沿：再大就会盖住金色边框（实测 0.9 时边框几乎看不见），
 *   再小（0.72）里侧会露出一圈空白衬板。想调边框留白就改这个数。
 */
const PHOTO_FILL = 0.8
/** 贴图上限边长：AI 封面图可能是很大的 dataURL，没必要按原尺寸上传显存 */
const MAX_TEXTURE_PX = 1024

/** 欧拉角(度) → 四元数（Cocos 的 Quat.fromEuler 参数是角度，不是弧度） */
function quatFromEuler(x: number, y: number, z: number): Quat {
  const q = new Quat()
  Quat.fromEuler(q, x, y, z)
  return q
}

/**
 * ★★ 总开关：场景里的相框 / 电视机是否展示 AI 媒体（照片面片 + 电视高亮）
 *
 *   false（当前）＝ **关**。AI 图片 / 视频**只在内容详情面板里查看**，
 *   3D 场景不再挂照片面片、不再点亮电视，也不再开轮询 —— 省掉一张贴图的显存、
 *   一个 quad 的绘制、以及每 8 秒一次的网络请求（用户反馈"太卡"）。
 *   true         ＝ 开。恢复「相框贴最新 AI 封面 + 电视机有 AI 视频就呼吸高亮」。
 *
 * 想恢复效果把这里改回 true 即可，下面的代码都保留着，不需要重写。
 */
const ENABLE_IN_SCENE_MEDIA = false

/**
 * 轮询间隔（秒）：隔多久问一次后端「有没有新的 AI 视频 / 新封面」。
 * 需求原话是「未来增加了 AI 视频则电视机自动高亮」—— 视频要 1~2 分钟才生成完，
 * 不轮询的话房间就只能在刷新后才亮。改小可以更及时（但也更费请求），改 0 关掉轮询。
 */
const GALLERY_POLL_SEC = 8

/** 场景里两个装饰件的节点名（用户在 Cocos 里就是这么命名的） */
const NODE_NAMES = { frame: 'rahmen', tv: 'television' }

/** 后端 room/layout 里的 gallery 字段（见 server/room.js 的 galleryOf） */
export interface GalleryData {
  cover?: string // 最新一张 AI 封面的 dataURL / URL，没有则空
  video?: string // 最新一条已完成的 AI 视频地址，没有则空
  videoCount?: number
}

/** 递归找场景里第一个叫这个名字的节点（find('rahmen') 的路径语义不明，自己找更稳） */
function findDeep(root: Node | null, name: string): Node | null {
  if (!root) return null
  if (root.name === name) return root
  const kids = root.children
  for (let i = 0; i < kids.length; i++) {
    const hit = findDeep(kids[i], name)
    if (hit) return hit
  }
  return null
}

function findByName(name: string): Node | null {
  const scene = director.getScene()
  return scene ? findDeep(scene, name) : null
}

/**
 * 取节点（含子件）在**世界空间**的包围盒。
 *
 * ★ 为什么不换算回局部空间（上一版的坑，已踩）：
 *   这两个 glb 的根节点带一个 +90° 的 X 旋转（glTF Y-up → 引擎坐标），
 *   模型的"高"在局部是 Z 轴、"厚度"在局部是 Y 轴。上一版按局部盒子的 X/Y 当宽高，
 *   算出来的照片只有 0.8 × 0.07 —— 一条贴在相框下边框上的细缝，看起来就是"没贴上去"。
 *   世界空间的 AABB 不受这件事影响：房间/相框都是轴对齐摆放的，
 *   最薄的那一根轴就是相框的法线，另外两根就是画面所在平面。
 */
function worldBoundsOf(n: Node): { center: Vec3; half: Vec3 } | null {
  const renderers = n.getComponentsInChildren(MeshRenderer)
  const lo = new Vec3(Infinity, Infinity, Infinity)
  const hi = new Vec3(-Infinity, -Infinity, -Infinity)
  let found = false
  for (const r of renderers) {
    const b: any = r.model ? r.model.worldBounds : null
    if (!b) continue
    // Cocos 3.8 的 geometry.AABB **没有** getBoundary()（上一版调用它直接抛
    // "AABB.getBoundary is not a function"，照片永远贴不上）。用 center/halfExtents 自己拼。
    const c: Vec3 = b.center || b._center
    const h: Vec3 = b.halfExtents || b._halfExtents
    if (!c || !h) continue
    lo.x = Math.min(lo.x, c.x - h.x)
    lo.y = Math.min(lo.y, c.y - h.y)
    lo.z = Math.min(lo.z, c.z - h.z)
    hi.x = Math.max(hi.x, c.x + h.x)
    hi.y = Math.max(hi.y, c.y + h.y)
    hi.z = Math.max(hi.z, c.z + h.z)
    found = true
  }
  if (!found || !isFinite(lo.x)) return null
  return {
    center: new Vec3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2),
    half: new Vec3((hi.x - lo.x) / 2, (hi.y - lo.y) / 2, (hi.z - lo.z) / 2),
  }
}

/**
 * 相框「正面」的几何信息：中心、半个盒、三轴尺寸、法线轴、画面平面的宽/高、相机在法线哪一侧。
 *
 * 三根轴里**最薄的那根**就是相框法线（相框是薄板）。画面平面的两根轴里，
 * 「u」是面片旋转后的局部 X 方向、「v」是局部 Y 方向 —— 顺序必须和 putPhoto 里的
 * 旋转一致，否则宽高会互换（照片被拉成横的）。
 */
interface FaceInfo {
  center: Vec3
  half: Vec3
  ext: number[]
  axis: number
  planeU: number
  planeV: number
  side: number
}

function faceOf(frame: Node, cam: Node | null): FaceInfo | null {
  const box = worldBoundsOf(frame)
  if (!box) return null
  const { center, half } = box
  const ext = [half.x * 2, half.y * 2, half.z * 2]
  let axis = 0
  if (ext[1] < ext[axis]) axis = 1
  if (ext[2] < ext[axis]) axis = 2
  //   法线=X → 面片绕 Y 转 ±90，局部 X 落到世界 Z、局部 Y 还是世界 Y
  //   法线=Y → 面片绕 X 转 ±90，局部 X 还是世界 X、局部 Y 落到世界 Z
  //   法线=Z → 不用转，局部 X/Y 就是世界 X/Y
  const PLANE: { [k: number]: [number, number] } = { 0: [2, 1], 1: [0, 2], 2: [0, 1] }
  const [uAxis, vAxis] = PLANE[axis]
  const planeU = ext[uAxis]
  const planeV = ext[vAxis]
  if (!(planeU > 1e-4) || !(planeV > 1e-4)) return null

  let side = 1
  if (cam) {
    const camPos = new Vec3()
    cam.getWorldPosition(camPos)
    const c = axis === 0 ? center.x : axis === 1 ? center.y : center.z
    const p = axis === 0 ? camPos.x : axis === 1 ? camPos.y : camPos.z
    side = p >= c ? 1 : -1
  }
  return { center, half, ext, axis, planeU, planeV, side }
}

/**
 * 把一个 URL / dataURL 变成贴图，并按目标宽高比**居中裁切**（cover）。
 *
 * ★ 为什么要在这一步裁：
 *   相框内框是个接近正方形/略扁的口，而 AI 封面基本是 16:9 或 1:1。
 *   直接把原图铺上去要么留白（contain，用户反馈"没铺满"），要么把人脸拉扁（stretch）。
 *   所以先把图按 `aspect = 内框宽/内框高` 居中裁一刀，裁出来的图再铺满整块面片 ——
 *   视觉上就是"照片填满相框"，且不变形。
 *
 * ★ 不用 assetManager.loadRemote：AI 封面可能是 **dataURL**（前端画出后 base64 存库），
 *   loadRemote 对 dataURL 的支持不完整。这里用浏览器自己的 Image 解码再画到 canvas，
 *   dataURL 和 http(s) 链接通吃，顺手还能把超大图压到 MAX_TEXTURE_PX。
 */
function loadTexture(src: string, aspect = 0): Promise<{ tex: Texture2D; w: number; h: number } | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const done = (ok: boolean) => {
      if (!ok) return resolve(null)
      try {
        const w = img.naturalWidth || img.width
        const h = img.naturalHeight || img.height
        if (!w || !h) return resolve(null)

        // ---- cover：按目标比例取最大的居中区域 ----
        let sx = 0
        let sy = 0
        let sw = w
        let sh = h
        if (aspect > 0.01) {
          const cur = w / h
          if (cur > aspect) {
            // 图比框宽 → 左右各裁掉一些
            sw = h * aspect
            sx = (w - sw) / 2
          } else if (cur < aspect) {
            // 图比框高 → 上下各裁掉一些
            sh = w / aspect
            sy = (h - sh) / 2
          }
        }

        const scale = Math.min(1, MAX_TEXTURE_PX / Math.max(sw, sh))
        const cw = Math.max(1, Math.round(sw * scale))
        const ch = Math.max(1, Math.round(sh * scale))
        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch)
        const asset = new ImageAsset(canvas)
        const tex = new Texture2D()
        tex.image = asset
        resolve({ tex, w: cw, h: ch })
      } catch (e) {
        console.warn('[RoomGallery] 贴图构造失败:', e)
        resolve(null)
      }
    }
    img.onload = () => done(true)
    img.onerror = () => done(false)
    img.src = src
  })
}

/**
 * 不是 Component，不需要挂在场景上 —— RoomBootstrap 拿到布局数据后直接调用 apply()。
 * 之所以不做成组件：它依赖的 gallery 数据是异步拉来的，做成组件反而要等,
 * 显式调用更省事也更可控。
 */
export class RoomGallery {
  // 当前已经挂上去的东西（为了重复调用时不叠加，也为了内容变化时能替换掉旧的）
  private static _photoNode: Node | null = null
  private static _photoTex: Texture2D | null = null
  private static _photoMat: Material | null = null
  private static _tvNode: Node | null = null
  /** 上一次的内容签名，用来判断"有没有变化"——没变就不做任何事 */
  private static _sig = ''
  private static _timer: any = null

  /**
   * 按后端的 gallery 数据点亮这两个装饰件。
   * 幂等：拿同一份数据反复调用不会叠加 / 闪烁，内容变了才会真正替换。
   * 任何一步失败都只降级（不显示照片 / 不亮），绝不把整个房间拖挂。
   */
  static async apply(data: GalleryData | null | undefined, camNode: Node | null) {
    if (camNode) this._cam = camNode
    // 总开关关着：场景里不显示任何 AI 媒体（详情面板里照常能看），顺手清掉残留
    if (!ENABLE_IN_SCENE_MEDIA) {
      this.clear()
      return
    }
    if (!data) return
    const sig = `${data.cover || ''}|${data.video || ''}`
    if (sig === this._sig) return // 内容没变，直接跳过（轮询绝大多数情况走这里）

    // ★ 只有"真的处理成功"才记签名：第一次如果因为节点还没加载好/贴图还没下载完而失败，
    //   下一轮轮询还能再试一次；否则会永远卡在"空相框"状态。
    const tvOk = this.syncTv(!!data.video, camNode)
    const photoOk = await this.syncPhoto(data.cover || '')
    if (tvOk && photoOk) this._sig = sig
  }

  /**
   * 开轮询：房间开着的时候自己去问后端有没有新产出，
   * 这样"生成完 AI 视频 → 电视自动亮"、"新 AI 封面 → 相框自动换图"都不用刷新页面。
   */
  static startWatch(spaceId: number) {
    // 开关关着就不开轮询 —— 省掉每 8 秒一次的 room/gallery 请求
    if (!ENABLE_IN_SCENE_MEDIA) return
    if (this._timer || !spaceId) return
    const { token, apiBase } = Net.getQuery()
    this._timer = setInterval(async () => {
      try {
        const data = (await Net.fetchGallery(spaceId, token, apiBase)) as GalleryData
        await RoomGallery.apply(data, RoomGallery._cam)
      } catch (e) {
        // 轮询失败不打扰：网络抖一下没关系，下次再试。只在首次失败时提示一次。
        if (!RoomGallery._warned) {
          RoomGallery._warned = true
          console.warn('[RoomGallery] 墙面陈设轮询失败（会继续重试）:', e)
        }
      }
    }, GALLERY_POLL_SEC * 1000)
  }

  static stopWatch() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }

  /**
   * 把已经挂到场景里的照片面片 / 电视光圈全部撤掉，签名也一并清掉。
   * 关掉总开关、或者以后切换开关时用它，保证不留残留节点和显存。
   */
  static clear() {
    if (this._photoNode) {
      this._photoNode.destroy()
      this._photoNode = null
    }
    if (this._tvNode) {
      this._tvNode.destroy()
      this._tvNode = null
    }
    if (this._photoTex) {
      this._photoTex.destroy()
      this._photoTex = null
    }
    if (this._photoMat) {
      this._photoMat.destroy()
      this._photoMat = null
    }
    this._sig = ''
  }

  private static _cam: Node | null = null
  private static _warned = false

  /** 电视机：有 AI 视频就点亮，没有就灭掉。返回是否已达到目标状态 */
  private static syncTv(on: boolean, camNode: Node | null): boolean {
    if (camNode) this._cam = camNode
    try {
      if (on) {
        if (this._tvNode) return true // 已经亮着
        const tv = findByName(NODE_NAMES.tv)
        if (!tv) {
          console.warn(
            `[RoomGallery] 场景里找不到名为 '${NODE_NAMES.tv}' 的节点 —— 请确认电视机已在 main.scene 里摆好并重命名为 television`,
          )
          return false
        }
        const w = new Vec3()
        tv.getWorldPosition(w)
        const glowNode = new Node('TvGlow')
        glowNode.parent = director.getScene()
        const glow = glowNode.addComponent(PropGlow)
        // 电视机比小摆件大很多，光圈按它的体量给大一档
        glow.init(this._cam, w, 1.1)
        this._tvNode = glowNode
        console.log('[RoomGallery] 已点亮电视机（本岛有 AI 视频）')
      } else if (this._tvNode) {
        this._tvNode.destroy()
        this._tvNode = null
      }
      return true
    } catch (e) {
      console.warn('[RoomGallery] 电视机状态更新失败:', e)
      return false
    }
  }

  /** 相框：换成新的 AI 封面（传空字符串就把照片撤掉，露出空相框）。返回是否成功 */
  private static async syncPhoto(cover: string): Promise<boolean> {
    try {
      // 先把旧的清干净
      if (this._photoNode) {
        this._photoNode.destroy()
        this._photoNode = null
      }
      if (this._photoTex) {
        this._photoTex.destroy()
        this._photoTex = null
      }
      if (this._photoMat) {
        this._photoMat.destroy()
        this._photoMat = null
      }
      if (!cover) return true

      const frame = findByName(NODE_NAMES.frame)
      if (!frame) {
        console.warn(
          `[RoomGallery] 场景里找不到名为 '${NODE_NAMES.frame}' 的节点 —— 请确认相框已在 main.scene 里摆好并重命名为 rahmen`,
        )
        return false
      }
      // 先量内框宽高比，再按这个比例裁图 —— 这样照片才能不变形地铺满（见 loadTexture 注释）
      const aspect = this.frameAspect(frame)
      // 后端存的是 /uploads/... 相对路径；dev 下 3D 页与后端不同源，要补成后端地址
      const tex = await loadTexture(this.absUrl(cover), aspect)
      if (!tex) {
        console.warn('[RoomGallery] AI 封面贴图加载失败，相框保持空框')
        return false
      }
      const node = this.putPhoto(frame, tex.tex)
      if (!node) return false
      this._photoNode = node
      this._photoTex = tex.tex
      this._photoMat = node.getComponent(MeshRenderer)?.material as Material
      console.log('[RoomGallery] 相框已挂上 AI 封面')
      return true
    } catch (e) {
      console.warn('[RoomGallery] 相框贴图失败:', e)
      return false
    }
  }

  /**
   * 绝对地址：后端给的 /uploads/xxx 在「同源部署」时直接可用；
   * 编辑器预览 / dev（iframe 在 5173、后端在 8787）时必须补上 API 主机。
   */
  private static absUrl(u: string): string {
    const s = String(u || '')
    if (!s) return ''
    if (/^(https?:|data:|blob:)/i.test(s)) return s
    if (!s.startsWith('/')) return s
    const base = Net.getQuery().apiBase || ''
    return base ? base.replace(/\/$/, '') + s : s
  }

  /**
   * 相框「画面」的宽高比（宽 / 高），用来决定照片怎么裁。
   * 取不到包围盒时返回 0（调用方会退化成不裁）。
   */
  private static frameAspect(frame: Node): number {
    const f = faceOf(frame, this._cam)
    if (!f || !(f.planeV > 1e-4)) return 0
    return f.planeU / f.planeV
  }

  /**
   * 在模型**朝向相机的那一面**贴一张照片面片，并**铺满**内侧画面区。
   *
   * 做法（和上一版的区别，改之前务必看）：
   *   1) 用**世界空间** AABB 算盒子 —— 模型自身带 +90°X 旋转，局部盒子的 Y 其实是厚度，
   *      按局部 Y 当高度会得到一条细缝（这就是上一版"照片没贴上"的真正原因）。
   *   2) 三根轴里**最薄的那根** = 相框法线；相机在哪一侧就贴哪一面。
   *   3) ★ 改成 **cover**：贴图在 loadTexture 里已经按内框比例裁好，这里直接铺满
   *      planeU × planeV（乘 PHOTO_FILL）。原来的 contain 会让 16:9 的图在方相框里
   *      变成"中间一条"，用户反馈"没铺满相框"就是这个。
   *   4) 用 setWorldPosition / setWorldRotation / setWorldScale 定位，父节点怎么旋转缩放
   *      都不影响（setWorldScale 会按父级世界轴长折算，比手算 worldScale 稳）。
   */
  private static putPhoto(frame: Node, tex: Texture2D): Node | null {
    const f = faceOf(frame, this._cam)
    if (!f) {
      console.warn('[RoomGallery] 取不到相框包围盒，放弃贴照片')
      return null
    }
    const { center, half, ext, axis, planeU, planeV, side } = f

    // 贴面中心（世界坐标）：AABB 中心沿法线推到对应那一面，再外移一点防 Z-fighting
    const face = center.clone()
    const out = Math.max(FACE_OUTSET, ext[axis] * 0.06)
    if (axis === 0) face.x += side * (half.x + out)
    else if (axis === 1) face.y += side * (half.y + out)
    else face.z += side * (half.z + out)

    // cover：图已按 planeU/planeV 的比例裁好，这里直接铺满整块内框
    const worldW = planeU * PHOTO_FILL
    const worldH = planeV * PHOTO_FILL

    const mat = new Material()
    let ok = false
    try {
      // technique 0 = opaque：照片是实心的，不需要透明混合，还能省下排序开销
      mat.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } })
      ok = true
    } catch (e) {
      console.warn('[RoomGallery] 照片材质创建失败:', e)
    }
    if (!ok) return null
    mat.setProperty('mainTexture', tex)
    // 显式给纯白：unlit 的 color 参与乘法，不给的话默认是黑会整片发暗
    mat.setProperty('mainColor', new Color(255, 255, 255, 255))

    const node = new Node('PhotoFace')
    node.parent = frame

    // 世界朝向：让面片的 +Z 法线指向 side 那一侧，同时保证「上」仍是世界 +Y
    if (axis === 0) node.setWorldRotation(quatFromEuler(0, side > 0 ? 90 : -90, 0))
    else if (axis === 1) node.setWorldRotation(quatFromEuler(side > 0 ? -90 : 90, 0, 0))
    else node.setWorldRotation(quatFromEuler(0, side > 0 ? 0 : 180, 0))

    node.setWorldPosition(face)
    // ★ 用 setWorldScale（而不是 setScale + 手除 worldScale）：父节点可能带旋转，
    //   手除会把宽高算到别的轴上（相框挂在 +90°X 的子节点下就会宽高互换）。
    node.setWorldScale(worldW, worldH, 1)

    const mr = node.addComponent(MeshRenderer)
    mr.mesh = utils.createMesh(primitives.quad())
    mr.material = mat
    console.log(
      `[RoomGallery] 照片面片: ${worldW.toFixed(3)}x${worldH.toFixed(3)} 世界单位, ` +
        `法线轴=${'XYZ'[axis]} 侧面=${side > 0 ? '+' : '-'}`,
    )
    return node
  }
}
