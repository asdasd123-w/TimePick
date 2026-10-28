// PropGlow.ts —— 物品的「灯光呼吸」高亮
//
// 需求（第二版）：高亮要像**灯光在呼吸**，但**不要太明显、不要覆盖物体**。
//   上一版是缩放家具本体做呼吸 —— 那会让物体变形、看起来像"被盖住"，已被否掉。
//
// 做法：在物品位置叠一张**柔光环**贴图（圆心完全透明，只在半径中段亮一圈），
//   竖着朝向相机，每帧轻微缩放 + 明暗呼吸。
//
// ★ 两个必须的取舍：
//   1) 不用平铺在台面上的环：相机几乎与桌面齐平，平环会被压成一条线，几乎看不见。
//   2) 必须关掉深度测试：竖直环的下半圈会插进桌面/隔板，开着 depthTest 就只剩半圆。
//      关掉之后整圈都在，而"圆心透明"的贴图保证物体本体不被糊住。
import {
  _decorator,
  Component,
  Node,
  Texture2D,
  Material,
  MeshRenderer,
  primitives,
  utils,
  Vec3,
  Color,
} from 'cc'

const { ccclass } = _decorator

@ccclass('PropGlow')
export class PropGlow extends Component {
  private camNode: Node | null = null
  /** 物品世界坐标（光晕以此为中心） */
  private anchor = new Vec3()
  /** 光晕基准直径（世界单位） */
  private baseSize = 0.36
  /** 各物品相位错开，呼吸不同步 */
  private phase = 0

  private _tex: Texture2D | null = null
  private _mat: Material | null = null
  private _color = new Color(255, 255, 255, 255)

  /**
   * 上一帧更新的时刻（秒）。
   *
   * ★ 为什么要降频：每个光晕的 lateUpdate 都要做 3 次 setWorld*（算世界矩阵）
   *   + 1 次 setProperty（标脏材质、重算 uniform）。房间里最多 13 件家具 + 电视机，
   *   60fps 下就是每秒几千次矩阵运算 —— 白白吃掉主线程。
   *   而呼吸周期是 1.6 秒的慢动作，**30fps 更新肉眼完全看不出差别**，
   *   这里直接把开销砍一半。UPDATE_HZ 可以往上调回 60（那样等于逐帧更新）。
   *   ⚠ 别把它当成"降帧"——游戏渲染仍是满帧，只是这一层装饰的计算频率降了。
   */
  private _lastT = -1
  private static readonly UPDATE_HZ = 30
  /**
   * 是否已经用「物品自己的包围盒」校准过位置和大小。
   *
   * ★ 为什么要校准：layout 给的 x/y/z 是**物品底下那个支撑面**的落点，不是物品中心；
   *   照它画圈会整体偏下（光圈压在隔板上、上半截才是书），而且大小只能写死。
   *   摆完之后模型的世界包围盒是有的，拿它算中心和尺寸，光圈就能正好"套住"每件物品。
   */
  private aligned = false

  init(camNode: Node | null, anchor: Vec3, size = 0.5) {
    this.camNode = camNode
    this.anchor.set(anchor)
    this.baseSize = size
    this.phase = Math.random() * Math.PI * 2

    const tex = this.buildRingTexture()
    if (!tex) return

    let mat = new Material()
    try {
      mat.initialize({
        effectName: 'builtin-unlit',
        technique: 1, // transparent：alpha 混合 + depthWrite=false
        defines: { USE_TEXTURE: true },
        // 关掉深度测试：整圈光都能看见（下半圈不会插进桌子里消失）
        states: { depthStencilState: { depthTest: false, depthWrite: false } } as any,
      })
    } catch {
      mat = new Material()
      mat.initialize({ effectName: 'builtin-unlit', technique: 1, defines: { USE_TEXTURE: true } })
    }
    mat.setProperty('mainTexture', tex)

    const mr = this.node.addComponent(MeshRenderer)
    mr.mesh = utils.createMesh(primitives.quad())
    mr.material = mat

    this._tex = tex
    this._mat = mat
    this.apply(0)
  }

  lateUpdate() {
    const t = performance.now() / 1000
    // 节流到 UPDATE_HZ：两次更新之间至少要间隔 1/UPDATE_HZ 秒（留 1ms 余量兜底浮点抖动）。
    // ★ 历史坑：曾写成 `1/UPDATE_HZ - 0.05`，而 1/30≈0.033 减 0.05 是负数，
    //   导致 `t - _lastT < 负数` 永远不成立、节流形同虚设，光环每帧(60Hz)都重算——
    //   13 件家具就是每秒近 800 次矩阵运算 + 材质标脏，白白吃主线程。下面才是真 30Hz。
    const minGap = 1 / PropGlow.UPDATE_HZ - 1e-3
    if (this._lastT >= 0 && t - this._lastT < minGap) return
    this._lastT = t
    if (!this.aligned) this.alignToParent()
    this.apply(t)
  }

