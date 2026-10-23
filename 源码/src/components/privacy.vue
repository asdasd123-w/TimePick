<template>
  <div class="privacy">
    <div class="privacy-figure" :style="{ '--pv-bg': `url(${PAGE_BG})` }">
      <div class="privacy-figure-inner">
        <!-- 手机端标题（≤767 才显示）：海报上的标题是画进图片里的，竖屏裁成顶条后会丢掉 -->
        <header class="pv-m-head">
          <h1>隐私设置</h1>
          <p>你的记忆，由你决定给谁看</p>
        </header>

        <img
    class="privacy-bg"
    src="../assets/opt/privacyBackground.webp"
    srcset="../assets/opt/privacyBackground-sm.webp 1000w, ../assets/opt/privacyBackground.webp 1443w"
    sizes="100vw"
    alt=""
    decoding="async"
  />

        <!-- 卡1: 记忆可见性 -->
        <section class="pv-card card-1">
          <div class="card-head"><b>记忆可见性</b></div>
          <p class="card-desc">你的记忆默认仅自己可见，你可以选择主动分享给重要的人。</p>
          <div class="card-body">
            <div class="vis-box">
              <span class="vis-label">新建记忆的默认可见性</span>
              <button
                class="vis-row"
                :class="{ on: vis === 'self' }"
                type="button"
                @click="vis = 'self'; saveVis()"
              >
                <i class="vis-dot"></i>
                <span class="vis-text">
                  <b>仅自己可见（推荐）</b>
                  <span>所有记忆默认只有你可以查看</span>
                </span>
              </button>
              <button
                class="vis-row"
                :class="{ on: vis === 'manual' }"
                type="button"
                @click="vis = 'manual'; saveVis()"
              >
                <i class="vis-dot"></i>
                <span class="vis-text">
                  <b>创建时手动选择</b>
                  <span>每次新建记忆时选择可见范围</span>
                </span>
              </button>
            </div>
          </div>
        </section>

        <!-- 卡2: AI 与记忆权限 -->
        <section class="pv-card card-2">
          <div class="card-head"><b>AI 与记忆权限</b></div>
          <p class="card-desc">你可以控制拾光 AI 能够读取和使用哪些内容。</p>
          <div class="card-body">
            <div v-for="(a, i) in aiPerms" :key="a.title" class="ai-row">
              <i class="ai-ico"></i>
              <span class="ai-text">
                <b>{{ a.title }}</b>
                <span>{{ a.desc }}</span>
              </span>
              <button
                class="sw"
                :class="{ on: a.on }"
                type="button"
                :aria-label="a.title"
                @click="a.on = !a.on; saveAiPerm(i)"
              ></button>
            </div>
          </div>
        </section>

        <!-- 卡3: 分享管理 -->
        <section class="pv-card card-3">
          <div class="card-head"><b>分享管理</b></div>
          <p class="card-desc">你可以将特定的切片或记忆生成链接，分享给重要的人。</p>
          <div class="sh-tabs">
            <button
              class="sh-tab"
              :class="{ on: tab === 'mine' }"
              type="button"
              @click="tab = 'mine'"
            >
              我分享的内容 ({{ mineCount }})
            </button>
            <button
              class="sh-tab"
              :class="{ on: tab === 'expired' }"
              type="button"
              @click="tab = 'expired'"
            >
              已失效的分享 ({{ expiredCount }})
            </button>
          </div>
          <div class="card-body">
            <div v-for="s in shownShares" :key="s.id" class="sh-row">
              <!-- 左边缩略图：对应小岛的切图（雪碧图按包围盒定位），不再是"图"字占位 -->
              <span class="sh-thumb" :style="thumbStyle(s)" aria-hidden="true"></span>
              <span class="sh-meta">
                <b>{{ s.name }}</b>
                <span>{{ s.meta }}</span>
                <span>{{ s.date }}</span>
              </span>
              <i class="sh-pill" :class="pillClass(s.status)">{{ pillText(s.status) }}</i>
              <span class="sh-acts">
                <template v-if="s.status !== 'expired'">
                  <button class="sh-act" type="button" @click="copyLink(s)">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M10 14a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-5.6-5.6L12 7.5" />
                      <path d="M14 10a4 4 0 0 0-6-.5l-3 3a4 4 0 0 0 5.6 5.6L12 16.5" />
                    </svg>
                    复制链接
                  </button>
                  <button class="sh-act danger" type="button" @click="cancelShare(s)">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m6 6 12 12M18 6 6 18" />
                    </svg>
                    取消分享
                  </button>
                </template>
                <template v-else>
                  <button class="sh-act" type="button" @click="reopenShare(s)">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
                    </svg>
                    重新开启
                  </button>
                  <button class="sh-act danger" type="button" @click="deleteShare(s)">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" />
                    </svg>
                    删除
                  </button>
                </template>
              </span>
            </div>
            <p v-if="!shownShares.length" class="card-empty">这里还没有分享记录</p>
          </div>
        </section>

        <!-- 卡4: 数据管理 -->
        <section class="pv-card card-4">
          <div class="card-head"><b>数据管理</b></div>
          <p class="card-desc">你始终拥有对自己数据的完全控制权。</p>
          <div class="card-body">
            <button class="dm-row" type="button" @click="exportData">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <span class="dm-text">
                <b>导出我的记忆</b>
                <span>将所有记忆导出为本地文件（如 Markdown / ZIP）</span>
              </span>
              <i class="dm-chev">›</i>
            </button>
            <!-- 「清除指定切片的数据」入口已按用户要求移除(2026-10-20):
                 误触代价太高(一次点掉整个切片的记忆), 而上面「清除所有数据」已经能覆盖需求。
                 相关弹窗/函数一并删除, 不再留死代码。 -->
            <div class="dm-row dm-row-danger">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3 2 20h20L12 3Zm0 7v5m0 3v.5" />
              </svg>
              <span class="dm-text">
                <b>清除所有数据</b>
                <span>此操作不可恢复，请谨慎操作</span>
              </span>
              <button class="dm-del" :class="{ armed }" type="button" @click="deleteAll">
                {{ armed ? '再点一次确认删除' : '删除所有数据' }}
              </button>
            </div>
          </div>
        </section>

        <div v-if="tip" class="pv-tip">{{ tip }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 隐私设置: 新背景四张白卡(标题/图标/便签已烘焙), 文字内容叠加, 超出可滚动
import { computed, onMounted, ref } from 'vue'
import { cloudApi } from '@/api/cloud'
import { useCloudAuthStore } from '@/stores/cloudAuth'
// ★ 2026-10-27：背景图在 CSS 里也要用一份（铺满用的模糊垫底层），所以显式 import 拿 URL
import PAGE_BG from '@/assets/opt/privacyBackground.webp'
import { islandSpriteStyle, DEFAULT_ART } from '@/data/islands'

const auth = useCloudAuthStore()

// 卡1: 默认可见性
const vis = ref('self')

// 卡2: AI 权限开关
const aiPerms = ref([
  { title: '允许 AI 读取我的记忆', desc: '用于回答问题、生成总结、提供陪伴式对话', on: true },
  { title: '允许 AI 跨切片寻找记忆关联', desc: '帮助你发现不同阶段记忆之间的联系', on: true },
  { title: '允许 AI 生成阶段性总结', desc: '如学期/年度回顾、情绪变化、兴趣趋势等', on: true },
  { title: '不使用我的记忆进行模型训练', desc: '你的记忆内容不会用于任何模型训练', on: true },
])

// 卡3: 分享管理
const tab = ref('mine')
const shares = ref([])

const expiredCount = computed(() => shares.value.filter((s) => s.status === 'expired').length)
// ★ 2026-10-27 修复「取消分享后统计数量没有变化」：
//   原来这两个页签的计数是 shares.length（全部记录，含已失效），取消一条后
//   记录只是换了状态、总数不变，所以数字纹丝不动。第一条页签要数"还能用的"。
const mineCount = computed(() => shares.value.filter((s) => s.status !== 'expired').length)
const shownShares = computed(() => {
  if (tab.value === 'mine') return shares.value.filter((s) => s.status !== 'expired')
  return shares.value.filter((s) => s.status === 'expired')
})

// 分享项左边的小岛缩略图：用雪碧图（isle.webp）按实测包围盒切出这座岛
// （原来是一个虚线框里写个"图"字，用户要求换成对应小岛切图）
const artBySpace = ref({})
function thumbStyle(s) {
  const art = artBySpace.value[Number(s.space_id)] || 'blossom'
  return islandSpriteStyle(art)
}
async function loadSpaceArts() {
  try {
    const list = (await cloudApi.listSpaces()) || []
    const map = {}
    for (const sp of list) {
      // 空间上存了外观 key 就用它；老数据没有就按主题名回落，再不行给 blossom
      map[Number(sp.id)] = sp.island_art || DEFAULT_ART[sp.island_name] || 'blossom'
    }
    artBySpace.value = map
  } catch {
    artBySpace.value = {}
  }
}

function pillClass(status) {
  if (status === 'valid') return 'valid'
  if (status === 'expired') return 'off'
  return 'warn'
}
// 状态一律用中文（原来直接把英文 valid 印在小胶囊里）
function pillText(status) {
  if (status === 'valid') return '生效中'
  if (status === 'expired') return '已失效'
  return '待确认'
}

async function copyLink(s) {
  const link = `${window.location.origin}/share/${s.token}`
  try {
    await navigator.clipboard.writeText(link)
    toast(`「${s.name}」的链接已复制`)
  } catch {
    toast(`链接：${link}`)
  }
}

async function cancelShare(s) {
  try {
    await cloudApi.updateShare({ id: s.id, status: 'expired' })
    s.status = 'expired'
    toast('已取消分享，链接不再生效')
  } catch (e) {
    toast(e.message || '操作失败')
  }
}

async function reopenShare(s) {
  try {
    await cloudApi.updateShare({ id: s.id, status: 'valid' })
    s.status = 'valid'
    toast('分享已重新开启')
  } catch (e) {
    toast(e.message || '操作失败')
  }
}

async function deleteShare(s) {
  try {
    await cloudApi.removeShare({ id: s.id })
    shares.value = shares.value.filter((it) => it.id !== s.id)
    toast('分享记录已删除')
  } catch (e) {
    toast(e.message || '删除失败')
  }
}

// 卡 4: 危险操作两次确认
const armed = ref(false)
let armTimer = null

async function deleteAll() {
  if (!armed.value) {
    armed.value = true
    clearTimeout(armTimer)
    armTimer = setTimeout(() => {
      armed.value = false
    }, 2500)
    return
  }
  armed.value = false
  try {
    await cloudApi.deleteAllData()
    toast('所有数据已删除')
    await loadSettings()
    await loadShares()
  } catch (e) {
    toast(e.message || '删除失败')
  }
}

// 导出数据: 服务端聚合 Markdown, 前端触发浏览器下载
async function exportData() {
  if (!auth.isLogin) return toast('请先登录后再导出')
  try {
    const { markdown, count } = await cloudApi.exportMemories()
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `拾光记忆-${new Date().toISOString().slice(0, 10)}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast(`已导出 ${count} 条记忆为 Markdown`)
  } catch (e) {
    toast(e.message || '导出失败')
  }
}

// 「清除指定切片」整套入口已在 2026-10-20 按用户要求移除(见模板处注释),
// 这里不再保留 showClearModal / spaces / armedSpace / clearSlice / doClearSpace。

// 加载设置
async function loadSettings() {
  if (!auth.isLogin) return
  try {
    const settings = await cloudApi.getSettings()
    if (settings) {
      vis.value = settings.default_vis || 'self'
      aiPerms.value[0].on = !!settings.ai_read_memory
      aiPerms.value[1].on = !!settings.ai_cross_space
      aiPerms.value[2].on = !!settings.ai_summary
      aiPerms.value[3].on = !!settings.ai_no_training
    }
  } catch (e) {
    console.error('加载设置失败:', e.message)
  }
}

// 保存可见性
async function saveVis() {
  if (!auth.isLogin) return
  try {
    await cloudApi.updateSettings({ default_vis: vis.value })
    // ★ 原来是静默保存：点完什么都没发生，用户会以为"这个开关没用"。
    //   给一句明确回执，并说清下一次新建记忆会按哪种规则走。
    toast(
      vis.value === 'manual'
        ? '已保存：以后新建记忆时会先让你选可见范围'
        : '已保存：以后新建的记忆默认只有你能看到',
    )
  } catch (e) {
    toast(e.message || '保存失败，请稍后重试')
    console.error('保存可见性失败:', e.message)
  }
}

// 保存 AI 权限
async function saveAiPerm(index) {
  if (!auth.isLogin) return
  const keys = ['ai_read_memory', 'ai_cross_space', 'ai_summary', 'ai_no_training']
  try {
    await cloudApi.updateSettings({ [keys[index]]: aiPerms.value[index].on ? 1 : 0 })
  } catch (e) {
    console.error('保存 AI 权限失败:', e.message)
  }
}

// 加载分享
async function loadShares() {
  if (!auth.isLogin) return
  try {
    const list = await cloudApi.listShares()
    shares.value = (list || []).map((s) => ({
      ...s,
      date: `分享于 ${fmtDate(s.created_at)}`,
    }))
  } catch (e) {
    console.error('加载分享失败:', e.message)
  }
}

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// 轻提示
const tip = ref('')
let tipTimer = null

function toast(text) {
  tip.value = text
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => {
    tip.value = ''
  }, 2200)
}

onMounted(() => {
  loadSettings()
  loadShares()
  loadSpaceArts()
})
</script>

<style scoped>
.privacy,
.privacy * {
  box-sizing: border-box;
}

.privacy {
  position: absolute;
  inset: 0;
}

.privacy-figure {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  container-type: size;
  background: #e6d9c9;
}

/* ★ 2026-10-27 用户反馈「隐私设置背景要铺满」：
   画面是按 1443×941 烘焙的，屏幕比例不是 1.53 时，contain 必然在两侧/上下留出空白条，
   看起来就是"没铺满"。这里在底下垫一层同一张图的 **cover + 高斯模糊**，
   留白区域就变成柔和的延伸画面（不裁掉卡片、也不会错位），
   上面那层 sharp 的 contain 图仍然与卡片位置严格对齐。 */
.privacy-figure::before {
  content: '';
  position: absolute;
  inset: -40px;
  background-image: var(--pv-bg, none);
  background-size: cover;
  background-position: center;
  filter: blur(26px) saturate(1.06);
  opacity: 0.96;
  pointer-events: none;
}

/* 与 contain 绘制出的图片区域同比例同位置 */
/* ★ 内层框必须和 object-fit:contain 画出来的图片区域**完全重合**。
   老写法是 width:100% + aspect-ratio + max-height:100%：容器比图更宽时，
   max-height 把高度卡住、宽度却还是 100%，比例就破了 —— 卡片按 % 定位会整体往外偏，
   换个屏幕比例（比如 16:9 笔记本接到 4:3 投影）看起来就是"排版乱了"。
   现在用容器查询单位算出 contain 盒的真实宽高，两种极端都能对上。
   （不支持容器查询的旧浏览器仍走上面那组老声明，行为与以前一致。） */
.privacy-figure-inner {
  position: absolute;
  inset: 0;
  z-index: 1;
  aspect-ratio: 1443 / 941;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  /* 精确的 contain 盒：宽度取「容器宽」与「按高换算的宽」的较小者 */
  width: min(100cqw, calc(100cqh * 1443 / 941));
  height: min(100cqh, calc(100cqw * 941 / 1443));
  max-width: none;
  max-height: none;
}

.privacy-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

/* 四张烘焙白卡的内容叠加区(透明, 让背景图标/便签透出来) */
.pv-card {
  position: absolute;
  display: flex;
  flex-direction: column;
  padding: 18px 24px;
  overflow: hidden;
}

/* 标题/描述/页签固定, 内容区超出时在卡内滚动, 不撑开卡片 */
.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  margin-top: 12px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #d8c4b4 transparent;
}

.card-body::-webkit-scrollbar {
  width: 6px;
}

.card-body::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: #d8c4b4;
}

.card-1 {
  left: 6.85%;
  top: 19.1%;
  width: 42.65%;
  height: 31.3%;
}

.card-2 {
  left: 50%;
  top: 19.1%;
  width: 42.5%;
  height: 32.4%;
}

.card-3 {
  left: 6.85%;
  top: 51.5%;
  width: 42.65%;
  height: 38.2%;
}

.card-4 {
  left: 51.3%;
  top: 53.8%;
  width: 41%;
  height: 37%;
}

/* 标题/描述居中, 与烘焙卡片版式对齐 */
.card-head {
  margin: 0;
  text-align: center;
}

.card-head b {
  font-size: 16.5px;
  letter-spacing: 1px;
  color: #4a4038;
}

.card-desc {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #8a7f74;
  text-align: center;
}

.card-empty {
  margin: 16px 0;
  text-align: center;
  color: #b3a79b;
  font-size: 13px;
}

/* 卡1: 可见性单选 */
.vis-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 62%;
  margin: 0 auto;
  padding: 12px 14px;
  border: 1px solid #f0e4d8;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
}

.vis-label {
  font-size: 14.5px;
  font-weight: 600;
  color: #5c5248;
}

.vis-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.16s, box-shadow 0.16s;
}

.vis-row:hover {
  background: rgba(255, 255, 255, 0.7);
}

/* ★ 2026-10-27：原来选中态只有一个小蓝点，点完"创建时手动选择"看起来跟没点一样，
   很容易被当成"功能没生效"。给当前选中项加一层浅蓝底 + 柔和描边，一眼能看出选的是哪个。 */
.vis-row.on {
  background: rgba(255, 255, 255, 0.92);
  box-shadow: inset 0 0 0 1.5px #c3d4f4, 0 2px 8px rgba(74, 127, 212, 0.1);
}

.vis-dot {
  flex: none;
  margin-top: 2px;
  width: 14px;
  height: 14px;
  border: 2px solid #c9b8a8;
  border-radius: 50%;
}

.vis-row.on .vis-dot {
  border-color: #4a7fd4;
  background: radial-gradient(circle, #4a7fd4 0 45%, transparent 50%);
}

.vis-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.vis-text b {
  font-size: 14.5px;
  color: #4a4038;
}

.vis-text span {
  font-size: 12px;
  color: #9a8f83;
}

/* 卡2: AI 权限行 */
.ai-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 76%;
  margin: 0 auto;
  padding: 7px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.5);
}

.ai-ico {
  flex: none;
  margin-top: 2px;
  width: 15px;
  height: 15px;
  border: 1.5px solid #b9a6e8;
  border-radius: 4px;
  background: radial-gradient(circle, #b9a6e8 0 30%, transparent 35%);
}

.ai-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ai-text b {
  font-size: 14.5px;
  color: #4a4038;
}

.ai-text span {
  font-size: 12px;
  color: #9a8f83;
}

.sw {
  flex: none;
  margin-left: auto;
  margin-top: 2px;
  width: 38px;
  height: 20px;
  border: none;
  border-radius: 999px;
  background: #d9cfc4;
  position: relative;
  cursor: pointer;
  transition: background 0.2s ease;
}

.sw::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.2s ease;
}

.sw.on {
  background: #4a7fd4;
}

.sw.on::after {
  left: 20px;
}

/* 卡3: 分享管理 */
.sh-tabs {
  display: flex;
  justify-content: center;
  gap: 18px;
  margin-top: 12px;
}

.sh-tab {
  padding: 4px 2px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #8a7f74;
  font-size: 14.5px;
  cursor: pointer;
}

.sh-tab.on {
  border-bottom-color: #4a7fd4;
  color: #4a7fd4;
  font-weight: 600;
}

.sh-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
}

/* 分享封面预留位 */
/* 缩略图：小岛切图（背景图由 islandSpriteStyle 内联给出 background-image/size/position） */
.sh-thumb {
  display: block;
  flex: none;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 10px;
  background-color: #f6ecdf;
  background-repeat: no-repeat;
  box-shadow: inset 0 0 0 1px rgba(228, 191, 164, 0.6);
}

.sh-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.sh-meta b {
  font-size: 14.5px;
  color: #4a4038;
}

.sh-meta span {
  font-size: 11.5px;
  color: #9a8f83;
}

.sh-pill {
  flex: none;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-style: normal;
}

.sh-pill.valid {
  background: #e5f5e5;
  color: #67a767;
}

.sh-pill.warn {
  background: #fdf1df;
  color: #d89a4e;
}

.sh-pill.off {
  background: #ececec;
  color: #999;
}

.sh-acts {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.sh-act {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6b5d52;
  font-size: 11.5px;
  cursor: pointer;
}

.sh-act svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sh-act:hover {
  background: rgba(255, 255, 255, 0.8);
}

.sh-act.danger {
  color: #d66a5a;
}

.sh-more {
  border: none;
  background: transparent;
  color: #b3a79b;
  font-size: 17px;
  cursor: pointer;
}

/* 卡4: 数据管理 */
.dm-row {
  display: flex;
  align-items: center;
  /* ★ 允许换行：中文在不同机器上回落的字体不一样（雅黑 / 宋体 / 苹方），
     字宽差 10% 以上，一行硬排会把右侧按钮挤出卡片（被 overflow:hidden 裁掉）。
     宁可换行，也不要让按钮消失。 */
  flex-wrap: wrap;
  gap: 10px;
  padding: 9px 12px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  text-align: left;
  cursor: pointer;
}

.dm-row:hover {
  background: rgba(255, 255, 255, 0.85);
}

.dm-row svg,
.dm-danger svg {
  flex: none;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: #8a6f5a;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dm-text {
  display: flex;
  flex: 1 1 120px;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  /* 长句/英文串在窄机器上要能断开，别把整行撑开 */
  overflow-wrap: anywhere;
}

.dm-text b {
  font-size: 14.5px;
  color: #4a4038;
}

.dm-text span {
  font-size: 12px;
  color: #9a8f83;
}

.dm-chev {
  margin-left: auto;
  color: #b3a79b;
  font-size: 17.5px;
  font-style: normal;
}

.dm-row-danger {
  background: #fdecec;
  cursor: default;
}

.dm-row-danger svg {
  stroke: #c0504d;
}

.dm-row-danger .dm-text b {
  color: #c0504d;
}

.dm-del {
  margin-left: auto;
  flex: 0 1 auto;
  /* 字数多时缩一点，别硬顶到卡片外 */
  max-width: 100%;
  padding: 7px 14px;
  white-space: nowrap;
  border: none;
  border-radius: 999px;
  background: #e88b7d;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.dm-del.armed {
  background: #c0504d;
}

/* 轻提示 */
.pv-tip {
  position: absolute;
  left: 50%;
  top: 12%;
  transform: translateX(-50%);
  padding: 8px 18px;
  border-radius: 999px;
  background: rgba(74, 63, 55, 0.85);
  color: #fff;
  font-size: 14.5px;
  white-space: nowrap;
}

/* 手机专用标题：桌面不占位 */
.pv-m-head {
  display: none;
}

/* ============================================================================
   手机版式（≤767.98）
   ★ 桌面是 1443×941 整页海报 + 四张按百分比定位的白卡。竖屏时整张海报被
     contain 成 390×254，四张卡挤在这个高度里，隐私开关只剩 20px 高。
     这里：海报退成 124px 顶部装饰条、四张卡回到文档流竖排、卡内不再内部滚动。
   ★ 卡片内容是自适应的（card-body 本来就能滚动），改成 auto 高度后自然撑开。
   ============================================================================ */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  .privacy {
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    background: #fdf7ef;
  }

  .privacy-figure {
    position: relative;
    display: block;
    height: auto;
    background: none;
  }

  /* 海报底下那层「cover + 模糊」垫图是为了补满桌面留白的，手机上用装饰条替代 */
  .privacy-figure::before {
    display: none;
  }

  .privacy-figure-inner {
    position: static;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    height: auto;
    max-height: none;
    aspect-ratio: auto;
    padding: 124px 12px calc(20px + env(safe-area-inset-bottom));
  }

  /* 装饰条：只取插画底部一条（避开烤进去的标题），底边渐隐接入页面底色 */
  .privacy-bg {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    width: 100%;
    height: 124px;
    object-fit: cover;
    object-position: 50% 100%;
    -webkit-mask-image: linear-gradient(180deg, #000 56%, transparent 100%);
    mask-image: linear-gradient(180deg, #000 56%, transparent 100%);
  }

  .pv-m-head {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    height: 124px;
    padding: 0 16px;
    background: linear-gradient(
      90deg,
      rgba(253, 247, 239, 0.97) 0%,
      rgba(253, 247, 239, 0.88) 46%,
      rgba(253, 247, 239, 0.1) 82%,
      rgba(253, 247, 239, 0) 100%
    );
    pointer-events: none;
  }

  .pv-m-head h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 3px;
    color: #57402f;
    font-family: 'Songti SC', 'STSong', 'SimSun', serif;
  }

  .pv-m-head p {
    margin: 0;
    font-size: 12.5px;
    color: #967f6a;
  }

  /* 四张白卡：回到流里、整宽、高度随内容 */
  .pv-card {
    position: static;
    width: auto;
    height: auto;
    padding: 14px;
    border-radius: 16px;
    background: rgba(255, 253, 250, 0.96);
    box-shadow: 0 6px 18px rgba(120, 90, 60, 0.1);
    overflow: visible;
  }

  .card-body {
    overflow: visible;
  }

  /* 可见性两选一：竖排，热区 48px 高 */
  .vis-box {
    gap: 8px;
  }

  .vis-row {
    min-height: 48px;
    padding: 10px 12px;
  }

  /* 开关：原来是 38×20，手指点不准位置；这里只把热区撑到 44×44，视觉尺寸不变 */
  .sw {
    flex: none;
    margin: -12px;
    padding: 12px;
    box-sizing: content-box;
  }

  /* 桌面卡片里的字是居中的（为了对准烘焙的白卡），竖屏通栏后居中很难读 */
  .pv-card,
  .card-head,
  .card-desc {
    text-align: left;
  }

  /* 两个可见性选项从"并排各半"改成"上下整宽"，否则每行只有 200px 宽、
     标题被折成两行（实测「新建记忆的默认可见性」断成 3 行） */
  .vis-box {
    flex-direction: column;
    align-items: stretch;
  }

  .vis-row {
    width: 100%;
  }

  .ai-row {
    min-height: 48px;
    gap: 10px;
  }

  /* ai-text 不设 min-width:0 的话，长文案会顶到开关下面（实测「允许 AI 读取我的记忆」
     压到开关上）；这里让文字占剩余宽度并允许换行 */
  .ai-text {
    flex: 1;
    min-width: 0;
  }

  /* 分享管理里的操作按钮 */
  .sh-act {
    min-height: 34px;
    padding: 0 10px;
  }

  .sh-tab {
    min-height: 38px;
  }

  .dm-row,
  .dm-del {
    min-height: 48px;
  }
}
</style>
