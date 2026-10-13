<template>
  <div class="square">
    <!-- 顶部天空岛横幅: 背景烘焙标题/搜索胶囊/右上角那句"分享一段时光" -->
    <header class="sq-hero">
      <!-- 横幅动态: 漂移云带 + 闪光点 + 扫光, 纯装饰层不挡交互 -->
      <div class="sq-fx" aria-hidden="true">
        <span class="fx-cloud c1"></span>
        <span class="fx-cloud c2"></span>
        <span class="fx-spark" style="left: 12%; top: 30%"></span>
        <span class="fx-spark" style="left: 30%; top: 58%; animation-delay: 1.4s"></span>
        <span class="fx-spark" style="left: 47%; top: 24%; animation-delay: 2.6s"></span>
        <span class="fx-spark" style="left: 58%; top: 66%; animation-delay: 0.8s"></span>
        <span class="fx-sweep"></span>
      </div>
      <input
        v-model="keyword"
        class="sq-search"
        type="text"
        placeholder=""
        aria-label="搜索用户、记忆或标签"
      />
      <!-- 烘焙在横幅上的那句「分享一段时光」: 广场自己不再提供添加数据,
           点它只是把人送去记忆库那唯一的写作入口(不在广场另开一套表单)。 -->
      <!-- 手机专用标题（≤767 才显示）：横幅上的「拾光广场」是画在图片里的，
           竖屏把横幅压到 150px 后那行字只剩几像素高，所以用文字重画一份。
           桌面端 display:none，不影响原有烘焙图 + 热点那套定位。 -->
      <span class="sq-h-m">
        <b>拾光广场</b>
        <i>在这里，遇见别人的时光，也分享自己的故事</i>
      </span>
      <button class="sq-hero-write" type="button" aria-label="去记忆库写一篇日记" @click="goWrite">
        <span class="sr-only">去记忆库写一篇日记</span>
      </button>
    </header>

    <!-- 内容区: 超出可滑动 -->
    <div class="sq-body">
      <div class="sq-wrap">
        <main class="sq-main">
          <!-- 手机专用搜索条：横幅上那个搜索胶囊是烤进图里的，竖屏根本点不到 -->
          <div class="sq-m-bar">
            <input
              v-model="keyword"
              class="sq-m-search"
              type="text"
              placeholder="搜索用户、记忆或标签"
              aria-label="搜索用户、记忆或标签"
            />
            <button class="sq-m-write" type="button" @click="goWrite">写日记</button>
          </div>
          <div class="sq-tabs">
            <button
              v-for="t in TABS"
              :key="t.key"
              type="button"
              :class="{ on: tab === t.key }"
              @click="pickTab(t.key)"
            >
              {{ t.label }}
            </button>
          </div>

          <!-- 筛选结果说明: 热门/最新没够线时退回全部, 说一句免得以为按钮没生效 -->
          <p v-if="feedNote" class="sq-note">{{ feedNote }}</p>

          <div class="sq-grid">
            <article v-for="p in filtered" :key="p.id" class="post">
              <div class="post-head">
                <button
                  class="p-avatar"
                  type="button"
                  :aria-label="`查看 ${p.name} 的资料`"
                  @click="openAuthor(p)"
                >
                  <img :src="avatarOf(p)" alt="" />
                </button>
                <div class="post-meta">
                  <b>{{ p.name }}</b>
                  <span>{{ p.time }}{{ p.from ? ' · 来自 ' + p.from : '' }}</span>
                </div>
                <button
                  class="p-more"
                  type="button"
                  aria-label="更多"
                  @click="menuId = menuId === p.id ? null : p.id"
                >
                  ⋯
                </button>
                <!-- 右上 ... 菜单: 修改 / 删除 / 举报 / 减少此类内容 / 问题反馈 -->
                <div v-if="menuId === p.id" class="p-menu">
                  <button v-if="p.authorId === auth.user?.id" type="button" @click="editPost(p)">✏️ 修改</button>
                  <!-- 删除要点两下: 第一下只是把这一项变成「确认删除」, 避免手滑(也不用浏览器原生 confirm,
                       有些内嵌浏览器会把它吞掉, 点了就像没反应) -->
                  <button
                    v-if="p.authorId === auth.user?.id"
                    type="button"
                    class="p-del"
                    :class="{ confirm: pendingDeleteId === p.id }"
                    @click="deletePost(p)"
                  >
                    {{ pendingDeleteId === p.id ? '❗ 确认删除' : '🗑️ 删除' }}
                  </button>
                  <button type="button" @click="report(p)">🚩 举报</button>
                  <button type="button" @click="reduce(p)">🙈 减少此类内容</button>
                  <button type="button" @click="goFeedback">💬 问题反馈</button>
                </div>
              </div>
              <div class="post-content-wrapper">
                <p class="post-text">{{ p.text }}</p>
                <button type="button" class="p-expand" @click="openPostDetail(p)">详情 →</button>
              </div>
              <img v-if="p.imgUrl" class="p-photo" :src="p.imgUrl" alt="" loading="lazy" decoding="async" />
              <div v-else-if="p.img" class="p-img" :class="p.img"></div>
              <div v-if="p.thumbs" class="p-thumbs">
                <span
                  v-for="n in p.thumbs"
                  :key="n"
                  class="p-thumb"
                  :class="thumbClass(p, n)"
                ></span>
              </div>
              <!-- 音频: 卡片内迷你播放器, 点整条播放/暂停 -->
              <button
                v-if="p.audioUrl"
                type="button"
                class="p-audio"
                :class="{ on: playingId === p.id }"
                @click="toggleAudio(p)"
              >
                <span class="pa-play">{{ playingId === p.id ? '⏸' : '▶' }}</span>
                <span class="pa-name">{{ p.audioName }}</span>
                <template v-if="playingId === p.id">
                  <span class="pa-bar"><i :style="{ width: progress + '%' }"></i></span>
                  <span class="pa-time">{{ timeText }}</span>
                </template>
              </button>
              <div class="p-tags">
                <button
                  v-for="(tg, i) in p.tags"
                  :key="tg"
                  type="button"
                  class="p-tag"
                  :class="'t' + (i % 4)"
                  @click="keyword = tg"
                >
                  # {{ tg }}
                </button>
              </div>
              <div class="post-foot">
                <button
                  class="p-like"
                  type="button"
                  :class="{ on: p.liked }"
                  @click="toggleLike(p)"
                >
                  ♥ {{ p.likes }}
                </button>
                <span class="p-comment">💬 {{ p.comments }}</span>
                <button class="p-enter" type="button" @click="openDetail(p)">进入这段记忆 →</button>
              </div>
            </article>
            <p v-if="!filtered.length" class="sq-empty">{{ emptyText }}</p>
            <!-- 分页加载: 还有更多帖子时手动加载下一页(避免一次拉全量) -->
            <button
              v-if="canLoadMore"
              class="sq-loadmore"
              type="button"
              :disabled="loadingMore"
              @click="loadMore"
            >
              {{ loadingMore ? '加载中…' : '加载更多' }}
            </button>
            <p v-else-if="posts.length && !keywordDeb.trim()" class="sq-loadmore-end">已经到底啦</p>
          </div>

          <!-- 大型活动横幅展示 -->
          <section v-if="majorActivities.length" class="sq-major-events">
            <div v-for="act in majorActivities" :key="'major-' + act.id" class="major-event-card" :style="act.cover ? { backgroundImage: `linear-gradient(135deg, rgba(255,200,160,0.85), rgba(255,180,200,0.85)), url(${act.cover})` } : {}" @click="openActDetail(act)">
              <div class="major-event-content">
                <div class="major-event-header">
                  <b>🎯 {{ act.title }}</b>
                  <span class="major-status" :class="'status-' + act.status">{{ actStatusText(act.status) }}</span>
                </div>
                <span class="major-event-desc">{{ act.content }}</span>
                <div v-if="act.start_time || act.end_time" class="major-event-time">
                  🕐 {{ act.start_time ? fmtActTime(act.start_time) : '?' }} ~ {{ act.end_time ? fmtActTime(act.end_time) : '不限' }}
                </div>
                <div class="major-event-bar"><i :style="{ width: majorPct(act) + '%' }"></i></div>
                <i class="major-event-num">{{ act.joined || 0 }} 人已加入</i>
              </div>
              <button v-if="act.status !== 2" type="button" :class="{ on: act.is_joined }" @click.stop="toggleJoinAct(act)">
                {{ act.is_joined ? '已加入 ✓' : '立即加入' }}
              </button>
              <span v-else class="act-ended-tag">已结束</span>
            </div>
          </section>
          <!-- 官方通知: 刻意和活动做成两种完全不同的形态 ——
               活动是「卡片 + 可进详情 + 可点赞评论」; 通知是「通栏公告条 + 原地展开 + 只读」。
               之前两者长得几乎一样, 用户分不出哪条能互动(2026-10-20 反馈)。 -->
          <section v-if="notices.length" class="sq-notices">
            <div class="notice-head">
              <b>📣 官方通知</b>
              <span class="notice-head-note">只读 · 不可评论</span>
            </div>
            <div v-for="n in notices" :key="n.id" class="notice-bar" :class="{ open: openNoticeId === n.id }">
              <button type="button" class="notice-bar-main" @click="toggleNotice(n)">
                <span class="notice-ico">📣</span>
                <span class="notice-title">{{ n.title }}</span>
                <span class="notice-time">{{ fmtNoticeTime(n.created_at) }}</span>
                <i class="notice-arrow">{{ openNoticeId === n.id ? '▴' : '▾' }}</i>
              </button>
              <div v-if="openNoticeId === n.id" class="notice-body">{{ n.content }}</div>
            </div>
          </section>

          <!-- 官方活动/公告 (仅普通活动) -->
          <section v-if="normalActivities.length" class="sq-activities">
            <div class="act-head"><b> 官方活动</b></div>
            <div v-for="act in normalActivities" :key="act.id" class="act-item" @click="openActDetail(act)">
              <div class="act-tag" :class="'act-type-' + act.type">{{ actTypeText(act.type) }}</div>
              <b class="act-title">{{ act.title }}</b>
              <p class="act-desc">{{ act.content }}</p>
              <div v-if="act.start_time || act.end_time" class="act-time">
                🕐 {{ act.start_time ? fmtActTime(act.start_time) : '?' }} ~ {{ act.end_time ? fmtActTime(act.end_time) : '不限' }}
                <span v-if="act.status !== undefined" class="act-status-badge" :class="'status-' + act.status">{{ actStatusText(act.status) }}</span>
              </div>
              <div v-if="act.media && act.media.length" class="act-media-preview">
                <img v-for="(m, i) in act.media.filter(m => m.type === 'image').slice(0, 3)" :key="i" :src="m.url" class="act-media-thumb" loading="lazy" decoding="async" />
                <span v-if="act.media.filter(m => m.type === 'image').length > 3" class="act-media-more">+{{ act.media.filter(m => m.type === 'image').length - 3 }}</span>
              </div>
              <div class="act-meta">
                <span class="act-join-count">👥 {{ act.joined || 0 }} 人已加入</span>
                <span class="act-comment-count">💬 {{ act.comments || 0 }}</span>
                <!-- 点赞挪到这里(原来只在详情弹窗里, 而且因为 .act-detail-join button
                     这条 CSS 把透明点赞按钮也染成了渐变胶囊, 和「退出活动」撞车)。
                     现在广场卡片上直接点赞, 详情弹窗只管评论。 -->
                <button
                  type="button"
                  class="act-card-like"
                  :class="{ liked: act.is_liked }"
                  :title="act.is_liked ? '取消赞' : '赞一下'"
                  @click.stop="toggleActLike(act)"
                >
                  {{ act.is_liked ? '❤️' : '🤍' }} {{ act.likes || 0 }}
                </button>
              </div>
            </div>
          </section>

          <!-- 时光胶囊: 随机开出一句被遗忘的小瞬间 -->
          <section class="sq-capsule">
            <span class="cap-icon">✉</span>
            <div class="cap-body">
              <b>拾光时光胶囊</b>
              <p :key="capKey" class="cap-line">{{ capsuleText }}</p>
            </div>
            <button type="button" @click="openCapsule">开一颗</button>
          </section>

          <footer class="sq-end">
            <span class="paw">🐾</span>
            <p>已经到广场的底部啦</p>
          </footer>
        </main>

        <aside class="sq-side">
          <section class="side-card">
            <div class="side-head">
              <b>推荐记忆空间</b>
              <button type="button" :disabled="shuffling" @click="shuffleSpaces">{{ shuffling ? '换一批…' : '⟳ 换一换' }}</button>
            </div>
            <div v-for="s in spaces.slice(0, 3)" :key="s.name" class="sp-row" @click="openUserSpace(s)">
              <span class="sp-thumb" :class="s.g"></span>
              <div class="sp-meta">
                <b>{{ s.name }}</b>
                <span>{{ s.sub }}</span>
              </div>
              <button type="button" @click.stop="openUserSpace(s)">进入</button>
            </div>
            <!-- 站里只有自己一个人时才会空: 给一句人话, 别留一块空白 -->
            <div v-if="!spaces.length" class="sp-empty">
              还没有别的拾光用户，等有人来串门吧 ✨
            </div>
          </section>

          <section class="side-card">
            <div class="side-head">
              <b>热门标签</b>
              <button type="button" @click="openAllTags">更多 ›</button>
            </div>
            <div class="tag-cloud">
              <button
                v-for="(tg, i) in HOT_TAGS"
                :key="tg"
                type="button"
                class="p-tag"
                :class="'t' + (i % 4)"
                @click="keyword = tg"
              >
                # {{ tg }}
              </button>
            </div>
          </section>

          <section class="side-card">
            <div class="side-head"><b>可能认识的人</b></div>
            <div v-for="f in friends" :key="f.name" class="fr-row" @click="openAuthor(f)">
              <span class="p-avatar sm">
                <img v-if="f.avatar" :src="f.avatar" alt="" />
                <template v-else>{{ f.name[0] }}</template>
              </span>
              <div class="sp-meta">
                <b>{{ f.name }}</b>
                <span>{{ f.sub }}</span>
              </div>
              <button type="button" :class="{ on: f.on }" @click.stop="toggleFollow(f)">
                {{ f.on ? '已关注' : '关注' }}
              </button>
            </div>
          </section>

          <section class="side-banner">
            <p>记录生活<br />也遇见同频的人</p>
            <span>♥</span>
          </section>
        </aside>
      </div>
    </div>

    <p v-if="tipText" class="sq-tip">{{ tipText }}</p>

    <!-- 菜单外点击关闭改由 document 的 pointerdown 处理。
         ★ 原来这里是一层 fixed 遮罩(z-index 20): 卡片因为 content-visibility 形成独立
         层叠上下文, 菜单的 z-index 30 只在该层叠上下文里有效, 结果遮罩盖在菜单上,
         点「修改/删除」只会把菜单关掉 —— 这就是「点了不管」的原因。 -->

    <!-- 作者个人信息子组件 -->
    <author-card
      v-if="authorOf"
      :author="authorOf"
      @close="authorOf = null"
      @follow="onAuthorFollow"
      @dm="onAuthorDm"
      @space="onAuthorSpace"
    />

    <!-- 发私信对话框 -->
    <div v-if="dmTo" class="sq-mask" @click.self="dmTo = null">
      <div class="dm-dialog">
        <div class="dm-head">
          <span class="dm-ava" :style="avaStyle(dmTo.name)">{{ (dmTo.name || '匿')[0] }}</span>
          <div class="dm-meta">
            <b>给 {{ dmTo.name }} 发私信</b>
            <span>对方将在私信列表中收到你的消息</span>
          </div>
          <button type="button" aria-label="关闭" @click="dmTo = null">×</button>
        </div>
        <textarea
          v-model="dmText"
          class="dm-input"
          placeholder="写一段温柔的私信..."
          rows="4"
        ></textarea>
        <div class="dm-foot">
          <button type="button" class="dm-cancel" @click="dmTo = null">取消</button>
          <button type="button" class="dm-send" :disabled="!dmText.trim()" @click="sendDm">
            发送
          </button>
        </div>
      </div>
    </div>

    <!-- 热门标签全量面板 -->
    <div v-if="showAllTags" class="sq-mask" @click.self="showAllTags = false">
      <div class="tags-panel">
        <div class="tags-head">
          <b>热门标签</b>
          <button type="button" aria-label="关闭" @click="showAllTags = false">×</button>
        </div>
        <div class="tags-grid">
          <button
            v-for="tg in HOT_TAGS"
            :key="tg"
            type="button"
            :class="{ on: keyword === tg }"
            @click="pickTag(tg)"
          >
            # {{ tg }}
          </button>
        </div>
      </div>
    </div>

    <!-- 回忆详情子组件: 完整内容 + 评论 -->
    <memory-detail
      v-if="detailPost"
      :post="detailPost"
      :comments="commentsOf(detailPost)"
      @close="detailPost = null"
      @add-comment="addComment"
    />

    <!-- 共享记忆的详情已并入上面这个统一详情: 它现在就是一条普通广场动态 -->

    <!-- 帖子详情弹窗（长文查看） -->
    <div v-if="postDetailModal" class="sq-mask" @click.self="postDetailModal = null">
      <div class="sq-dialog post-detail-modal" :style="pdDragStyle">
        <div class="sq-dialog-head" @pointerdown="onPdDragStart">
          <span>{{ postDetailModal.title || '记忆详情' }}</span>
          <button type="button" aria-label="关闭" @click="postDetailModal = null">×</button>
        </div>
        <!-- 详情: 从上到下 标题/内容/图片/视频/音频, 内容多时上下滑动 -->
        <div class="post-detail-scroll">
          <div class="post-detail-content">{{ postDetailModal.text }}</div>
          <template v-if="postDetailModal.imgList && postDetailModal.imgList.length">
            <div class="pd-divider"></div>
            <img
              v-for="(u, i) in postDetailModal.imgList"
              :key="i"
              class="detail-photo pd-media"
              :src="u"
              alt=""
              loading="lazy"
              decoding="async"
            />
          </template>
          <template v-if="postDetailModal.videoUrl">
            <div class="pd-divider"></div>
            <video class="pd-video" :src="postDetailModal.videoUrl" controls playsinline></video>
          </template>
          <template v-if="postDetailModal.audioUrl">
            <div class="pd-divider"></div>
            <audio class="pd-audio" :src="postDetailModal.audioUrl" controls></audio>
          </template>
        </div>
      </div>
    </div>

    <!-- 广场不再有「添加数据」入口: 写/改只在记忆库, 分享后自动进广场 -->

    <!-- 活动详情弹窗 -->
    <div v-if="actDetail" class="act-detail-overlay" @click.self="actDetail = null">
      <div class="act-detail-modal">
        <div class="act-detail-head">
          <div class="act-tag" :class="'act-type-' + actDetail.type">{{ actTypeText(actDetail.type) }}</div>
          <h3>{{ actDetail.title }}</h3>
          <button class="act-detail-close" type="button" @click="actDetail = null">&times;</button>
        </div>
        <div class="act-detail-body">
          <p class="act-detail-content">{{ actDetail.content }}</p>
          <!-- 活动时间 -->
          <div v-if="actDetail.start_time || actDetail.end_time" class="act-detail-time">
            🕐 {{ actDetail.start_time ? fmtActTime(actDetail.start_time) : '?' }} ~ {{ actDetail.end_time ? fmtActTime(actDetail.end_time) : '不限' }}
            <span v-if="actDetail.status !== undefined" class="act-status-badge" :class="'status-' + actDetail.status">{{ actStatusText(actDetail.status) }}</span>
          </div>
          <!-- 媒体展示 -->
          <div v-if="actDetail.media && actDetail.media.length" class="act-detail-media">
            <div v-for="(m, i) in actDetail.media" :key="i" class="act-media-item">
              <img v-if="m.type === 'image'" :src="m.url" class="act-media-img" loading="lazy" decoding="async" />
              <audio v-else-if="m.type === 'audio'" :src="m.url" controls class="act-media-audio"></audio>
              <video v-else-if="m.type === 'video'" :src="m.url" controls class="act-media-video"></video>
            </div>
          </div>
          <!-- 加入按钮 -->
          <div class="act-detail-join">
            <span class="act-join-info">{{ actDetail.joined || 0 }} 人已加入</span>
            <div class="act-detail-actions">
              <button
                v-if="actDetail.status !== 2"
                type="button"
                :class="{ joined: actDetail.isJoined }"
                @click.stop="toggleJoinAct(actDetail)"
              >
                {{ actDetail.isJoined ? '退出活动' : '立即加入' }}
              </button>
              <span v-else class="act-ended-tag">活动已结束</span>
            </div>
          </div>
          <!-- 评论区: 不需要先加入活动 —— 登录就能评论/发图(2026-10-20 用户要求) -->
          <div class="act-comments">
            <h4>评论 ({{ actDetail.comments?.length || 0 }})</h4>
            <div v-if="auth.isLogin" class="act-comment-input">
              <textarea v-model="newComment" placeholder="写下你的评论..." rows="2"></textarea>
              <div class="act-comment-actions">
                <label class="act-comment-upload">
                  <input type="file" accept="image/*" @change="onCommentImage" />
                  <span>📷 图片</span>
                </label>
                <button type="button" @click="submitComment" :disabled="!newComment.trim() && !commentImage">发布</button>
              </div>
              <img v-if="commentImage" :src="commentImage" class="comment-preview" />
            </div>
            <!-- 没登录时给一句人话, 别让输入框凭空消失 -->
            <p v-else class="act-comment-login">登录后即可评论</p>
            <div v-for="c in actDetail.comments" :key="c.id" class="act-comment-item">
              <div class="comment-head">
                <span class="comment-author">{{ c.author }}</span>
                <span class="comment-time">{{ fmtCommentTime(c.created_at) }}</span>
              </div>
              <p class="comment-text">{{ c.content }}</p>
              <img v-if="c.image" :src="c.image" class="comment-image" loading="lazy" decoding="async" />
            </div>
            <div v-if="!actDetail.comments?.length" class="act-no-comments">暂无评论</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 拾光广场: 天空岛横幅 + 社区信息流(标签页/搜索/点赞) + 侧栏推荐
