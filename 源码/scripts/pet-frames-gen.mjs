// 实测每张宠物素材的逐帧裁剪窗口, 生成 src/data/petFrames.js, 并输出逐帧拼接验证图
//
// 为什么要逐张实测: 换色素材虽然构图一致, 但画布尺寸、帧落位、甚至同一动作的行高
// 都有 ±10px 抖动, 只按「橘猫基准网格等比换算」会切掉耳尖或尾巴。
//
// 为什么不能再用「相邻帧中点」当搜索边界(旧做法的坑):
//   有些素材里相邻帧的猫身贴得比中点还近(三花猫 walkL 的第 3/4 帧重叠 6px), 中点当硬边界
//   会同时造成两种可见 bug —— 自己的猫被切掉一条、隔壁帧的猫毛漏进当前窗口。
//   所以改成: 全图连通块标注 -> 归属到 (行, 帧) -> 合并块按「最细腰」切开 ->
//   再以「错配像素数最少」为目标优化行与行之间、帧与帧之间的切分线,
//   目标是任何窗口内都不出现别帧像素, 也不切掉自家猫。
//
// 用法: node scripts/pet-frames-gen.mjs
// 产物: src/data/petFrames.js + .sheetcheck/pf-*.png(逐帧拼接图, 用于目视核对)
import sharp from 'sharp'
import fs from 'node:fs'

// 橘猫素材(1536x2288)的手工帧表: 只作为"大致定位"的先验, 不再当作硬边界
const PRIOR = [
  { y: [5, 203], f: [[21, 170], [213, 363], [407, 554], [603, 748], [790, 938], [983, 1127], [1173, 1322]] },
  { y: [226, 399], f: [[5, 180], [197, 371], [390, 571], [582, 755], [774, 948], [966, 1139], [1158, 1333], [1349, 1526]] },
  { y: [446, 594], f: [[5, 185], [201, 377], [395, 570], [585, 763], [781, 954], [972, 1146], [1165, 1338], [1349, 1531]] },
  { y: [629, 827], f: [[18, 172], [210, 365], [403, 556], [595, 749]] },
  { y: [837, 1034], f: [[9, 186], [199, 378], [400, 562], [582, 763], [776, 954]] },
  { y: [1045, 1243], f: [[23, 167], [210, 364], [389, 570], [581, 762], [776, 955], [981, 1131], [1175, 1321], [1365, 1514]] },
  { y: [1253, 1451], f: [[20, 171], [210, 364], [405, 554], [603, 739], [790, 940], [981, 1131]] },
  { y: [1461, 1659], f: [[25, 169], [219, 357], [402, 562], [593, 762], [803, 936], [982, 1132]] },
  { y: [1669, 1867], f: [[21, 171], [213, 363], [408, 554], [586, 756], [797, 934], [983, 1128]] },
  { y: [1877, 2075], f: [[28, 165], [224, 354], [418, 548], [610, 739], [802, 931], [997, 1124], [1189, 1318], [1382, 1508]] },
  { y: [2098, 2283], f: [[25, 165], [214, 352], [410, 542], [601, 738], [796, 928], [989, 1118], [1183, 1308], [1375, 1500]] },
]
const BASE_W = 1536
const BASE_H = 2288

const sheets = [
  ['橘猫', 'src/assets/spritesheet.webp'],
  ['三花猫', 'src/assets/cat-calico.webp'],
  ['虎斑猫', 'src/assets/cat-tabby.webp'],
  ['黑白猫', 'src/assets/cat-tuxedo.webp'],
  ['白猫', 'src/assets/cat-white.webp'],
]

// 逐帧拼接图的输出文件名(中文名做文件名容易出幺蛾子, 统一给个英文简写)
const SLUG = {
  橘猫: 'orange',
  三花猫: 'calico',
  虎斑猫: 'tabby',
  黑白猫: 'tuxedo',
  白猫: 'white',
}

