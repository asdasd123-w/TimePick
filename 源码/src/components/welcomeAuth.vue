<template>
  <!-- 欢迎页登录/注册子组件: diaryOrMnemonic 背景 + 动态光效, 暖纸风表单卡 -->
  <!-- Teleport 到 body: 脱离 .welcome 的 DOM 树, 避免弹窗内点击冒泡触发“开始探索” -->
  <Teleport to="body">
    <div class="wa-mask" @click.self="$emit('close')">
      <!-- 动态背景层: 缓慢呼吸的背景图 + 漂浮光点 + 柔光扫过 -->
      <div class="wa-bg" aria-hidden="true">
        <img
          class="wa-bg-img"
          src="@/assets/opt/diaryOrMnemonicBackground.webp"
          srcset="@/assets/opt/diaryOrMnemonicBackground-sm.webp 1000w, @/assets/opt/diaryOrMnemonicBackground.webp 1920w"
          sizes="100vw"
          alt=""
          decoding="async"
          draggable="false"
        />
        <span class="wa-glow"></span>
        <span class="wa-sweep"></span>
        <span v-for="d in DOTS" :key="d.id" class="wa-dot" :style="d.style"></span>
      </div>

      <div class="wa-card">
        <button class="wa-close" type="button" aria-label="关闭" @click="$emit('close')">×</button>

        <div class="wa-brand">
          <span class="wa-logo">拾光</span>
          <span class="wa-brand-sub">{{
            tab === 'login' ? '欢迎回来, 继续收藏你的时光' : '填好资料, 开启你的拾光之旅'
          }}</span>
        </div>

        <div class="wa-tabs">
          <button type="button" :class="{ on: tab === 'login' }" @click="switchTab('login')">
            登录
          </button>
          <button type="button" :class="{ on: tab === 'register' }" @click="switchTab('register')">
            注册
          </button>
        </div>

        <!-- 扫码没走完时的提示卡：不用一行扎眼红字，直接告诉用户下一步怎么做 -->
        <div v-if="wxCallbackError" class="wa-wx-fail">
          <span class="wa-wx-fail-ico" aria-hidden="true">!</span>
          <div class="wa-wx-fail-main">
            <b>这次微信登录没有完成</b>
            <span>{{ wxCallbackError }}</span>
          </div>
          <button class="wa-wx-fail-btn" type="button" :disabled="wxBusy" @click="retryWechat">
            {{ wxBusy ? '正在跳转…' : '重新扫码' }}
          </button>
        </div>

        <!-- ★ 登录表单：「登录」tab 用手机号 + 密码；
             注册 tab 既有微信扫码（一键建号），也保留了原来的手机号注册表单。 -->
        <form v-if="tab === 'login'" class="wa-form" @submit.prevent="submit">
          <label class="wa-field">
            <span>手机号</span>
            <input
              v-model.trim="username"
              type="text"
              placeholder="请输入手机号"
              autocomplete="username"
            />
            <!-- 实时校验: 一输入就判断, 绿色对号=正确 / 红色叉号=错误 -->
            <em v-if="!username" class="wa-hint">请输入正确格式手机号(1开头，11位数字)</em>
            <em
              v-else
              class="wa-phone-state"
              :class="isPhone(username) ? 'ok' : 'bad'"
            >{{ isPhone(username) ? '✓ 正确' : '✗ 错误' }}</em>
          </label>

          <label class="wa-field">
            <span>密码</span>
            <div class="wa-input">
              <input
                v-model="password"
                :type="showPwd ? 'text' : 'password'"
                placeholder="至少 6 位"
                autocomplete="current-password"
              />
              <button
                class="wa-eye"
                type="button"
                :aria-label="showPwd ? '隐藏密码' : '显示密码'"
                :title="showPwd ? '隐藏密码' : '显示密码'"
                @click.prevent="showPwd = !showPwd"
              >
                {{ showPwd ? '🙈' : '👁' }}
              </button>
            </div>
          </label>

          <p v-if="error" class="wa-error">{{ error }}</p>

          <button class="wa-submit" type="submit" :disabled="busy">
            {{ busy ? '请稍候…' : '登录' }}
          </button>

          <button class="wa-forgot" type="button" @click="showForgot = true">
            忘记密码？
          </button>
        </form>

        <!-- 注册 tab：手机号注册在上（原来的方式，原样保留），微信扫码放在下面。
             顺序按用户要求：先「手机号注册」，再「或 微信扫码注册」。 -->
        <div v-else class="wa-reg">
          <!-- 原来的注册方式原样保留：手机号 + 昵称 + 密码 + 注册口令 -->
          <form class="wa-form" @submit.prevent="submit">
            <label class="wa-field">
              <span>手机号</span>
              <input
                v-model.trim="username"
                type="text"
                placeholder="请输入手机号"
                autocomplete="username"
              />
              <em v-if="!username" class="wa-hint">请输入正确格式手机号(1开头，11位数字)</em>
              <em v-else class="wa-phone-state" :class="isPhone(username) ? 'ok' : 'bad'">{{
                isPhone(username) ? '✓ 正确' : '✗ 错误'
              }}</em>
            </label>

            <label class="wa-field">
              <span>昵称</span>
              <input
                v-model.trim="nickname"
                type="text"
                placeholder="昵称不能为空"
                autocomplete="nickname"
              />
            </label>

            <label class="wa-field">
              <span>密码</span>
              <div class="wa-input">
                <input
                  v-model="password"
                  :type="showPwd ? 'text' : 'password'"
                  placeholder="至少 6 位"
                  autocomplete="new-password"
                />
                <button
                  class="wa-eye"
                  type="button"
                  :aria-label="showPwd ? '隐藏密码' : '显示密码'"
                  :title="showPwd ? '隐藏密码' : '显示密码'"
                  @click.prevent="showPwd = !showPwd"
                >
                  {{ showPwd ? '🙈' : '👁' }}
                </button>
              </div>
            </label>

            <label class="wa-field">
              <span>注册口令 <i class="wa-req">必填</i></span>
              <input v-model.trim="passphrase" type="text" placeholder="请输入注册口令" />
            </label>

            <p v-if="error" class="wa-error">{{ error }}</p>

            <button class="wa-submit" type="submit" :disabled="busy">
              {{ busy ? '请稍候…' : '注册并登录' }}
            </button>
          </form>

          <div class="wa-or"><span>或 微信扫码注册</span></div>

          <!-- 微信扫码即注册：扫完自动建号并登录，昵称/头像跟随微信 -->
          <div class="wa-reg-hero">
            <span class="wa-reg-badge">
              <svg class="wa-wx-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M9.2 3C5.2 3 2 5.7 2 9c0 1.9 1 3.5 2.7 4.7l-.7 2.2 2.5-1.3c.5.1 1 .2 1.6.2.3 0 .6 0 .9-.1a4.9 4.9 0 0 1-.2-1.3c0-3.1 2.9-5.6 6.5-5.6h.3C15 5 12.4 3 9.2 3Zm-2.4 3.2a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Zm4.8 0a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Z"
                />
                <path
                  fill="currentColor"
                  d="M22 13.2c0-2.7-2.6-4.8-5.8-4.8s-5.8 2.1-5.8 4.8 2.6 4.8 5.8 4.8c.7 0 1.3-.1 1.9-.3l2.1 1.1-.5-1.9c1.4-.9 2.3-2.2 2.3-3.7Zm-7.8-1.2a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Zm4.2 0a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Z"
                />
              </svg>
            </span>
            <p class="wa-reg-title">微信扫一扫，一键注册</p>
          </div>

          <button
            class="wa-wechat solid"
            type="button"
            :disabled="busy || wxBusy"
            @click="loginByWechat"
          >
            <svg class="wa-wx-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M9.2 3C5.2 3 2 5.7 2 9c0 1.9 1 3.5 2.7 4.7l-.7 2.2 2.5-1.3c.5.1 1 .2 1.6.2.3 0 .6 0 .9-.1a4.9 4.9 0 0 1-.2-1.3c0-3.1 2.9-5.6 6.5-5.6h.3C15 5 12.4 3 9.2 3Zm-2.4 3.2a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Zm4.8 0a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Z"
              />
              <path
                fill="currentColor"
                d="M22 13.2c0-2.7-2.6-4.8-5.8-4.8s-5.8 2.1-5.8 4.8 2.6 4.8 5.8 4.8c.7 0 1.3-.1 1.9-.3l2.1 1.1-.5-1.9c1.4-.9 2.3-2.2 2.3-3.7Zm-7.8-1.2a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Zm4.2 0a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Z"
              />
            </svg>
            {{ wxBusy ? '正在跳转微信…' : '微信扫码注册' }}
          </button>
        </div>

        <!-- 微信扫码（登录 tab 的备用入口）: 首次扫码自动注册, 之后再扫就是登录 -->
        <template v-if="tab === 'login'">
          <div class="wa-or"><span>或</span></div>
          <button class="wa-wechat" type="button" :disabled="busy || wxBusy" @click="loginByWechat">
            <svg class="wa-wx-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M9.2 3C5.2 3 2 5.7 2 9c0 1.9 1 3.5 2.7 4.7l-.7 2.2 2.5-1.3c.5.1 1 .2 1.6.2.3 0 .6 0 .9-.1a4.9 4.9 0 0 1-.2-1.3c0-3.1 2.9-5.6 6.5-5.6h.3C15 5 12.4 3 9.2 3Zm-2.4 3.2a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Zm4.8 0a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Z"
              />
              <path
                fill="currentColor"
                d="M22 13.2c0-2.7-2.6-4.8-5.8-4.8s-5.8 2.1-5.8 4.8 2.6 4.8 5.8 4.8c.7 0 1.3-.1 1.9-.3l2.1 1.1-.5-1.9c1.4-.9 2.3-2.2 2.3-3.7Zm-7.8-1.2a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Zm4.2 0a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Z"
              />
            </svg>
            {{ wxBusy ? '正在跳转微信…' : '微信扫码登录' }}
          </button>
          <p class="wa-wx-tip">首次扫码自动创建账号 · 手机号密码登录照旧可用</p>
        </template>

        <p class="wa-foot">
          {{
            tab === 'login'
              ? '还没有账号? 注册可以用微信扫码, 也可以直接用手机号'
              : '注册后自动同步广场、记忆与 AI 会话'
          }}
        </p>
      </div>

      <ForgotPassword v-if="showForgot" @close="showForgot = false" />
    </div>
  </Teleport>