// ★ 2026-10-27 起广场不再提供「添加数据」: 写作只在记忆库, 分享到广场后自动出现在信息流。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePersistentState } from '@/composables/usePersistentState'
import { useDebouncedRef } from '@/composables/useRateLimit'
import { cloudApi } from '@/api/cloud'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { useMemoriesStore } from '@/stores/memories'
import AuthorCard from './authorCard.vue'
import MemoryDetail from './memoryDetail.vue'
// 统一头像来源：作者传过头像就用他传的，没传过用默认橘猫（不再用"首字 + 渐变块"）
import { avatarOf } from '@/data/avatar'

const router = useRouter()
const auth = useCloudAuthStore()
// 删除广场动态时同步记忆库里的「已分享」状态, 两处显示才一致
const memStore = useMemoriesStore()

// 相对时间: 将服务端毫秒时间戳转为“X 分钟前”等友好文案
function relTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

// 无图帖子按 id 回退到一组渐变占位, 保留卡片视觉层次
const GRADS = ['g-sunset', 'g-book', 'g-flower', 'g-film', 'g-rain']

// 将服务端帖子行映射为模板需要的视图模型
function mapPost(r) {
  const images = (r.images || '').split(',').filter(Boolean)
  const author = r.author || {}
  return {
    id: r.id,
    authorId: r.user_id,
    // 关联的记忆库条目(0 = 老数据): 编辑时会先改记忆, 再同步这条动态
    memoryId: r.memory_id || 0,
    spaceId: r.space_id || 0,
    name: author.nickname || author.username || '匿名用户',
    avatar: author.avatar || '',
    time: relTime(r.created_at),
    from: '',
    createdAt: r.created_at,
    text: r.content || '',
    tags: (r.tags || '').split(',').filter(Boolean),
    likes: r.likes_count || 0,
    comments: r.comments_count || 0,
    liked: !!r.liked_by_me,
    favorited: !!r.favorited_by_me,
    imgUrl: images[0] || null,
    img: images[0] ? null : GRADS[r.id % GRADS.length],
    // 详情弹窗所需: 全部图片 / 用户上传的视频 / 音频
    imgList: images,
    videoUrl: r.video || '',
    audioUrl: r.audio || '',
    audioName: r.audio ? '音频' : '',
    thumbs: 0,
    // 服务端随帖子一起返回关注状态, 无需再按作者逐个请求
    followed: !!r.followed_by_me,
    expanded: false,
  }
}

