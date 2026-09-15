-- TimePick「拾光」SQLite 建表脚本(14 张表, 与 ER 图一一对应)
-- 时间字段统一为 INTEGER 毫秒时间戳

CREATE TABLE IF NOT EXISTS user (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL UNIQUE,
  password   TEXT    NOT NULL,
  nickname   TEXT    NOT NULL DEFAULT '',
  avatar     TEXT    NOT NULL DEFAULT '',
  email      TEXT             DEFAULT NULL UNIQUE,
  role       INTEGER NOT NULL DEFAULT 0,
  status     INTEGER NOT NULL DEFAULT 1,
  -- 用户级 AI 权限(管理员可在后台单独关闭某个用户): 1 允许 / 0 禁止
  ai_chat    INTEGER NOT NULL DEFAULT 1,
  ai_image   INTEGER NOT NULL DEFAULT 1,
  ai_video   INTEGER NOT NULL DEFAULT 1,
  -- token_epoch: 改密/禁用时自增, 使此前签发的所有 token 立即失效
  token_epoch INTEGER NOT NULL DEFAULT 0,
  -- wechat_uid: 微信扫码登录绑定的云端身份(形如 wx:oXXXX), NULL = 该账号不用微信登录
  wechat_uid TEXT             DEFAULT NULL,
  -- phone: 微信扫码带回来的手机号(没有就 NULL)。只做展示与"以后能不能手机号登录"的提示,
  --        登录凭证仍是 username —— 微信网页授权在拿不到手机号时不能让账号失去用户名。
  phone      TEXT             DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 系统级配置(键值对): 管理中心「AI 使用」的总开关存这里
-- ai_reply = AI 自动回复总开关 / ai_image = AI 生图总开关 / ai_video = AI 生视频总开关(功能未实现, 仅预留)
CREATE TABLE IF NOT EXISTS system_config (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profile (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE REFERENCES user (id) ON DELETE CASCADE,
  gender     INTEGER NOT NULL DEFAULT 0,
  birthday   INTEGER          DEFAULT NULL,
  bio        TEXT    NOT NULL DEFAULT '',
  quote      TEXT    NOT NULL DEFAULT '',
  hobbies    TEXT    NOT NULL DEFAULT '',
  occupation TEXT    NOT NULL DEFAULT '',
  location   TEXT    NOT NULL DEFAULT '',
  avatar     TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_space (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  cover       TEXT    NOT NULL DEFAULT '',
  theme       TEXT    NOT NULL DEFAULT '',
  is_public   INTEGER NOT NULL DEFAULT 0,
  -- 岛屿三件套: 总览页展示用的名称 / 鼠标悬停文案 / 外观 key(islands.js 里 6 选 1)
  island_name TEXT    NOT NULL DEFAULT '',
  island_tip  TEXT    NOT NULL DEFAULT '',
  island_art  TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_item (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id   INTEGER NOT NULL REFERENCES memory_space (id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL DEFAULT '',
  mood       TEXT    NOT NULL DEFAULT '',
  weather    TEXT    NOT NULL DEFAULT '',
  tags       TEXT    NOT NULL DEFAULT '',
  is_public  INTEGER NOT NULL DEFAULT 0,
  shared_at  INTEGER NOT NULL DEFAULT 0,
  kind       TEXT    NOT NULL DEFAULT 'memory',
  author     TEXT    NOT NULL DEFAULT '',
  entry_date TEXT    NOT NULL DEFAULT '',
  type       TEXT    NOT NULL DEFAULT '其他',
  position_x REAL    NOT NULL DEFAULT 0,
  position_y REAL    NOT NULL DEFAULT 0,
  rotation   REAL    NOT NULL DEFAULT 0,
  ai_cover   TEXT    NOT NULL DEFAULT '',
  -- 1 = 该记忆创建时用户没有 AI 出图权限(或当时被管理员限制), 已判定为「未使用 AI」,
  -- 之后即使管理员恢复权限也不再自动补生成, 避免历史记忆突然冒出一张图
  ai_denied  INTEGER NOT NULL DEFAULT 0,
  -- AI 图生视频: 成品视频的 /uploads/videos/xxx 访问地址(每条记忆只能生成一个, 永久保存不可更改/删除)
  ai_video   TEXT    NOT NULL DEFAULT '',
  -- 视频生成是异步的: 提交任务后暂存 DashScope 的 task_id, 轮询到成功就落库 ai_video 并清空
  ai_video_task TEXT NOT NULL DEFAULT '',
  island_tip TEXT    NOT NULL DEFAULT '',
  island_art TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id  INTEGER NOT NULL REFERENCES memory_item (id) ON DELETE CASCADE,
  type       INTEGER NOT NULL DEFAULT 1,
  url        TEXT    NOT NULL,
  thumb      TEXT    NOT NULL DEFAULT '',
  duration   INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 共享记忆评论: 对公开记忆条目的评论, 所有登录用户可见
CREATE TABLE IF NOT EXISTS memory_comment (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id  INTEGER NOT NULL REFERENCES memory_item (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

-- 记忆点赞
CREATE TABLE IF NOT EXISTS memory_item_like (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id  INTEGER NOT NULL REFERENCES memory_item (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(memory_id, user_id)
);

-- 3D 房间摆件方案: 每条记忆(记忆空间中的一座岛上的记忆)对应 3D 房间(sg3d)里的一件家具。
-- 与「记忆空间」一一对应: 一个 space_id = 一间 3D 房间(现阶段都复用 house_three.glb)。
-- item_id 唯一, 天然保证「每条记忆只摆一件」; 删除记忆时(外键 CASCADE)连带删除本表行。
CREATE TABLE IF NOT EXISTS room_prop (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  space_id   INTEGER NOT NULL REFERENCES memory_space (id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL UNIQUE REFERENCES memory_item (id) ON DELETE CASCADE,
  furniture  TEXT    NOT NULL,          -- 13 种白名单之一(与 sg3d assets/resources/models/furniture/ 文件名一致)
  x          REAL    NOT NULL DEFAULT 0,
  y          REAL    NOT NULL DEFAULT 0,          -- 离"室内地板面"的高度(米)。放桌上/柜里就是该支撑面的高度
  z          REAL    NOT NULL DEFAULT 0,
  rot_y      REAL    NOT NULL DEFAULT 0,
  scale      REAL    NOT NULL DEFAULT 1,
  support    TEXT    NOT NULL DEFAULT '',        -- 被撑在哪件家具上: ''=地面 floor=地板 desk=桌面 bookcase=书架隔板(调试/展示用)
  reason     TEXT,                      -- AI 给出的摆放理由(调试/展示用)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_room_prop_space ON room_prop (space_id);

CREATE TABLE IF NOT EXISTS ai_conversation (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  title          TEXT    NOT NULL,
  companion_type INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_message (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversation (id) ON DELETE CASCADE,
  role            TEXT    NOT NULL,
  content         TEXT    NOT NULL DEFAULT '',
  tokens          INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_follow (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id  INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  UNIQUE (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS favorite (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  target_type INTEGER NOT NULL,
  target_id   INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS square_post (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  space_id       INTEGER          DEFAULT NULL REFERENCES memory_space (id) ON DELETE SET NULL,
  -- 这条动态对应的记忆库条目(0 = 老数据/没有对应记忆)。
  -- 广场发布 = 先建记忆, 再投影成动态, 两边共用同一条内容, 不会再出现"广场有、记忆库没有"。
  memory_id      INTEGER NOT NULL DEFAULT 0,
  content        TEXT    NOT NULL,
  images         TEXT    NOT NULL DEFAULT '',
  likes_count    INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  is_public      INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS post_like (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES square_post (id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_comment (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL REFERENCES square_post (id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  parent_id   INTEGER          DEFAULT NULL REFERENCES post_comment (id) ON DELETE SET NULL,
  content     TEXT    NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pet_config (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL UNIQUE REFERENCES user (id) ON DELETE CASCADE,
  pet_type      TEXT    NOT NULL DEFAULT '橘猫',
  pet_name      TEXT    NOT NULL DEFAULT '',
  level         INTEGER NOT NULL DEFAULT 1,
  exp           INTEGER NOT NULL DEFAULT 0,
  mood          REAL    NOT NULL DEFAULT 80,
  outfit        TEXT    NOT NULL DEFAULT '',
  accessories   TEXT    NOT NULL DEFAULT '',
  last_interact INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  type       INTEGER NOT NULL,
  content    TEXT    NOT NULL,
  contact    TEXT    NOT NULL DEFAULT '',
  status     INTEGER NOT NULL DEFAULT 0,
  reply      TEXT    NOT NULL DEFAULT '',
  user_reply TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 用户举报: 举报帖子/评论/用户
CREATE TABLE IF NOT EXISTS report (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id  INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  target_type  INTEGER NOT NULL,
  target_id    INTEGER NOT NULL,
  reason       TEXT    NOT NULL,
  status       INTEGER NOT NULL DEFAULT 0,
  handle_note  TEXT    NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- 网站活动/公告
CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  cover       TEXT    NOT NULL DEFAULT '',
  type        INTEGER NOT NULL DEFAULT 1,
  is_public   INTEGER NOT NULL DEFAULT 1,
  is_major    INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  start_time  INTEGER DEFAULT NULL,
  end_time    INTEGER DEFAULT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- 通知表
CREATE TABLE IF NOT EXISTS notification (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  reply      TEXT    NOT NULL DEFAULT '',
  saved      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 私信表
CREATE TABLE IF NOT EXISTS private_message (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id   INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  content     TEXT    NOT NULL,
  is_read     INTEGER NOT NULL DEFAULT 0,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  deleted_by  INTEGER DEFAULT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_private_message_receiver ON private_message (receiver_id);
CREATE INDEX IF NOT EXISTS idx_private_message_sender ON private_message (sender_id);

-- 活动评论
CREATE TABLE IF NOT EXISTS activity_comment (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  content     TEXT    NOT NULL,
  image       TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

-- 活动参与
CREATE TABLE IF NOT EXISTS activity_join (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  UNIQUE(activity_id, user_id)
);

-- 活动点赞
CREATE TABLE IF NOT EXISTS activity_like (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activity (id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  UNIQUE(activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_space_user ON memory_space (user_id);
CREATE INDEX IF NOT EXISTS idx_memory_item_space ON memory_item (space_id);
CREATE INDEX IF NOT EXISTS idx_memory_media_memory ON memory_media (memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_comment_memory ON memory_comment (memory_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_user ON ai_conversation (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_message_conv ON ai_message (conversation_id);
CREATE INDEX IF NOT EXISTS idx_follow_following ON user_follow (following_id);
CREATE INDEX IF NOT EXISTS idx_favorite_user ON favorite (user_id);
CREATE INDEX IF NOT EXISTS idx_post_user ON square_post (user_id);
CREATE INDEX IF NOT EXISTS idx_like_post ON post_like (post_id);
CREATE INDEX IF NOT EXISTS idx_comment_post ON post_comment (post_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback (user_id);

-- 用户设置(隐私/空间偏好)
CREATE TABLE IF NOT EXISTS user_settings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL UNIQUE REFERENCES user (id) ON DELETE CASCADE,
  default_vis      TEXT    NOT NULL DEFAULT 'self',
  ai_read_memory   INTEGER NOT NULL DEFAULT 1,
  ai_cross_space   INTEGER NOT NULL DEFAULT 1,
  ai_summary       INTEGER NOT NULL DEFAULT 1,
  ai_no_training   INTEGER NOT NULL DEFAULT 1,
  bgm              INTEGER NOT NULL DEFAULT 1,
  ambient          INTEGER NOT NULL DEFAULT 1,
  ambient_type     TEXT    NOT NULL DEFAULT '雨声',
  motion           TEXT    NOT NULL DEFAULT '适中',
  tone             TEXT    NOT NULL DEFAULT '暖色',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

-- 分享记录
CREATE TABLE IF NOT EXISTS share (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  space_id    INTEGER          DEFAULT NULL REFERENCES memory_space (id) ON DELETE SET NULL,
  memory_id   INTEGER          DEFAULT NULL REFERENCES memory_item (id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  meta        TEXT    NOT NULL DEFAULT '',
  token       TEXT    NOT NULL UNIQUE,
  status      TEXT    NOT NULL DEFAULT 'valid',
  expires_at  INTEGER          DEFAULT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_settings_user ON user_settings (user_id);
CREATE INDEX IF NOT EXISTS idx_share_user ON share (user_id);
CREATE INDEX IF NOT EXISTS idx_share_token ON share (token);

-- AI 密钥的后台覆盖项(只有超级管理员可写): 有值时优先于 .env, 清空即回落到 .env。
-- 存库而不是只放 .env 的原因: 线上每次发布会覆盖 .env, 换密钥不该重新打包。
CREATE TABLE IF NOT EXISTS app_secret (
  k          TEXT PRIMARY KEY,
  v          TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);