</template>

<script setup>
// 欢迎页登录/注册: 依赖 cloudAuth store 的 login/register, 注册需口令(后端校验)
import { ref } from 'vue'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import ForgotPassword from './forgotPassword.vue'
import { startLocalWechatLogin } from '@/cloud/client'
import { takeWechatLoginError } from '@/cloud/localLogin'

/*正则判断手机号*/ 
const phoneReg = /^1[3-9]\d{9}$/;
function isPhone(str) {
  return typeof str === 'string' && phoneReg.test(str.trim());
}

const emit = defineEmits(['close', 'success'])
const auth = useCloudAuthStore()

// 忘记密码提示框(管理员联系方式)
const showForgot = ref(false)

const tab = ref('login')
const username = ref('')
const password = ref('')
const nickname = ref('')
const passphrase = ref('')
// 扫码回调失败后回到欢迎页会带一条原因过来(取完即清), 单独用柔和提示卡展示
const wxCallbackError = ref(takeWechatLoginError())
const error = ref('')
const busy = ref(false)
// 微信登录会整页跳走, 单独用一个 busy 标记, 避免和表单提交互相锁住
const wxBusy = ref(false)
// 密码明文显示开关
const showPwd = ref(false)

// 漂浮光点: 随机参数只生成一次, 动画纯 CSS
const DOTS = Array.from({ length: 16 }, (_, id) => {
  const size = 3 + Math.random() * 5
  return {
    id,
    style: {
      left: `${3 + Math.random() * 94}%`,
      width: `${size}px`,
      height: `${size}px`,
      animationDuration: `${10 + Math.random() * 12}s`,
      animationDelay: `${-Math.random() * 18}s`,
      '--sway': `${(Math.random() - 0.5) * 120}px`,
    },
  }
})