// 搜索关键词: 输入即时响应, 帖子过滤经防抖
const { source: keyword, debounced: keywordDeb } = useDebouncedRef('', 250)
// 顶部分类: 三个筛选都交给服务端（见 server 的 square/post/list）——
// 客户端排序只会「这一页看着变了, 下一批又乱」。
const TABS = [
  { key: 'all', label: '全部' },
  { key: 'follow', label: '关注' },
  { key: 'hot', label: '热门' },
  { key: 'new', label: '最新' },
]
const tab = ref('all')
// 热门/最新没内容时服务端退回全部, 这里放一句说明, 免得以为按钮又坏了
const feedNote = ref('')
const tipText = ref('')
let tipTimer = null

const ACT_TYPE = { 1: '公告', 2: '活动', 3: '更新' }
const ACT_STATUS = { 0: '未开始', 1: '进行中', 2: '已结束' }
function actTypeText(t) { return ACT_TYPE[t] || '其他' }
function actStatusText(s) { return ACT_STATUS[s] ?? '' }
// Unix 毫秒 -> "MM-DD HH:mm"
function fmtActTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const HOT_TAGS = [
  '大学生活',
  '日常',
  '阅读',
  '风景',
  '自拍',
  '音乐',
  '美食',
  '旅行',
  '成长',
  '雨天',
]


// 时光胶囊: 随机开出一句被遗忘的小瞬间
const CAPSULES = [
  '一年前的今天: 图书馆窗边, 阳光刚好落在第 74 页。',
  '两年前的今天: 和室友抢最后一块西瓜, 输了但笑了很久。',
  '一年前的今天: 晚课路上第一次闻到桂花香。',
  '三年前的今天: 军训结束那晚的风, 比空调还温柔。',
  '两年前的今天: 把没说完的话写进了便利贴, 夹在书里。',
]
const capsuleText = ref('每一颗胶囊里, 都藏着一个被遗忘的小瞬间。')
const capKey = ref(0)

function openCapsule() {
  capKey.value += 1
  capsuleText.value = CAPSULES[Math.floor(Math.random() * CAPSULES.length)]
}

// 可能认识的人(由后端随机推荐填充)
const friends = ref([])

async function toggleFollow(f) {
  if (!auth.isLogin) {
    auth.openAuth()
    tip('登录后才能关注哦')
    return
  }
  const targetId = f.userId || f.id
  if (!targetId) {
    f.on = !f.on
    tip(f.on ? `已关注 ${f.name}` : `已取消关注 ${f.name}`)
    return
  }
  try {
    const { following } = await cloudApi.toggleFollow({ following_id: targetId })
    f.on = following
    // 同步信息流里该作者的关注状态, 「关注」标签页才能实时生效
    posts.value.forEach((p) => {
      if (p.authorId === targetId) p.followed = following
    })
    tip(following ? `已关注 ${f.name}` : `已取消关注 ${f.name}`)
  } catch (e) {
    tip(e.message || '关注失败')
  }
}

const posts = ref([])
const activities = ref([])
// 官方通知(管理员在「通知管理」里发的那种): 与活动分开存、分开渲染
const notices = ref([])
const openNoticeId = ref(null)

function toggleNotice(n) {
  openNoticeId.value = openNoticeId.value === n.id ? null : n.id
}
function fmtNoticeTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 大型活动 / 普通活动分离
const majorActivities = computed(() => activities.value.filter(a => a.is_major))
const normalActivities = computed(() => activities.value.filter(a => !a.is_major))
function majorPct(act) { return Math.min(100, Math.round(((act.joined || 0) / 500) * 100)) }

// 活动详情
const actDetail = ref(null)
const newComment = ref('')
const commentImage = ref('')

async function openActDetail(act) {
  // is_joined / is_liked 列表接口已经给了, 弹窗直接沿用, 不再额外问一次
  actDetail.value = { ...act, comments: [], isJoined: !!act.is_joined }
  // 只加载评论; 加入/点赞状态已在列表里
  try {
    const comments = await cloudApi.listActivityComments({ activity_id: act.id }).catch(() => [])
    if (actDetail.value && actDetail.value.id === act.id) actDetail.value.comments = comments
  } catch {
    // 加载失败不影响弹窗显示
  }
}

function fmtCommentTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function onCommentImage(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    commentImage.value = ev.target.result
  }
  reader.readAsDataURL(file)
}

async function submitComment() {
  if (!actDetail.value) return
  if (!auth.isLogin) { tip('请先登录'); return }
  if (!newComment.value.trim() && !commentImage.value) return
  try {
    await cloudApi.createActivityComment({
      activity_id: actDetail.value.id,
      content: newComment.value,
      image: commentImage.value || '',
    })
    // 发送成功先把新评论插到列表最前面, 立即可见; 再在后台静默刷新一次对齐服务端
    const optimistic = {
      id: 'tmp-' + Date.now(),
      content: newComment.value,
      image: commentImage.value || '',
      created_at: Date.now(),
      author: { nickname: auth.user?.nickname || auth.user?.username || '我' },
    }
    actDetail.value.comments = [optimistic, ...(actDetail.value.comments || [])]
    const act = activities.value.find((a) => a.id === actDetail.value.id)
    // 卡片上 comments 是**个数**(服务端就是这么给的), 别再塞数组进去
    if (act) act.comments = actDetail.value.comments.length
    newComment.value = ''
    commentImage.value = ''
    const actId = actDetail.value.id
    cloudApi
      .listActivityComments({ activity_id: actId })
      .then((comments) => {
        if (!actDetail.value || actDetail.value.id !== actId) return
        actDetail.value.comments = comments
        if (act) act.comments = comments.length
      })
      .catch(() => {})
  } catch {
    tip('评论失败，请重试')
  }
}

// 加入/退出活动(横幅、卡片、详情弹窗共用)
// ★ 同样统一用服务端的 is_joined —— 原来读写 isJoined, 而列表给的是 is_joined,
//   导致进广场时「立即加入」按钮永远显示成未加入的状态。
async function toggleJoinAct(act) {
  if (!auth.isLogin) {
    tip('请先登录')
    return
  }
  try {
    const res = act.is_joined
      ? await cloudApi.unjoinActivity({ activity_id: act.id })
      : await cloudApi.joinActivity({ activity_id: act.id })
    // ★ 详情弹窗和广场卡片是两份对象: 以前只改了被点的那一份, 关掉弹窗后卡片上的
    //   「加入人数 / 立即加入」还是旧值(2026-10-21 用户反馈「加入后没跟统计同步」)。
    //   这里按 id 把两处一起改, 保证关掉弹窗也看到最新的。
    applyJoinState(act.id, res.isJoined, res.joined)
    tip(res.isJoined ? `已加入「${act.title}」` : `已退出「${act.title}」`)
  } catch {
    tip('操作失败，请重试')
  }
}

// 把加入状态同步到广场列表与详情弹窗(两处对象不同, 只改一处会出现数字不一致)
function applyJoinState(activityId, isJoined, joined) {
  const card = activities.value.find((a) => a.id === activityId)
  if (card) {
    card.is_joined = isJoined
    card.joined = joined
  }
  if (actDetail.value && actDetail.value.id === activityId) {
    actDetail.value.isJoined = isJoined
    actDetail.value.joined = joined
  }
}

// 活动点赞(广场卡片与详情弹窗共用)
// ★ 字段名统一用服务端下发的 is_liked —— 原来这里读写的是 isLiked,
//   而卡片绑定的是 is_liked, 于是点完赞卡片毫无反应、也永远取消不掉。
async function toggleActLike(act) {
  if (!auth.isLogin) {
    tip('请先登录')
    return
  }
  try {
    const res = act.is_liked
      ? await cloudApi.unlikeActivity({ activity_id: act.id })
      : await cloudApi.likeActivity({ activity_id: act.id })
    act.is_liked = res.isLiked
    act.likes = res.liked
    // 同步到详情弹窗
    if (actDetail.value && actDetail.value.id === act.id) {
      actDetail.value.is_liked = res.isLiked
      actDetail.value.likes = res.liked
    }
  } catch {
    tip('操作失败，请重试')
  }
}