  /**
   * 按「父节点（= 这件家具）的世界包围盒」校准光圈的中心与直径。
   *
   * 三个必须踩过的坑（都实测过，改之前先看）：
   *   1) **不能**用 `getComponentsInChildren` 再自己过滤 —— 光圈自己的 MeshRenderer
   *      也在里面，而且它的 `model.worldBounds` 是个"没跟着节点走"的旧值（贴着原点），
   *      混进来会把光圈拉到房间中央、并撑到 1.1 米大。这里直接遍历子树并跳过自己。
   *   2) `model.worldBounds` 是**渲染时**才更新的，家具刚 instantiate 的那一帧还是空的/旧的。
   *      所以优先用 `mesh.struct.minPosition/maxPosition`（网格本地包围盒）× 节点世界矩阵，
   *      这个值一加载就有，不依赖是否渲染过。
   *   3) 家具是异步加载的，某一帧还可能什么都拿不到 —— 拿不到就不置 aligned，下一帧再试。
   */
  private alignToParent() {
    const parent = this.node.parent
    if (!parent) return
    parent.updateWorldTransform()

    const lo = new Vec3(Infinity, Infinity, Infinity)
    const hi = new Vec3(-Infinity, -Infinity, -Infinity)
    let found = false
    const acc = (x: number, y: number, z: number) => {
      lo.x = Math.min(lo.x, x)
      lo.y = Math.min(lo.y, y)
      lo.z = Math.min(lo.z, z)
      hi.x = Math.max(hi.x, x)
      hi.y = Math.max(hi.y, y)
      hi.z = Math.max(hi.z, z)
      found = true
    }
    const corner = new Vec3()
    const walk = (node: Node) => {
      const r = node.getComponent(MeshRenderer)
      if (r) {
        const st: any = r.mesh ? (r.mesh as any).struct : null
        if (st && st.minPosition && st.maxPosition) {
          node.updateWorldTransform()
          for (let i = 0; i < 8; i++) {
            corner.set(
              i & 1 ? st.maxPosition.x : st.minPosition.x,
              i & 2 ? st.maxPosition.y : st.minPosition.y,
              i & 4 ? st.maxPosition.z : st.minPosition.z,
            )
            Vec3.transformMat4(corner, corner, node.worldMatrix)
            acc(corner.x, corner.y, corner.z)
          }
        } else {
          // 退路：渲染器自己的世界包围盒（可能还没更新，靠下面的合理性检查兜住）
          const b: any = (r as any).model ? (r as any).model.worldBounds : null
          const ctr: Vec3 = b ? b.center || b._center : null
          const hf: Vec3 = b ? b.halfExtents || b._halfExtents : null
          if (ctr && hf) {
            acc(ctr.x - hf.x, ctr.y - hf.y, ctr.z - hf.z)
            acc(ctr.x + hf.x, ctr.y + hf.y, ctr.z + hf.z)
          }
        }
      }
      for (const c of node.children) walk(c)
    }
    for (const child of parent.children) {
      if (child === this.node) continue // 跳过光圈自己
      walk(child)
    }

    if (!found || !isFinite(lo.x)) return
    const cx = (lo.x + hi.x) / 2
    const cy = (lo.y + hi.y) / 2
    const cz = (lo.z + hi.z) / 2
    // 合理性检查：物品就在家具的落点上，盒子中心不可能离它太远
    const p = parent.worldPosition
    if (Math.abs(cx - p.x) > 2 || Math.abs(cz - p.z) > 2 || Math.abs(cy - p.y) > 2) return

    this.anchor.set(cx, cy, cz)
    // 直径：取水平/竖直两个方向里较大的那个再放大一点；小于传入的基准值时用基准值，
    // 免得小书的光圈缩到看不见（用户反馈过"高亮也没有"）。
    const w = Math.max(hi.x - lo.x, hi.z - lo.z)
    const h = hi.y - lo.y
    const fit = Math.max(w, h) * 1.5
    this.baseSize = Math.max(this.baseSize, Math.min(1.1, Math.max(0.3, fit)))
    this.aligned = true
  }

  private apply(t: number) {
    const wave = Math.sin(t * 1.6 + this.phase)
    // 尺寸起伏刻意压到 4%：原来 14% 会让光圈忽大忽小，隔板上相邻的几件物品
    // 的光圈会互相碰到一起（用户反馈"串在一起"）。
    const size = this.baseSize * (1 + 0.04 * wave)
    // 校准前（还不知道物品多大）先按"落点 +0.1"摆个大概位置，校准后直接用几何中心
    const y = this.aligned ? this.anchor.y : this.anchor.y + 0.1
    this.node.setWorldPosition(this.anchor.x, y, this.anchor.z)
    this.node.setWorldScale(size, size, 1)
    // 圆环是中心对称的，朝向随相机即可（不涉及左右镜像问题）
    if (this.camNode) this.node.setWorldRotation(this.camNode.worldRotation)

    // 亮度呼吸：0.36 → 0.70。
    // ★ 上一版是 0.18 → 0.42，在暖色隔板上几乎看不见（用户反馈"高亮也没有"）。
    //   这里把亮度整体提上来，同时保持 ±4% 的小幅起伏 —— 是"呼吸"不是"闪"。
    if (this._mat) {
      const a = 0.36 + 0.34 * (0.5 + 0.5 * wave)
      this._color.set(255, 234, 200, Math.round(a * 255))
      this._mat.setProperty('mainColor', this._color)
    }
  }

  onDestroy() {
    this._tex?.destroy()
    this._mat?.destroy()
    this._tex = null
    this._mat = null
  }

  /**
   * 生成柔光环贴图：
   *   圆心 0 → 半径 42% 全透明（不盖物体），
   *   50%~64% 最亮（形成一圈暖光），
   *   向外逐渐淡出到全透明（边缘不硬）。
   */
  private buildRingTexture(): Texture2D | null {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const S = 128
    canvas.width = S
    canvas.height = S

    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0.0, 'rgba(255,225,180,0)')
    g.addColorStop(0.42, 'rgba(255,225,180,0)')
    g.addColorStop(0.52, 'rgba(255,238,200,0.9)')
    g.addColorStop(0.64, 'rgba(255,215,165,0.5)')
    g.addColorStop(0.84, 'rgba(255,195,140,0.14)')
    g.addColorStop(1.0, 'rgba(255,190,130,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)

    const tex = new Texture2D()
    tex.reset({ width: S, height: S })
    tex.uploadData(canvas)
    return tex
  }
}