function switchTab(next) {
  tab.value = next
  error.value = ''
  wxCallbackError.value = ''
}

// 扫码没走完（最常见是二维码停留太久、state 过期）：清掉提示，重新走一遍授权
function retryWechat() {
  wxCallbackError.value = ''
  error.value = ''
  loginByWechat()
}

async function submit() {
  if (busy.value) return
  error.value = ''
  if (!username.value) return (error.value = '请输入手机号')
  if (tab.value === 'register' && !isPhone(username.value))
    return (error.value = '请输入正确的11位手机号')
  if (!password.value) return (error.value = '请输入密码')
  // ★ 昵称必填（2026-10-27 用户要求）：不再回落成手机号，也不再允许和别人重名
  if (tab.value === 'register' && !nickname.value.trim()) return (error.value = '请输入昵称')
  if (tab.value === 'register' && nickname.value.trim().length > 20)
    return (error.value = '昵称最长 20 个字符')
  if (tab.value === 'register' && !passphrase.value) return (error.value = '请输入注册口令')
  busy.value = true
  try {
    if (tab.value === 'login') {
      await auth.login(username.value, password.value)
    } else {
      // 手机号注册: 昵称必填, 重名由后端拦(唯一校验必须在服务端做, 前端查不到全量)
      await auth.register(
        username.value,
        password.value,
        nickname.value.trim(),
        passphrase.value,
      )
      passphrase.value = ''
    }
    password.value = ''
    emit('success')
    emit('close')
  } catch (e) {
    error.value = e.message || '操作失败, 请重试'
  } finally {
    busy.value = false
  }
}