// 广场信息流分页状态
const PAGE_SIZE = 20
const feedPage = ref(1)
const feedTotal = ref(0)
const loadingMore = ref(false)
const canLoadMore = computed(() => posts.value.length < feedTotal.value)

// 拉取广场信息流(第 1 页)。
// ★ 2026-10-27：关注/热门/最新 三个筛选改成**服务端**做(见 square/post/list 的 filter),
//   前端只带参数重新拉第一页。以前是本地排序: 热门按点赞数排、最新按 id 排,
//   而卡片本来就是按时间倒序来的 —— 于是点下去画面一模一样, 用户反复反馈「点了不管」。
async function loadFeed() {
  const filter = tab.value
  try {
    const [postData, actData, noticeData] = await Promise.all([
      cloudApi.listPosts({ page: 1, pageSize: PAGE_SIZE, filter }),
      cloudApi.listActivities().catch(() => []),
      auth.isLogin ? cloudApi.listNotifications().catch(() => []) : Promise.resolve([]),
    ])
    // 快速连点标签时, 慢的那个请求可能后回来: 过滤条件已经变了就丢掉这批结果
    if (filter !== tab.value) return
    posts.value = (postData.list || []).map(mapPost)
    feedPage.value = postData.page || 1
    feedTotal.value = postData.total || 0
    feedNote.value = postData.fallback
      ? filter === 'hot'
        ? '还没有够热门的记忆（3 条评论或 5 个赞会上热门），先按互动多少排：'
        : '最近 3 天还没有新记忆，下面是更早的：'
      : ''
    // likes / is_liked / is_joined / comments / joined 都由服务端算好直接给, 前端不再自己拼
    activities.value = (actData || []).map((a) => ({ ...a, likes: a.likes || 0 }))
    notices.value = noticeData || []
    openNoticeId.value = null
  } catch (e) {
    tip(e.message || '广场加载失败, 请检查后端服务')
  }
}

// 横幅上那句「分享一段时光」: 送到记忆库并直接打开写日记的弹窗。
// 广场不提供添加数据(用户要求只有一个写作入口), 所以这里只是跳转。
function goWrite() {
  router.push({ name: 'memory', query: { compose: '1' } })
}

// 切分类: 重新拉第一页(不叠加上一类的数据)
function pickTab(key) {
  if (tab.value === key) return
  tab.value = key
  feedPage.value = 1
  posts.value = []
  loadFeed()
}

// 空状态: 每个筛选说自己的话, 别都用一句「没有匹配的分享」
const emptyText = computed(() => {
  const k = keywordDeb.value.trim()
  if (k) return `没有搜到和「${k}」有关的记忆`
  if (tab.value === 'follow') {
    return auth.isLogin ? '你关注的人还没有分享记忆，去旁边「可能认识的人」里关注几个吧' : '登录后能看到你关注对象的记忆'
  }
  if (tab.value === 'hot') return '还没有够热门的记忆（3 条评论或 5 个赞会上热门）'
  if (tab.value === 'new') return '最近 3 天还没有新记忆'
  return '广场里还没有匹配的分享，去记忆库把一段回忆分享进来吧'
})

// 加载下一页并追加, 避免一次性拉取全量帖子
async function loadMore() {
  if (loadingMore.value || !canLoadMore.value) return
  loadingMore.value = true
  const filter = tab.value
  try {
    const next = feedPage.value + 1
    const data = await cloudApi.listPosts({ page: next, pageSize: PAGE_SIZE, filter })
    const rows = (data.list || []).map(mapPost)
    const seen = new Set(posts.value.map((p) => p.id))
    posts.value.push(...rows.filter((p) => !seen.has(p.id)))
    feedPage.value = data.page || next
    feedTotal.value = data.total || 0
  } catch (e) {
    tip(e.message || '加载更多失败')
  } finally {
    loadingMore.value = false
  }
}

onMounted(loadFeed)

// 切回标签页/窗口时刷新一次: 用户在别处逛了一圈回来, 不该看到旧的点赞/评论/关注数。
// 加 5 秒节流, 避免快速来回切换把接口打爆。
let lastHiddenAt = 0
function onSquareVisible() {
  if (document.visibilityState !== 'visible') {
    lastHiddenAt = Date.now()
    return
  }
  if (Date.now() - lastHiddenAt < 5000) return
  loadFeed()
  loadSide()
}
onMounted(() => {
  document.addEventListener('visibilitychange', onSquareVisible)
  document.addEventListener('pointerdown', onDocPointerDown)
})
onUnmounted(() => {
  document.removeEventListener('visibilitychange', onSquareVisible)
  document.removeEventListener('pointerdown', onDocPointerDown)
})

const spaces = ref([])
const SPACE_GRADS = ['g-sunset', 'g-book', 'g-flower', 'g-film', 'g-rain']
// 换一换时置 true, 防止连点把接口打爆
const shuffling = ref(false)

// 侧栏: 推荐记忆空间(点赞前三) + 可能认识的人(随机)
// ★ 关注状态一律以服务端下发的 following 为准 —— 原来这里写死 on:false,
//   用户点过关注一刷新就变回「关注」(2026-10-20 用户反馈)。
function applySide(sp, fr) {
  spaces.value = (sp || []).map((s, i) => ({ ...s, g: SPACE_GRADS[i % SPACE_GRADS.length] }))
  friends.value = (fr || []).map((f) => ({ ...f, userId: f.id, on: !!f.following }))
}

async function loadSide() {
  try {
    const [sp, fr] = await Promise.all([cloudApi.recommendSpaces().catch(() => []), cloudApi.randomUsers().catch(() => [])])
    applySide(sp, fr)
  } catch {
    /* 侧栏加载失败不影响主流程 */
  }
}

// 换一换: 重新问服务端要一批(ORDER BY RANDOM), 不是本地数组轮转 ——
// 本地轮转翻来覆去还是同一批人, 用户看到的"随机"是假的。
async function shuffleSpaces() {
  if (shuffling.value) return
  shuffling.value = true
  try {
    const [sp, fr] = await Promise.all([cloudApi.recommendSpaces().catch(() => []), cloudApi.randomUsers().catch(() => [])])
    applySide(sp, fr)
  } catch {
    tip('换一批失败了, 稍后再试')
  } finally {
    shuffling.value = false
  }
}

onMounted(loadSide)

function thumbClass(p, n) {
  return [p.img, 'g-book', 'g-film'][(n - 1) % 3]
}

// 多行长文折叠: 避免单张卡片撑高整行网格, 挤压同排其他卡片
function isLong(p) {
  return p.text.split('\n').length > 6 || p.text.length > 80
}

async function toggleLike(p) {
  if (!auth.isLogin) {
    auth.openAuth()
    tip('登录后才能点赞哦')
    return
  }
  try {
    const { liked, likes_count } = await cloudApi.toggleLike({ post_id: p.id })
    p.liked = liked
    p.likes = likes_count
  } catch (e) {
    tip(e.message || '操作失败')
  }
}

// ---- 右上 ... 菜单: 修改 / 删除 / 举报 / 减少此类内容 / 问题反馈 ----
const menuId = ref(null)
// 删除要点两下: 第一次点只是进入「确认删除」状态, 5 秒没再点或菜单关掉就复原
const pendingDeleteId = ref(null)
let pendingDeleteTimer = 0
const hiddenIds = usePersistentState('square-hidden', [])

// 点菜单外面收起菜单。
// ★ 以前是一层 fixed 遮罩(见模板注释): 遮罩盖在菜单上, 点了等于「关菜单」,
//   用户看到的就是「修改/删除点了不管」。改成监听 document 后不再存在层叠问题。
function onDocPointerDown(e) {
  if (menuId.value === null) return
  if (e.target.closest('.p-menu') || e.target.closest('.p-more')) return
  menuId.value = null
  pendingDeleteId.value = null
}

async function report(p) {
  menuId.value = null
  if (!auth.isLogin) {
    auth.openAuth()
    tip('登录后才能举报')
    return
  }
  try {
    await cloudApi.createReport({ target_type: 1, target_id: p.id, reason: '广场内容举报' })
    tip(`已举报 ${p.name} 的这条分享, 我们会尽快处理`)
  } catch (e) {
    tip(e.message || '举报失败')
  }
}

function reduce(p) {
  menuId.value = null
  if (!hiddenIds.value.includes(p.id)) hiddenIds.value.push(p.id)
  tip('好的, 之后会减少此类内容的推荐')
}

async function deletePost(p) {
  // 第一下只上膛, 第二下才真的删
  if (pendingDeleteId.value !== p.id) {
    pendingDeleteId.value = p.id
    clearTimeout(pendingDeleteTimer)
    pendingDeleteTimer = setTimeout(() => {
      pendingDeleteId.value = null
    }, 5000)
    return
  }
  clearTimeout(pendingDeleteTimer)
  pendingDeleteId.value = null
  menuId.value = null
  try {
    await cloudApi.removePost({ id: p.id })
    posts.value = posts.value.filter((post) => post.id !== p.id)
    feedTotal.value = Math.max(0, feedTotal.value - 1)
    // 关联的记忆不会被删掉(那是记忆库里的东西), 只是不再公开;
    // 本地列表同步一下「已分享」状态, 免得记忆库里还挂着分享标记
    if (p.memoryId) {
      const idx = memStore.entries.findIndex((e) => e.id === p.memoryId)
      if (idx >= 0) {
        memStore.entries[idx].is_public = false
        memStore.entries[idx].shared_at = 0
      }
    }
    tip('已删除这条广场动态（记忆库里那条还留着）')
  } catch (e) {
    tip(e.message || '删除失败')
  }
}

// 修改: 内容只有一份, 在记忆库里。所以「修改」直接带着这条记忆跳去记忆库的编辑弹窗,
// 不在广场里再养一套写作表单（用户要求: 只保留记忆库一个写作入口）。
function editPost(p) {
  menuId.value = null
  if (!p.memoryId) {
    tip('这条动态是旧版本发的，请到记忆库修改对应记忆')
    return
  }
  router.push({ name: 'memory', query: { edit: String(p.memoryId) } })
}

// ---- 作者信息子组件 ----
const AUTHORS = {
  林间: {
    bio: '记录晚霞与日常碎片, 相信柔软的力量',
    joined: '2023 年秋加入拾光',
    shares: 86,
    following: 132,
    followers: 1024,
    tags: ['晚霞', '日常', '大学生活'],
  },
  小禾: {
    bio: '在读一点书, 在走一点路',
    joined: '2024 年春加入拾光',
    shares: 41,
    following: 87,
    followers: 356,
    tags: ['书籍', '阅读', '自我成长'],
  },
  momo: {
    bio: '花开了就要去看, 香草味的是秋天',
    joined: '2024 年秋加入拾光',
    shares: 23,
    following: 45,
    followers: 189,
    tags: ['花卉', '校园', '秋天'],
  },
  阿哲: {
    bio: '胶片机爱好者, 巷子里的光影收集者',
    joined: '2023 年冬加入拾光',
    shares: 64,
    following: 98,
    followers: 721,
    tags: ['胶片', '风景', '日常'],
  },
  小满不满: {
    bio: '录声音的人, 山里雨里都在',
    joined: '2025 年夏加入拾光',
    shares: 18,
    following: 33,
    followers: 97,
    tags: ['音乐', '雨天', '旅行'],
  },
  小拾光: {
    bio: '我的数字记忆空间, 把散落的日子收好',
    joined: '拾光原住民',
    shares: 6,
    following: 12,
    followers: 28,
    tags: ['日常', '我的分享'],
  },
}

