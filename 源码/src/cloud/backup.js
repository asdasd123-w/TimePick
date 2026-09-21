// 「拾光云」数据层: 云端公告(公开读) + 记忆云备份(按云账号隔离) + 备份文件云存储
//
// 两条链路刻意分开:
//   - 公告是公开只读表 tp_notice，不登录也能读，用于首页/欢迎页展示；
//   - 备份是 owner_id = auth.uid() 的私有表 tp_cloud_backup，必须先登录云账号。
// 身份由 SDK 的共享 fetch 自动带上，这里**不传** owner_id / token。
import { cloud, cloudErrorText, currentSession } from './client'
import { cloudApi } from '../api/cloud'

const BACKUP_TABLE = 'tp_cloud_backup'
const NOTICE_TABLE = 'tp_notice'

function unwrap({ data, error }, fallback) {
  if (error) throw new Error(cloudErrorText(error, fallback))
  return data
}

/** 云端公告: 公开可读，未登录也能拿 */
export async function listNotices(limit = 5) {
  if (!cloud) return []
  const { data, error } = await cloud.database
    .from(NOTICE_TABLE)
    .select('id, title, body, kind, pinned, published_at')
    .order('pinned', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.warn('[cloud] 公告读取失败:', cloudErrorText(error))
    return []
  }
  return data || []
}

/** 收集当前本地账号的全部记忆（空间 + 条目 + 媒体地址），组成可序列化快照 */
export async function collectSnapshot() {
  const [spaces, items] = await Promise.all([cloudApi.listSpaces(), cloudApi.listMyItems()])
  const spaceList = Array.isArray(spaces) ? spaces : []
  const itemList = Array.isArray(items) ? items : []
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    spaces: spaceList.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description || '',
      cover: s.cover || '',
      theme: s.theme || '',
      island_name: s.island_name || s.name,
      island_tip: s.island_tip || '',
      island_art: s.island_art || '',
    })),
    items: itemList.map((i) => ({
      space_id: i.space_id,
      space_name: i.space_name || '',
      title: i.title || '',
      content: i.content || '',
      mood: i.mood || '',
      weather: i.weather || '',
      tags: i.tags || '',
      kind: i.kind || 'memory',
      author: i.author || '',
      entry_date: i.entry_date || '',
      type: i.type || '其他',
      position_x: i.position_x || 0,
      position_y: i.position_y || 0,
      rotation: i.rotation || 0,
      ai_cover: i.ai_cover || '',
      island_art: i.island_art || '',
      media: (i.media || []).map((m, idx) => ({
        type: Number(m.type) || 1,
        url: m.url,
        thumb: m.thumb || '',
        duration: Number(m.duration) || 0,
        sort: m.sort ?? idx,
      })),
    })),
  }
}

/**
 * 把一份快照写入云端。
 * 返回 { row, filePath, downloadUrl } —— 文件上传失败不影响数据库备份，只是没有下载链接。
 */
export async function createBackup({ title, device } = {}) {
  if (!cloud) throw new Error('云服务未就绪')
  const session = await currentSession()
  if (!session) throw new Error('请先登录云账号')

  const snapshot = await collectSnapshot()
  if (!snapshot.spaces.length && !snapshot.items.length) {
    throw new Error('还没有可备份的记忆，先去收藏第一条时光吧')
  }

  const stamp = new Date()
  const finalTitle =
    title ||
    `拾光备份 ${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(
      stamp.getDate(),
    ).padStart(2, '0')} ${String(stamp.getHours()).padStart(2, '0')}:${String(
      stamp.getMinutes(),
    ).padStart(2, '0')}`

  const { data, error } = await cloud.database
    .from(BACKUP_TABLE)
    .insert({
      title: finalTitle,
      owner_name: session.user?.name || null,
      space_count: snapshot.spaces.length,
      item_count: snapshot.items.length,
      payload: snapshot,
      device: device || navigator.platform || '',
    })
    .select()
  if (error) {
    if (error.code === '42501') throw new Error('当前账号没有写入权限，请重新登录云账号')
    throw new Error(cloudErrorText(error, '备份写入失败'))
  }
  const row = Array.isArray(data) ? data[0] : data

  // 备份文件另存一份到云存储，方便在任意设备直接下载
  let filePath = ''
  let downloadUrl = ''
  try {
    const path = cloud.storage.userPath(
      session.user.id,
      `backups/${row.id}-${stamp.getTime()}.json`,
    )
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const up = await cloud.storage.upload(path, blob, {
      contentType: 'application/json',
      upsert: true,
    })
    if (!up.error) {
      filePath = path
      // ★ 有效期上限 2592 秒(43.2 分钟)，是云存储签名接口的硬限制：
      //   传 7 天(604800) 会被直接拒掉一整条上传，控制台刷 "expires must be an integer
      //   between 1 and 2592 seconds"。这里取满 2592，链接只在"刚备份完"那一小会儿有用。
      const signed = await cloud.storage.createSignedUrl(path, 2592)
      if (!signed.error) downloadUrl = signed.data?.signedUrl || ''
    }
  } catch (e) {
    console.warn('[cloud] 备份文件上传失败(不影响数据库备份):', e && e.message)
  }

  return { row, filePath, downloadUrl, snapshot }
}