const PAD = 26 // 先验窗口外允许外扩的像素(判定帧归属用)
const MARGIN = 1 // 包围盒外留的像素
const MIN_BLOB = 20 // 忽略的小碎块
const ANCHOR_AREA = 1200 // 面积达到这个量级才算"主体块", 用作小碎块的归属锚点
const ALPHA_FLOOR = 24 // 判定「猫身」的 alpha 下限
const WAIST_WIN = 22 // 合并块「掐腰」在分界线两侧的搜索半宽
const CUT_WIN = 26 // 帧间/行间切分线在中心附近的搜索半宽
const ROW_OVERLAP_MIN = 20 // 连通块与某行至少要相交这么多像素高, 才算真的跨到那一行
const ROW_OVERLAP_RATIO = 0.25 // 或者相交高度达到该行行高的这个比例

const result = {}
const log = []

for (const [name, path] of sheets) {
  const meta = await sharp(path).metadata()
  const W = meta.width
  const H = meta.height
  const N = W * H
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const C = info.channels
  const solid = new Uint8Array(N)
  for (let p = 0; p < N; p++) solid[p] = data[p * C + 3] > ALPHA_FLOOR ? 1 : 0

  // ---- 1) 全图连通块标注 ----
  const lab = new Int32Array(N).fill(-1)
  const blobs = []
  const stack = []
  for (let p0 = 0; p0 < N; p0++) {
    if (lab[p0] !== -1 || !solid[p0]) continue
    const id = blobs.length
    let x0 = W
    let x1 = -1
    let y0 = H
    let y1 = -1
    let area = 0
    let sx = 0
    let sy = 0
    stack.length = 0
    stack.push(p0)
    lab[p0] = id
    while (stack.length) {
      const q = stack.pop()
      const qx = q % W
      const qy = (q - qx) / W
      area++
      sx += qx
      sy += qy
      if (qx < x0) x0 = qx
      if (qx > x1) x1 = qx
      if (qy < y0) y0 = qy
      if (qy > y1) y1 = qy
      if (qx > 0 && lab[q - 1] === -1 && solid[q - 1]) { lab[q - 1] = id; stack.push(q - 1) }
      if (qx < W - 1 && lab[q + 1] === -1 && solid[q + 1]) { lab[q + 1] = id; stack.push(q + 1) }
      if (qy > 0 && lab[q - W] === -1 && solid[q - W]) { lab[q - W] = id; stack.push(q - W) }
      if (qy < H - 1 && lab[q + W] === -1 && solid[q + W]) { lab[q + W] = id; stack.push(q + W) }
    }
    blobs.push({ x0, x1, y0, y1, area, cx: sx / area, cy: sy / area })
  }

  // ---- 2) 先验网格(换算到本素材坐标) ----
  const sx = W / BASE_W
  const sy = H / BASE_H
  const pRows = PRIOR.map((r) => ({
    y: [Math.round(r.y[0] * sy), Math.round(r.y[1] * sy)],
    f: r.f.map(([a, b]) => [Math.round(a * sx), Math.round(b * sx)]),
  }))
  const cyOf = pRows.map((r) => (r.y[0] + r.y[1]) / 2)
  const cxOf = pRows.map((r) => r.f.map(([a, b]) => (a + b) / 2))

  // ---- 3) 连通块 -> 行 (按质心最近) ----
  const blobRow = new Int32Array(blobs.length).fill(-1)
  const kept = []
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i]
    if (b.area < MIN_BLOB) continue
    let best = 0
    for (let r = 1; r < cyOf.length; r++) if (Math.abs(b.cy - cyOf[r]) < Math.abs(b.cy - cyOf[best])) best = r
    blobRow[i] = best
    kept.push(i)
  }

  // ---- 3.5) 跨行的合并块先按 y 切开 ----
  // 光靠质心归行是不够的: 有些素材相邻两行的猫在竖直方向是粘住的
  // (白猫 row6/row7 直接粘成一块 19192px 的连通块), 整块归给质心所在行,
  // 会把另一行的猫整只吞进去 —— 表现就是某帧「漏入上万像素」而邻帧「整只被切掉」。
  // 这里按「相邻行先验中心之间的最细腰」把它切开, 每段各归各的行。
  const rowSegs = new Array(blobs.length).fill(null)
  const rowCountIn = (i, yA, yB) => {
    const b = blobs[i]
    const cnt = new Int32Array(H)
    for (let y = Math.max(0, yA); y <= Math.min(H - 1, yB); y++) {
      const base = y * W
      for (let x = b.x0; x <= b.x1; x++) if (lab[base + x] === i) cnt[y]++
    }
    return cnt
  }
  for (const i of kept) {
    const b = blobs[i]
    const rows = []
    // 判据: 块区间与行区间的**相交高度**够大才算真跨行。
    // 两种极端都踩过:
    //   ① 只看「行中心是否落在块的 bbox 内」→ 漏掉搭边粘连。白猫 #57
    //      bbox y=[818,1093] 把 row6/row7 两只猫粘成 19212px 的整块,
    //      它的质心落在 row7, 于是 row6 那只猫整只被吞(row6 漏入上万 px)。
    //   ② 只看「有交集就算」→ 太激进。普通的猫尾巴尖也会搭到邻行 1px,
    //      被误判成跨行后一切就散架(实测三花/虎斑从 0 漏入变成四处漏入,
    //      内容包围盒还被撑到 280/293px 宽)。
    // 所以取中间: 相交高度 >= 行高的 ROW_OVERLAP_RATIO 且 >= ROW_OVERLAP_MIN。
    for (let r = 0; r < pRows.length; r++) {
      const a = Math.max(b.y0, pRows[r].y[0])
      const z = Math.min(b.y1, pRows[r].y[1])
      const ov = z - a + 1
      const need = Math.max(ROW_OVERLAP_MIN, (pRows[r].y[1] - pRows[r].y[0] + 1) * ROW_OVERLAP_RATIO)
      if (ov >= need) rows.push(r)
    }
    if (rows.length <= 1) {
      rowSegs[i] = [{ y0: b.y0, y1: b.y1, row: blobRow[i] }]
      continue
    }
    const cnt = rowCountIn(i, b.y0, b.y1)
    const cuts = []
    for (let k = 0; k + 1 < rows.length; k++) {
      const m = Math.round((cyOf[rows[k]] + cyOf[rows[k + 1]]) / 2)
      let bestY = m
      let bestV = Infinity
      for (let y = Math.max(b.y0, m - WAIST_WIN); y <= Math.min(b.y1, m + WAIST_WIN); y++) {
        const v = cnt[y]
        if (v < bestV || (v === bestV && Math.abs(y - m) < Math.abs(bestY - m))) {
          bestV = v
          bestY = y
        }
      }
      cuts.push(bestY)
    }
    const segs = []
    let y = b.y0
    for (let k = 0; k < rows.length; k++) {
      const end = k < cuts.length ? cuts[k] : b.y1
      // 每段要算自己 y 范围内的**实际列范围**, 不能沿用整块的 x0..x1:
      // 切开后上下两半的猫在 x 上可能差很远(比如上半在列 130、下半在列 900),
      // 沿用整块宽度去数「最细腰」会把两个空档都算进来, 切点乱跑,
      // 结果某帧的包围盒被撑到整行宽(内容宽度从 133 炸到 280 就是这个)。
      let sx0 = W
      let sx1 = 0
      for (let yy = y; yy <= end; yy++) {
        const base = yy * W
        for (let x = b.x0; x <= b.x1; x++) {
          if (lab[base + x] === i) {
            if (x < sx0) sx0 = x
            if (x > sx1) sx1 = x
          }
        }
      }
      if (sx1 < sx0) {
        sx0 = b.x0
        sx1 = b.x1
      }
      segs.push({ y0: y, y1: end, row: rows[k], x0: sx0, x1: sx1 })
      y = end + 1
    }
    rowSegs[i] = segs
  }

  // ---- 4) 行内: 连通块 -> 帧; 跨帧的合并块按「最细腰」切开 ----
  // parts[i] = [{ y0, y1, lo, hi, row, frame }] (该连通块的归属分段, 可能同时跨行和跨帧)
  const parts = new Array(blobs.length).fill(null)
  const colCountIn = (i, lo, hi, yA, yB) => {
    const cnt = new Int32Array(W)
    for (let y = Math.max(0, yA); y <= Math.min(H - 1, yB); y++) {
      const base = y * W
      for (let x = lo; x <= hi; x++) if (lab[base + x] === i) cnt[x]++
    }
    return cnt
  }
  const candFrames = (i, row) => {
    const b = blobs[i]
    const out = []
    pRows[row].f.forEach(([a, b2], fi) => {
      if (b.x1 >= a - PAD && b.x0 <= b2 + PAD) out.push(fi)
    })
    if (!out.length) {
      let best = 0
      cxOf[row].forEach((c, fi) => {
        if (Math.abs(b.cx - c) < Math.abs(b.cx - cxOf[row][best])) best = fi
      })
      out.push(best)
    }
    return out
  }
  const splitBlob = (i, lo, hi, cands, depth, yA, yB, row) => {
    // 兜底: 没有可切的分界线时, 归给"先验中心离本段中心最近"的那一帧。
    // 千万不能取 cands[0] —— 候选会因为 ±PAD 外扩而包含两格外的先验,
    // 取序号最小的会把整行归属错位一帧(踩过这个坑)。
    const nearest = () => {
      const mid = (lo + hi) / 2
      let best = cands[0] ?? 0
      let bestD = Infinity
      for (const f of cands) {
        const d = Math.abs(cxOf[row][f] - mid)
        if (d < bestD) {
          bestD = d
          best = f
        }
      }
      return best
    }
    if (cands.length <= 1 || depth > 6) return [{ lo, hi, frame: cands[0] ?? 0 }]
    for (let k = 0; k + 1 < cands.length; k++) {
      const m = Math.round((cxOf[row][cands[k]] + cxOf[row][cands[k + 1]]) / 2)
      if (m <= lo || m >= hi) continue
      const cnt = colCountIn(i, lo, hi, yA, yB)
      let bestX = m
      let bestV = Infinity
      for (let x = Math.max(lo, m - WAIST_WIN); x <= Math.min(hi, m + WAIST_WIN); x++) {
        const v = cnt[x]
        if (v < bestV || (v === bestV && Math.abs(x - m) < Math.abs(bestX - m))) {
          bestV = v
          bestX = x
        }
      }
      const left = cands.filter((f) => cxOf[row][f] < bestX + 1)
      const right = cands.filter((f) => cxOf[row][f] > bestX - 1)
      return [
        ...splitBlob(i, lo, bestX, left.length ? left : [cands[k]], depth + 1, yA, yB, row),
        ...splitBlob(i, bestX + 1, hi, right.length ? right : [cands[k + 1]], depth + 1, yA, yB, row),
      ]
    }
    return [{ lo, hi, frame: nearest() }]
  }
  for (const i of kept) {
    const b = blobs[i]
    parts[i] = []
    for (const seg of rowSegs[i]) {
      const x0 = seg.x0 ?? b.x0
      const x1 = seg.x1 ?? b.x1
      const cands = candFrames(i, seg.row)
      for (const s of splitBlob(i, x0, x1, cands, 0, seg.y0, seg.y1, seg.row)) {
        parts[i].push({ y0: seg.y0, y1: seg.y1, row: seg.row, lo: s.lo, hi: s.hi, frame: s.frame })
      }
    }
  }
  const mergedRows = kept.filter((i) => rowSegs[i].length > 1).length
  if (mergedRows) log.push(`  ${name}: 纵向粘连被切开的块 ${mergedRows} 个`)

  // 小碎块(远端脱离的尾尖/噪点)按最近的"主体块分段"归属, 离得太远的直接丢弃。
  // 注意: 主体块可能被掐腰切成多段, 必须取"离碎块最近的那一段"的帧号,
  // 拿第一段会张冠李戴, 把某帧的包围盒撑到整行宽(踩过这个坑)。
  const rowAnchors = pRows.map(() => [])
  for (const i of kept) {
    if (blobs[i].area < ANCHOR_AREA) continue
    for (const seg of parts[i]) rowAnchors[seg.row].push(seg)
  }
  const segGap = (seg, b) => Math.max(0, Math.max(seg.lo - b.x1, b.x0 - seg.hi))
  let dropped = 0
  for (const i of kept) {
    const b = blobs[i]
    if (b.area >= ANCHOR_AREA) continue
    let bestGap = Infinity
    let bestOff = Infinity
    let bestFrame = -1
    for (const seg of rowAnchors[blobRow[i]]) {
      const g = segGap(seg, b)
      const off = Math.abs((seg.lo + seg.hi) / 2 - b.cx)
      if (g < bestGap || (g === bestGap && off < bestOff)) {
        bestGap = g
        bestOff = off
        bestFrame = seg.frame
      }
    }
    if (bestFrame < 0 || bestGap > 40) {
      parts[i] = null
      dropped++
    } else {
      parts[i] = [{ y0: b.y0, y1: b.y1, row: blobRow[i], lo: b.x0, hi: b.x1, frame: bestFrame }]
    }
  }
  const tiny = blobs.filter((b) => b.area < MIN_BLOB).length
  log.push(`  ${name}: 连通块 ${blobs.length} 个 -> 忽略噪声 ${tiny} 个, 丢弃孤立碎块 ${dropped} 个`)

  // ---- 5) 归属图: owner[p] = 行*32+帧; status: 0=透明 1=已归属 2=噪声(不参与判定) ----
  const owner = new Int16Array(N).fill(-1)
  const status = new Uint8Array(N)
  for (let p = 0; p < N; p++) {
    if (!solid[p]) continue
    const i = lab[p]
    const pt = parts[i]
    if (!pt || !pt.length) {
      status[p] = 2
      continue
    }
    const x = p % W
    const y = (p - x) / W
    // 块可能同时跨行和跨帧, 必须 (y, x) 同时命中才算归属
    let hit = null
    for (const seg of pt) {
      if (y >= seg.y0 && y <= seg.y1 && x >= seg.lo && x <= seg.hi) {
        hit = seg
        break
      }
    }
    // 兜底: 分段理论上覆盖整块, 真没命中就退给"只按 x 匹配", 别把像素标成噪声
    if (!hit) {
      for (const seg of pt) {
        if (x >= seg.lo && x <= seg.hi) {
          hit = seg
          break
        }
      }
    }
    if (!hit) {
      status[p] = 2
      continue
    }
    owner[p] = hit.row * 32 + hit.frame
    status[p] = 1
  }

  const nF = pRows.map((r) => r.f.length)
  const rowKey = (r) => r * 32
  // 每个 (行,帧) 的包围盒
  const box = pRows.map((r, ri) =>
    r.f.map(() => ({ x0: W, x1: -1, y0: H, y1: -1, n: 0 }))
  )
  for (let p = 0; p < N; p++) {
    const o = owner[p]
    if (o < 0) continue
    const ri = o >> 5
    const fi = o & 31
    const x = p % W
    const y = (p - x) / W
    const b = box[ri][fi]
    if (x < b.x0) b.x0 = x
    if (x > b.x1) b.x1 = x
    if (y < b.y0) b.y0 = y
    if (y > b.y1) b.y1 = y
    b.n++
  }

  // 窗口初值 = 包围盒 ± MARGIN; 行 y 带 = 该行所有帧包围盒的并集 ± MARGIN
  // 内容尺寸(裁切前的真实包围盒)单独记下来: 切分线会把窗口扩成整格宽,
  // 窗口宽不再等于猫身宽, 拿窗口折算 SCALE 会让不同素材的猫大小差 5%。
  let contentW = 0
  let contentH = 0
  for (const bs of box)
    for (const b of bs)
      if (b.n) {
        contentW = Math.max(contentW, b.x1 - b.x0 + 1)
        contentH = Math.max(contentH, b.y1 - b.y0 + 1)
      }
  const win = pRows.map((r, ri) =>
    r.f.map((_p, fi) => {
      const b = box[ri][fi]
      if (b.n === 0) return [0, 0, 'EMPTY']
      return [Math.max(0, b.x0 - MARGIN), Math.min(W - 1, b.x1 + MARGIN)]
    })
  )
  const band = pRows.map((_r, ri) => {
    let y0 = H
    let y1 = -1
    for (const b of box[ri])
      if (b.n) {
        y0 = Math.min(y0, b.y0)
        y1 = Math.max(y1, b.y1)
      }
    return [Math.max(0, y0 - MARGIN), Math.min(H - 1, y1 + MARGIN)]
  })
  // 行间切分的"自然分界"(两条带中间的空档), 切点只在这个位置附近微调, 避免乱跑
  const naturalY = band.map((_b, ri) =>
    ri + 1 < band.length ? Math.floor((band[ri][1] + band[ri + 1][0]) / 2) : band[ri][1]
  )

  // ---- 6) 帧间 x 切分: 让两个窗口里的"错配像素"(切到自家 / 漏进别帧)最少 ----
  for (let ri = 0; ri < pRows.length; ri++) {
    for (let fi = 0; fi + 1 < nF[ri]; fi++) {
      const [li] = win[ri][fi]
      const [, rj] = win[ri][fi + 1]
      if (rj <= li) continue
      // 列统计: 该行 y 带内, 每列"属于帧 fi/帧 fi+1/其它"的像素数
      const ownA = new Int32Array(W + 1)
      const ownB = new Int32Array(W + 1)
      const all = new Int32Array(W + 1)
      const [ya, yb] = [Math.min(band[ri][0], H - 1), band[ri][1]]
      for (let y = ya; y <= yb; y++) {
        const base = y * W
        for (let x = li; x <= rj; x++) {
          if (status[base + x] !== 1) continue
          all[x]++
          const o = owner[base + x]
          if (o === rowKey(ri) + fi) ownA[x]++
          else if (o === rowKey(ri) + fi + 1) ownB[x]++
        }
      }
      const preAll = [0]
      const preA = [0]
      const preB = [0]
      for (let x = 0; x <= W; x++) {
        preAll[x + 1] = preAll[x] + all[x]
        preA[x + 1] = preA[x] + ownA[x]
        preB[x + 1] = preB[x] + ownB[x]
      }
      const sum = (pre, a, b) => pre[b + 1] - pre[a]
      const mid = Math.round((cxOf[ri][fi] + cxOf[ri][fi + 1]) / 2)
      let bestC = -1
      let bestV = Infinity
      const lo = Math.max(li, mid - CUT_WIN)
      const hi = Math.min(rj - 1, mid + CUT_WIN)
      for (let c = lo; c <= hi; c++) {
        // 左窗 [li, c]: 漏进来的(非 fi) + 右窗 [c+1, rj]: 漏进来的(非 fi+1)
        const leakL = sum(preAll, li, c) - sum(preA, li, c)
        const leakR = sum(preAll, c + 1, rj) - sum(preB, c + 1, rj)
        // 自家被切掉的部分(在窗口外)
        const cutA = box[ri][fi].n - sum(preA, li, Math.min(c, win[ri][fi][1]))
        const cutB = box[ri][fi + 1].n - sum(preB, Math.max(c + 1, win[ri][fi + 1][0]), rj)
        const v = (leakL + leakR) * 4 + cutA + cutB
        if (v < bestV || (v === bestV && Math.abs(c - mid) < Math.abs(bestC - mid))) {
          bestV = v
          bestC = c
        }
      }
      if (bestC >= 0) {
        win[ri][fi][1] = bestC
        win[ri][fi + 1][0] = bestC + 1
      }
    }
  }

  // ---- 7) 行间 y 切分: 同样的目标(不漏别人 / 不切自己) ----
  for (let ri = 0; ri + 1 < pRows.length; ri++) {
    const rn = ri + 1
    const [b0, b1] = band[ri]
    const [c0, c1] = band[rn]
    // 切点 y 的含义: 本行带 = [b0, y], 邻行带 = [y+1, c1]
    // 只在"自然分界"附近 ±45px 内微调, 往外会开始啃到自家猫
    const natural = naturalY[ri]
    const lo = Math.max(b0, natural - 45)
    const hi = Math.min(c1 - 1, natural + 45)
    if (hi <= lo) {
      // 两条带完全错开(或只剩一像素), 无需切分
      if (band[ri][1] >= band[rn][0] && band[rn][0] - 1 > band[ri][0]) {
        band[ri][1] = band[rn][0] - 1
      }
      continue
    }
    // 逐 y 统计: 本行窗口内的像素归属 / 邻行窗口内的像素归属
    const inWin = (r, x) => win[r].some(([a, b]) => x >= a && x <= b)
    const ownI = new Int32Array(H + 1)
    const forI = new Int32Array(H + 1) // 本行窗口里出现、但不属于本行的像素
    const ownJ = new Int32Array(H + 1)
    const forJ = new Int32Array(H + 1)
    for (let y = 0; y < H; y++) {
      const base = y * W
      for (let x = 0; x < W; x++) {
        if (status[base + x] !== 1) continue
        const o = owner[base + x]
        const or = o < 0 ? -1 : o >> 5
        if (inWin(ri, x)) {
          if (or === ri) ownI[y]++
          else forI[y]++
        }
        if (inWin(rn, x)) {
          if (or === rn) ownJ[y]++
          else forJ[y]++
        }
      }
    }
    const pre = (a) => {
      const p = [0]
      for (let y = 0; y <= H; y++) p[y + 1] = p[y] + a[y]
      return p
    }
    const pOwnI = pre(ownI)
    const pForI = pre(forI)
    const pOwnJ = pre(ownJ)
    const pForJ = pre(forJ)
    const s = (p, a, b) => (b < a ? 0 : p[b + 1] - p[a])
    let bestY = -1
    let bestV = Infinity
    for (let y = lo; y <= hi; y++) {
      // 本行带 [b0, y]; 邻行带 [y+1, c1]
      const leakI = s(pForI, b0, y)
      const leakJ = s(pForJ, y + 1, c1)
      const cutI = s(pOwnI, y + 1, b1)
      const cutJ = s(pOwnJ, c0, y)
      // 漏进来的别家像素比"自家被切"更刺眼, 权重 4; 同代价时取最靠近自然分界的切点
      const v = (leakI + leakJ) * 4 + cutI + cutJ
      if (v < bestV || (v === bestV && Math.abs(y - natural) < Math.abs(bestY - natural))) {
        bestV = v
        bestY = y
      }
    }
    if (bestY >= 0) {
      band[ri][1] = bestY
      band[rn][0] = bestY + 1
    }
  }

  // ---- 8) 复核: 窗口内是否有别帧像素 / 自家像素被切掉多少 ----
  const leaks = []
  let cutTotal = 0
  for (let ri = 0; ri < pRows.length; ri++) {
    for (let fi = 0; fi < nF[ri]; fi++) {
      const [a, b] = win[ri][fi]
      const [ya, yb] = band[ri]
      let bad = 0
      let mineIn = 0
      for (let y = ya; y <= yb; y++) {
        const base = y * W
        for (let x = a; x <= b; x++) {
          if (status[base + x] !== 1) continue
          const o = owner[base + x]
          if (o === rowKey(ri) + fi) mineIn++
          else bad++
        }
      }
      const cut = box[ri][fi].n - mineIn
      cutTotal += Math.max(0, cut)
      if (bad > 0 || cut > 0) leaks.push(`row${ri}帧${fi} 漏入${bad}px 切掉${cut}px`)
    }
  }
  const badRows = leaks.filter((s) => !/漏入0px/.test(s))
  log.push(
    `  ${name} ${W}x${H}: ${blobs.length} 块, 窗口 ${win.map((r) => r.length).join('/')}` +
      `  猫身内容 ${contentW}x${contentH}  漏入异常 ${leaks.filter((s) => !s.includes('漏入0px')).length} 处, 切掉合计 ${cutTotal}px`
  )
  for (const s of leaks) log.push(`      ${s}`)

  result[name] = { w: W, h: H, cw: contentW, ch: contentH, rows: pRows.map((_r, ri) => ({ y: band[ri], f: win[ri] })) }
  if (badRows.length) log.push(`  !!! ${name} 仍有漏入: ${badRows.join(' ; ')}`)

  // ---- 逐帧拼接验证图: 每帧多取 4px 边距并画红框(红框 = 应用里真正显示的范围) ----
  const CELL_PAD = 4
  const maxW = Math.max(...win.flat().map(([a, b]) => b - a + 1)) + CELL_PAD * 2
  const cellH = Math.max(...band.map(([a, b]) => b - a + 1)) + CELL_PAD * 2
  const cols = Math.max(...nF)
  const comps = []
  for (let ri = 0; ri < pRows.length; ri++) {
    for (let fi = 0; fi < nF[ri]; fi++) {
      const [a, b] = win[ri][fi]
      const [ya, yb] = band[ri]
      const left = Math.max(0, a - CELL_PAD)
      const top = Math.max(0, ya - CELL_PAD)
      const w = Math.min(W, b + 1 + CELL_PAD) - left
      const h = Math.min(H, yb + 1 + CELL_PAD) - top
      if (w <= 0 || h <= 0) continue
      const buf = await sharp(path).extract({ left, top, width: w, height: h }).ensureAlpha().raw().toBuffer()
      const cc = 4
      const mark = (x, y, rgb) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return
        const p = (y * w + x) * cc
        buf[p] = rgb[0]
        buf[p + 1] = rgb[1]
        buf[p + 2] = rgb[2]
        buf[p + 3] = 255
      }
      // 红框: 窗口边界在放大图里的位置
      const wx0 = a - left
      const wy0 = ya - top
      const wx1 = b - left
      const wy1 = yb - top
      for (let x = wx0; x <= wx1; x++) {
        mark(x, wy0, [225, 40, 40])
        mark(x, wy1, [225, 40, 40])
      }
      for (let y = wy0; y <= wy1; y++) {
        mark(wx0, y, [225, 40, 40])
        mark(wx1, y, [225, 40, 40])
      }
      const cell = await sharp({
        create: { width: w + CELL_PAD * 2, height: cellH, channels: 4, background: { r: 246, g: 242, b: 236, alpha: 1 } },
      })
        .composite([{ input: await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), left: CELL_PAD, top: CELL_PAD }])
        .png()
        .toBuffer()
      comps.push({ input: cell, left: fi * (maxW + 2), top: ri * (cellH + 2) })
    }
  }
  const slug = SLUG[name] || name
  fs.mkdirSync('.sheetcheck', { recursive: true })
  await sharp({
    create: { width: cols * (maxW + 2), height: pRows.length * (cellH + 2), channels: 4, background: { r: 250, g: 248, b: 245, alpha: 1 } },
  })
    .composite(comps)
    .png()
    .toFile(`.sheetcheck/pf-${slug}.png`)
}

