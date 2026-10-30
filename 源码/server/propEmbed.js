// 3D 摆件的向量检索（DashScope text-embedding-v3）
// ---------------------------------------------------------------------------
// propSearch.js 是"字面/共现"检索：同义词、换一种说法就抓不住
// （"读完《活着》的那个晚上" 在字面检索里排不到"书"）。
// 这里用**语义向量**补上这一块：把 13 件摆件的语料和记忆正文都映射成向量，
// 用余弦相似度算"意思有多近"。
//
// 为什么要落盘缓存：摆件语料是常量，每次启动都重新向量化纯属浪费；13 条 × 1024 维
// 只有一百多 KB。缓存文件里带语料指纹，改了语料自动重建。
//
// 为什么可以没有它：没配 DASHSCOPE_API_KEY、断网、额度用尽时全部方法返回 null，
// 调用方自动退回 propSearch.js 的字面检索，功能不中断。
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { PROP_CATALOG, searchProps } from './propSearch.js'

const EMB_MODEL = process.env.DASHSCOPE_EMB_MODEL || 'text-embedding-v3'
const BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com'
// 缓存必须按**模块所在目录**定位，不能用 process.cwd()：
// 从别的目录启动服务（或测试脚本）会写到别处，线上就等于每次都重建一遍。
const HERE = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.join(HERE, 'data/prop_embeddings.json')
// 单次请求条数上限（兼容端点对 batch 有限制，8 条最稳）
const BATCH = 8

let keyGetter = () => ''
/** index.js 启动时注入取密钥函数（库里的密钥优先于 .env，改完立即生效） */
export function setEmbeddingKeyGetter(fn) {
  if (typeof fn === 'function') keyGetter = fn
}

/** 每件摆件喂给模型的"文档"：名称 + 别名 + 关键词 + 描述句，越像人话越准 */
function docText(item) {
  return [
    `${item.name}。`,
    `也叫：${item.aliases.join('、')}。`,
    `相关的词：${item.tags.join('、')}。`,
    item.desc,
  ].join('')
}

const DOC_TEXTS = PROP_CATALOG.map(docText)
const fingerprint = crypto.createHash('sha1').update(DOC_TEXTS.join('\n')).digest('hex').slice(0, 16)

// 内存里的文档向量（lazy 构建）
let docVecs = null
let building = null

function norm(v) {
  let s = 0
  for (const x of v) s += x * x
  return Math.sqrt(s) || 1
}

function cosine(a, b) {
  let dot = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) dot += a[i] * b[i]
  return dot / (norm(a) * norm(b))
}

/**
 * 对外复用的向量能力（记忆的语义搜索也用这一套，别再造一份）。
 * @returns {Promise<number[][]>} 与入参一一对应；失败抛错，由调用方决定是否降级
 */
export async function embedTexts(texts) {
  return embed(texts)
}

/** 余弦相似度（0~1 左右；中文短句之间通常落在 0.2~0.7） */
export function cosineSim(a, b) {
  return cosine(a, b)
}

