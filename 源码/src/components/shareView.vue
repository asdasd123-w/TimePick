<template>
  <div class="share-page">
    <div class="share-wrap">
      <!-- 加载/失败状态 -->
      <div v-if="loading" class="share-state">链接加载中...</div>
      <div v-else-if="errorMsg" class="share-state error">
        <span class="state-ico">!</span>
        <b>{{ errorMsg }}</b>
        <span>该链接可能已被取消、过期或不存在。</span>
      </div>

      <!-- 分享内容 -->
      <template v-else-if="data">
        <header class="share-head">
          <span class="share-badge">拾光分享</span>
          <h1 class="share-title">{{ data.name }}</h1>
          <p class="share-meta">
            {{ data.owner ? data.owner.nickname + ' 分享于 ' : '' }}{{ fmtDate(data.created_at) }}
            <template v-if="data.meta"> · {{ data.meta }}</template>
          </p>
        </header>

        <div class="share-list">
          <article v-for="it in data.items" :key="it.id" class="share-card">
            <div class="card-top">
              <i v-if="it.kind === 'book'" class="kind-tag book">书</i>
              <i v-else-if="it.kind === 'music'" class="kind-tag music">乐</i>
              <i v-else class="kind-tag diary">记</i>
              <b class="card-title">{{ it.title }}</b>
            </div>
            <p class="card-meta">
              {{ it.author ? it.author + ' · ' : '' }}{{ it.type || '其他' }} ·
              {{ it.entry_date || '未填日期' }}
            </p>
            <img v-if="photoOf(it)" class="card-photo" :src="photoOf(it)" alt="" loading="lazy" decoding="async" />
            <audio v-if="audioOf(it)" class="card-audio" :src="audioOf(it)" controls></audio>
            <p v-if="it.content" class="card-content">{{ it.content }}</p>
          </article>
          <p v-if="!data.items.length" class="share-state">这份分享里还没有内容</p>
        </div>

        <footer class="share-foot">有些时光, 只需要被自己记得 · 拾光 TimePick</footer>
      </template>
    </div>
  </div>
</template>

<script setup>
// 公开分享页: 免登录按 token 查看他人分享的切片/单条记忆
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { cloudApi } from '@/api/cloud'

const route = useRoute()

const loading = ref(true)
const errorMsg = ref('')
const data = ref(null)

const photoOf = (it) => (Array.isArray(it.media) ? it.media.find((m) => m.type === 1)?.url : '') || ''
const audioOf = (it) => (Array.isArray(it.media) ? it.media.find((m) => m.type === 2)?.url : '') || ''

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

onMounted(async () => {
  try {
    data.value = await cloudApi.viewShare({ token: route.params.token })
  } catch (e) {
    errorMsg.value = e.message || '分享链接无效'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.share-page,
.share-page * {
  box-sizing: border-box;
}

/* 宿主 .page 是 absolute inset:0 且外层 overflow:hidden,
   这里必须自己撑满并在内部滚动, 否则长内容会被裁掉且无法滚动 */
.share-page {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 48px 16px 64px;
  background: linear-gradient(180deg, #fff9f1 0%, #faebdd 100%);
}

.share-wrap {
  max-width: 680px;
  margin: 0 auto;
}

.share-state {
  padding: 60px 0;
  text-align: center;
  color: #8a7f74;
  font-size: 15.5px;
}

.share-state.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.share-state.error b {
  color: #c0504d;
  font-size: 16.5px;
}

.state-ico {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #fdecec;
  color: #c0504d;
  font-size: 22px;
  font-weight: 700;
}

.share-head {
  padding: 28px 28px 20px;
  border-radius: 18px 18px 0 0;
  background: rgba(255, 255, 255, 0.85);
  text-align: center;
}

.share-badge {
  padding: 4px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ffb27a, #f6a45c);
  color: #fff;
  font-size: 12px;
  letter-spacing: 2px;
}

.share-title {
  margin: 10px 0 6px;
  font-size: 22px;
  color: #4a4038;
}

.share-meta {
  margin: 0;
  font-size: 13px;
  color: #9a8f83;
}

.share-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px 20px;
  border-radius: 0 0 18px 18px;
  background: rgba(255, 255, 255, 0.65);
}

.share-card {
  padding: 14px 16px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(120, 90, 60, 0.08);
}

.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kind-tag {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  font-style: normal;
  font-size: 12px;
  color: #fff;
}

.kind-tag.diary {
  background: #f6a45c;
}

.kind-tag.book {
  background: #8fb58f;
}

.kind-tag.music {
  background: #b9a6e8;
}

.card-title {
  font-size: 17px;
  color: #4a4038;
}

.card-meta {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #9a8f83;
}

.card-photo {
  width: 100%;
  max-height: 320px;
  margin-top: 10px;
  border-radius: 10px;
  object-fit: cover;
}

.card-audio {
  width: 100%;
  margin-top: 10px;
}

.card-content {
  margin: 10px 0 0;
  font-size: 15px;
  line-height: 1.8;
  color: #5c4f45;
  white-space: pre-line;
}

.share-foot {
  margin-top: 24px;
  text-align: center;
  color: #b3a79b;
  font-size: 13px;
  letter-spacing: 1px;
}
</style>