const authorOf = ref(null)
const dmTo = ref(null)
const dmText = ref('')
const showAllTags = ref(false)

// 进入他人记忆空间: 跳转到记忆库页并以只读模式展示该用户公开内容
function openUserSpace(u) {
  // 三处来源字段不一致: 推荐空间用 user_id, 「可能认识的人」用 userId, 共享记忆用 ownerId
  const userId = u.userId || u.user_id || u.ownerId || u.authorId
  if (!userId) {
    tip('无法获取用户信息')
    return
  }
  // 自己的空间不必进「只读浏览自己」那种别扭状态, 直接回自己的记忆库
  if (auth.user?.id && Number(userId) === auth.user.id) {
    router.push({ name: 'memory' })
    return
  }
  router.push({ name: 'memory', query: { uid: userId, uname: u.name || '' } })
}

function openAllTags() {
  showAllTags.value = true
}

function pickTag(tg) {
  keyword.value = tg
  showAllTags.value = false
}

async function openAuthor(p) {
  const userId = p.authorId || p.id || p.userId
  // 尝试从后端获取真实用户统计
  let stats = { likes: 0, publicMemories: 0, following: 0, bio: '这位朋友还没写简介', joined: '新加入拾光', tags: p.tags || [] }
  if (userId) {
    try {
      const userStats = await cloudApi.getUserStats({ user_id: userId })
      if (userStats) stats = { ...stats, ...userStats }
    } catch {
      // 后端获取失败，使用默认值
    }
  }
  // ★ 关注状态以服务端为准(2026-10-20 用户反馈"刷新就丢"):
  //   调用方来源不一样 —— 侧栏「可能认识的人」给的是 following, 信息流帖子给的是 followed,
  //   哪一边漏了都会显示成「+ 关注」。所以这里先尽量用调用方给的, 再拿 checkFollow 兜底确认。
  let followed = !!(p.followed ?? p.following)
  if (userId && auth.isLogin) {
    try {
      const r = await cloudApi.checkFollow({ following_id: userId })
      followed = !!r.following
    } catch {
      /* 确认失败就沿用调用方给的值 */
    }
  }
  authorOf.value = { name: p.name, userId, ...stats, avatar: p.avatar || stats.avatar || '', followed }
}

async function onAuthorFollow({ name, on }) {
  const targetId = authorOf.value?.userId
  // 未登录或无作者 id: 仅本地回显(演示)
  if (!auth.isLogin || !targetId) {
    posts.value.forEach((x) => {
      if (x.name === name) x.followed = on
    })
    tip(on ? `已关注 ${name}` : `已取消关注 ${name}`)
    return
  }
  try {
    const { following } = await cloudApi.toggleFollow({ following_id: targetId })
    posts.value.forEach((x) => {
      if (x.authorId === targetId) x.followed = following
    })
    tip(following ? `已关注 ${name}` : `已取消关注 ${name}`)
  } catch (e) {
    tip(e.message || '关注失败')
  }
}

function onAuthorDm(author) {
  authorOf.value = null
  dmTo.value = author
  dmText.value = ''
}

// 作者卡片 -> 进入其记忆空间
function onAuthorSpace(author) {
  const a = authorOf.value
  authorOf.value = null
  openUserSpace({ userId: a?.userId || author.userId, name: author.name, sub: author.bio || '' })
}

async function sendDm() {
  const text = dmText.value.trim()
  if (!text || !dmTo.value) return
  if (!auth.isLogin) {
    auth.openAuth()
    tip('登录后才能发私信')
    return
  }
  const receiverId = dmTo.value.userId || dmTo.value.id
  if (!receiverId) {
    tip('无法获取用户ID')
    return
  }
  try {
    await cloudApi.sendPm({ receiver_id: receiverId, content: text })
    tip(`已给 ${dmTo.value.name} 发送私信`)
    dmTo.value = null
    dmText.value = ''
  } catch (e) {
    tip(e.message || '发送失败')
  }
}

// 昵称首字哈希出色相, 与广场头像同一套配色逻辑
function avaStyle(name) {
  const n = name || '匿'
  const hue = (n.charCodeAt(0) * 7) % 360
  return {
    background: `linear-gradient(135deg, hsl(${hue} 80% 78%), hsl(${(hue + 40) % 360} 70% 66%))`,
  }
}

// ---- 回忆详情子组件 + 评论 ----
const detailPost = ref(null)
const commentsMap = ref({})

function commentsOf(p) {
  return (p && commentsMap.value[p.id]) || []
}

// 打开详情: 从服务端拉取该帖评论(公开接口, 未登录也可看)
async function openDetail(p) {
  detailPost.value = p
  try {
    const rows = await cloudApi.listComments({ post_id: p.id })
    commentsMap.value[p.id] = (rows || []).map((r) => ({
        name: r.author?.nickname || r.author?.username || r.author_nickname || '匿名用户',
        avatar: r.author?.avatar || r.author_avatar || '',
        text: r.content,
        time: relTime(r.created_at),
      }))
  } catch (e) {
    console.error('加载评论失败:', e.message)
  }
}

// 打开帖子详情弹窗: 内容首行是标题, 其余是正文(与发布时 title\ntext 的拼接一致)
const postDetailModal = ref(null)
// 详情弹窗拖动: 按住标题栏平移(点关闭按钮不触发), 每次打开回到原位
const pdDrag = ref({ x: 0, y: 0 })
let pdDragState = null
const pdDragStyle = computed(() =>
  pdDrag.value.x || pdDrag.value.y
    ? { transform: `translate(${pdDrag.value.x}px, ${pdDrag.value.y}px)` }
    : {}
)
function onPdDragStart(e) {
  if (e.target.closest('button')) return
  pdDragState = { sx: e.clientX, sy: e.clientY, ox: pdDrag.value.x, oy: pdDrag.value.y }
  window.addEventListener('pointermove', onPdDragMove)
  window.addEventListener('pointerup', onPdDragEnd)
}
function onPdDragMove(e) {
  if (!pdDragState) return
  pdDrag.value = {
    x: pdDragState.ox + (e.clientX - pdDragState.sx),
    y: pdDragState.oy + (e.clientY - pdDragState.sy),
  }
}
function onPdDragEnd() {
  pdDragState = null
  window.removeEventListener('pointermove', onPdDragMove)
  window.removeEventListener('pointerup', onPdDragEnd)
}
function openPostDetail(p) {
  const lines = (p.text || '').split('\n')
  postDetailModal.value = {
    ...p,
    title: lines[0] || '记忆详情',
    text: lines.slice(1).join('\n'),
  }
  pdDrag.value = { x: 0, y: 0 }
}

async function addComment(text) {
  const p = detailPost.value
  if (!p) return
  if (!auth.isLogin) {
    auth.openAuth()
    tip('登录后才能评论哦')
    return
  }
  try {
    const c = await cloudApi.createComment({ post_id: p.id, content: text })
    const list = commentsMap.value[p.id] || (commentsMap.value[p.id] = [])
    list.push({
      name: (c.author && (c.author.nickname || c.author.username)) || auth.user?.nickname || '我',
      text: c.content,
      time: relTime(c.created_at),
    })
    p.comments += 1
  } catch (e) {
    tip(e.message || '评论失败')
  }
}

// 卡片内音频: 一次只放一个, 换卡片要先把上一首停掉
const playingId = ref(null)
const progress = ref(0)
const timeText = ref('')
const state = ref('idle')
let audioEl = null

