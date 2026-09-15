// 后端通用工具: 环境变量 / 密码哈希 / token 签发校验 / 时间戳
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 密钥优先取环境变量, 未配置时回落到默认值(开发环境)
export const SECRET = process.env.JWT_SECRET || 'timepick@2026#api-secret'
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000 // 7 天

const now = () => Date.now()

// ---------------- 密码哈希 ----------------
// 新格式: s2$N$r$p$salt$hash   (scrypt)
// 旧格式: salt$sha256          (历史数据, 登录成功时自动升级为 s2)
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64

// 旧格式哈希, 仅用于兼容校验
function legacyHash(password, salt) {
  return crypto.createHash('sha256').update(salt + ':' + password).digest('hex')
}

function scryptHash(password, salt, n = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P) {
  return crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: n, r, p }).toString('hex')
}

// 定长字符串常量时间比较, 避免时序侧信道
function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

// 生成新密码串(始终使用 scrypt)
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  return `s2$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${scryptHash(password, salt)}`
}

// 校验密码; 兼容旧 sha256 格式
export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$')
  try {
    if (parts[0] === 's2') {
      if (parts.length !== 6) return false
      const [, n, r, p, salt, hash] = parts
      return safeEqual(scryptHash(password, salt, Number(n), Number(r), Number(p)), hash)
    }
    const [salt, hash] = parts
    if (!salt || !hash) return false
    return safeEqual(legacyHash(password, salt), hash)
  } catch {
    return false
  }
}

// 旧格式需要重新哈希(登录成功后调用)
export function needsRehash(stored) {
  return String(stored || '').split('$')[0] !== 's2'
}

// ---------------- 密码可逆加密(管理中心要显示用户真实密码) ----------------
// scrypt 是单向哈希无法还原, 因此注册/改密时额外存一份 AES-256-GCM 加密的密文(user.password_enc),
// 登录校验仍只走 scrypt 哈希, 这份密文仅用于管理员查看。
// 密钥: 优先环境变量 PASSWORD_ENC_KEY, 否则首次使用时自动生成 256bit 并持久化到 server/data/secret.key
//      (密钥丢失 = 所有密文不可解, 届时只能重置密码重新积累)。
const KEY_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'secret.key')
let encKeyCache = null
function encKey() {
  if (encKeyCache) return encKeyCache
  if (process.env.PASSWORD_ENC_KEY) {
    encKeyCache = crypto.createHash('sha256').update(String(process.env.PASSWORD_ENC_KEY)).digest()
    return encKeyCache
  }
  try {
    const hex = fs.readFileSync(KEY_FILE, 'utf8').trim()
    if (/^[0-9a-f]{64}$/i.test(hex)) {
      encKeyCache = Buffer.from(hex, 'hex')
      return encKeyCache
    }
  } catch {
    // 文件不存在则走下面的生成流程
  }
  const key = crypto.randomBytes(32)
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true })
  fs.writeFileSync(KEY_FILE, key.toString('hex'), 'utf8')
  encKeyCache = key
  return encKeyCache
}

// 返回 v1.iv.ciphertext.tag 形式的密文; 失败返回空串(调用方照常存哈希, 只是管理员看不到明文)
export function encryptPassword(plain) {
  try {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv)
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
    return ['v1', iv.toString('base64'), data.toString('base64'), cipher.getAuthTag().toString('base64')].join('.')
  } catch {
    return ''
  }
}

// 解不开(密钥换过/密文损坏/旧账号没存)返回空串
export function decryptPassword(stored) {
  const parts = String(stored || '').split('.')
  if (parts[0] !== 'v1' || parts.length !== 4) return ''
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(parts[1], 'base64'))
    decipher.setAuthTag(Buffer.from(parts[3], 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}

// ---------------- token ----------------
// payload: { uid, e(token_epoch, 改密/封禁时自增使旧 token 失效), iat, exp }
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function signToken(uid, epoch = 0) {
  const payload = b64url(JSON.stringify({ uid, e: epoch | 0, iat: now(), exp: now() + TOKEN_TTL }))
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
  return payload + '.' + sig
}

// 返回 { uid, e }; 校验失败返回 null
export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const idx = token.indexOf('.')
  const payload = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
  if (!safeEqual(sig, expect)) return null
  try {
    const data = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    )
    if (!data || typeof data.uid !== 'number') return null
    if (!data.exp || data.exp <= now()) return null
    return { uid: data.uid, e: data.e | 0 }
  } catch {
    return null
  }
}

export { now }
