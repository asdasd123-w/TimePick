<template>
  <div v-if="notice" class="cn-wrap" @click.stop>
    <span class="cn-dot" aria-hidden="true"></span>
    <div class="cn-text">
      <strong>{{ notice.title }}</strong>
      <span v-if="notice.body">{{ notice.body }}</span>
    </div>
    <button class="cn-close" type="button" aria-label="收起公告" @click="dismiss">&times;</button>
  </div>
</template>

<script setup>
// 云端公告：不登录也能看到的公开只读数据（云数据库 tp_notice）。
// 挂在欢迎页，既是一条真的产品公告，也证明「浏览器 → 数据面 → 云数据库」这条链路是通的。
import { onMounted, ref } from 'vue'
import { listNotices } from '@/cloud/backup'

const KEY = 'tp_cloud_notice_closed'
const notice = ref(null)

function dismiss() {
  if (notice.value) sessionStorage.setItem(KEY, String(notice.value.id))
  notice.value = null
}

onMounted(async () => {
  try {
    const rows = await listNotices(3)
    const closed = sessionStorage.getItem(KEY)
    notice.value = rows.find((r) => String(r.id) !== closed) || null
  } catch {
    notice.value = null
  }
})
</script>

<style scoped>
.cn-wrap {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 300px;
  padding: 9px 11px;
  border-radius: 12px;
  background: rgba(255, 253, 250, 0.86);
  box-shadow: 0 8px 20px rgba(90, 60, 35, 0.16);
  backdrop-filter: blur(6px);
}

.cn-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: #e0865a;
  box-shadow: 0 0 0 3px rgba(224, 134, 90, 0.18);
}

.cn-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cn-text strong {
  font-size: 12px;
  font-weight: 600;
  color: #4a3f37;
}

.cn-text span {
  font-size: 11.5px;
  line-height: 1.5;
  color: #8d7761;
}

.cn-close {
  flex: 0 0 auto;
  border: 0;
  background: none;
  font-size: 16px;
  line-height: 1;
  color: #b0937a;
  cursor: pointer;
}
/* 手机端：× 原本只有 21×18，手指点不中。撑成 40×40 的正方形热区，
   用负外边距把多出来的部分吐回去，公告条的视觉高度一点不变。 */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  .cn-close {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin: -8px -8px -8px 0;
    border-radius: 10px;
    font-size: 18px;
  }
  .cn-wrap {
    /* 390 宽下 300px 的卡片会把右侧的关闭键顶出屏，改成跟容器走 */
    max-width: min(320px, calc(100vw - 32px));
  }
}
</style>