async function embed(texts) {
  const key = keyGetter()
  if (!key) throw new Error('未配置向量模型密钥')
  const out = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH)
    const res = await fetch(`${BASE_URL}/compatible-mode/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: EMB_MODEL, input: slice, dimensions: 1024 }),
      signal: AbortSignal.timeout(20_000),
    })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.data) {
      throw new Error(j?.error?.message || j?.message || `向量服务异常(${res.status})`)
    }
    // 服务端不保证顺序，按 index 排序
    const rows = [...j.data].sort((a, b) => a.index - b.index)
    for (const r of rows) out.push(r.embedding)
  }
  return out
}

function readCache() {
  try {
    const j = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    if (j?.fingerprint === fingerprint && Array.isArray(j.vectors) && j.vectors.length === DOC_TEXTS.length) {
      return j.vectors
    }
  } catch {
    /* 缓存不存在/损坏 -> 重建 */
  }
  return null
}

function writeCache(vectors) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
    // 保留 5 位小数：体积减少一半多，对余弦相似度的影响在 1e-5 量级
    const rounded = vectors.map((v) => v.map((x) => Math.round(x * 1e5) / 1e5))
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ fingerprint, model: EMB_MODEL, vectors: rounded }))
  } catch (e) {
    console.warn('[prop/emb] 向量缓存写入失败(忽略):', e.message)
  }
}

/** 确保文档向量就绪（并发调用共享同一个 promise） */
async function ensureDocs() {
  if (docVecs) return docVecs
  if (building) return building
  building = (async () => {
    try {
      const cached = readCache()
      if (cached) {
        docVecs = cached
        return docVecs
      }
      const vecs = await embed(DOC_TEXTS)
      docVecs = vecs
      writeCache(vecs)
      console.log(`[prop/emb] 摆件语料向量已建好（${vecs.length} 条，${EMB_MODEL}）`)
      return docVecs
    } catch (e) {
      console.warn('[prop/emb] 语义检索不可用，退回字面检索:', e.message)
      return null
    } finally {
      building = null
    }
  })()
  return building
}

// 查询向量缓存（同一条记忆重复规划时不必再花钱）
const qCache = new Map()
const Q_MAX = 200

/**
 * 语义检索：给一段文字，返回最相近的摆件。
 * @returns {Promise<{furniture:string,name:string,score:number}[]|null>} null = 不可用
 */
export async function rankProps(text, opts = {}) {
  const body = String(text || '').trim()
  if (body.length < 2) return null
  const docs = await ensureDocs()
  if (!docs) return null
  try {
    let qv = qCache.get(body)
    if (!qv) {
      const [v] = await embed([body.slice(0, 1200)])
      if (!v) return null
      qv = v
      if (qCache.size >= Q_MAX) qCache.delete(qCache.keys().next().value)
      qCache.set(body, qv)
    }
    const scored = PROP_CATALOG.map((item, i) => ({
      furniture: item.furniture,
      name: item.name,
      score: Math.round(cosine(qv, docs[i]) * 1000) / 1000,
    }))
    scored.sort((a, b) => b.score - a.score || a.furniture.localeCompare(b.furniture))
    return scored.slice(0, Number(opts.limit) || 3)
  } catch (e) {
    console.warn('[prop/emb] 检索失败，退回字面检索:', e.message)
    return null
  }
}

/** 预热：启动时后台把语料向量建好，第一次保存记忆不必等 */
export function warmupProps() {
  ensureDocs().catch(() => {})
}

/**
 * 决定一条记忆该变成哪件 3D 摆件（向量 + 字面混合打分）。
 *
 * 为什么不是"哪个高用哪个"：
 *   向量的绝对相似度整体偏高（这几件摆件的语料都是暖色日常口吻，随便一句话也有 0.4+），
 *   真正有区分度的是**名次差**；而字面检索在"实词命中"上非常准（键盘→电脑、耳机→唱片）。
 *   所以两者加权：0.55×向量 + 0.45×归一化字面分，既保留语义又守住精确性。
 *
 * @returns {Promise<{furniture:string,name:string,score:number,via:string,confident:boolean,hits:string[]}|null>}
 */
export async function decideProp(text, opts = {}) {
  const body = String(text || '').trim()
  if (body.length < 2) return null
  const title = String(opts.title || '')
  const lex = searchProps(body, { title, limit: 4 })
  const emb = await rankProps(body, { limit: 4 })

  const rows = new Map()
  for (const l of lex) rows.set(l.furniture, { furniture: l.furniture, name: l.name, emb: 0, lex: l.score, hits: l.hits })
  if (emb) {
    for (const e of emb) {
      const r = rows.get(e.furniture) || { furniture: e.furniture, name: e.name, emb: 0, lex: 0, hits: [] }
      r.emb = e.score
      rows.set(e.furniture, r)
    }
  }
  const scored = [...rows.values()]
    .map((r) => ({
      ...r,
      // 字面分归一化：0.5 以上就算"命中很明确"，封顶 1
      score: 0.55 * r.emb + 0.45 * Math.min(1, r.lex / 0.5),
    }))
    .sort((a, b) => b.score - a.score || a.furniture.localeCompare(b.furniture))

  const top = scored[0]
  if (!top) return null
  const second = scored[1]
  // 置信度：向量有明确领先（名次差≥0.02）或字面命中了实词
  const confident = Boolean(
    (emb && second && top.emb - second.emb >= 0.02) || (emb && top.emb >= 0.6) || top.lex >= 0.22,
  )
  return {
    furniture: top.furniture,
    name: top.name,
    score: Math.round(top.score * 1000) / 1000,
    via: emb ? 'vector+lexical' : 'lexical',
    confident,
    hits: top.hits || [],
  }
}

