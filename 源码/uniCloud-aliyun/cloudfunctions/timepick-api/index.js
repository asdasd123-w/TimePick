'use strict'
// TimePick「拾光」统一 API 云函数(URL 化)
// 前端 POST { action, params, token } 到本函数 URL, 返回 { code, msg, data }
// code: 0 成功 / 1 业务失败 / 401 未登录 / 404 未知 action / 500 异常
const crypto = require('crypto')

const db = uniCloud.database()
const cmd = db.command
const SECRET = 'timepick@2026#api-secret'
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000 // 7 天
// 注册口令: 只有输入正确口令才能注册(可在云函数环境变量中覆盖 REGISTER_PASSPHRASE)
const REGISTER_PASSPHRASE = process.env.REGISTER_PASSPHRASE || '优乐美'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
}

function http(body, statusCode = 200) {
  return {
    mpserverlessComposedResponse: true,
    statusCode,
    headers: CORS,
    body: JSON.stringify(body),
  }
}
const ok = (data) => http({ code: 0, msg: 'ok', data })
const fail = (msg, code = 1) => http({ code, msg, data: null })
const err = (msg) => new Error(msg)

// ---------------- 基础工具 ----------------
const b64e = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64d = (str) =>
  JSON.parse(Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
const now = () => Date.now()
const col = (name) => db.collection(name)

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(salt + ':' + password).digest('hex')
}
function signToken(uid) {
  const payload = b64e({ uid, exp: now() + TOKEN_TTL })
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64')
  return payload + '.' + sig
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('base64')
  if (sig !== expect) return null
  try {
    const data = b64d(payload)
    return data.exp > now() ? data.uid : null
  } catch (e) {
    return null
  }
}
async function getDoc(name, id) {
  if (!id) return null
  const r = await col(name).doc(id).get()
  return r.data && r.data[0] ? r.data[0] : null
}
async function findOne(name, where) {
  const r = await col(name).where(where).limit(1).get()
  return r.data && r.data[0] ? r.data[0] : null
}
const publicUser = (u) =>
  u ? { id: u._id, username: u.username, nickname: u.nickname, avatar: u.avatar, email: u.email, role: u.role || 0 } : null

async function isAdmin(uid) {
  const u = await getDoc('user', uid)
  if (!u) throw err('用户不存在')
  if (!u.role) throw err('无权操作(需要管理员权限)')
  return u
}

// MongoDB 返回 _id, 前端统一用 id; 递归重命名所有文档的 _id → id
function withId(data) {
  if (data === null || data === undefined) return data
  if (Array.isArray(data)) return data.map(withId)
  if (typeof data !== 'object') return data
  if (data instanceof Date) return data
  if (Buffer.isBuffer(data)) return data
  const result = {}
  for (const key of Object.keys(data)) {
    if (key === '_id') {
      if (!('id' in data)) result.id = data._id
      else result.id = data._id
    } else {
      result[key] = withId(data[key])
    }
  }
  return result
}

async function attachAuthors(rows, uid) {
  if (!rows.length) return rows
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
  const users = await col('user')
    .where({ _id: cmd.in(ids) })
    .field({ username: true, nickname: true, avatar: true })
    .get()
  const map = {}
  users.data.forEach((u) => (map[u._id] = publicUser(u)))
  let likedSet = new Set()
  let favSet = new Set()
  if (uid) {
    const postIds = rows.map((r) => r._id)
    const [likes, favs] = await Promise.all([
      col('post_like').where({ post_id: cmd.in(postIds), user_id: uid }).get(),
      col('favorite').where({ target_type: 2, target_id: cmd.in(postIds), user_id: uid }).get(),
    ])
    likedSet = new Set(likes.data.map((l) => l.post_id))
    favSet = new Set(favs.data.map((f) => f.target_id))
  }
  return rows.map((r) => ({
    ...r,
    author: map[r.user_id] || null,
    liked_by_me: likedSet.has(r._id),
    favorited_by_me: favSet.has(r._id),
  }))
}
async function mustSpaceOwner(spaceId, uid) {
  const space = await getDoc('memory_space', spaceId)
  if (!space) throw err('记忆空间不存在')
  if (space.user_id !== uid) throw err('无权操作该空间')
  return space
}