// ---- 输出 JS 数据文件 ----
const lines = []
lines.push('// 宠物精灵图的逐帧裁剪窗口(素材像素坐标)')
lines.push('// 由素材实测生成(见 scripts/pet-frames-gen.mjs): 全图连通块标注后归属到 (行,帧),')
lines.push('// 合并块按「最细腰」切开, 再用「错配像素最少」优化行/帧切分线。')
lines.push('// 各素材的画布/排版有 ±10px 抖动, 靠等比换算会切掉耳尖或尾巴, 所以逐张实测。')
lines.push('// 关键: 相邻帧的猫身可能贴得比中点还近, 所以窗口边界不能简单取中点。')
lines.push('')
lines.push('export const PET_FRAMES = {')
for (const [name, v] of Object.entries(result)) {
  lines.push(`  ${name}: [`)
  for (const r of v.rows) {
    lines.push(`    { y: [${r.y[0]}, ${r.y[1]}], f: [${r.f.map(([a, b]) => `[${a}, ${b}]`).join(', ')}] },`)
  }
  lines.push('  ],')
}
lines.push('}')
lines.push('')
lines.push('// 各素材的"猫身内容"最大尺寸(裁切前的真实包围盒)')
lines.push('// 窗口边界是整格宽(为了相邻帧之间留出透明间隔), 不反映猫身大小,')
lines.push('// 折算显示缩放必须用这个尺寸, 否则不同素材的猫会差 5% 大。')
lines.push('export const PET_CONTENT = {')
for (const [name, v] of Object.entries(result)) {
  lines.push(`  ${name}: { w: ${v.cw}, h: ${v.ch} },`)
}
lines.push('}')
lines.push('')
fs.writeFileSync('src/data/petFrames.js', lines.join('\n'))

log.push('已写 src/data/petFrames.js')
fs.writeFileSync('.pet-frames-gen.txt', log.join('\n') + '\n')
console.log('done')
