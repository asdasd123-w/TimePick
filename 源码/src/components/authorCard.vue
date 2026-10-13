<template>
  <!-- 作者个人信息卡: 点广场卡片左上头像呼出 -->
  <div class="ac-mask" @click.self="$emit('close')">
    <div class="ac-card">
      <button class="ac-close" type="button" aria-label="关闭" @click="$emit('close')">×</button>
      <span class="ac-cover" :style="coverStyle"></span>
      <button
        class="ac-ava"
        type="button"
        :style="avaStyle"
        :title="`进入 ${author.name} 的记忆空间`"
        @click="$emit('space', author)"
      >
        <img v-if="author.avatar" class="ac-ava-img" :src="author.avatar" alt="" />
        <template v-else>{{ author.name[0] }}</template>
      </button>
      <b class="ac-name">{{ author.name }}</b>
      <span class="ac-bio">{{ author.bio }}</span>
      <span class="ac-joined">{{ author.joined }}</span>
      <div class="ac-stats">
        <span
          ><b>{{ author.likes || 0 }}</b
          >赞数</span
        >
        <span
          ><b>{{ author.publicMemories || 0 }}</b
          >公开记忆</span
        >
        <span
          ><b>{{ author.following || 0 }}</b
          >关注</span
        >
        <span
          ><b>{{ author.followers || 0 }}</b
          >粉丝</span
        >
      </div>
      <div class="ac-tags">
        <span v-for="t in author.tags" :key="t" class="ac-tag"># {{ t }}</span>
      </div>
      <div class="ac-foot">
        <button type="button" :class="{ on: followed }" @click="toggleFollow">
          {{ followed ? '已关注 ✓' : '+ 关注' }}
        </button>
        <button type="button" class="ghost" @click="$emit('space', author)">记忆空间</button>
        <button type="button" class="ghost" @click="$emit('dm', author)">发私信</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// 作者信息子组件: 头像/简介/统计/标签 + 关注与私信入口
import { computed, ref } from 'vue'

const props = defineProps({
  author: { type: Object, required: true },
})
const emit = defineEmits(['close', 'follow', 'dm', 'space'])

const followed = ref(!!props.author.followed)

function toggleFollow() {
  followed.value = !followed.value
  emit('follow', { name: props.author.name, on: followed.value })
}

// 昵称首字哈希出色相, 每人头像颜色不同
const hue = computed(() => ((props.author?.name || '匿').charCodeAt(0) * 7) % 360)
const avaStyle = computed(() => ({
  background: `linear-gradient(135deg, hsl(${hue.value} 80% 78%), hsl(${(hue.value + 40) % 360} 70% 66%))`,
}))
const coverStyle = computed(() => ({
  background: `linear-gradient(120deg, hsl(${hue.value} 70% 88%), hsl(${(hue.value + 60) % 360} 65% 84%))`,
}))
</script>

<style scoped>
.ac-card,
.ac-card * {
  box-sizing: border-box;
}

.ac-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: rgba(40, 34, 28, 0.32);
  backdrop-filter: blur(2px);
}

.ac-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 300px;
  padding: 0 20px 18px;
  border-radius: 18px;
  background: rgba(255, 252, 248, 0.98);
  box-shadow: 0 24px 60px rgba(90, 70, 40, 0.3);
  animation: ac-in 0.28s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@keyframes ac-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.96);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.ac-close {
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 2;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.7);
  color: #8a7a6d;
  font-size: 17.5px;
  line-height: 1;
  cursor: pointer;
}

.ac-cover {
  width: calc(100% + 40px);
  height: 74px;
  margin: 0 -20px;
  border-radius: 18px 18px 0 0;
}

/* 头像本身也可点: 直接进入 TA 的记忆空间 */
.ac-ava {
  display: grid;
  place-items: center;
  width: 62px;
  height: 62px;
  margin-top: -31px;
  padding: 0;
  border: 3px solid #fffdf9;
  border-radius: 50%;
  overflow: hidden;
  color: #fff;
  font-family: inherit;
  font-size: 24px;
  font-weight: 700;
  box-shadow: 0 6px 16px rgba(90, 70, 40, 0.22);
  cursor: pointer;
  transition: transform 0.18s ease;
}

.ac-ava:hover {
  transform: scale(1.06);
}
.ac-ava-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ac-name {
  font-size: 17.5px;
  color: #3d352e;
}

.ac-bio {
  font-size: 14.5px;
  color: #8a7a6d;
}

.ac-joined {
  font-size: 12px;
  color: #b3a79c;
}

.ac-stats {
  display: flex;
  gap: 22px;
  margin-top: 6px;
  padding: 8px 18px;
  border-radius: 12px;
  background: #f8f2ea;
}

.ac-stats span {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  font-size: 12px;
  color: #a08063;
}

.ac-stats b {
  font-size: 17px;
  color: #4a3f37;
}

.ac-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.ac-tag {
  padding: 2px 9px;
  border-radius: 999px;
  background: #fdeae2;
  color: #e0705a;
  font-size: 12px;
}

.ac-foot {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.ac-foot button {
  padding: 7px 12px;
  border: none;
  border-radius: 999px;
  background: #f0917c;
  color: #fff;
  font-size: 14.5px;
  white-space: nowrap;
  cursor: pointer;
}

.ac-foot button.on {
  background: #f6e8dc;
  color: #a08063;
}

.ac-foot button.ghost {
  background: #fff;
  box-shadow: inset 0 0 0 1px #eadfd2;
  color: #8a7a6d;
}
</style>