// ---------------- 业务处理 ----------------
const handlers = {
  'system/health': async () => ({ service: 'timepick-api', time: now() }),

  // ---------- 认证 ----------
  'auth/register': async ({ username, password, nickname, passphrase }) => {
    if (!username || username.length < 3 || username.length > 50) throw err('用户名需 3-50 个字符')
    if (!password || password.length < 6) throw err('密码至少 6 位')
    if ((passphrase || '').trim() !== REGISTER_PASSPHRASE) throw err('注册口令不正确')
    if (await findOne('user', { username })) throw err('用户名已被注册')
    const nick = (nickname || username).trim()
    if (nick && await findOne('user', { nickname: nick })) throw err('昵称已被使用')
    const salt = crypto.randomBytes(8).toString('hex')
    const r = await col('user').add({
      username,
      password: salt + '$' + hashPassword(password, salt),
      nickname: nickname || username,
      avatar: '',
      email: null,
      status: 1,
      created_at: now(),
      updated_at: now(),
    })
    const user = await getDoc('user', r.id)
    return { token: signToken(r.id), user: publicUser(user) }
  },
  'auth/login': async ({ username, password }) => {
    const user = await findOne('user', { username })
    if (!user) throw err('用户名或密码错误')
    const [salt, hash] = (user.password || '').split('$')
    if (!hash || hashPassword(password, salt) !== hash) throw err('用户名或密码错误')
    if (user.status !== 1) throw err('账号已被禁用')
    return { token: signToken(user._id), user: publicUser(user) }
  },
  'auth/me': async (_p, uid) => {
    const user = await getDoc('user', uid)
    if (!user) throw err('用户不存在')
    const profile = await findOne('user_profile', { user_id: uid })
    return { user: publicUser(user), profile }
  },
  'auth/profile/update': async (p, uid) => {
    // 更新 user 表的 nickname
    if (p.nickname !== undefined) {
      await col('user').where({ _id: uid }).update({ nickname: p.nickname, updated_at: now() })
    }
    const allow = ['gender', 'birthday', 'bio', 'hobbies', 'occupation', 'location']
    const patch = {}
    allow.forEach((k) => {
      if (p[k] !== undefined) patch[k] = p[k]
    })
    patch.updated_at = now()
    const exist = await findOne('user_profile', { user_id: uid })
    if (exist) await col('user_profile').doc(exist._id).update(patch)
    else await col('user_profile').add({ user_id: uid, created_at: now(), ...patch })
    return findOne('user_profile', { user_id: uid })
  },
  'auth/password/change': async (p, uid) => {
    if (!p.oldPassword) throw err('请输入原密码')
    if (!p.newPassword) throw err('请输入新密码')
    if (p.newPassword.length < 6) throw err('新密码至少 6 位')
    const user = await col('user').doc(uid).get()
    if (!user.data || !user.data.length) throw err('用户不存在')
    const u = user.data[0]
    const [salt, hash] = (u.password || '').split('$')
    if (!hash || hashPassword(p.oldPassword, salt) !== hash) throw err('原密码错误')
    const newSalt = crypto.randomBytes(8).toString('hex')
    const newHash = hashPassword(p.newPassword, newSalt)
    await col('user').doc(uid).update({ password: newSalt + '$' + newHash, updated_at: now() })
    return { changed: true }
  },

  // 用户统计: 赞数/公开记忆数/关注数
  'user/stats': async (p) => {
    const uid = p.user_id
    if (!uid) throw err('用户 ID 不能为空')
    const user = await getDoc('user', uid)
    if (!user) throw err('用户不存在')
    // 赞数: 该用户所有帖子收到的点赞总数
    const posts = await col('square_post').where({ user_id: uid }).get()
    const likes = (posts.data || []).reduce((sum, post) => sum + (post.likes_count || 0), 0)
    // 公开记忆数: 该用户公开的帖子数
    const publicMemories = (await col('square_post').where({ user_id: uid, is_public: 1 }).count()).total
    // 关注数: 该用户关注的人数
    const following = (await col('user_follow').where({ follower_id: uid }).count()).total
    return { id: user._id, username: user.username, nickname: user.nickname, likes, publicMemories, following }
  },

  // 推荐记忆空间: 按公开记忆获赞总量排序取前三
  'space/recommend': async () => {
    const items = await col('memory_item').where({ is_public: 1 }).limit(500).get()
    if (!items.data.length) return []
    const itemIds = items.data.map((i) => i._id)
    const likes = await col('memory_item_like').where({ memory_id: cmd.in(itemIds) }).get()
    const likeCount = {}
    for (const l of likes.data || []) likeCount[l.memory_id] = (likeCount[l.memory_id] || 0) + 1
    const spaceIds = [...new Set(items.data.map((i) => i.space_id))]
    const spaces = await col('memory_space').where({ _id: cmd.in(spaceIds) }).get()
    const spaceOwner = {}
    for (const s of spaces.data || []) spaceOwner[s._id] = s.user_id
    const agg = {}
    for (const i of items.data) {
      const owner = spaceOwner[i.space_id]
      if (!owner) continue
      if (!agg[owner]) agg[owner] = { user_id: owner, likes: 0, mem_count: 0 }
      agg[owner].likes += likeCount[i._id] || 0
      agg[owner].mem_count += 1
    }
    const list = Object.values(agg)
      .sort((a, b) => b.likes - a.likes || b.mem_count - a.mem_count)
      .slice(0, 3)
    const userIds = list.map((x) => x.user_id)
    if (!userIds.length) return []
    const users = await col('user').where({ _id: cmd.in(userIds) }).get()
    const nameOf = {}
    for (const u of users.data || []) nameOf[u._id] = u.nickname
    return list.map((x) => ({
      user_id: x.user_id,
      name: nameOf[x.user_id] || '匿名用户',
      likes: x.likes,
      sub: `${x.mem_count} 条公开记忆 · ${x.likes} 赞`,
    }))
  },

  // 可能认识的人: 随机返回其他用户
  'user/random': async (_p, uid) => {
    const users = await col('user').limit(100).get()
    const list = (users.data || [])
      .filter((u) => u._id !== uid)
      .sort(() => Math.random() - 0.5)
      .slice(0, 4)
    const result = []
    for (const u of list) {
      const spaces = await col('memory_space').where({ user_id: u._id }).get()
      const sIds = spaces.data.map((s) => s._id)
      let memCount = 0
      if (sIds.length) memCount = (await col('memory_item').where({ space_id: cmd.in(sIds), is_public: 1 }).count()).total
      result.push({ id: u._id, name: u.nickname, sub: memCount ? `${memCount} 条公开记忆` : '新加入拾光' })
    }
    return result
  },

  // 指定用户的公开记忆: 进入他人记忆空间时拉取
  'memory/user/public': async (p) => {
    const targetId = p.user_id
    if (!targetId) throw err('用户 ID 不能为空')
    const spaces = await col('memory_space').where({ user_id: targetId }).get()
    const spaceIds = spaces.data.map((s) => s._id)
    if (!spaceIds.length) return []
    const items = await col('memory_item')
      .where({ space_id: cmd.in(spaceIds), is_public: 1 })
      .orderBy('created_at', 'desc')
      .get()
    const user = await getDoc('user', targetId)
    const result = []
    for (const item of items.data) {
      const media = (await col('memory_media').where({ memory_id: item._id }).orderBy('sort', 'asc').get()).data
      const comments = (await col('memory_comment').where({ memory_id: item._id }).count()).total
      const likes = (await col('memory_item_like').where({ memory_id: item._id }).count()).total
      const space = spaces.data.find((s) => s._id === item.space_id)
      result.push({
        ...withId(item),
        space_name: space ? space.name : '',
        owner_id: targetId,
        author_nickname: user ? user.nickname : '',
        comments_count: comments,
        likes_count: likes,
        media: withId(media),
      })
    }
    return result
  },

  // ---------- 用户设置 ----------
  'settings/get': async (_p, uid) => {
    let s = await findOne('user_settings', { user_id: uid })
    if (!s) {
      await col('user_settings').add({
        user_id: uid,
        default_vis: 'self',
        ai_read_memory: 1,
        ai_cross_space: 1,
        ai_summary: 1,
        ai_no_training: 1,
        bgm: 1,
        ambient: 1,
        ambient_type: '雨声',
        motion: '适中',
        tone: '暖色',
        created_at: now(),
        updated_at: now(),
      })
      s = await findOne('user_settings', { user_id: uid })
    }
    return s
  },
  'settings/update': async (p, uid) => {
    const fields = ['default_vis', 'ai_read_memory', 'ai_cross_space', 'ai_summary', 'ai_no_training', 'bgm', 'ambient', 'ambient_type', 'motion', 'tone']
    const patch = { updated_at: now() }
    fields.forEach((k) => {
      if (p[k] !== undefined) patch[k] = p[k]
    })
    const exist = await findOne('user_settings', { user_id: uid })
    if (exist) await col('user_settings').doc(exist._id).update(patch)
    else await col('user_settings').add({ user_id: uid, created_at: now(), ...patch })
    return findOne('user_settings', { user_id: uid })
  },

  // ---------- 分享管理 ----------
  'share/list': async (_p, uid) =>
    (await col('share').where({ user_id: uid }).orderBy('created_at', 'desc').get()).data,
  'share/create': async (p, uid) => {
    if (!p.name) throw err('分享名称不能为空')
    if (!p.space_id && !p.memory_id) throw err('请指定要分享的切片或记忆')
    const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    const r = await col('share').add({
      user_id: uid,
      space_id: p.space_id || null,
      memory_id: p.memory_id || null,
      name: p.name,
      meta: p.meta || '',
      token,
      status: 'valid',
      expires_at: p.expires_at || null,
      created_at: now(),
      updated_at: now(),
    })
    return getDoc('share', r.id)
  },
  'share/update': async (p, uid) => {
    const doc = await findOne('share', { _id: p.id, user_id: uid })
    if (!doc) throw err('分享不存在或无权操作')
    const patch = { updated_at: now() }
    if (p.status !== undefined) patch.status = p.status
    if (p.name !== undefined) patch.name = p.name
    await col('share').doc(p.id).update(patch)
    return getDoc('share', p.id)
  },
  'share/remove': async (p, uid) => {
    const doc = await findOne('share', { _id: p.id, user_id: uid })
    if (!doc) throw err('分享不存在或无权删除')
    await col('share').doc(p.id).remove()
    return { removed: true }
  },
  // 公开分享页: 免登录按 token 查看分享的切片/单条记忆
  'share/view': async (p) => {
    const s = await findOne('share', { token: p.token || '' })
    if (!s) throw err('分享不存在')
    if (s.status !== 'valid') throw err('该分享已被所有者取消')
    if (s.expires_at && s.expires_at <= now()) throw err('该分享已过期')
    let items = []
    if (s.memory_id) {
      const it = await getDoc('memory_item', s.memory_id)
      if (it) {
        const media = (await col('memory_media').where({ memory_id: it._id }).orderBy('sort', 'asc').get()).data
        items = [{ ...withId(it), media: withId(media) }]
      }
    } else if (s.space_id) {
      const rows = (await col('memory_item').where({ space_id: s.space_id }).orderBy('created_at', 'desc').get())
        .data
      for (const r of rows) {
        const media = (await col('memory_media').where({ memory_id: r._id }).orderBy('sort', 'asc').get()).data
        items.push({ ...withId(r), media: withId(media) })
      }
    }
    const owner = publicUser(await getDoc('user', s.user_id))
    return { id: s._id, name: s.name, meta: s.meta, created_at: s.created_at, owner, items }
  },

  // ---------- 删除所有数据 (危险操作) ----------
  'user/deleteAll': async (_p, uid) => {
    await col('memory_space').where({ user_id: uid }).remove()
    await col('square_post').where({ user_id: uid }).remove()
    await col('favorite').where({ user_id: uid }).remove()
    await col('user_follow').where(cmd.or([{ follower_id: uid }, { following_id: uid }])).remove()
    await col('feedback').where({ user_id: uid }).remove()
    await col('share').where({ user_id: uid }).remove()
    await col('user_settings').where({ user_id: uid }).remove()
    await col('pet_config').where({ user_id: uid }).remove()
    await col('ai_conversation').where({ user_id: uid }).remove()
    await col('private_message').where(cmd.or([{ sender_id: uid }, { receiver_id: uid }])).remove()
    await col('notification').where({ user_id: uid }).remove()
    await col('report').where({ reporter_id: uid }).remove()
    await col('user_profile').where({ user_id: uid }).remove()
    await col('activity_comment').where({ user_id: uid }).remove()
    await col('activity_join').where({ user_id: uid }).remove()
    await col('activity_like').where({ user_id: uid }).remove()
    await col('memory_comment').where({ user_id: uid }).remove()
    await col('memory_item_like').where({ user_id: uid }).remove()
    return { deleted: true }
  },

  // 导出我的记忆: 聚合空间+条目+媒体为 Markdown 文本, 前端触发浏览器下载
  'user/export': async (_p, uid) => {
    const user = await getDoc('user', uid)
    const spaces = (await col('memory_space').where({ user_id: uid }).orderBy('created_at', 'asc').get()).data
    const lines = [`# ${(user && (user.nickname || user.username)) || '拾光'} 的拾光记忆`, '']
    let total = 0
    for (const s of spaces) {
      const items = (await col('memory_item').where({ space_id: s._id }).orderBy('created_at', 'asc').get()).data
      lines.push(`## 切片 · ${s.name}`, '')
      if (!items.length) lines.push('（此切片暂无记忆）', '')
      for (const it of items) {
        total += 1
        const kindLabel = it.kind === 'book' ? '书籍' : it.kind === 'music' ? '音乐' : '日记'
        lines.push(`### ${it.title}`)
        lines.push(`- 种类: ${kindLabel}${it.author ? ` / 作者: ${it.author}` : ''}`)
        lines.push(
          `- 类型: ${it.type || '其他'} / 日期: ${it.entry_date || '未填'} / 可见性: ${it.is_public ? '公开' : '仅自己'}`
        )
        if (it.content) lines.push('', it.content)
        const media = (await col('memory_media').where({ memory_id: it._id }).orderBy('sort', 'asc').get()).data
        if (media.length) {
          lines.push('', '附件:')
          media.forEach((m) => lines.push(`- ${m.type === 2 ? '音频' : '图片'}: ${m.url}`))
        }
        lines.push('')
      }
    }
    if (!spaces.length) lines.push('（还没有任何切片与记忆）', '')
    lines.push('---', `共 ${total} 条记忆 · 导出于 ${new Date().toLocaleString('zh-CN')}`)
    return { markdown: lines.join('\n'), count: total }
  },

  // ---------- 记忆空间 / 条目 ----------
  'memory/space/list': async (_p, uid) => {
    const spaces = (await col('memory_space').where({ user_id: uid }).orderBy('created_at', 'desc').get()).data
    for (const s of spaces) {
      s.item_count = (await col('memory_item').where({ space_id: s._id }).count()).total
    }
    return spaces
  },
  'memory/space/create': async (p, uid) => {
    if (!p.name) throw err('空间名称不能为空')
    const r = await col('memory_space').add({
      user_id: uid,
      name: p.name,
      description: p.description || '',
      cover: p.cover || '',
      theme: p.theme || '',
      is_public: p.is_public ? 1 : 0,
      created_at: now(),
      updated_at: now(),
    })
    return getDoc('memory_space', r.id)
  },
  'memory/space/update': async (p, uid) => {
    await mustSpaceOwner(p.id, uid)
    const patch = {}
    ;['name', 'description', 'cover', 'theme', 'is_public'].forEach((k) => {
      if (p[k] !== undefined) patch[k] = p[k]
    })
    patch.updated_at = now()
    await col('memory_space').doc(p.id).update(patch)
    return getDoc('memory_space', p.id)
  },
  'memory/space/remove': async (p, uid) => {
    await mustSpaceOwner(p.id, uid)
    const items = await col('memory_item').where({ space_id: p.id }).get()
    const itemIds = items.data.map((i) => i._id)
    if (itemIds.length) await col('memory_media').where({ memory_id: cmd.in(itemIds) }).remove()
    if (itemIds.length) await col('memory_item').where({ space_id: p.id }).remove()
    await col('memory_space').doc(p.id).remove()
    return { removed: true }
  },
  // 清除指定切片的数据: 删除空间内全部条目与媒体, 保留空间本身
  'memory/space/clear': async (p, uid) => {
    await mustSpaceOwner(p.id, uid)
    const items = await col('memory_item').where({ space_id: p.id }).get()
    const itemIds = items.data.map((i) => i._id)
    if (itemIds.length) await col('memory_media').where({ memory_id: cmd.in(itemIds) }).remove()
    if (itemIds.length) await col('memory_item').where({ space_id: p.id }).remove()
    return { cleared: itemIds.length }
  },
  // 我的全部记忆条目(跨空间), 记忆库主页数据源
  'memory/item/my': async (_p, uid) => {
    const spaces = await col('memory_space').where({ user_id: uid }).get()
    const spaceIds = spaces.data.map((s) => s._id)
    if (!spaceIds.length) return []
    const items = await col('memory_item')
      .where({ space_id: cmd.in(spaceIds) })
      .orderBy('created_at', 'desc')
      .get()
    const result = []
    for (const item of items.data) {
      const space = spaces.data.find((s) => s._id === item.space_id)
      const media = (await col('memory_media').where({ memory_id: item._id }).orderBy('sort', 'asc').get()).data
      result.push({ ...withId(item), space_name: space ? space.name : '', owner_id: uid, media: withId(media) })
    }
    return result
  },
  // 共享记忆流: 所有用户公开的记忆, 人人可见
  'memory/shared/list': async (_p, uid) => {
    const items = await col('memory_item').where({ is_public: 1 }).orderBy('created_at', 'desc').limit(100).get()
    const result = []
    for (const item of items.data) {
      const space = await getDoc('memory_space', item.space_id)
      const author = space ? await getDoc('user', space.user_id) : null
      const media = (await col('memory_media').where({ memory_id: item._id }).orderBy('sort', 'asc').get()).data
      const commentsCount = (await col('memory_comment').where({ memory_id: item._id }).count()).total
      const likesCount = (await col('memory_item_like').where({ memory_id: item._id }).count()).total
      const isLiked = uid ? !!(await findOne('memory_item_like', { memory_id: item._id, user_id: uid })) : false
      result.push({
        ...withId(item),
        space_name: space ? space.name : '',
        owner_id: space ? space.user_id : '',
        author_nickname: author ? author.nickname || author.username : '匿名用户',
        author_avatar: author ? author.avatar : '',
        comments_count: commentsCount,
        likes_count: likesCount,
        media: withId(media),
        is_mine: space ? space.user_id === uid : false,
        is_liked: isLiked,
      })
    }
    return result
  },
  'memory/item/list': async (p, uid) => {
    const space = await getDoc('memory_space', p.space_id)
    if (!space) throw err('记忆空间不存在')
    if (space.user_id !== uid && space.is_public !== 1) throw err('该空间未公开')
    return (await col('memory_item').where({ space_id: p.space_id }).orderBy('created_at', 'desc').get()).data
  },
  'memory/item/detail': async (p, uid) => {
    const item = await getDoc('memory_item', p.id)
    if (!item) throw err('记忆不存在')
    const space = await getDoc('memory_space', item.space_id)
    if (!space || (space.user_id !== uid && space.is_public !== 1)) throw err('无权查看')
    const media = (await col('memory_media').where({ memory_id: p.id }).orderBy('sort', 'asc').get()).data
    return { ...item, media }
  },
  'memory/item/create': async (p, uid) => {
    // 支持 space_id 或 space_name(自动创建)
    let spaceId = p.space_id
    if (!spaceId && p.space_name) {
      const trimmed = String(p.space_name).trim()
      const existing = await findOne('memory_space', { user_id: uid, name: trimmed })
      if (existing) {
        spaceId = existing._id
      } else {
        const r = await col('memory_space').add({
          user_id: uid,
          name: trimmed,
          description: '',
          cover: '',
          theme: '',
          is_public: 0,
          created_at: now(),
          updated_at: now(),
        })
        spaceId = r.id
      }
    }
    if (!spaceId) throw err('请指定所属空间')
    await mustSpaceOwner(spaceId, uid)
    if (!p.title) throw err('标题不能为空')
    const r = await col('memory_item').add({
      space_id: spaceId,
      title: p.title,
      content: p.content || '',
      mood: p.mood || '',
      weather: p.weather || '',
      tags: p.tags || '',
      is_public: p.is_public ? 1 : 0,
      kind: p.kind || 'memory',
      author: p.author || '',
      entry_date: p.entry_date || '',
      type: p.type || '其他',
      position_x: Number(p.position_x) || 0,
      position_y: Number(p.position_y) || 0,
      rotation: Number(p.rotation) || 0,
      ai_cover: p.ai_cover || '',
      created_at: now(),
      updated_at: now(),
    })
    if (Array.isArray(p.media) && p.media.length) {
      await col('memory_media').add(
        p.media.map((m, i) => ({
          memory_id: r.id,
          type: Number(m.type) || 1,
          url: m.url,
          thumb: m.thumb || '',
          duration: Number(m.duration) || 0,
          sort: m.sort !== undefined ? m.sort : i,
          created_at: now(),
        }))
      )
    }
    const item = await getDoc('memory_item', r.id)
    const space = await getDoc('memory_space', spaceId)
    const media = (await col('memory_media').where({ memory_id: r.id }).orderBy('sort', 'asc').get()).data
    return { ...withId(item), space_name: space ? space.name : '', owner_id: uid, media: withId(media) }
  },
  'memory/item/update': async (p, uid) => {
    const item = await getDoc('memory_item', p.id)
    if (!item) throw err('记忆不存在')
    await mustSpaceOwner(item.space_id, uid)
    const patch = {}
    ;['title', 'content', 'mood', 'weather', 'tags', 'position_x', 'position_y', 'rotation', 'kind', 'author', 'entry_date', 'type', 'is_public', 'ai_cover'].forEach((k) => {
      if (p[k] !== undefined) patch[k] = p[k]
    })
    patch.updated_at = now()
    await col('memory_item').doc(p.id).update(patch)
    if (Array.isArray(p.media)) {
      await col('memory_media').where({ memory_id: p.id }).remove()
      if (p.media.length) {
        await col('memory_media').add(
          p.media.map((m, i) => ({
            memory_id: p.id,
            type: Number(m.type) || 1,
            url: m.url,
            thumb: m.thumb || '',
            duration: Number(m.duration) || 0,
            sort: m.sort !== undefined ? m.sort : i,
            created_at: now(),
          }))
        )
      }
    }
    const updated = await getDoc('memory_item', p.id)
    const space = await getDoc('memory_space', item.space_id)
    const media = (await col('memory_media').where({ memory_id: p.id }).orderBy('sort', 'asc').get()).data
    return { ...withId(updated), space_name: space ? space.name : '', owner_id: space ? space.user_id : '', media: withId(media) }
  },
  'memory/item/remove': async (p, uid) => {
    const item = await getDoc('memory_item', p.id)
    if (!item) throw err('记忆不存在')
    await mustSpaceOwner(item.space_id, uid)
    await col('memory_media').where({ memory_id: p.id }).remove()
    await col('memory_item').doc(p.id).remove()
    return { removed: true }
  },

  // ---------- 媒体上传 ----------
  'media/upload': async (p, uid) => {
    const m = /^data:(image\/(png|jpe?g|webp|gif));base64,(.+)$/.exec(p.dataUrl || '')
    if (!m) throw err('仅支持 png/jpg/webp/gif 图片')
    const buf = Buffer.from(m[3], 'base64')
    if (buf.length > 6 * 1024 * 1024) throw err('图片过大(限 6MB)')
    const ext = m[2].replace('jpeg', 'jpg')
    const cloudPath = `uploads/${now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`
    try {
      const result = await uniCloud.uploadFile({
        cloudPath,
        fileContent: buf,
      })
      return { url: result.fileID || result.url || '' }
    } catch (e) {
      // 若 uniCloud 文件上传不可用, 降级为 dataURL 直接存储
      return { url: p.dataUrl }
    }
  },

  // ---------- 广场 ----------
  'square/post/list': async (p, uid) => {
    const page = Number(p.page) || 1
    const pageSize = Math.min(Number(p.pageSize) || 10, 50)
    const where = { is_public: 1 }
    const total = await col('square_post').where(where).count()
    const rows = await col('square_post')
      .where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
    return { total: total.total, page, pageSize, list: await attachAuthors(rows.data, uid) }
  },
  'square/post/create': async (p, uid) => {
    if (!p.content) throw err('帖子内容不能为空')
    const r = await col('square_post').add({
      user_id: uid,
      space_id: p.space_id || null,
      content: p.content,
      images: p.images || '',
      tags: Array.isArray(p.tags) ? p.tags.join(',') : p.tags || '',
      likes_count: 0,
      comments_count: 0,
      is_public: p.is_public === 0 ? 0 : 1,
      created_at: now(),
      updated_at: now(),
    })
    const doc = await getDoc('square_post', r.id)
    return (await attachAuthors([doc], uid))[0]
  },
  'square/post/detail': async (p, uid) => {
    const doc = await getDoc('square_post', p.id)
    if (!doc) throw err('帖子不存在')
    if (doc.is_public !== 1 && doc.user_id !== uid) throw err('无权查看')
    return (await attachAuthors([doc], uid))[0]
  },
  'square/post/remove': async (p, uid) => {
    const doc = await getDoc('square_post', p.id)
    if (!doc) throw err('帖子不存在')
    if (doc.user_id !== uid) throw err('无权删除')
    await col('post_like').where({ post_id: p.id }).remove()
    await col('post_comment').where({ post_id: p.id }).remove()
    await col('square_post').doc(p.id).remove()
    return { removed: true }
  },
  'square/like/toggle': async (p, uid) => {
    const post = await getDoc('square_post', p.post_id)
    if (!post) throw err('帖子不存在')
    const exist = await findOne('post_like', { post_id: p.post_id, user_id: uid })
    if (exist) {
      await col('post_like').doc(exist._id).remove()
      await col('square_post').doc(p.post_id).update({ likes_count: cmd.inc(-1) })
      return { liked: false, likes_count: Math.max(post.likes_count - 1, 0) }
    }
    await col('post_like').add({ post_id: p.post_id, user_id: uid, created_at: now() })
    await col('square_post').doc(p.post_id).update({ likes_count: cmd.inc(1) })
    return { liked: true, likes_count: post.likes_count + 1 }
  },
  'square/comment/list': async (p) => {
    const rows = await col('post_comment')
      .where({ post_id: p.post_id })
      .orderBy('created_at', 'asc')
      .limit(200)
      .get()
    return attachAuthors(rows.data, null)
  },
  'square/comment/create': async (p, uid) => {
    const post = await getDoc('square_post', p.post_id)
    if (!post) throw err('帖子不存在')
    if (!p.content) throw err('评论内容不能为空')
    const r = await col('post_comment').add({
      post_id: p.post_id,
      user_id: uid,
      parent_id: p.parent_id || null,
      content: p.content,
      likes_count: 0,
      created_at: now(),
      updated_at: now(),
    })
    await col('square_post').doc(p.post_id).update({ comments_count: cmd.inc(1) })
    return (await attachAuthors([await getDoc('post_comment', r.id)], uid))[0]
  },
  'square/comment/remove': async (p, uid) => {
    const doc = await getDoc('post_comment', p.id)
    if (!doc) throw err('评论不存在')
    if (doc.user_id !== uid) throw err('无权删除')
    const children = await col('post_comment').where({ parent_id: p.id }).count()
    await col('post_comment').where({ parent_id: p.id }).remove()
    await col('post_comment').doc(p.id).remove()
    await col('square_post').doc(doc.post_id).update({ comments_count: cmd.inc(-(children.total + 1)) })
    return { removed: true }
  },

  // ---------- 收藏 / 关注 ----------
  'favorite/toggle': async (p, uid) => {
    const type = Number(p.target_type)
    if (![1, 2, 3].includes(type) || !p.target_id) throw err('收藏目标无效')
    const exist = await findOne('favorite', { user_id: uid, target_type: type, target_id: p.target_id })
    if (exist) {
      await col('favorite').doc(exist._id).remove()
      return { favorited: false }
    }
    await col('favorite').add({ user_id: uid, target_type: type, target_id: p.target_id, created_at: now() })
    return { favorited: true }
  },
  'favorite/list': async (p, uid) => {
    const where = { user_id: uid }
    if (p.target_type) where.target_type = Number(p.target_type)
    return (await col('favorite').where(where).orderBy('created_at', 'desc').get()).data
  },
  'follow/toggle': async (p, uid) => {
    if (!p.following_id || p.following_id === uid) throw err('关注目标无效')
    const exist = await findOne('user_follow', { follower_id: uid, following_id: p.following_id })
    if (exist) {
      await col('user_follow').doc(exist._id).remove()
      return { following: false }
    }
    await col('user_follow').add({ follower_id: uid, following_id: p.following_id, created_at: now() })
    return { following: true }
  },
  'follow/check': async (p, uid) => ({
    following: !!(await findOne('user_follow', { follower_id: uid, following_id: p.following_id })),
  }),

  // ---------- AI 会话 ----------
  'ai/conversation/list': async (_p, uid) =>
    (await col('ai_conversation').where({ user_id: uid }).orderBy('updated_at', 'desc').get()).data,
  'ai/conversation/create': async (p, uid) => {
    const r = await col('ai_conversation').add({
      user_id: uid,
      title: p.title || '新的对话',
      companion_type: Number(p.companion_type) || 1,
      created_at: now(),
      updated_at: now(),
    })
    return getDoc('ai_conversation', r.id)
  },
  'ai/conversation/remove': async (p, uid) => {
    const doc = await getDoc('ai_conversation', p.id)
    if (!doc || doc.user_id !== uid) throw err('会话不存在')
    await col('ai_message').where({ conversation_id: p.id }).remove()
    await col('ai_conversation').doc(p.id).remove()
    return { removed: true }
  },
  'ai/message/list': async (p, uid) => {
    const doc = await getDoc('ai_conversation', p.conversation_id)
    if (!doc || doc.user_id !== uid) throw err('会话不存在')
    return (await col('ai_message').where({ conversation_id: p.conversation_id }).orderBy('created_at', 'asc').get())
      .data
  },
  'ai/message/add': async (p, uid) => {
    const doc = await getDoc('ai_conversation', p.conversation_id)
    if (!doc || doc.user_id !== uid) throw err('会话不存在')
    if (!['user', 'assistant', 'system'].includes(p.role)) throw err('角色无效')
    const r = await col('ai_message').add({
      conversation_id: p.conversation_id,
      role: p.role,
      content: p.content || '',
      tokens: Number(p.tokens) || 0,
      created_at: now(),
    })
    await col('ai_conversation').doc(p.conversation_id).update({ updated_at: now() })
    return getDoc('ai_message', r.id)
  },

  // ---------- 宠物 ----------
  'pet/get': async (_p, uid) => {
    let pet = await findOne('pet_config', { user_id: uid })
    if (!pet) {
      const r = await col('pet_config').add({
        user_id: uid,
        pet_type: 'cat',
        pet_name: '拾光兽',
        level: 1,
        exp: 0,
        mood: 80,
        outfit: '',
        accessories: '',
        last_interact: now(),
        created_at: now(),
        updated_at: now(),
      })
      pet = await getDoc('pet_config', r.id)
    }
    return pet
  },
  'pet/update': async (p, uid) => {
    const pet = await findOne('pet_config', { user_id: uid })
    if (!pet) throw err('宠物不存在')
    const patch = {}
    ;['pet_type', 'pet_name', 'outfit', 'accessories'].forEach((k) => {
      if (p[k] !== undefined) patch[k] = p[k]
    })
    patch.updated_at = now()
    await col('pet_config').doc(pet._id).update(patch)
    return getDoc('pet_config', pet._id)
  },
  'pet/interact': async (_p, uid) => {
    const pet = await findOne('pet_config', { user_id: uid })
    if (!pet) throw err('宠物不存在')
    const exp = pet.exp + 5
    const patch = {
      exp,
      mood: Math.min(100, pet.mood + 2),
      level: Math.floor(exp / 100) + 1,
      last_interact: now(),
      updated_at: now(),
    }
    await col('pet_config').doc(pet._id).update(patch)
    return getDoc('pet_config', pet._id)
  },

  // ---------- 反馈 ----------
  'feedback/create': async (p, uid) => {
    if (![1, 2, 3].includes(Number(p.type))) throw err('反馈类型无效')
    if (!p.content) throw err('反馈内容不能为空')
    const r = await col('feedback').add({
      user_id: uid,
      type: Number(p.type),
      content: p.content,
      contact: p.contact || '',
      status: 0,
      reply: '',
      created_at: now(),
      updated_at: now(),
    })
    return getDoc('feedback', r.id)
  },
  'feedback/list': async (_p, uid) =>
    (await col('feedback').where({ user_id: uid }).orderBy('created_at', 'desc').get()).data,
  'feedback/remove': async (p, uid) => {
    const docs = await col('feedback').where({ id: p.id, user_id: uid }).get()
    if (!docs.data || !docs.data.length) throw err('反馈不存在或无权删除')
    await col('feedback').doc(p.id).remove()
    return { removed: true }
  },

  // 用户提交举报
  'report/create': async (p, uid) => {
    if (![1, 2, 3].includes(Number(p.target_type))) throw err('举报目标类型无效')
    if (!p.target_id) throw err('举报目标ID不能为空')
    if (!p.reason) throw err('举报原因不能为空')
    const r = await col('report').add({
      reporter_id: uid,
      target_type: Number(p.target_type),
      target_id: p.target_id,
      reason: p.reason,
      status: 0,
      handle_note: '',
      created_at: now(),
      updated_at: now(),
    })
    return getDoc('report', r.id)
  },

  // 公开活动列表
  'activity/list': async (p, uid) => {
    const rows = (await col('activity').where({ is_public: 1 }).orderBy('sort', 'desc').orderBy('created_at', 'desc').get()).data
    const t = now()
    const result = []
    for (const r of rows) {
      const likes = (await col('activity_like').where({ activity_id: r._id }).count()).total
      const isLiked = uid ? !!(await findOne('activity_like', { activity_id: r._id, user_id: uid })) : false
      const joined = (await col('activity_join').where({ activity_id: r._id }).count()).total
      const isJoined = uid ? !!(await findOne('activity_join', { activity_id: r._id, user_id: uid })) : false
      const comments = (await col('activity_comment').where({ activity_id: r._id }).count()).total
      let status = 1
      if (r.end_time && r.end_time <= t) status = 2
      else if (r.start_time && r.start_time > t) status = 0
      result.push({ ...withId(r), likes, isLiked, joined, isJoined, comments, status })
    }
    return result
  },

  // 活动点赞
  'activity/like': async (p, uid) => {
    if (!p.activity_id) throw err('活动 ID 不能为空')
    const existing = await findOne('activity_like', { activity_id: p.activity_id, user_id: uid })
    if (!existing) {
      await col('activity_like').add({ activity_id: p.activity_id, user_id: uid, created_at: now() })
    }
    const liked = (await col('activity_like').where({ activity_id: p.activity_id }).count()).total
    return { liked, isLiked: true }
  },
  'activity/unlike': async (p, uid) => {
    if (!p.activity_id) throw err('活动 ID 不能为空')
    const existing = await findOne('activity_like', { activity_id: p.activity_id, user_id: uid })
    if (existing) await col('activity_like').doc(existing._id).remove()
    const liked = (await col('activity_like').where({ activity_id: p.activity_id }).count()).total
    return { liked, isLiked: false }
  },
  'activity/checkLike': async (p, uid) => {
    if (!uid) return { isLiked: false, liked: 0 }
    const row = await findOne('activity_like', { activity_id: p.activity_id, user_id: uid })
    const liked = (await col('activity_like').where({ activity_id: p.activity_id }).count()).total
    return { isLiked: !!row, liked }
  },

  // 活动评论
  'activity/comment/list': async (p) => {
    const rows = await col('activity_comment').where({ activity_id: p.activity_id }).orderBy('created_at', 'asc').get()
    // 关联用户信息
    const result = []
    for (const r of rows.data) {
      const user = await getDoc('user', r.user_id)
      result.push({
        id: r._id,
        author: user ? (user.nickname || user.username || '匿名') : '匿名',
        content: r.content,
        image: r.image || null,
        created_at: r.created_at,
      })
    }
    return result
  },
  'activity/comment/create': async (p, uid) => {
    if (!p.activity_id) throw err('活动 ID 不能为空')
    if (!p.content && !p.image) throw err('评论内容不能为空')
    await col('activity_comment').add({
      activity_id: p.activity_id,
      user_id: uid,
      content: p.content || '',
      image: p.image || '',
      created_at: now(),
    })
    return { ok: true }
  },

  // 活动加入/退出
  'activity/join': async (p, uid) => {
    if (!p.activity_id) throw err('活动 ID 不能为空')
    // 检查是否已加入
    const existing = await findOne('activity_join', { activity_id: p.activity_id, user_id: uid })
    if (!existing) {
      await col('activity_join').add({
        activity_id: p.activity_id,
        user_id: uid,
        created_at: now(),
      })
    }
    const joined = (await col('activity_join').where({ activity_id: p.activity_id }).count()).total
    return { joined, isJoined: true }
  },
  'activity/unjoin': async (p, uid) => {
    if (!p.activity_id) throw err('活动 ID 不能为空')
    const existing = await findOne('activity_join', { activity_id: p.activity_id, user_id: uid })
    if (existing) await col('activity_join').doc(existing._id).remove()
    const joined = (await col('activity_join').where({ activity_id: p.activity_id }).count()).total
    return { joined, isJoined: false }
  },
  'activity/checkJoin': async (p, uid) => {
    if (!uid) return { isJoined: false, joined: 0 }
    const row = await findOne('activity_join', { activity_id: p.activity_id, user_id: uid })
    const joined = (await col('activity_join').where({ activity_id: p.activity_id }).count()).total
    return { isJoined: !!row, joined }
  },

  // ---------- 管理员 ----------
  'admin/feedback/list': async (p, uid) => {
    await isAdmin(uid)
    const where = {}
    if (p.status !== undefined && p.status !== '') where.status = Number(p.status)
    if (p.type) where.type = Number(p.type)
    const rows = await col('feedback').where(where).orderBy('created_at', 'desc').get()
    return attachAuthors(rows.data, null)
  },
  'admin/feedback/update': async (p, uid) => {
    await isAdmin(uid)
    const patch = {}
    if (p.status !== undefined) patch.status = Number(p.status)
    if (p.reply !== undefined) patch.reply = p.reply
    patch.updated_at = now()
    await col('feedback').doc(p.id).update(patch)
    return getDoc('feedback', p.id)
  },
  'admin/feedback/remove': async (p, uid) => {
    await isAdmin(uid)
    await col('feedback').doc(p.id).remove()
    return { removed: true }
  },

  'admin/report/list': async (p, uid) => {
    await isAdmin(uid)
    const where = {}
    if (p.status !== undefined && p.status !== '') where.status = Number(p.status)
    return (await col('report').where(where).orderBy('created_at', 'desc').get()).data
  },
  'admin/report/update': async (p, uid) => {
    await isAdmin(uid)
    const patch = {}
    if (p.status !== undefined) patch.status = Number(p.status)
    if (p.handle_note !== undefined) patch.handle_note = p.handle_note
    patch.updated_at = now()
    await col('report').doc(p.id).update(patch)
    return getDoc('report', p.id)
  },
  'admin/report/remove': async (p, uid) => {
    await isAdmin(uid)
    await col('report').doc(p.id).remove()
    return { removed: true }
  },

  'admin/activity/list': async (p, uid) => {
    await isAdmin(uid)
    return (await col('activity').orderBy('sort', 'desc').orderBy('created_at', 'desc').get()).data
  },
  'admin/activity/create': async (p, uid) => {
    await isAdmin(uid)
    if (!p.title) throw err('活动标题不能为空')
    if (!p.content) throw err('活动详情不能为空')
    const r = await col('activity').add({
      title: p.title,
      content: p.content,
      cover: p.cover || '',
      type: Number(p.type) || 1,
      is_public: p.is_public === 0 ? 0 : 1,
      is_major: p.is_major === 1 || p.is_major === true ? 1 : 0,
      sort: Number(p.sort) || 0,
      created_at: now(),
      updated_at: now(),
    })
    return getDoc('activity', r.id)
  },
  'admin/activity/update': async (p, uid) => {
    await isAdmin(uid)
    const patch = {}
    ;['title', 'content', 'cover', 'type', 'is_public', 'is_major', 'sort'].forEach((k) => {
      if (p[k] !== undefined) patch[k] = p[k]
    })
    patch.updated_at = now()
    await col('activity').doc(p.id).update(patch)
    return getDoc('activity', p.id)
  },
  'admin/activity/remove': async (p, uid) => {
    await isAdmin(uid)
    await col('activity').doc(p.id).remove()
    return { removed: true }
  },

  'admin/user/list': async (p, uid) => {
    await isAdmin(uid)
    const keyword = p.keyword || ''
    if (keyword) {
      return (
        await col('user')
          .where(cmd.or([{ username: new RegExp(keyword) }, { nickname: new RegExp(keyword) }]))
          .field({ username: true, nickname: true, avatar: true, email: true, role: true, status: true, created_at: true })
          .orderBy('created_at', 'desc')
          .get()
      ).data
    }
    return (
      await col('user')
        .field({ username: true, nickname: true, avatar: true, email: true, role: true, status: true, created_at: true })
        .orderBy('created_at', 'desc')
        .get()
    ).data
  },
  'admin/user/update': async (p, uid) => {
    await isAdmin(uid)
    const patch = {}
    if (p.status !== undefined) patch.status = Number(p.status)
    if (p.nickname !== undefined) patch.nickname = p.nickname
    patch.updated_at = now()
    await col('user').doc(p.id).update(patch)
    return getDoc('user', p.id)
  },
  'admin/user/setAdmin': async (p, uid) => {
    const admin = await isAdmin(uid)
    if (p.id === admin._id) throw err('不能修改自己的管理员状态')
    const role = p.role ? 1 : 0
    await col('user').doc(p.id).update({ role, updated_at: now() })
    return getDoc('user', p.id)
  },
  'admin/user/remove': async (p, uid) => {
    const admin = await isAdmin(uid)
    if (p.id === admin._id) throw err('不能删除自己')
    // 先删除该用户发送的私信，避免 CASCADE 删除对方的私信
    await col('private_message').where({ sender_id: p.id }).remove()
    await col('user').doc(p.id).remove()
    return { removed: true }
  },
}

const PUBLIC_ACTIONS = new Set([
  'system/health',
  'auth/register',
  'auth/login',
  'share/view',
  'square/post/list',
  'square/post/detail',
  'square/comment/list',
  'activity/list',
  'activity/comment/list',
])

// ---------------- 入口 ----------------
exports.main = async (event) => {
  if (event.httpMethod === 'OPTIONS') return http({ code: 0 }, 204)
  let body = {}
  if (typeof event.body === 'string' && event.body) {
    try {
      body = JSON.parse(event.body)
    } catch (e) {
      body = {}
    }
  } else if (event.body && typeof event.body === 'object') {
    body = event.body
  } else {
    body = event || {}
  }
  const action = body.action || ''
  const params = body.params || {}
  const token = body.token || ''
  const handler = handlers[action]
  if (!handler) return fail('未知 action: ' + action, 404)
  const uid = verifyToken(token)
  if (!PUBLIC_ACTIONS.has(action) && !uid) return fail('未登录或登录已过期', 401)
  try {
    params._uid = uid
    return ok(withId(await handler(params, uid)))
  } catch (e) {
    return fail(e.message || '服务器内部错误', 500)
  }
}
