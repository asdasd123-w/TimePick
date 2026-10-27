// 清空数据库所有数据（保留管理员用户）
// 用法：在 uniCloud 云函数控制台执行此代码，或本地连接 MongoDB 执行

const db = uniCloud.database()

async function clearDatabase() {
  console.log('开始清空数据库...')
  
  // 获取管理员用户ID（优乐美）
  const adminUser = await db.collection('user').where({ username: '优乐美' }).get()
  let adminId = null
  if (adminUser.data && adminUser.data.length > 0) {
    adminId = adminUser.data[0]._id
    console.log('找到管理员 ID:', adminId)
  } else {
    console.warn('未找到管理员用户，将清空所有用户')
  }
  
  // 清空各集合（按依赖顺序，先清空子表）
  const collections = [
    'activity_comment',      // 活动评论
    'activity_join',         // 活动参与
    'post_comment',          // 帖子评论
    'post_like',             // 帖子点赞
    'favorite',              // 收藏
    'user_follow',           // 关注关系
    'memory_media',          // 记忆媒体
    'memory_item',           // 记忆条目
    'ai_message',            // AI 消息
    'ai_conversation',       // AI 对话
    'feedback',              // 反馈
    'report',                // 举报
    'activity',              // 活动
    'square_post',           // 广场帖子
    'pet_config',            // 宠物配置
    'user_profile',          // 用户资料
    'user_settings',         // 用户设置
    'share',                 // 分享记录
  ]
  
  for (const colName of collections) {
    try {
      const collection = db.collection(colName)
      
      // 如果是 user 表，需要排除管理员
      if (colName === 'user') {
        if (adminId) {
          // 删除非管理员用户
          const res = await collection.where({ _id: db.command.neq(adminId) }).remove()
          console.log(`清空 ${colName}: 删除了 ${res.deleted} 条非管理员记录`)
        } else {
          // 没有管理员，清空所有
          const res = await collection.remove()
          console.log(`清空 ${colName}: 删除了 ${res.deleted} 条记录`)
        }
      } else {
        const res = await collection.remove()
        console.log(`清空 ${colName}: 删除了 ${res.deleted} 条记录`)
      }
    } catch (err) {
      console.error(`清空 ${colName} 失败:`, err.message)
    }
  }
  
  console.log('数据库清空完成！')
  console.log('提示：请在云函数控制台手动添加演示数据，或运行 seed-demo 脚本')
}

// 如果在云函数环境执行
exports.main = async (event) => {
  await clearDatabase()
  return { success: true, message: '数据库已清空' }
}

// 如果在本地 Node.js 环境执行（需要修改为本地 MongoDB 连接）
if (typeof module !== 'undefined' && require.main === module) {
  clearDatabase().catch(console.error)
}