// 微信扫码: 跳去微信授权页。回来后由 main.js 的启动流程换成拾光登录态。
// 首次扫码 = 注册(后端自动建号), 已有绑定 = 直接登录, 所以登录/注册两个 tab 都放这个按钮。
async function loginByWechat() {
  if (busy.value || wxBusy.value) return
  error.value = ''
  wxBusy.value = true
  try {
    await startLocalWechatLogin('/index/memory')
    // 正常情况这里已经整页跳走了; 浏览器拦了跳转才回到这行
    wxBusy.value = false
  } catch (e) {
    error.value = e?.message || '微信登录暂时不可用'
    wxBusy.value = false
  }
}
</script>

<style scoped>
.wa-card,
.wa-card * {
  box-sizing: border-box;
}

.wa-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: rgba(38, 30, 24, 0.55);
  animation: wa-fade 0.3s ease both;
}

@keyframes wa-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* ---- 动态背景层 ---- */
.wa-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.wa-bg-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.5;
  transform-origin: 55% 45%;
  animation: wa-kenburns 24s ease-in-out infinite alternate;
}

@keyframes wa-kenburns {
  from {
    transform: scale(1.04) translate3d(0, 0, 0);
  }

  to {
    transform: scale(1.16) translate3d(-1.5%, -1.5%, 0);
  }
}

/* 柔光晕: 缓慢明暗呼吸 */
.wa-glow {
  position: absolute;
  left: 50%;
  top: 42%;
  width: 70vmin;
  height: 70vmin;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 226, 178, 0.35) 0%, rgba(255, 214, 160, 0) 68%);
  filter: blur(6px);
  animation: wa-breathe 7s ease-in-out infinite;
}

@keyframes wa-breathe {
  0%,
  100% {
    opacity: 0.55;
    scale: 0.94;
  }

  50% {
    opacity: 0.95;
    scale: 1.06;
  }
}

/* 斜向扫光:  periodic 掠过 */
.wa-sweep {
  position: absolute;
  top: -30%;
  left: -60%;
  width: 45%;
  height: 160%;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 248, 226, 0.22) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  transform: rotate(16deg);
  filter: blur(4px);
  animation: wa-sweep 9s ease-in-out infinite;
}

@keyframes wa-sweep {
  0% {
    left: -60%;
  }

  55%,
  100% {
    left: 130%;
  }
}

/* 漂浮光点: 缓慢上升 + 摇摆 + 淡入淡出 */
.wa-dot {
  position: absolute;
  bottom: -4%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 246, 218, 0.95) 0%, rgba(255, 246, 218, 0) 70%);
  opacity: 0;
  animation: wa-rise linear infinite;
}

