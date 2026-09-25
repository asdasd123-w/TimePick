<template>
  <!-- 登录 / 注册弹窗: 未登录时调用 store.openAuth() 唤起 -->
  <div v-if="auth.modal" class="am-mask" @click.self="auth.closeAuth()">
    <div class="am-card">
      <button class="am-close" type="button" aria-label="关闭" @click="auth.closeAuth()">×</button>

      <div class="am-tabs">
        <button type="button" :class="{ on: tab === 'login' }" @click="switchTab('login')">
          登录
        </button>
        <button type="button" :class="{ on: tab === 'register' }" @click="switchTab('register')">
          注册
        </button>
      </div>

      <p class="am-title">{{ tab === 'login' ? '欢迎回到拾光' : '创建你的云端账号' }}</p>
      <p class="am-sub">
        {{ tab === 'login' ? '登录后同步广场、记忆与 AI 会话' : '注册后即可发布与互动' }}
      </p>

      <form class="am-form" @submit.prevent="submit">
        <label class="am-field">
          <span>手机号</span>
          <input
            v-model.trim="username"
            type="text"
            placeholder="请输入手机号"
            autocomplete="username"
          />
          <em v-if="tab === 'register'" class="am-hint">请输入 11 个字符</em>
        </label>
        <label v-if="tab === 'register'" class="am-field">
          <span>昵称 <i class="am-req">必填</i></span>
          <input
            v-model.trim="nickname"
            type="text"
            maxlength="20"
            placeholder="不可与已有昵称重复"
            autocomplete="nickname"
          />
        </label>
        <label class="am-field">
          <span>密码</span>
          <div class="am-input">
            <input
              v-model="password"
              :type="showPwd ? 'text' : 'password'"
              placeholder="至少 6 位"
              :autocomplete="tab === 'login' ? 'current-password' : 'new-password'"
            />
            <button
              class="am-eye"
              type="button"
              :aria-label="showPwd ? '隐藏密码' : '显示密码'"
              :title="showPwd ? '隐藏密码' : '显示密码'"
              @click.prevent="showPwd = !showPwd"
            >
              {{ showPwd ? '🙈' : '👁' }}
            </button>
          </div>
        </label>
        <label v-if="tab === 'register'" class="am-field">
          <span>注册口令 <i class="am-req">必填</i></span>
          <input v-model.trim="passphrase" type="text" placeholder="请输入注册口令" />
        </label>

        <p v-if="error" class="am-error">{{ error }}</p>

        <button
          class="am-submit"
          type="submit"
          :disabled="busy || (tab === 'register' && !nickname.trim())"
        >
          {{ busy ? '请稍候…' : tab === 'login' ? '登录' : '注册并登录' }}
        </button>

        <button
          v-if="tab === 'login'"
          class="am-forgot"
          type="button"
          @click="showForgot = true"
        >
          忘记密码？
        </button>
      </form>

      <p v-if="tab === 'login'" class="am-tip">演示账号: linjian / demo123456</p>
    </div>

    <ForgotPassword v-if="showForgot" @close="showForgot = false" />
  </div>
</template>

<script setup>
// 登录/注册弹窗子组件: 依赖 cloudAuth store 的 modal 状态与 login/register
import { ref, watch } from 'vue'
import { useCloudAuthStore } from '../stores/cloudAuth'
import ForgotPassword from './forgotPassword.vue'

const auth = useCloudAuthStore()

// 忘记密码提示框(管理员联系方式)
const showForgot = ref(false)

const tab = ref('login')
const username = ref('')
const password = ref('')
const nickname = ref('')
const passphrase = ref('')
const error = ref('')
const busy = ref(false)
// 密码明文显示开关
const showPwd = ref(false)

// 每次打开都重置为登录态, 清空上一次输入
watch(
  () => auth.modal,
  (open) => {
    if (open) {
      tab.value = 'login'
      error.value = ''
      busy.value = false
      showPwd.value = false
      showForgot.value = false
    }
  },
)

function switchTab(next) {
  tab.value = next
  error.value = ''
}

