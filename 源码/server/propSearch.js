// 3D 摆件的「数据检索」层（2026-10-29）
// ---------------------------------------------------------------------------
// 需求：给 3D 物品建立可检索的数据，记忆的文字**意思相近**（同义词/近义说法）
// 或**全文内容相近**（成段描述）时，就能把对应的物品放进 3D 房间。
//
// 为什么不用纯关键词 includes：
//   原来的 matchFurnitureName() 是 `text.includes(词)` 平铺扫表。它只认"列出来的那几个字"：
//   「烘焙」不会命中杯子、「加班到三点」不会命中台灯（只有"深夜"才行）、
//   「和奶奶的合影」命中相机靠的是"合影"，写成"合照"就失效了。词表越加越长，还是漏。
//
// 这里的做法（不需要任何外部服务、不花钱、可离线跑）：
//   1) 给 13 件摆件各写一份**语料**：名称 + 别名（同义物件）+ 抽象标签 + 描述句；
//   2) 中文按**二元组（bigram）**切词 —— 中文没有空格，bigram 是最稳的无词典切分；
//      英文/数字整词当 token（bug、k歌、ppt）；
//   3) 对 13 份语料建 **TF-IDF 倒排索引**，查询向量与文档向量算**余弦相似度**；
//   4) 再叠一层「字面命中」加分：整词命中别名/标签的，直接抬分（精确性优先）；
//   5) 标题权重 ×3（标题比正文更能说明"这是什么东西"）。
//
// 效果边界：这是检索，不是理解。它靠"共现的字"判断相近，所以对
//   「加班到三点，桌上那杯早就凉了」这种含多个线索的句子，会按命中最多的那类算。
//   真要语义理解还得靠 LLM —— room.js 里的 planRoomPropAI() 那条路依然保留，
//   本模块是它的**离线兜底**，也是没有配密钥时唯一可用的方案。
//
// ★ 本文件是纯函数模块（同样的输入必得同样的输出），planSpace 的幂等性靠这一点。

