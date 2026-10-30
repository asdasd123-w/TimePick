// 记忆的语义搜索
// ---------------------------------------------------------------------------
// 记忆库的搜索框一直是"前端 includes"，只比标题/类型/空间名，**连正文都不搜**：
// 用户搜「大理」搜不到「那天风很大，我们坐在洱海边」，搜「外婆」也搜不到那碗面。
// 这里把 3D 摆件用的那套向量检索（text-embedding-v3）复用到记忆上：
//   查询文本 → 向量 → 与本人所有记忆的向量算余弦 → 取最相近的若干条。
//
// 三个刻意的设计：
//   1) **只在字面搜不到时才走这里**（前端判断），常规搜索零延迟、也不花向量钱；
//   2) 向量按「记忆 id + 内容指纹」缓存在内存里，改一条只重算那一条；
//      重启后第一次搜索会补算（最多 300 条，约 1~2 秒），之后都是毫秒级；
//   3) 没有密钥 / 断网 / 额度用尽时返回 null，前端原样显示"没有找到"，功能不中断。
import crypto from 'crypto'
import db from './db.js'
import { embedTexts, cosineSim } from './propEmbed.js'

// 单次最多索引多少条（按最近更新倒序取）。几百条以上的人极少，且首次建索引会明显变慢
const MAX_DOCS = 300
// 相似度下限：低于这个分算"不相关"，宁可不给结果也别硬凑。
// 0.5 是拿 7 组标注样本 + 换措辞的边界样本校准的：
//   · 措辞几乎相同的（标题里就有关键词）0.75~0.86
//   · 意思对但换了说法（"大理" ↔ "洱海边风很大"）0.5~0.6
//   · 不相关的天花板 0.44 左右
// 0.5 正好落在"换了说法"和"不相关"之间。
const MIN_SCORE = 0.5
// 相对落差：只留和第一名差 0.1 以内的，避免"第一名很像、后面一堆勉强及格"混进来
const REL_GAP = 0.1
// 最多给多少条（超过 12 条基本上就是"全都跟这事有点关系"，等于没筛）
const MAX_HITS = 12
// 内存缓存上限（每条 1024 维 float），超了整体清空重建，别把内存吃干净
const MAX_CACHE = 4000

const cache = new Map() // `${id}:${内容指纹}` -> 向量

const sig = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12)

/**
 * 语义搜索某人的记忆。
 * @param {number} uid
 * @param {string} q 查询文本（用户输入的一整句话也行）
 * @returns {Promise<{ids:number[],scored:{id:number,score:number}[],indexed:number}|null>} null = 不可用
 */
export async function semanticSearchMemory(uid, q, opts = {}) {
  const query = String(q || '').trim()
  if (query.length < 2) return null
  const limit = Number(opts.limit) || 60

  const rows = db
    .prepare(
      `SELECT i.id, i.title, i.content
         FROM memory_item i
         JOIN memory_space s ON s.id = i.space_id
        WHERE s.user_id = ?
        ORDER BY i.created_at DESC
        LIMIT ${MAX_DOCS}`,
    )
    .all(uid)
  if (!rows.length) return { ids: [], scored: [], indexed: 0 }

  const docs = rows.map((r) => ({
    id: r.id,
    text: `${r.title || ''}。${r.content || ''}`.replace(/\s+/g, ' ').trim().slice(0, 1200),
  }))

  try {
    // 只补算缓存里没有的（新写的记忆、改过内容的记忆）
    const missing = []
    for (const d of docs) {
      if (!d.text) continue
      const k = `${d.id}:${sig(d.text)}`
      if (!cache.has(k)) missing.push({ ...d, k })
    }
    if (missing.length) {
      // embedTexts 内部按 8 条一批，300 条约 38 批；这里只在本人生成/改动较多时才会走到
      const vecs = await embedTexts(missing.map((m) => m.text))
      missing.forEach((m, i) => {
        if (!vecs[i]) return
        if (cache.size >= MAX_CACHE) cache.clear()
        cache.set(m.k, vecs[i])
      })
    }

    const [qv] = await embedTexts([query.slice(0, 200)])
    if (!qv) return null

    const scored = []
    for (const d of docs) {
      const v = cache.get(`${d.id}:${sig(d.text)}`)
      if (!v) continue
      scored.push({ id: d.id, score: Math.round(cosineSim(qv, v) * 1000) / 1000 })
    }
    scored.sort((a, b) => b.score - a.score)
    const top = scored[0]?.score ?? 0
    const cut = Math.max(MIN_SCORE, top - REL_GAP)
    return {
      scored: scored.slice(0, limit),
      // 前端拿的就是这个集合：达到下限、且没比第一名差太多的都算"意思相近"
      ids: scored
        .filter((s) => s.score >= cut)
        .slice(0, MAX_HITS)
        .map((s) => s.id),
      indexed: scored.length,
    }
  } catch (e) {
    console.warn('[memory/semantic] 语义搜索不可用:', e.message)
    return null
  }
}