function fmtTime(s) {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${m}:${ss < 10 ? '0' : ''}${ss}`
}

function stopAudio() {
  if (audioEl) audioEl.pause()
  playingId.value = null
  progress.value = 0
  timeText.value = ''
  state.value = 'idle'
}

function toggleAudio(p) {
  if (playingId.value === p.id) {
    stopAudio()
    return
  }
  state.value = 'loading'
  if (audioEl) audioEl.pause()
  audioEl = new Audio(p.audioUrl)
  audioEl.preload = 'auto'
  audioEl.volume = 1
  audioEl.muted = false
  audioEl.ontimeupdate = () => {
    progress.value = audioEl.duration ? (audioEl.currentTime / audioEl.duration) * 100 : 0
    timeText.value = `${fmtTime(audioEl.currentTime)} / ${fmtTime(audioEl.duration)}`
  }
  audioEl.onplaying = () => {
    state.value = 'playing'
  }
  audioEl.onwaiting = () => {
    state.value = 'loading'
  }
  audioEl.onended = stopAudio
  // 解码/播放失败: 静默复位, 不在卡片上显示失败信息
  audioEl.onerror = stopAudio
  audioEl.play().catch(stopAudio)
  playingId.value = p.id
}

// DEV: 便于浏览器实测播放状态
if (import.meta.env.DEV) {
  window.__sq = { audio: () => audioEl, playingId, progress, state }
}

function tip(text) {
  tipText.value = text
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => {
    tipText.value = ''
  }, 2200)
}

function goFeedback() {
  menuId.value = null
  router.push({ name: 'feedback' })
}

// 只做「搜索关键词 + 减少此类内容」的本地过滤。
// 关注/热门/最新 已经由服务端筛好(见 loadFeed), 这里再排一遍只会自相矛盾。
const filtered = computed(() => {
  let list = posts.value.filter((p) => !hiddenIds.value.includes(p.id))
  const k = keywordDeb.value.trim()
  if (k) {
    list = list.filter(
      (p) => p.text.includes(k) || p.name.includes(k) || p.tags.some((t) => t.includes(k)),
    )
  }
  return list
})

</script>

<style scoped>
.square,
.square * {
  box-sizing: border-box;
}

.square {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #f5f6f8;
}

/* 横幅: 取背景图顶部天空岛一段, 宽度撑满等比裁切 */
/* 手机专用元素：桌面一律不渲染（烘焙图上已经有标题和搜索胶囊） */
.sq-h-m,
.sq-m-bar {
  display: none;
}

.sq-hero {
  position: relative;
  flex: none;
  width: 100%;
  aspect-ratio: 1446 / 272;
  max-height: min(42%, 272px);
  min-height: 110px;
  background: url('../assets/opt/squareBackground.webp') top center / 100% auto no-repeat;
  overflow: hidden;
}

/* 横幅装饰层: 不动烘焙图本体, 避免搜索/发布热区错位 */
.sq-fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.fx-cloud {
  position: absolute;
  left: -40%;
  height: 18%;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0),
    rgba(255, 255, 255, 0.5),
    rgba(255, 255, 255, 0)
  );
  filter: blur(6px);
  animation: cloud-drift linear infinite;
}

.fx-cloud.c1 {
  top: 12%;
  width: 34%;
  animation-duration: 34s;
}

.fx-cloud.c2 {
  top: 34%;
  width: 26%;
  opacity: 0.7;
  animation-duration: 46s;
  animation-delay: -18s;
}

@keyframes cloud-drift {
  from {
    left: -40%;
  }

  to {
    left: 110%;
  }
}

.fx-spark {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 8px 2px rgba(255, 244, 214, 0.8);
  opacity: 0;
  animation: spark-twinkle 4.5s ease-in-out infinite;
}

@keyframes spark-twinkle {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.6);
  }

  50% {
    opacity: 0.9;
    transform: scale(1.15);
  }
}

.fx-sweep {
  position: absolute;
  top: -20%;
  bottom: -20%;
  left: -25%;
  width: 18%;
  background: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0),
    rgba(255, 255, 255, 0.28),
    rgba(255, 255, 255, 0)
  );
  transform: skewX(-14deg);
  animation: sweep 9s ease-in-out infinite;
}

@keyframes sweep {
  0%,
  55% {
    left: -25%;
  }

  85%,
  100% {
    left: 115%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fx-cloud,
  .fx-spark,
  .fx-sweep {
    animation: none;
  }
}

/* 烘焙搜索胶囊上的透明输入层 (相对横幅) */
.sq-search {
  position: absolute;
  left: 67.8%;
  top: 12%;
  width: 21.8%;
  height: 11.6%;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14.5px;
  color: #6b5d52;
}

.sq-search::placeholder {
  color: #b9afa4;
}

/* 横幅右上角「分享一段时光」的透明热区: 只负责把用户送到记忆库的写作入口,
   广场本身没有发布表单了(热区位置对应背景图上那两行手写字)。 */
.sq-hero-write {
  position: absolute;
  left: 79%;
  top: 44%;
  width: 17%;
  height: 20%;
  border: none;
  background: transparent;
  cursor: pointer;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* 内容区: 多出的内容在这里滑动 */
.sq-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #d3d9e2 transparent;
}

.sq-body::-webkit-scrollbar {
  width: 6px;
}

.sq-body::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: #d3d9e2;
}

.sq-wrap {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 16px 24px 28px;
}

.sq-main {
  flex: 1;
  min-width: 0;
}

/* 标签页 */
.sq-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.sq-tabs button {
  padding: 6px 18px;
  border: none;
  border-radius: 999px;
  background: #eceff3;
  color: #7c8794;
  font-size: 14.5px;
  cursor: pointer;
}

.sq-tabs button.on {
  background: #bcd7f6;
  color: #3f6ea8;
  font-weight: 600;
}

/* 卡片流 */
.sq-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 14px;
  align-content: start;
}

.post {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 14px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 3px 12px rgba(120, 130, 150, 0.08);
  height: 380px; /* 固定高度，所有卡片一致 */
  overflow: hidden;
  /* 性能: 视口外的卡片跳过布局与绘制, 长列表滚动明显更顺;
     卡片定高 380px, 内在尺寸与之写死一致, 滚动条不会跳动 */
  content-visibility: auto;
  contain-intrinsic-size: auto 380px;
}

/* 固定尺寸的元素不被压缩 */
.post-head,
.post-content-wrapper,
.p-tags,
.p-thumbs,
.p-audio,
.post-foot {
  flex: none;
}

.post-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 头像预留位 */
.p-avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(140deg, #f8cfc0, #c9a6e0);
  color: #fff;
  font-size: 15.5px;
  font-weight: 600;
}
.p-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 头像按钮化: 点开作者信息卡 */
button.p-avatar {
  flex: none;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: transform 0.18s ease;
}

button.p-avatar:hover {
  transform: scale(1.08);
}

.post-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.post-meta b {
  font-size: 15px;
  color: #3d4652;
}

.post-meta span {
  font-size: 12px;
  color: #a3adb8;
}

.p-more {
  margin-left: auto;
  border: none;
  background: transparent;
  color: #b6bfc9;
  font-size: 17px;
  cursor: pointer;
}

/* ... 下拉菜单: 举报 / 减少此类内容 */
.p-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 30;
  display: flex;
  flex-direction: column;
  min-width: 128px;
  padding: 4px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 26px rgba(120, 90, 60, 0.18);
}

.p-menu button {
  border: none;
  border-radius: 8px;
  background: transparent;
  padding: 7px 10px;
  font-size: 14px;
  color: #5a6472;
  text-align: left;
  cursor: pointer;
}

.p-menu button:hover {
  background: #f6f2ec;
  color: #e0705a;
}

/* 删除第二下的「确认」态: 整行变红, 让人看清这一步真的会删 */
.p-menu button.p-del.confirm {
  background: #fdecea;
  color: #d9403a;
  font-weight: 600;
}

.post-text {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.7;
  color: #55606c;
  white-space: pre-line;
  overflow-wrap: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 4; /* 最多 4 行, 多余显示省略号 */
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 长文折叠按钮 */
.p-expand {
  align-self: flex-start;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: #5b8ad0;
  font-size: 14px;
  cursor: pointer;
}

.p-expand:hover {
  color: #3f6ea8;
}

/* 内容包裹层，防止溢出和压缩 */
.post-content-wrapper {
  flex: none;
  overflow: hidden;
}

/* 帖子配图/缩略图预留位 (渐变占位), 填充剩余空间 */
.p-img {
  flex: 1 1 0;
  min-height: 60px;
  border-radius: 8px;
}

.p-thumbs {
  display: flex;
  gap: 6px;
}

.p-thumb {
  flex: 1;
  aspect-ratio: 4 / 3;
  border-radius: 6px;
}

.g-sunset {
  background: linear-gradient(160deg, #ffd9a0, #ff9d7c 55%, #8a6aa0);
}

.g-book {
  background: linear-gradient(150deg, #f7e8d4, #d9b896);
}

.g-flower {
  background: linear-gradient(150deg, #eaf6e2, #bcd9a8 60%, #f4fbee);
}

.g-film {
  background: linear-gradient(150deg, #dfe6ee, #9fb2c8);
}

.g-rain {
  background: linear-gradient(150deg, #dce8f2, #a9c2d8);
}

/* 标签胶囊 */
.p-tags,
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.p-tag {
  padding: 3px 9px;
  border: none;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}

.p-tag.t0 {
  background: #fde3d3;
  color: #d0764a;
}

.p-tag.t1 {
  background: #dceafb;
  color: #5b87c0;
}

.p-tag.t2 {
  background: #fbe0e8;
  color: #c76a8b;
}

.p-tag.t3 {
  background: #e2f0dd;
  color: #6f9c62;
}

.post-foot {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: auto; /* 底部栏始终贴底 */
}

.p-like {
  border: none;
  background: transparent;
  color: #b0b8c2;
  font-size: 13px;
  cursor: pointer;
}

.p-like.on {
  color: #e0607a;
  font-weight: 600;
}

.p-comment {
  font-size: 13px;
  color: #b0b8c2;
}

.p-enter {
  margin-left: auto;
  border: none;
  background: transparent;
  color: #5b87c0;
  font-size: 13px;
  cursor: pointer;
}

.sq-empty {
  grid-column: 1 / -1;
  margin: 30px 0;
  text-align: center;
  color: #a3adb8;
  font-size: 14.5px;
}

/* 加载更多 / 到底提示 */
.sq-loadmore {
  grid-column: 1 / -1;
  justify-self: center;
  margin: 24px 0 8px;
  padding: 10px 28px;
  border: 1px solid #dfe4ea;
  border-radius: 999px;
  background: #fff;
  color: #5b6672;
  font-size: 15.5px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.sq-loadmore:hover:not(:disabled) {
  border-color: #3d7bfd;
  color: #3d7bfd;
}

.sq-loadmore:disabled {
  color: #a3adb8;
  cursor: default;
}

.sq-loadmore-end {
  grid-column: 1 / -1;
  margin: 24px 0 8px;
  text-align: center;
  color: #b3bac4;
  font-size: 14.5px;
}

/* 侧栏 */
.sq-side {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 0 0 240px;
}

.side-card {
  padding: 14px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 3px 12px rgba(120, 130, 150, 0.08);
}

.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.side-head b {
  font-size: 15px;
  color: #3d4652;
}

.side-head button {
  border: none;
  background: transparent;
  color: #8b96a3;
  font-size: 13px;
  cursor: pointer;
}

.sp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 6px;
  border-radius: 10px;
  cursor: pointer;
}

/* 整行可点: 点名字/缩略图也能进入对方的记忆空间 */
.sp-row:hover {
  background: #f8f1e9;
}

.sp-thumb {
  flex: none;
  width: 42px;
  height: 42px;
  border-radius: 8px;
}

.sp-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.sp-meta b {
  font-size: 14px;
  color: #3d4652;
}

.sp-meta span {
  font-size: 11.5px;
  color: #a3adb8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sp-row button {
  flex: none;
  padding: 4px 12px;
  border: none;
  border-radius: 999px;
  background: #dceafb;
  color: #5b87c0;
  font-size: 12.5px;
  cursor: pointer;
}

/* 推荐列表为空(全站只有自己一个用户)时的一句人话, 不留白 */
.sp-empty {
  padding: 10px 6px 4px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #a3adb8;
}

.side-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 16px;
  border-radius: 12px;
  background: linear-gradient(140deg, #fde8ec, #f7d9e6 60%, #efd9f2);
}

.side-banner p {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.8;
  color: #a06a7e;
}

.side-banner span {
  color: #e08ba4;
  font-size: 16.5px;
}

/* 分类说明: 热门/最新没内容时服务端退回全部, 用一行小字交代清楚 */
.sq-note {
  margin: -4px 0 12px;
  padding: 8px 14px;
  border-radius: 10px;
  background: #f1f5fb;
  color: #6b7f9b;
  font-size: 13.5px;
}

/* 大型活动横幅 */
.sq-major-events {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 16px;
}

.major-event-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 22px;
  background: linear-gradient(135deg, #ffe6c9, #ffd4dc);
  background-size: cover;
  background-position: center;
  border-radius: 20px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 16px rgba(200, 120, 80, 0.15);
}

.major-event-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(200, 120, 80, 0.25);
}

.major-event-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.major-event-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.major-event-header b {
  color: #7a4a2b;
  font-size: 17.5px;
}

.major-status {
  font-size: 12px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.7);
  color: #e06040;
  border-radius: 999px;
  font-weight: 600;
}

.major-status.status-0 { background: rgba(255,255,255,0.7); color: #d89a4e; }
.major-status.status-1 { background: rgba(255,255,255,0.85); color: #4a8a5a; }
.major-status.status-2 { background: rgba(200,200,200,0.7); color: #888; }

.major-event-desc {
  color: #8a5a3a;
  font-size: 15.5px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.major-event-bar {
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.55);
  overflow: hidden;
}

.major-event-bar i {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #f08c5a, #e06080);
  transition: width 0.5s ease;
}

.major-event-num {
  color: #a06a4a;
  font-size: 14.5px;
  font-style: normal;
}

.major-event-time {
  color: #a06a4a;
  font-size: 13px;
  margin: 4px 0;
}

.major-event-card > button {
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  padding: 10px 22px;
  background: #f08c5a;
  color: #fff;
  font-size: 15.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(240, 140, 90, 0.35);
  transition: transform 0.15s, background 0.2s;
}

.major-event-card > button:hover {
  transform: translateY(-1px);
}

.major-event-card > button.on {
  background: #a8b7cc;
  box-shadow: none;
}

.act-ended-tag {
  flex-shrink: 0;
  padding: 10px 22px;
  background: #ccc;
  color: #888;
  font-size: 15.5px;
  font-weight: 600;
  border-radius: 999px;
}

/* 时光胶囊 */
.sq-capsule {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  margin-top: 14px;
  background: #fffdf6;
  border: 1px dashed #e0c98f;
  border-radius: 18px;
}

.cap-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: linear-gradient(135deg, #fdeec9, #f8d9e0);
  border-radius: 12px;
}

.cap-body {
  flex: 1;
  min-width: 0;
}

.cap-body b {
  display: block;
  color: #7a5c33;
  font-size: 17px;
  margin-bottom: 4px;
}

.cap-line {
  margin: 0;
  color: #9a7b52;
  font-size: 15px;
  line-height: 1.6;
  animation: cap-in 0.45s ease;
}

@keyframes cap-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.sq-capsule button {
  flex-shrink: 0;
  border: 1px solid #e0c98f;
  border-radius: 999px;
  padding: 8px 16px;
  background: #fff;
  color: #a07c43;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.sq-capsule button:hover {
  background: #fdf4dd;
}

/* 官方活动 */
.sq-activities {
  margin-top: 14px;
  padding: 18px 20px;
  background: linear-gradient(105deg, #ffe6c9, #ffd4dc);
  border-radius: 18px;
}

.act-head {
  margin-bottom: 12px;
  font-size: 16.5px;
  color: #8a5a2b;
}

.act-item {
  padding: 14px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.5);
}

.act-item:last-child {
  border-bottom: none;
}

.act-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  margin-bottom: 6px;
}

.act-type-1 {
  background: rgba(255, 255, 255, 0.7);
  color: #5b87c7;
}

.act-type-2 {
  background: rgba(255, 255, 255, 0.7);
  color: #67a767;
}

.act-type-3 {
  background: rgba(255, 255, 255, 0.7);
  color: #d89a4e;
}

.act-title {
  display: block;
  font-size: 17px;
  color: #4a3f37;
  margin-bottom: 4px;
}

.act-desc {
  margin: 0;
  font-size: 14.5px;
  color: #a06a4a;
  line-height: 1.5;
}

.act-media-preview {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.act-media-thumb {
  width: 50px;
  height: 50px;
  object-fit: cover;
  border-radius: 6px;
}

.act-media-more {
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f0eb;
  border-radius: 6px;
  font-size: 14.5px;
  color: #8a7a6d;
}

.act-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 13px;
  color: #b3a79b;
}

/* 活动卡片上的点赞: 原来是详情弹窗里的透明文字按钮, 被 .act-detail-join button
   误染成渐变胶囊、和「退出活动」撞车。现在它是卡片上的一个小胶囊, 有独立类名。 */
.act-card-like {
  margin-left: auto;
  border: 1px solid rgba(240, 145, 124, 0.35);
  background: #fff;
  color: #c2705f;
  font-size: 13px;
  line-height: 1;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: transform 0.15s, background 0.2s, color 0.2s;
}

.act-card-like:hover {
  transform: translateY(-1px);
  background: #fff5f1;
}

.act-card-like.liked {
  border-color: rgba(224, 96, 96, 0.5);
  background: #fdecec;
  color: #d0453f;
}

.act-comment-login {
  margin: 6px 0 0;
  font-size: 13px;
  color: #b3a79b;
}

/* 官方通知: 通栏公告条, 刻意做得和活动卡片完全不像 ——
   活动是「大卡片 + 右下角计数 + 可进弹窗」, 通知是「细长条 + 左侧喇叭 + 原地展开」 */
.sq-notices {
  margin-bottom: 18px;
  border: 1px solid rgba(120, 150, 190, 0.28);
  border-radius: 14px;
  background: linear-gradient(180deg, #f3f7fc 0%, #eef3f9 100%);
  overflow: hidden;
}

.notice-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px dashed rgba(120, 150, 190, 0.35);
  font-size: 14px;
  color: #4a6480;
}

.notice-head-note {
  font-size: 12px;
  color: #8fa3b8;
}

.notice-bar + .notice-bar {
  border-top: 1px solid rgba(120, 150, 190, 0.18);
}

.notice-bar-main {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  color: #3f556d;
}

.notice-bar-main:hover {
  background: rgba(255, 255, 255, 0.55);
}

.notice-ico {
  flex: none;
  font-size: 15px;
}

.notice-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.notice-time {
  flex: none;
  font-size: 12px;
  color: #93a7bb;
}

.notice-arrow {
  flex: none;
  font-size: 11px;
  font-style: normal;
  color: #93a7bb;
}

.notice-body {
  padding: 0 14px 12px 39px;
  font-size: 13.5px;
  line-height: 1.75;
  color: #55697f;
  white-space: pre-wrap;
}

.act-time {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 13px;
  color: #8a7a6d;
}

.act-status-badge {
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 600;
}

.act-status-badge.status-0 { background: #fdf1df; color: #d89a4e; }
.act-status-badge.status-1 { background: #e3f5e8; color: #4a8a5a; }
.act-status-badge.status-2 { background: #f0e8e8; color: #a07070; }

.act-item {
  cursor: pointer;
  transition: background 0.2s;
}

.act-item:hover {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 8px;
}

/* 活动详情弹窗 */
.act-detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.act-detail-modal {
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  max-height: 85vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

.act-detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid #f0ebe5;
  position: relative;
}

.act-detail-head h3 {
  margin: 0;
  font-size: 20px;
  color: #4a3f37;
  flex: 1;
}

.act-detail-close {
  border: none;
  background: transparent;
  font-size: 28px;
  color: #b3a79b;
  cursor: pointer;
  padding: 0 4px;
}

.act-detail-close:hover {
  color: #8a7a6d;
}

.act-detail-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.act-detail-content {
  font-size: 17px;
  color: #6b5d52;
  line-height: 1.6;
  margin: 0 0 16px;
}

.act-detail-media {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.act-media-item {
  border-radius: 8px;
  overflow: hidden;
}

.act-media-img {
  width: 100%;
  height: 150px;
  object-fit: cover;
}

.act-media-audio,
.act-media-video {
  width: 100%;
}

.act-detail-time {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f9f5f1;
  border-radius: 8px;
  font-size: 14.5px;
  color: #6b5a4a;
  margin-bottom: 12px;
}

.act-detail-join {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0;
  border-top: 1px solid #f0ebe5;
  border-bottom: 1px solid #f0ebe5;
  margin-bottom: 16px;
}

.act-join-info {
  font-size: 15.5px;
  color: #8a7a6d;
}

.act-detail-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.act-like-btn {
  border: none;
  background: transparent;
  color: #8a7a6d;
  font-size: 17px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 999px;
}

.act-like-btn.liked {
  color: #e06060;
}

.act-like-btn:hover {
  background: #f5f0eb;
}

.act-detail-join button {
  padding: 10px 24px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #f7a860, #f06292);
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.2s;
}

.act-detail-join button:hover {
  transform: translateY(-1px);
}

.act-detail-join button.joined {
  background: #a8b7cc;
}

/* 评论区 */
.act-comments h4 {
  margin: 0 0 12px;
  font-size: 16.5px;
  color: #4a3f37;
}

.act-comment-input {
  margin-bottom: 16px;
}

.act-comment-input textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e8e0d8;
  border-radius: 8px;
  font-size: 15.5px;
  resize: vertical;
  font-family: inherit;
}

.act-comment-input textarea:focus {
  outline: none;
  border-color: #f7a860;
}

.act-comment-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.act-comment-upload {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 14.5px;
  color: #8a7a6d;
}

.act-comment-upload input {
  display: none;
}

.act-comment-actions button {
  padding: 6px 16px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #f7a860, #f06292);
  color: #fff;
  font-size: 14.5px;
  cursor: pointer;
}

.act-comment-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.comment-preview {
  max-width: 100px;
  max-height: 100px;
  border-radius: 8px;
  margin-top: 8px;
}

.act-comment-item {
  padding: 12px 0;
  border-bottom: 1px solid #f5f0eb;
}

.act-comment-item:last-child {
  border-bottom: none;
}

.comment-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.comment-author {
  font-size: 14.5px;
  font-weight: 600;
  color: #4a3f37;
}

.comment-time {
  font-size: 12px;
  color: #b3a79b;
}

.comment-text {
  margin: 0 0 6px;
  font-size: 15.5px;
  color: #6b5d52;
  line-height: 1.5;
}

.comment-image {
  max-width: 200px;
  max-height: 200px;
  border-radius: 8px;
}

.act-no-comments {
  text-align: center;
  padding: 20px 0;
  color: #b3a79b;
  font-size: 15.5px;
}

/* 到底部页脚 */
.sq-end {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 30px 0 40px;
  color: #9aa7b8;
}

.sq-end .paw {
  font-size: 22px;
  opacity: 0.55;
}

.sq-end p {
  margin: 0;
  font-size: 15px;
}

/* 可能认识的人 */
.fr-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fr-row + .fr-row {
  margin-top: 12px;
}

.fr-row button {
  margin-left: auto;
  flex-shrink: 0;
  border: 1px solid #bcd0ea;
  border-radius: 999px;
  padding: 4px 12px;
  background: #fff;
  color: #5b7db0;
  font-size: 14px;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}

.fr-row button.on {
  background: #e8eef7;
  border-color: #d5ddea;
  color: #97a5b8;
}

/* 卡片内: 用户上传图/音频条, 图片填充剩余空间 */
.p-photo {
  width: 100%;
  flex: 1 1 0;
  min-height: 60px;
  object-fit: cover;
  border-radius: 8px;
}

.p-audio {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 999px;
  background: #f3ead9;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
}

.p-audio:hover,
.p-audio.on {
  background: #f7e3c8;
}

.pa-play {
  flex: none;
  color: #8a6f5a;
  font-size: 13px;
}

.pa-bar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(122, 92, 51, 0.18);
  overflow: hidden;
}

.pa-bar i {
  display: block;
  height: 100%;
  background: #d89a4e;
  transition: width 0.2s linear;
}

.pa-time {
  flex: none;
  color: #a08050;
  font-size: 12px;
}

.pa-name {
  min-width: 0;
  color: #7a5c33;
  font-size: 13px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 轻提示 */
.sq-tip {
  position: fixed;
  left: 50%;
  bottom: 5%;
  transform: translateX(-50%);
  z-index: 75;
  margin: 0;
  padding: 7px 16px;
  border-radius: 999px;
  background: rgba(60, 66, 76, 0.82);
  color: #fff;
  font-size: 13px;
}

/* 弹窗遮罩(详情/私信/标签面板共用) */
.sq-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: rgba(50, 55, 65, 0.32);
}

/* 帖子详情 / 私信等共用的小弹窗外壳 */
.sq-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(420px, 92vw);
  max-height: 88vh;
  overflow-y: auto;
  padding: 18px 20px;
  border-radius: 16px;
  background: #fffdfb;
  box-shadow: 0 18px 44px rgba(60, 60, 80, 0.28);
}

.sq-dialog-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 2px;
  background: #fffdfb;
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #4a3f37;
}

.sq-dialog-head button {
  border: none;
  background: transparent;
  color: #c9bbae;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

/* ---- 帖子详情弹窗 ---- */
.post-detail-modal {
  width: min(500px, 86%);
  max-height: 80%;
  overflow-y: auto;
}

.post-detail-content {
  font-size: 15.5px;
  line-height: 1.8;
  color: #55606c;
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-photo {
  width: 100%;
  max-height: 300px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 12px;
}

/* 帖子详情: 内容/图片/视频/音频 依次排布, 分割线隔开 */
.post-detail-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pd-divider {
  height: 1px;
  background: #eee6da;
}

.pd-media {
  margin-bottom: 0;
}

.pd-video {
  display: block;
  width: 100%;
  border-radius: 10px;
  background: #000;
}

.pd-audio {
  display: block;
  width: 100%;
  border-radius: 10px;
}

/* 发私信对话框 */
.dm-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 360px;
  padding: 18px 20px;
  border-radius: 16px;
  background: #fffdf9;
  box-shadow: 0 18px 44px rgba(60, 60, 80, 0.28);
  animation: dm-in 0.24s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@keyframes dm-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.dm-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dm-ava {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: #fff;
  font-size: 16.5px;
  font-weight: 600;
}

.dm-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dm-meta b {
  font-size: 15.5px;
  color: #3d352e;
}

.dm-meta span {
  font-size: 12px;
  color: #b3a79c;
}

.dm-head button {
  flex: none;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: #f6f0e8;
  color: #8a7a6d;
  font-size: 17.5px;
  line-height: 1;
  cursor: pointer;
}

.dm-input {
  padding: 10px 12px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #fff;
  font-size: 14.5px;
  color: #4a3f37;
  outline: none;
  resize: none;
  font-family: inherit;
  line-height: 1.6;
}

.dm-input:focus {
  border-color: #f0917c;
}

.dm-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dm-cancel {
  padding: 7px 16px;
  border: none;
  border-radius: 999px;
  background: #f6e8dc;
  color: #8a5f43;
  font-size: 14.5px;
  cursor: pointer;
}

.dm-send {
  padding: 7px 18px;
  border: none;
  border-radius: 999px;
  background: #f0917c;
  color: #fff;
  font-size: 14.5px;
  cursor: pointer;
}

.dm-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 用户记忆空间面板 */
.us-panel {
  display: flex;
  flex-direction: column;
  width: 380px;
  max-height: 70vh;
  border-radius: 16px;
  background: #fffdf9;
  box-shadow: 0 18px 44px rgba(60, 60, 80, 0.28);
  animation: dm-in 0.24s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  overflow: hidden;
}

.us-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid #f0e8de;
}

.us-ava {
  display: grid;
  flex: none;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  color: #fff;
  font-size: 17.5px;
  font-weight: 600;
}

.us-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.us-meta b {
  font-size: 17px;
  color: #3d352e;
}

.us-meta span {
  font-size: 13px;
  color: #b3a79c;
}

.us-head button {
  flex: none;
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

.us-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.us-row {
  display: flex;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.7);
}

.us-cover {
  flex: none;
  width: 34px;
  height: 46px;
  border-radius: 4px;
  overflow: hidden;
  background: #f0e8de;
}

.us-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.kind-tag {
  flex: none;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-style: normal;
  font-weight: 500;
}

.kind-tag.memory {
  background: #e8f1fd;
  color: #3d7bfd;
}

.kind-tag.book {
  background: #f6e8dc;
  color: #8a5f43;
}

.kind-tag.music {
  background: #fde8e4;
  color: #e0705a;
}

.us-row-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.us-row-content b {
  font-size: 14.5px;
  color: #3d352e;
}

.us-row-content span {
  font-size: 13px;
  color: #6b5d4f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.us-row-content em {
  font-size: 12px;
  font-style: normal;
  color: #b3a79c;
}

.us-empty {
  text-align: center;
  font-size: 14.5px;
  color: #b3a79c;
  padding: 20px 0;
}

/* 热门标签全量面板 */
.tags-panel {
  display: flex;
  flex-direction: column;
  width: 340px;
  border-radius: 16px;
  background: #fffdf9;
  box-shadow: 0 18px 44px rgba(60, 60, 80, 0.28);
  animation: dm-in 0.24s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  overflow: hidden;
}

.tags-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #f0e8de;
}

.tags-head b {
  font-size: 17px;
  color: #3d352e;
}

.tags-head button {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: #f6f0e8;
  color: #8a7a6d;
  font-size: 17.5px;
  line-height: 1;
  cursor: pointer;
}

.tags-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 18px;
}

.tags-grid button {
  padding: 6px 14px;
  border: none;
  border-radius: 999px;
  background: #f6e8dc;
  color: #8a5f43;
  font-size: 14.5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tags-grid button:hover {
  background: #f0d8c4;
}

.tags-grid button.on {
  background: #f0917c;
  color: #fff;
}
/* 小屏: 380px 定高在手机上太占屏, 收敛高度; 内在尺寸必须同步改, 否则滚动条会跳 */
/* ============================================================================
   手机版式（≤767.98）
   ★ 桌面是「1446×272 烘焙横幅 + 双列（信息流 + 240px 右栏）」。竖屏下横幅压到 110px、
     搜索胶囊缩成 22px 高（点不到）、右栏 240px 把信息流挤成 150px 宽 —— 三处都会坏。
     这里：横幅留作装饰条（zoom 到右侧风车/石桥那段，避开烤进去的标题字）、
     标题与搜索换成真实控件、右栏折到信息流下面、卡片单列。
   ★ 全部在断点内，桌面零匹配。
   ============================================================================ */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  /* 横幅：定高 + 放大到右侧插画段（那段没有文字），底部渐隐接入页面底色 */
  .sq-hero {
    aspect-ratio: auto;
    height: 148px;
    min-height: 0;
    max-height: none;
    /* 320% + 58%/14%：实测这组只框到「风车小屋 + 石桥」那段插画，
       完全避开烤在图里的标题、搜索胶囊和右上角那句手写字 */
    background-size: 320% auto;
    background-position: 58% 14%;
    -webkit-mask-image: linear-gradient(180deg, #000 62%, transparent 100%);
    mask-image: linear-gradient(180deg, #000 62%, transparent 100%);
  }

  /* 云带/扫光在 148px 的条里只是噪点，关掉 */
  .sq-fx {
    display: none;
  }

  /* 图上的搜索胶囊 / 「分享一段时光」热区：竖屏下都只有十几像素高，隐藏，用下面的真实控件 */
  .sq-search,
  .sq-hero-write {
    display: none;
  }

  /* 真实标题：左侧米色渐隐托底，右侧留插画 */
  .sq-h-m {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    padding: 0 16px;
    background: linear-gradient(
      90deg,
      rgba(250, 246, 242, 0.97) 0%,
      rgba(250, 246, 242, 0.88) 44%,
      rgba(250, 246, 242, 0.16) 76%,
      rgba(250, 246, 242, 0) 100%
    );
    pointer-events: none;
  }

  .sq-h-m b {
    font-size: 25px;
    font-weight: 700;
    letter-spacing: 3px;
    color: #4a3b33;
    font-family: 'Songti SC', 'STSong', 'SimSun', serif;
  }

  .sq-h-m i {
    font-size: 12.5px;
    font-style: normal;
    line-height: 1.5;
    letter-spacing: 0.5px;
    color: #8d7a6b;
  }

  /* 搜索条：44px 高，右侧一个「写日记」直达记忆库 */
  .sq-m-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .sq-m-search {
    flex: 1;
    min-width: 0;
    height: 44px;
    padding: 0 14px;
    border: 1px solid #e6e9ee;
    border-radius: 999px;
    background: #fff;
    font-size: 16px; /* iOS 聚焦不放大 */
    color: #5c5350;
    outline: none;
  }

  .sq-m-search::placeholder {
    color: #b3bcc7;
  }

  .sq-m-write {
    flex: none;
    height: 44px;
    padding: 0 14px;
    border: none;
    border-radius: 999px;
    background: linear-gradient(135deg, #ffcf9b, #ff9db1);
    color: #7a4a3a;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }

  /* 内容区：单列，右栏折到信息流下面 */
  .sq-wrap {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 10px 12px calc(20px + env(safe-area-inset-bottom));
  }

  .sq-main {
    width: 100%;
  }

  /* 分类标签：一行放不下时可横滑，别折成两行把首屏吃光 */
  .sq-tabs {
    gap: 8px;
    margin-bottom: 10px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .sq-tabs::-webkit-scrollbar {
    display: none;
  }

  .sq-tabs button {
    flex: none;
    min-height: 38px;
    padding: 0 16px;
    font-size: 14px;
  }

  /* 卡片：取消 380px 定高（竖屏一屏只放得下一张半，短卡片还留一大块空白） */
  .post {
    height: auto;
    min-height: 0;
    contain-intrinsic-size: auto 280px;
  }

  .sq-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  /* 卡片里那些 23~27px 的小按钮 → 40px 左右 */
  .p-avatar {
    width: 40px;
    height: 40px;
  }

  .p-more {
    width: 40px;
    height: 40px;
  }

  .p-expand,
  .p-tag,
  .p-like {
    min-height: 38px;
    padding: 0 10px;
  }

  .p-enter {
    min-height: 36px;
  }

  /* 右栏（可能认识的人 / 热门标签）：整宽排在信息流后面 */
  .sq-side {
    position: static;
    flex: 1 1 auto;
    width: 100%;
  }

  /* 右栏折下来之后，这几颗按钮（换一换 / 进入 / 关注 / 更多）还是桌面的 21~30px 高 */
  .side-head button,
  .sp-row button,
  .fr-row button {
    min-height: 38px;
    padding: 0 12px;
  }

  /* 长按不选中文字，拖着页面滚动时更顺 */
  .square {
    -webkit-touch-callout: none;
  }

  .sq-end p,
  .sq-end span {
    font-size: 13.5px;
  }
}
</style>
