// 环境变量加载：依次读取 .env.local、.env（不引入 dotenv 依赖，已存在的环境变量优先）
//
// ★ 为什么单独成一个文件：
//   ES 模块的 import 会在模块体执行**之前**完成求值。如果加载逻辑写在 index.js 里，
//   db.js 顶层的 `process.env.DB_PATH` / `process.env.SUPER_ADMIN_USERNAME`
//   会在它之前被读取，永远是 undefined —— 表现是「.env.local 里明明写了却不生效」，
//   而且不报错，非常难查。
//   把加载放进独立模块，由 db.js / index.js 各自 import 一次，
//   模块只求值一次，谁先 import 谁就先拿到环境变量。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

for (const name of ['.env.local', '.env']) {
  const file = path.join(__dirname, '..', name)
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const eq = s.indexOf('=')
    if (eq <= 0) continue
    const key = s.slice(0, eq).trim()
    let val = s.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

// ---------------- 占位符兜底（2026-10-30） ----------------
// 新人按说明「cp .env.example .env.local」但没逐项替换时，值就是示例里的
//   DEEPSEEK_API_KEY=sk-填你自己的DeepSeek密钥
// 这种中文串一旦被塞进 HTTP 头，Node 会抛
//   Cannot convert argument to a ByteString because the character at index 10 has a value of 22635
// —— 报错信息跟真实原因（密钥没填）完全不像，排查成本极高。
//
// 但「含中文 = 占位符」不能一概而论：REGISTER_PASSPHRASE 用户完全可能自己填中文
// （「优乐美」「生日快乐」），按字符集判断会把它误当成占位符静默改掉。
// 所以分两套判据：
//   · 密钥类（*_KEY、JWT_SECRET）：合法凭证必然是 ASCII，含非 ASCII 一定是占位符；
//   · 其余（超管手机号、注册口令）：只认模板里的固定话术（请填 / 请设置 / 请替换…）。
//
// 只看本应用认识的变量：系统里还有一堆正常的非 ASCII 环境变量
// （COMPUTERNAME / USERDOMAIN / PWD 之类，中文机器名和中文目录都很常见），
// 全量扫一遍会把它们全列出来，警告反而没人看。
const WATCHED = [
  'JWT_SECRET',
  'SUPER_ADMIN_USERNAME',
  'REGISTER_PASSPHRASE',
  'DEEPSEEK_API_KEY',
  'ZHIPU_API_KEY',
  'DASHSCOPE_API_KEY',
  'PASSWORD_ENC_KEY',
  'CLOUD_ACCESS_KEY',
]
// .env.example 里占位话术的固定用词（“请填你自己的注册手机号”这类）
const PLACEHOLDER_WORDS = /请填|请设置|请替换|填你自己|你自己的|一串随机字符/

const placeholders = []
const cleared = [] // 按「未配置」处理，走代码里的默认值
const regenerated = [] // 换成随机值，避免用公开的字符串当密钥
for (const k of WATCHED) {
  const v = process.env[k]
  if (typeof v !== 'string' || !v) continue

  const isSecret = /_KEY$/.test(k) || k === 'JWT_SECRET'
  const looksPlaceholder = isSecret ? /[^\t\n\r\x20-\x7e]/.test(v) : PLACEHOLDER_WORDS.test(v)
  if (!looksPlaceholder) continue // 正常值，不动它

  placeholders.push(k)
  if (k === 'JWT_SECRET') {
    // 占位符是公开字符串（写在仓库里），拿它签 token 等于谁都能伪造。
    // 换成每次启动随机的密钥：代价是重启后所有人要重新登录，比被人伪造强。
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex')
    regenerated.push(k)
  } else {
    // *_KEY 类：留着会在 fetch 拼 HTTP 头时抛 ByteString 错误，直接当没填；
    // SUPER_ADMIN_USERNAME / REGISTER_PASSPHRASE：删掉即走代码里的默认值
    // （注册口令回落到「优乐美」、超管功能关闭），不会拿中文串当口令卡住注册。
    delete process.env[k]
    cleared.push(k)
  }
}
if (placeholders.length) {
  console.warn(`[env] 以下变量还是 .env.example 里的占位符，请改成真实值：${placeholders.join(', ')}`)
  if (cleared.length) {
    console.warn(
      `[env] 其中 ${cleared.join(', ')} 已按「未配置」处理：` +
        `AI 能力关闭、注册口令回落到默认值、超管功能关闭，其余功能不受影响`
    )
  }
  if (regenerated.length) {
    console.warn(
      `[env] ${regenerated.join(', ')} 本次启动随机生成。重启后所有人需重新登录；` +
        `要固定下来，请在 .env.local 里填一串自己的随机字符（32 位以上）。`
    )
  }
}