@keyframes wa-rise {
  0% {
    transform: translate3d(0, 0, 0);
    opacity: 0;
  }

  14% {
    opacity: 0.85;
  }

  50% {
    transform: translate3d(var(--sway), -48vh, 0);
    opacity: 0.6;
  }

  100% {
    transform: translate3d(calc(var(--sway) * -0.6), -96vh, 0);
    opacity: 0;
  }
}

/* ---- 表单卡: 暖纸风毛玻璃 ---- */
.wa-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 360px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 26px 28px 22px;
  border-radius: 20px;
  background: rgba(255, 252, 248, 0.94);
  box-shadow: 0 26px 70px rgba(60, 44, 24, 0.42);
  backdrop-filter: blur(6px);
  animation: wa-in 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  scrollbar-width: thin;
  scrollbar-color: #d8c9b8 transparent;
}

@keyframes wa-in {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.wa-close {
  position: absolute;
  right: 14px;
  top: 14px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: #f6f0e8;
  color: #8a7a6d;
  font-size: 18.5px;
  line-height: 1;
  cursor: pointer;
}

.wa-brand {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}

.wa-logo {
  font-family: 'Xingkai SC', 'STXingkai', 'KaiTi', 'STKaiti', cursive;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 4px;
  color: #e0705a;
}

.wa-brand-sub {
  font-size: 14px;
  color: #a89a8c;
}

.wa-tabs {
  display: flex;
  gap: 6px;
  padding: 3px;
  border-radius: 999px;
  background: #f4ece1;
}

.wa-tabs button {
  flex: 1;
  padding: 8px 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #a08063;
  font-size: 15.5px;
  cursor: pointer;
}

.wa-tabs button.on {
  background: #fffdf9;
  color: #e0705a;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(90, 70, 40, 0.12);
}

.wa-form {
  display: flex;
  flex-direction: column;
  gap: 13px;
  margin-top: 18px;
}

.wa-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.wa-field span {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #8a7a6d;
}

/* 手机号长度提示: 常驻小字, 与校验报错(红色 .wa-error)区分开 */
.wa-hint {
  font-size: 13px;
  font-style: normal;
  color: #a89a8c;
}

/* 手机号实时校验结果: 绿色对号=正确, 红色叉号=错误 */
.wa-phone-state {
  font-size: 13.5px;
  font-style: normal;
  font-weight: 600;
  letter-spacing: 1px;
}

.wa-phone-state.ok {
  color: #2e9e5b;
}

.wa-phone-state.bad {
  color: #e05a5a;
}

.wa-req {
  padding: 0 6px;
  border-radius: 999px;
  background: #fdeae2;
  color: #e0705a;
  font-size: 11.5px;
  font-style: normal;
}

.wa-field input {
  padding: 10px 13px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #fff;
  font-size: 15.5px;
  color: #4a4038;
  outline: none;
  transition: border-color 0.2s;
}

.wa-field input:focus {
  border-color: #f0917c;
}

/* 密码框: 输入 + 右侧明文切换按钮 */
.wa-input {
  position: relative;
  display: flex;
}

.wa-field .wa-input input {
  flex: 1;
  width: 100%;
  padding-right: 44px;
}

.wa-eye {
  position: absolute;
  right: 6px;
  top: 50%;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  transform: translateY(-50%);
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 16.5px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.55;
  transition:
    opacity 0.18s,
    background 0.18s;
}

.wa-eye:hover {
  opacity: 1;
  background: #f6f0e8;
}

.wa-error {
  margin: 0;
  font-size: 14px;
  color: #e0705a;
}

/* ---- 微信扫码没走完的提示卡 ----
   原来是表单里一行红字，用户看不出下一步。改成一块浅色卡片 + 一个「重新扫码」按钮。 */
.wa-wx-fail {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(224, 134, 90, 0.28);
  border-radius: 14px;
  background: rgba(255, 247, 240, 0.9);
}

.wa-wx-fail-ico {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #e8a87c, #d9855c);
}

.wa-wx-fail-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.wa-wx-fail-main b {
  font-size: 13px;
  color: #6b5546;
}

.wa-wx-fail-main span {
  font-size: 11.5px;
  line-height: 1.5;
  color: #a08063;
  word-break: break-all;
}

.wa-wx-fail-btn {
  flex: 0 0 auto;
  padding: 6px 12px;
  border: none;
  border-radius: 999px;
  font-size: 12px;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, #e79a6c, #d97a4f);
}

.wa-wx-fail-btn:disabled {
  opacity: 0.6;
}

.wa-submit {
  margin-top: 4px;
  padding: 11px 0;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #f6a58f, #f0917c);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(240, 145, 124, 0.35);
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}

.wa-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 26px rgba(240, 145, 124, 0.45);
}

