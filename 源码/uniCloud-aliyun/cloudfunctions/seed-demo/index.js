// uniCloud 演示数据种子云函数
// 用法: 在 uniCloud 控制台创建此云函数并运行，或本地调用

const db = uniCloud.database()
const crypto = require('crypto')

const now = Date.now()
const H = 3600 * 1000

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(salt + ':' + password).digest('hex')
}

async function seedDemoData() {
  console.log('开始填充演示数据...')
  
  // 检查是否已有演示数据
  const existingUser = await db.collection('user').where({ username: '优乐美' }).get()
  if (existingUser.data && existingUser.data.length > 0) {
    console.log('演示数据已存在，跳过种子')
    return { success: true, message: '演示数据已存在' }
  }
  
  // 添加演示用户
  const users = {}
  const adminUsers = new Set(['优乐美'])
  const userList = [
    ['优乐美', '优乐美'],
    ['xiaohe', '小禾'],
    ['momo', 'momo'],
    ['azhe', '阿哲'],
    ['xiaoman', '小满不满'],
    ['ayu', '阿芋'],
    ['tangyuan', '汤圆不糖'],
    ['laozhou', '老周的胶片机'],
  ]
  
  for (const [username, nickname] of userList) {
    const salt = crypto.randomBytes(8).toString('hex')
    const role = adminUsers.has(username) ? 1 : 0
    const pwd = adminUsers.has(username) ? '002529' : 'demo123456'
    const res = await db.collection('user').add({
      username,
      password: salt + '$' + hashPassword(pwd, salt),
      nickname,
      avatar: '',
      email: null,
      role,
      status: 1,
      created_at: now - 90 * 24 * H,
      updated_at: now,
    })
    users[nickname] = res.id
  }
  console.log(`创建了 ${userList.length} 位演示用户`)
  
  // 添加广场帖子
  const POSTS = [
    {
      by: '林间',
      hours: 2,
      likes: 245,
      text: '今天的晚霞真的好美,\n走在回宿舍的路上, 突然觉得一切都柔软了。',
      tags: '日常,晚霞,大学生活',
      comments: [
        ['阿芋', '这个瞬间也太温柔了, 偷偷收藏了!'],
        ['汤圆不糖', '看到最后一句鼻子一酸…'],
        ['老周的胶片机', '光影和文字都刚刚好, 学到了。'],
      ],
    },
    {
      by: '小禾',
      hours: 5,
      likes: 189,
      text: '最近读完了《也许你该找个人聊聊》,\n很多话好像被唤醒了。\n生活虽然会有很多乱七八糟的时刻,\n但依然值得期待。',
      tags: '书籍,阅读,自我成长',
      comments: [
        ['阿芋', '好喜欢这种慢慢记录的感觉。'],
        ['林间', '同款经历! 那天的风我也记得。'],
      ],
    },
    {
      by: 'momo',
      hours: 24,
      likes: 132,
      text: '学校的小花园开花了 🌷\n熟悉的味道又回来了,\n好像每年闻到这个味道,\n才真正意识到秋天来了。',
      tags: '花卉,校园,秋天',
      comments: [
        ['汤圆不糖', '被安利了, 这就去翻自己的旧记忆。'],
        ['小禾', '文字里有味道, 好像真的闻到了。'],
        ['阿芋', '希望我的秋天也这样温柔。'],
      ],
    },
    {
      by: '阿哲',
      hours: 48,
      likes: 98,
      text: '把上个月的胶卷洗出来了,\n巷子里的光影, 像时间给的礼物。',
      tags: '自拍,风景,日常',
      comments: [
        ['老周的胶片机', '同好! 这卷是什么片子?'],
        ['林间', '巷子的光影最耐看了。'],
      ],
    },
    {
      by: '小满不满',
      hours: 72,
      likes: 76,
      text: '在山里录了一整晚的雨声,\n现在回放, 还能闻到草木的味道。',
      tags: '音乐,雨天,旅行',
      comments: [['汤圆不糖', '雨声是最白的白噪音。']],
    },
  ]
  
  let postCount = 0
  let commentCount = 0
  for (const p of POSTS) {
    const created = now - p.hours * H
    const res = await db.collection('square_post').add({
      user_id: users[p.by],
      space_id: null,
      content: p.text,
      images: '',
      tags: p.tags,
      likes_count: p.likes,
      comments_count: 0,
      is_public: 1,
      created_at: created,
      updated_at: created,
    })
    postCount++
    
    // 添加评论
    for (let i = 0; i < p.comments.length; i++) {
      const [name, text] = p.comments[i]
      const ct = created + (i + 1) * 10 * 60 * 1000
      await db.collection('post_comment').add({
        post_id: res.id,
        user_id: users[name],
        parent_id: null,
        content: text,
        likes_count: 0,
        created_at: ct,
        updated_at: ct,
      })
      commentCount++
    }
    
    // 更新评论数
    await db.collection('square_post').doc(res.id).update({
      comments_count: p.comments.length,
    })
  }
  console.log(`创建了 ${postCount} 条帖子，${commentCount} 条评论`)
  
  // 添加反馈
  const feedbacks = [
    [users['林间'], 3, '希望宠物小猫的动作可以更丰富一点, 比如会打滚!', 0, ''],
    [users['小禾'], 1, '希望记忆库可以按类型筛选, 找起来更方便。', 1, '新版本已上线类型筛选, 感谢你的建议!'],
    [users['momo'], 2, '首页日历切换月份时偶尔会没有响应。', 2, '已修复, 更新到最新版本即可体验。'],
  ]
  for (const [uid, type, content, status, reply] of feedbacks) {
    await db.collection('feedback').add({
      user_id: uid,
      type,
      content,
      contact: '',
      status,
      reply,
      created_at: now - Math.floor(Math.random() * 30) * 24 * H,
      updated_at: now,
    })
  }
  console.log(`创建了 ${feedbacks.length} 条反馈`)
  
  // 添加举报
  const reports = [
    [users['阿芋'], 1, 1, '该帖子包含不当内容', 0, ''],
    [users['汤圆不糖'], 2, 3, '评论有攻击性言论', 1, '已删除违规评论, 对评论者进行警告'],
  ]
  for (const [reporterId, targetType, targetId, reason, status, note] of reports) {
    await db.collection('report').add({
      reporter_id: reporterId,
      target_type: targetType,
      target_id: targetId,
      reason,
      status,
      handle_note: note,
      created_at: now - Math.floor(Math.random() * 10) * 24 * H,
      updated_at: now,
    })
  }
  console.log(`创建了 ${reports.length} 条举报`)
  
  // 添加活动（含大型活动）
  const activities = [
    ['拾光一周年 · 记忆展览', '我们一岁了! 回顾这一年的温暖瞬间, 分享你的拾光故事, 有机会获得限定宠物装扮。', '', 2, 1, 1, 100],
    ['v2.0 版本更新公告', '新增记忆空间协作功能、AI 陪伴升级、宠物互动动作扩充。', '', 3, 1, 0, 50],
    ['秋季摄影大赛', '用镜头记录秋天, 上传你的秋日记忆, 点赞最多的作品将获得「秋日拾光者」称号。', '', 2, 1, 0, 30],
  ]
  for (const [title, content, cover, type, isPublic, isMajor, sort] of activities) {
    await db.collection('activity').add({
      title,
      content,
      cover,
      type,
      is_public: isPublic,
      is_major: isMajor,
      sort,
      created_at: now - Math.floor(Math.random() * 30) * 24 * H,
      updated_at: now,
    })
  }
  console.log(`创建了 ${activities.length} 条活动（含 ${activities.filter(a => a[5]).length} 个大型活动）`)
  
  console.log('\n✅ 演示数据填充完成！')
  console.log('\n演示账号:')
  console.log('  管理员: 优乐美 / 002529')
  console.log('  普通用户: xiaohe, momo, azhe... / demo123456')
  
  return {
    success: true,
    message: '演示数据填充完成',
    users: userList.length,
    posts: postCount,
    comments: commentCount,
    feedbacks: feedbacks.length,
    reports: reports.length,
    activities: activities.length,
  }
}

// 云函数入口
exports.main = async (event) => {
  try {
    return await seedDemoData()
  } catch (err) {
    console.error('种子执行失败:', err)
    return {
      success: false,
      message: '填充失败: ' + err.message,
    }
  }
}