/** 摆件语料。furniture 必须与 sg3d 的模型文件名 / FURNITURE_WHITELIST 一致。 */
export const PROP_CATALOG = [
  {
    furniture: 'camera_my',
    name: '相机',
    aliases: ['相机', '照片', '拍照', '摄影', '合影', '合照', '相册', '胶片', '镜头', '自拍', '拍下', '快门', '底片', '影像'],
    tags: ['记忆', '怀念', '时光', '留念', '记录', '见证', '纪实', '观察', '凝视', '发现', '浪漫', '热爱生活', '讲述', '叙事', '真相', '证据', '历史', '视角', '立场', '新闻', '传媒', '记录生活', '探索'],
    desc: '把眼前的一刻留下来。拍一张合影、洗一卷胶片、翻看旧相册里的自己，照片是时间的证据，替我们记住那些回不去的日子。',
  },
  {
    furniture: 'computer',
    name: '电脑',
    aliases: ['电脑', '笔记本', '显示器', '键盘', '程序', '代码', '编程', '剪辑', '网站', '游戏机', '办公桌'],
    tags: ['编程', '代码', '游戏', '打游戏', '上网', '网站', '程序', '剪辑', '键盘', '开发', '调试', '算法', 'bug', '连接', '沟通', '信息', '知识', '创造', '远方', '梦想', '奔赴', '文明', '科技', '时代', '效率', '理性', '秩序', '互联网', '网络', '数字', '办公', '学习', '大数据', '信息化'],
    desc: '屏幕亮起来就是另一个世界。写代码、剪片子、开黑打游戏、和很远的人说上话，一台电脑把工作时间也把孤独接住了。',
  },
  {
    furniture: 'cup',
    name: '杯子',
    aliases: ['杯子', '马克杯', '咖啡', '奶茶', '热可可', '拿铁', '茶', '喝水', '水杯', '热饮', '杯子里的'],
    tags: ['温暖', '陪伴', '慰藉', '安宁', '日常', '烟火', '平淡', '接纳', '包容', '等待', '牵挂', '思念', '治愈', '初心', '人情', '相聚', '别离', '珍惜', '独处', '静心', '待客', '平凡', '烘焙', '做饭', '早餐', '深夜的热饮'],
    desc: '一杯热的东西捧在手里，人就慢慢松下来了。早上冲的咖啡、深夜泡的茶、冬天捂手的可可，喝的是水，暖的是心。',
  },
  {
    furniture: 'record',
    name: '唱片机',
    aliases: ['唱片', '黑胶', '唱片机', '音乐', '歌', '歌曲', '听歌', '歌单', '专辑', '耳机', '电台', '吉他', '钢琴', '乐队', '演唱会', '旋律'],
    tags: ['旋律', '声音', '怀旧', '情绪', '共鸣', '聆听', '诉说', '定格', '品味', '氛围', '岁月', '经典', '心声', '故事', '浪漫', '艺术', 'k歌', '唱歌', '旧时光', '回忆'],
    desc: '针一落下，屋子就有了气氛。老歌一响，某年夏天的风就回来了；一个人戴着耳机发呆，也是被音乐陪着。',
  },
  {
    furniture: 'schoolbag',
    name: '书包',
    aliases: ['书包', '背包', '行囊', '行李箱', '行李', '车票', '机票', '火车票'],
    tags: ['旅行', '旅游', '出游', '出发', '旅途', '远行', '出差', '露营', '爬山', '徒步', '车站', '机场', '火车', '航班', '在路上', '成长', '求学', '期许', '责任', '青春', '求知', '希望', '探索', '童年', '少年', '积攒', '上学', '放学', '开学'],
    desc: '背起它就往外走。上学路上的清晨、说走就走的旅行、车站里的告别，包里装的是行李，也是往前走的勇气。',
  },
  {
    furniture: 'tableLamp',
    name: '台灯',
    aliases: ['台灯', '灯', '灯光', '灯泡', '小夜灯'],
    tags: ['深夜', '夜里', '夜晚', '光明', '希望', '指引', '方向', '坚守', '清醒', '思索', '长夜', '照亮', '守护', '潜心', '理想', '力量', '信念', '微光', '独自前行', '守候', '治愈', '开灯', '关灯', '灯下', '加班', '熬夜', '失眠'],
    desc: '一盏灯陪你把夜熬完。深夜还在写东西、加班到很晚、一个人睡不着的时候，灯亮着，房间就不算空。',
  },
  {
    furniture: 'greenbook',
    name: '书',
    aliases: ['书', '书本', '书籍', '小说', '散文', '诗集', '图书馆', '书单', '笔记', '手账', '账本', '清单', '备忘录', '待办', '课本'],
    tags: ['读书', '看书', '阅读', '知识', '思想', '文明', '传承', '眼界', '启迪', '沉淀', '孤独', '真理', '想象', '自由', '精神世界', '启蒙', '求索', '感悟', '学识', '信念', '记账', '计划', '论文', '作业', '复习', '考试', '上课', '课堂', '毕业'],
    desc: '翻开一页，世界就安静了。读小说、读诗、做笔记、列计划，写论文写到天亮，纸上的字把想法沉下来，也把人从喧闹里捞出来。',
  },
  {
    furniture: 'yellowbook',
    name: '灵感本',
    aliases: ['灵感本', '灵感', '点子', '想法', '创意', '随笔', '日记', '碎碎念', '涂鸦'],
    tags: ['脑洞', '闪念', '记录想法', '构思', '设计', '创作', '一时兴起'],
    desc: '想到什么就先写下来。半句话、一个奇怪的点子、随手画的涂鸦，先记下，以后再慢慢长成东西。',
  },
  {
    furniture: 'diary',
    name: '日记本',
    aliases: ['日记', '日记本', '手记', '周记'],
    tags: ['一天', '心情', '琐事', '流水账', '睡前', '自言自语', '情绪', '倾诉'],
    desc: '今天发生了什么就写两句。不必写得好看，只是把一天放下来，合上本子睡觉。',
  },
]

// ---------------------------------------------------------------------------
// 切词：中文 bigram + 英文/数字整词
// ---------------------------------------------------------------------------
// 单字虚词没有区分度，出现在 bigram 里也会被 IDF 压到很低，这里只挡掉纯虚词 bigram。
const CJK = /[\u4e00-\u9fa5]/
const WORD = /[a-z0-9]+/g

/** 归一化：全角转半角、英文小写、去掉标点与空白 */
function normalize(text) {
  return String(text || '')
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, ' ')
    .trim()
}

/**
 * 切成 token 列表（保留重复，用于算 tf）。
 * 中文：每个连续汉字串产出**单字 + 全部二元组**；英文/数字整词。
 *
 * ★ 单字也要留：中文的"书""灯""茶"这类词单独出现时（"合上书很久没说话"），
 *   二元组里根本不会有独立的"书"，只发 bigram 就会漏配。单字权重被 IDF 压得很低
 *   （"的了在"几乎出现在所有语料里 → idf≈1），不会喧宾夺主。
 */
