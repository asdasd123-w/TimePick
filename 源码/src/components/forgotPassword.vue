<template>
  <!-- 忘记密码提示框: 登录弹窗与欢迎页登录共用(管理员联系方式只有一处, 改一处即可) -->
  <Teleport to="body">
    <div class="fp-mask" @click.self="$emit('close')">
      <div class="fp-card" role="dialog" aria-modal="true" aria-labelledby="fp-title">
        <button class="fp-close" type="button" aria-label="关闭" @click="$emit('close')">×</button>

        <span class="fp-badge" aria-hidden="true">🔑</span>
        <h3 id="fp-title" class="fp-title">忘记密码了？</h3>
        <p class="fp-sub">请联系下面任意一位管理员QQ：</p>

        <ul class="fp-list">
          <li v-for="q in ADMINS" :key="q.qq" class="fp-item">
            <span class="fp-avatar" aria-hidden="true">{{ q.label }}</span>
            <span class="fp-meta">
              <b class="fp-role">{{ q.role }}</b>
              <code class="fp-qq">{{ q.qq }}</code>
            </span>
            <button class="fp-copy" type="button" @click="copy(q.qq)">
              {{ copied === q.qq ? '已复制' : '复制' }}
            </button>
          </li>
        </ul>

        <p class="fp-tip">
          加好友时请附上你的<b>手机号</b>，管理员核验身份后会为你设置新密码。
        </p>
        <p v-if="copyError" class="fp-warn">{{ copyError }}</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'

defineEmits(['close'])

// 管理员联系方式: 全站唯一来源, 两个登录入口都读这里
const ADMINS = [
  { qq: '3407450891', role: '管理员', label: '管' },
  { qq: '1657779760', role: '管理员', label: '管' },
]

const copied = ref('')
const copyError = ref('')

async function copy(qq) {
  copyError.value = ''
  try {
    // navigator.clipboard 只在 HTTPS / localhost 下可用, 失败要能降级
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(qq)
    } else {
      const ta = document.createElement('textarea')
      ta.value = qq
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    copied.value = qq
    setTimeout(() => {
      if (copied.value === qq) copied.value = ''
    }, 1800)
  } catch {
    // 复制不了不影响查看: 号码本来就摊在界面上, 手动记也行
    copyError.value = '自动复制失败，请手动记下上面的 QQ 号'
  }
}
</script>

<style scoped>
.fp-card,
.fp-card * {
  box-sizing: border-box;
}

.fp-mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(44, 34, 26, 0.42);
  backdrop-filter: blur(3px);
  animation: fp-fade 0.22s ease both;
}

@keyframes fp-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.fp-card {
  position: relative;
  width: 330px;
  max-width: 100%;
  padding: 26px 24px 20px;
  border-radius: 20px;
  background: linear-gradient(168deg, #fffdf9 0%, #fdf4ea 100%);
  box-shadow: 0 26px 60px rgba(70, 48, 28, 0.34);
  text-align: center;
  animation: fp-in 0.3s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@keyframes fp-in {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.95);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.fp-close {
  position: absolute;
  right: 12px;
  top: 12px;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: #f4ece1;
  color: #8a7a6d;
  font-size: 17.5px;
  line-height: 1;
  cursor: pointer;
}

.fp-close:hover {
  background: #eadfd2;
}

.fp-badge {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin: 0 auto 10px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffd9a8, #f6a45c);
  box-shadow: 0 8px 18px rgba(240, 145, 124, 0.32);
  font-size: 23px;
}

.fp-title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
  color: #4a3f37;
}

.fp-sub {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.6;
  color: #a89a8c;
}

.fp-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: left;
}

.fp-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid #f0e4d6;
  border-radius: 12px;
  background: #fff;
  transition:
    border-color 0.18s,
    box-shadow 0.18s;
}

.fp-item:hover {
  border-color: #f3c7a4;
  box-shadow: 0 6px 16px rgba(120, 90, 60, 0.1);
}

.fp-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffb27a, #f0917c);
  color: #fff;
  font-size: 14.5px;
  font-weight: 600;
}

.fp-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.fp-role {
  font-size: 12px;
  font-weight: 400;
  color: #b3a79c;
}

.fp-qq {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 16px;
  letter-spacing: 0.6px;
  color: #4a3f37;
}

.fp-copy {
  flex: none;
  margin-left: auto;
  padding: 5px 11px;
  border: 1px solid #eadfd2;
  border-radius: 999px;
  background: #fdf6ee;
  color: #a07048;
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.18s,
    color 0.18s;
}

.fp-copy:hover {
  background: #f0917c;
  border-color: #f0917c;
  color: #fff;
}

.fp-tip {
  margin: 14px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: #a89a8c;
}

.fp-tip b {
  color: #e0705a;
  font-weight: 600;
}

.fp-warn {
  margin: 8px 0 0;
  font-size: 13px;
  color: #c75b5b;
}

@media (prefers-reduced-motion: reduce) {
  .fp-mask,
  .fp-card {
    animation: none;
  }
}
</style>