/** 我的云备份列表（RLS 只返回当前云账号自己的行） */
export async function listBackups(limit = 20) {
  if (!cloud) return []
  const { data, error } = await cloud.database
    .from(BACKUP_TABLE)
    .select('id, title, space_count, item_count, device, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(cloudErrorText(error, '备份列表读取失败'))
  return data || []
}

/** 读一条备份的完整内容（只发给列表里不带的 payload） */
export async function readBackup(id) {
  if (!cloud) throw new Error('云服务未就绪')
  const { data, error } = await cloud.database
    .from(BACKUP_TABLE)
    .select('id, title, payload, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(cloudErrorText(error, '备份内容读取失败'))
  if (!data) throw new Error('这条备份不存在，或不属于当前云账号')
  return data
}

/** 删除一条云备份；返回是否真的删掉了（RLS 过滤时删除 0 行） */
export async function removeBackup(id) {
  if (!cloud) throw new Error('云服务未就绪')
  const { data, error } = await cloud.database.from(BACKUP_TABLE).delete().eq('id', id).select()
  if (error) throw new Error(cloudErrorText(error, '删除备份失败'))
  return Array.isArray(data) && data.length > 0
}

const MAX_ITEMS_PER_SPACE = 13

/**
 * 从云端恢复：**新建**空间再灌入条目，绝不覆盖已有空间。
 * 单个空间最多 13 条记忆，超出部分自动拆成「… · 云端恢复 2/3」。
 * 返回 { spaces, items, skipped }。
 */
export async function restoreBackup(id, onProgress) {
  const payload = (await readBackup(id)).payload
  const items = Array.isArray(payload?.items) ? payload.items : []
  const sourceSpaces = Array.isArray(payload?.spaces) ? payload.spaces : []

  // 空间名 → 原空间信息（用于还原描述/外观）
  const spaceMeta = new Map(sourceSpaces.map((s) => [s.name, s]))
  // 按原空间分组，保持条目原有顺序
  const groups = new Map()
  for (const it of items) {
    const key = it.space_name || '云端恢复'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(it)
  }

  const suffix = ` · 云端恢复 ${new Date().toLocaleDateString('zh-CN')}`
  let createdSpaces = 0
  let createdItems = 0
  let skipped = 0

  for (const [name, list] of groups) {
    const meta = spaceMeta.get(name) || {}
    const chunks = []
    for (let i = 0; i < list.length; i += MAX_ITEMS_PER_SPACE) {
      chunks.push(list.slice(i, i + MAX_ITEMS_PER_SPACE))
    }
    for (let c = 0; c < chunks.length; c++) {
      const partName =
        chunks.length > 1 ? `${name}${suffix} ${c + 1}/${chunks.length}` : `${name}${suffix}`
      const space = await cloudApi.createSpace({
        name: partName.slice(0, 40),
        description: meta.description || '',
        cover: meta.cover || '',
        theme: meta.theme || '',
        island_name: partName.slice(0, 40),
        island_tip: meta.island_tip || '',
        island_art: meta.island_art || '',
      })
      createdSpaces++
      for (const it of chunks[c]) {
        try {
          await cloudApi.createItem({
            space_id: space.id,
            title: it.title || '',
            content: it.content || '',
            mood: it.mood,
            weather: it.weather,
            tags: it.tags,
            kind: it.kind,
            author: it.author,
            entry_date: it.entry_date,
            type: it.type,
            position_x: it.position_x,
            position_y: it.position_y,
            rotation: it.rotation,
            ai_cover: it.ai_cover,
            island_art: it.island_art,
            media: it.media || [],
          })
          createdItems++
        } catch (e) {
          console.warn('[cloud] 条目恢复失败:', e && e.message)
          skipped++
        }
        if (typeof onProgress === 'function') onProgress({ createdItems, totalItems: items.length })
      }
    }
  }
  return { spaces: createdSpaces, items: createdItems, skipped }
}