export function tokenize(text) {
  const s = normalize(text)
  const out = []
  for (const word of s.match(WORD) || []) out.push(word)
  // 汉字串单独处理（normalize 之后汉字之间可能有空格）
  const runs = s.match(/[\u4e00-\u9fa5]+/g) || []
  for (const run of runs) {
    for (const ch of run) out.push(ch)
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2))
  }
  return out
}

/** 语料拼成一篇"文档"：名称重复两次（提高权重），别名/标签/描述全进 */
function docTextOf(item) {
  return [item.name, item.name, ...item.aliases, ...item.tags, item.desc].join(' ')
}

// ---------------------------------------------------------------------------
// 索引：doc -> tf，全局 df -> idf
// ---------------------------------------------------------------------------
const DOCS = PROP_CATALOG.map((item) => {
  const toks = tokenize(docTextOf(item))
  const tf = new Map()
  for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1)
  return { item, tf, len: toks.length }
})

const DF = new Map()
for (const d of DOCS) {
  for (const t of d.tf.keys()) DF.set(t, (DF.get(t) || 0) + 1)
}
const N = DOCS.length
/** 平滑 IDF：出现在所有文档里的词（比如"的")idf 接近 0，天然被压掉 */
const idf = (t) => Math.log(1 + N / (1 + (DF.get(t) || 0))) + 1

// 文档向量（TF-IDF 归一化），建一次缓存
for (const d of DOCS) {
  const v = new Map()
  let sq = 0
  for (const [t, c] of d.tf) {
    const w = (1 + Math.log(c)) * idf(t)
    v.set(t, w)
    sq += w * w
  }
  const norm = Math.sqrt(sq) || 1
  for (const [t, w] of v) v.set(t, w / norm)
  d.vec = v
}

/**
 * 检索：给一段文字，返回按相近度排序的摆件。
 *
 * @param {string} text 记忆的标题 + 正文（可以只给其中一段）
 * @param {{limit?: number, title?: string}} opts title 会以 3 倍权重参与
 * @returns {{furniture: string, name: string, score: number, hits: string[]}[]}
 */
export function searchProps(text, opts = {}) {
  const limit = Number(opts.limit) || 3
  const title = String(opts.title || '')
  const body = String(text || '')
  // 查询向量：正文 tf + 标题 tf×3
  const q = new Map()
  const bump = (toks, k) => {
    for (const t of toks) q.set(t, (q.get(t) || 0) + k)
  }
  bump(tokenize(body), 1)
  if (title) bump(tokenize(title), 3)
  if (!q.size) return []

  const qv = new Map()
  let sq = 0
  for (const [t, c] of q) {
    const w = (1 + Math.log(c)) * idf(t)
    qv.set(t, w)
    sq += w * w
  }
  const qnorm = Math.sqrt(sq) || 1

  const lower = normalize(`${title} ${body}`)
  const scored = DOCS.map((d) => {
    // 余弦相似度（文档向量已归一化，这里只算点积再除以查询模）
    let dot = 0
    for (const [t, w] of qv) {
      const dw = d.vec.get(t)
      if (dw) dot += (w / qnorm) * dw
    }
    let score = dot

    // 字面命中加分：整词出现在原文里比"共享二元组"可信得多
    const hits = []
    for (const a of d.item.aliases) {
      if (a.length >= 2 && lower.includes(a)) {
        score += 0.18 + Math.min(0.12, a.length * 0.02)
        hits.push(a)
      }
    }
    for (const g of d.item.tags) {
      if (g.length >= 2 && lower.includes(g)) {
        score += 0.1
        hits.push(g)
      }
    }
    return { furniture: d.item.furniture, name: d.item.name, score, hits: [...new Set(hits)] }
  })

  scored.sort((a, b) => b.score - a.score || a.furniture.localeCompare(b.furniture))
  return scored.slice(0, limit).map((s) => ({ ...s, score: Math.round(s.score * 1000) / 1000 }))
}

/** 便捷方法：只要最相近的那一件（分数低于阈值就当没匹配上，交给兜底） */
export function bestProp(text, opts = {}) {
  const min = opts.minScore ?? 0.16
  const top = searchProps(text, { ...opts, limit: 1 })[0]
  if (!top || top.score < min) return null
  return top
}