.wa-submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 忘记密码: 弱化但可点的文字链, 不抢登录按钮的视觉重心 */
.wa-forgot {
  align-self: center;
  margin-top: 2px;
  padding: 2px 4px;
  border: none;
  background: transparent;
  color: #b3a79c;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  transition: color 0.18s;
}

.wa-forgot:hover {
  color: #e0705a;
}

/* 分隔线: 密码登录与微信登录之间的「或」 */
.wa-or {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 14px 0 12px;
  color: #c0b4a8;
  font-size: 12px;
}

.wa-or::before,
.wa-or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(180, 160, 140, 0.38), transparent);
}

/* 微信扫码: 微信绿压得很淡, 免得在暖纸卡片上跳出来 */
.wa-wechat {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 0;
  border: 1px solid rgba(7, 193, 96, 0.42);
  border-radius: 999px;
  background: rgba(7, 193, 96, 0.06);
  color: #0a8f4a;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 1px;
  cursor: pointer;
  transition:
    background 0.18s,
    border-color 0.18s,
    transform 0.15s;
}

.wa-wechat:hover:not(:disabled) {
  background: rgba(7, 193, 96, 0.12);
  border-color: rgba(7, 193, 96, 0.68);
  transform: translateY(-1px);
}

.wa-wechat:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.wa-wx-icon {
  width: 19px;
  height: 19px;
  flex: none;
}

.wa-wx-tip {
  margin: 9px 0 0;
  text-align: center;
  font-size: 12px;
  line-height: 1.5;
  color: #b3a79c;
}

/* ---- 注册 tab：微信一键注册（不再有手机号/昵称/密码/口令表单） ---- */
.wa-reg {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 6px;
}

/* 注册 tab 里手机号表单是最上面一块：.wa-form 自带 margin-top 18px 会多推一段空白 */
.wa-reg > .wa-form {
  margin-top: 0;
}

/* 分隔线自己带上下 margin，叠上 .wa-reg 的 gap 会变成 40px，注册页里收掉 */
.wa-reg > .wa-or {
  margin: 2px 0 0;
}

.wa-reg-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.wa-reg-badge {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 1px solid rgba(7, 193, 96, 0.3);
  border-radius: 50%;
  background: rgba(7, 193, 96, 0.1);
  color: #0a8f4a;
}

.wa-reg-badge .wa-wx-icon {
  width: 30px;
  height: 30px;
}

.wa-reg-title {
  margin: 4px 0 0;
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #4a4038;
}

.wa-reg-sub {
  margin: 0;
  font-size: 13px;
  color: #a89a8c;
}

.wa-reg-list {
  margin: 0;
  padding: 12px 14px 12px 30px;
  border: 1px dashed #eadfd2;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
  font-size: 13px;
  line-height: 1.9;
  color: #7d6f63;
}

.wa-reg-list li::marker {
  color: #f0b09c;
}

.wa-reg-list b {
  margin-right: 4px;
  font-weight: 600;
  color: #4a4038;
}

/* 注册 tab 的主按钮：微信绿实心，是这一屏唯一的行动点 */
.wa-wechat.solid {
  border-color: transparent;
  background: linear-gradient(135deg, #22c55e, #07c160);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 8px 20px rgba(7, 193, 96, 0.28);
}

.wa-wechat.solid:hover:not(:disabled) {
  background: linear-gradient(135deg, #16a34a, #06ad56);
  border-color: transparent;
}

.wa-foot {
  margin: 15px 0 0;
  text-align: center;
  font-size: 12.5px;
  line-height: 1.6;
  color: #b3a79c;
}

@media (prefers-reduced-motion: reduce) {
  .wa-bg-img,
  .wa-glow,
  .wa-sweep,
  .wa-dot,
  .wa-card,
  .wa-mask {
    animation: none;
  }
}
</style>