async function submit() {
  if (busy.value) return
  error.value = ''
  if (!username.value) return (error.value = '请输入手机号')
  // 注册严格按手机号正则校验(1开头第二位3-9共11位); 登录不拦老账号(历史上用户名可能不是手机号)
  if (tab.value === 'register' && !/^1[3-9]\d{9}$/.test(username.value.trim())) {
    return (error.value = '请输入正确的11位手机号')
  }
  if (!password.value) return (error.value = '请输入密码')
  // ★ 昵称必填（2026-10-27 用户要求）：留空会回落成手机号，一屋子同名账号没法区分
  if (tab.value === 'register' && !nickname.value.trim()) return (error.value = '请输入昵称')
  if (tab.value === 'register' && nickname.value.trim().length > 20)
    return (error.value = '昵称最长 20 个字符')
  if (tab.value === 'register' && !passphrase.value) return (error.value = '请输入注册口令')
  busy.value = true
  try {
    if (tab.value === 'login') {
      await auth.login(username.value, password.value)
    } else {
      await auth.register(
        username.value,
        password.value,
        nickname.value.trim(),
        passphrase.value,
      )
    }
    password.value = ''
    passphrase.value = ''
  } catch (e) {
    error.value = e.message || '操作失败, 请重试'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.am-card,
.am-card * {
  box-sizing: border-box;
}

.am-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  background: rgba(40, 34, 28, 0.32);
  backdrop-filter: blur(2px);
}

.am-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 340px;
  max-width: calc(100vw - 40px);
  padding: 24px 26px 22px;
  border-radius: 18px;
  background: rgba(255, 252, 248, 0.98);
  box-shadow: 0 24px 60px rgba(90, 70, 40, 0.3);
  animation: am-in 0.28s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@keyframes am-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.96);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.am-close {
  position: absolute;
  right: 12px;
  top: 12px;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: #f6f0e8;
  color: #8a7a6d;
  font-size: 17.5px;
  line-height: 1;
  cursor: pointer;
}

.am-tabs {
  display: flex;
  gap: 6px;
  padding: 3px;
  border-radius: 999px;
  background: #f4ece1;
}

.am-tabs button {
  flex: 1;
  padding: 7px 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #a08063;
  font-size: 15.5px;
  cursor: pointer;
}

.am-tabs button.on {
  background: #fffdf9;
  color: #e0705a;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(90, 70, 40, 0.12);
}

.am-title {
  margin: 18px 0 2px;
  font-size: 17.5px;
  font-weight: 600;
  color: #3d352e;
}

.am-sub {
  margin: 0 0 16px;
  font-size: 14px;
  color: #b3a79c;
}

.am-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.am-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.am-field span {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #8a7a6d;
}

/* 手机号长度提示: 常驻小字, 与校验报错(红色 .am-error)区分开 */
.am-hint {
  font-size: 13px;
  font-style: normal;
  color: #a89a8c;
}

.am-req {
  padding: 0 6px;
  border-radius: 999px;
  background: #fdeae2;
  color: #e0705a;
  font-size: 11.5px;
  font-style: normal;
}

.am-field input {
  padding: 9px 13px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #fff;
  font-size: 15.5px;
  color: #4a4038;
  outline: none;
}

.am-field input:focus {
  border-color: #f0917c;
}

/* 密码框: 输入 + 右侧明文切换按钮 */
.am-input {
  position: relative;
  display: flex;
}

.am-field .am-input input {
  flex: 1;
  width: 100%;
  padding-right: 42px;
}

.am-eye {
  position: absolute;
  right: 5px;
  top: 50%;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  transform: translateY(-50%);
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.55;
  transition:
    opacity 0.18s,
    background 0.18s;
}

.am-eye:hover {
  opacity: 1;
  background: #f6f0e8;
}

.am-error {
  margin: 0;
  font-size: 14px;
  color: #e0705a;
}

.am-submit {
  margin-top: 4px;
  padding: 10px 0;
  border: none;
  border-radius: 999px;
  background: #f0917c;
  color: #fff;
  font-size: 15.5px;
  font-weight: 600;
  cursor: pointer;
}

.am-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 忘记密码: 弱化但可点的文字链, 不抢登录按钮的视觉重心 */
.am-forgot {
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

.am-forgot:hover {
  color: #e0705a;
}

.am-tip {
  margin: 14px 0 0;
  text-align: center;
  font-size: 12.5px;
  color: #c0b4a6;
}
</style>
