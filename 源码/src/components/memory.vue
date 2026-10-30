<template>
  <div class="memory">
    <div class="memory-figure">
      <div class="memory-figure-inner">
        <img
    class="memory-bg"
    src="../assets/opt/memoryBackground.webp"
    srcset="../assets/opt/memoryBackground-sm.webp 1000w, ../assets/opt/memoryBackground.webp 1452w"
    sizes="100vw"
    alt=""
    decoding="async"
  />

        <!-- 手机端标题条（≤767 才显示）：海报上的「记忆库」是画进图片里的，
             竖屏把海报裁成顶部装饰条后标题会跟着被裁掉，所以用文字重画一份。
             桌面端 display:none，不占位、不影响原有定位体系。 -->
        <header class="mem-m-head">
          <h1>记忆库</h1>
          <p>所有走过的时光，都值得被温柔保存</p>
        </header>

        <!-- 右下角睡猫随机冒想法 -->
        <idle-thought :lines="CAT_THOUGHTS" left="87%" top="74%" />

        <!-- 搜索框: 可输入关键词, 右侧圆钮为搜索按钮 -->
        <div class="search-pill">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input v-model="keyword" class="search-input" type="text" />
          <button class="search-go" type="button" aria-label="搜索">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 12h16" />
              <path d="m14 6 6 6-6 6" />
            </svg>
          </button>
        </div>

        <!-- 三个筛选下拉按钮 -->
        <div class="filter-wrap filter-space">
          <button class="filter-btn" type="button" @click="toggle('space')">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
            </svg>
            <span>{{ space }}</span>
            <svg class="ico chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div v-if="openMenu === 'space'" class="menu">
            <button
              v-for="o in spaceOptions"
              :key="o"
              type="button"
              :class="{ on: o === space }"
              @click="pick('space', o)"
            >
              {{ o }}
            </button>
          </div>
        </div>

        <!-- 第二栏：小岛（选项来自你已有小岛的名字，不再是"旅游/工作/学习/其他"） -->
        <div class="filter-wrap filter-type">
          <button class="filter-btn" type="button" @click="toggle('island')">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 17c2.2 0 2.2-1.6 4.4-1.6S9.6 17 11.8 17s2.2-1.6 4.4-1.6S18.4 17 20.6 17" />
              <path d="M7 12.5c1.6-1.4 2.6-3.3 3-5.5M17 12.5c-1.2-1.1-2-2.5-2.4-4.2" />
              <circle cx="12" cy="6.4" r="2.1" />
            </svg>
            <span>{{ island }}</span>
            <svg class="ico chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div v-if="openMenu === 'island'" class="menu">
            <button
              v-for="o in islandOptions"
              :key="o"
              type="button"
              :class="{ on: o === island }"
              @click="pick('island', o)"
            >
              {{ o }}
            </button>
          </div>
        </div>

        <div class="filter-wrap filter-time">
          <button class="filter-btn" type="button" @click="toggle('time')">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="6" width="16" height="14" rx="2" />
              <path d="M8 3v5M16 3v5M4 11h16" />
            </svg>
            <span>{{ time }}</span>
            <svg class="ico chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <div v-if="openMenu === 'time'" class="menu">
            <button
              v-for="o in timeOptions"
              :key="o"
              type="button"
              :class="{ on: o === time }"
              @click="pick('time', o)"
            >
              {{ o }}
            </button>
          </div>
        </div>

        <!-- 谁关注我: 自己可点开具体名单; 浏览他人时只显示数量, 点不开(名单在服务端就被拦下) -->
        <div class="filter-wrap filter-fans">
          <button
            class="filter-btn fans-btn"
            type="button"
            :title="browseUid ? `${browseName || 'TA'} 的粉丝数, 名单不公开` : '看看是谁在关注你'"
            @click="openFans"
          >
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
            </svg>
            <span>{{ browseUid ? 'TA 的粉丝' : '谁关注我' }} · {{ fansCount }}</span>
          </button>
        </div>

        <!-- 筛选行与纸页之间的模糊带: 柔光帷 + 手写铭文装饰 -->
        <div class="band-deco">
          <span class="band-line"></span>
          <span class="band-spark">✧</span>
          <span class="band-motto">把日子过成值得收藏的样子</span>
          <span class="band-spark">✧</span>
          <span class="band-line"></span>
        </div>

        <!-- 中间正文: 数据列表 + 添加数据按钮 -->
        <div class="body-panel">
          <!-- 浏览他人公开记忆横幅 -->
          <div v-if="browseUid" class="browse-bar">
            <button class="browse-back" type="button" @click="exitBrowse">← 返回我的记忆库</button>
            <span class="browse-title">正在浏览 {{ browseName }} 的公开记忆</span>
          </div>
          <div class="body-head">
            <span class="body-count">共 {{ filtered.length }} 条记忆</span>
            <!-- ★ 2026-10-27 用户要求: 这里就是全站**唯一**的写作入口(广场的「添加数据」已删掉)，
                 所以按钮文案改成「去写一篇日记」, 图标也换成笔。 -->
            <button v-if="!browseUid" class="add-btn" type="button" @click="openAdd">
              <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
                <path d="M14.5 5.5 18.5 9.5" />
              </svg>
              去写一篇日记
            </button>
          </div>

          <div class="entry-list">
            <article v-for="e in filtered" :key="e.id" class="entry-card">
              <!-- 分享到广场: 卡片右上角胶囊, 与下方「公开/隐私」是两个独立入口, 状态同源 -->
              <button
                v-if="!browseUid"
                class="entry-share"
                :class="{ on: e.is_public }"
                type="button"
                :title="
                  e.is_public
                    ? '点击取消分享, 让这条只留在记忆空间'
                    : '分享到拾光广场, 其他人可以看到并评论'
                "
                @click="toggleShare(e)"
              >
                {{ e.is_public ? '✓ 已分享' : '↗ 分享到广场' }}
              </button>
              <div v-if="e.photo" class="entry-photo">
                <img :src="e.photo" alt="" loading="lazy" decoding="async" />
              </div>
              <div v-else class="entry-no-photo">添加图片</div>
              <span class="entry-title">{{ e.title }}</span>
              <span class="entry-meta">
                {{ e.island || e.space }} · {{ e.date }}
              </span>
              <!-- 语义兜底命中：字面上一个字都不一样，得告诉用户"为什么它会出现在这里" -->
              <span v-if="isSemanticHit(e)" class="entry-sem">≈ 意思相近</span>
              <p v-if="e.content" class="entry-content">{{ e.content }}</p>
              <!-- 详情按钮恒显示: 不管内容长短/有没有媒体, 都能点开看完整详情 -->
              <button class="entry-detail-btn" type="button" @click="openDetail(e)">详情 →</button>
              <div v-if="!browseUid" class="entry-actions">
                <button class="entry-edit" type="button" @click="openEdit(e)">修改</button>
                <button class="entry-vis" type="button" @click="toggleVisibility(e)">
                  {{ e.is_public ? '公开' : '隐私' }}
                </button>
                <button class="entry-del" type="button" @click="remove(e)">
                  删除
                </button>
              </div>
            </article>
            <div v-if="!filtered.length" class="entry-empty">
              <!-- 搜不到 ≠ 没有记忆：这两件事在界面上必须分开，
                   否则用户会以为自己的记忆丢了（验证报告 FIND-01 同类问题） -->
              <template v-if="keywordDeb.trim()">
                <div class="empty-art">
                  <span class="spark s1">✦</span>
                  <span class="spark s2">✧</span>
                  <span class="spark s3">✦</span>
                </div>
                <p class="empty-title">没有找到「{{ keywordDeb.trim() }}」</p>
                <p class="empty-sub">{{ semHint }}</p>
                <button class="empty-cta" type="button" @click="keyword = ''">清空搜索</button>
              </template>
              <template v-else>
                <div class="empty-art">
                  <span class="spark s1">✦</span>
                  <span class="spark s2">✧</span>
                  <span class="spark s3">✦</span>
                  <div class="empty-polaroid">
                    <span class="empty-photo">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 20s-7-4.6-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8c0 4.6-7 9.2-7 9.2Z"
                        />
                      </svg>
                    </span>
                    <span class="empty-caption">your first memory</span>
                  </div>
                </div>
                <p class="empty-title">这里还空着呢</p>
                <p class="empty-sub">把第一段回忆夹进这本手账, 让时光有处可栖。</p>
                <button v-if="!browseUid" class="empty-cta" type="button" @click="openAdd">+ 记下第一段回忆</button>
              </template>
            </div>
          </div>
        </div>

        <!-- 右侧统计: 有数据后盖住背景图上的空状态占位 -->
        <div v-if="sourceEntries.length" class="stats-panel">
          <div class="stats-title">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 20V10M12 20V4M19 20v-7" />
            </svg>
            时光统计
          </div>
          <div class="stats-total">共 {{ sourceEntries.length }} 条记忆</div>
          <div v-for="(n, t) in stats" :key="t" class="stats-row">
            <span>{{ t }}</span>
            <span>{{ n }} 条</span>
          </div>
        </div>
      </div>
    </div>
    <!-- 写作/修改记忆的小弹窗: 按住标题栏可拖动 -->
    <div v-if="showDialog" class="dialog-mask" @click.self="closeDialog">
      <div class="dialog" :style="dialogDragStyle">
        <div class="dialog-head" @pointerdown="onDialogDragStart">
          <span class="dialog-title">{{ form.id ? '修改记忆' : '写一篇日记' }}</span>
          <button class="dialog-close" type="button" aria-label="关闭" @click="closeDialog">
            ×
          </button>
        </div>

        <!-- ★ 这一栏只有「内容、照片、视频、音频、所属空间、日期」。
             标题 / 类型 / 内容种类(日记·书籍·音乐) / 作者 / 自定义类型 已按需求全部删掉：
             标题改由服务端读正文用 AI 生成（见 server/index.js 的 generateTitle），
             所以这里连隐藏字段都不留 —— 保存时也不再提交 title。
             内容**必填**：没有正文，AI 就没东西可起名。 -->
        <!-- 内容排第一：它是唯一必填项，标题也是服务端读它生成的 -->
        <label class="field">
          <span class="field-label">内容 <i class="req">必填</i></span>
          <!-- 语音输入：录到的文字直接追加到正文末尾（不清空已写的内容） -->
          <div class="voice-box" :class="{ rec: voiceState === 'rec', busy: voiceState === 'busy' }">
            <textarea v-model="form.content" rows="3" placeholder="写下这段记忆..."></textarea>
            <button
              class="voice-btn"
              type="button"
              :disabled="voiceState === 'busy'"
              :title="voiceState === 'rec' ? '点击结束并转成文字' : '点击开始说话，说完再点一下'"
              @click.prevent="onVoiceClick"
            >
              <span v-if="voiceState === 'busy'" class="voice-spin" aria-hidden="true"></span>
              <span v-else class="voice-mic" aria-hidden="true">🎙</span>
              <span class="voice-txt">{{ voiceLabel }}</span>
              <span v-if="voiceState === 'rec'" class="voice-dot" aria-hidden="true"></span>
            </button>
          </div>
          <p v-if="voiceState === 'rec'" class="voice-hint">
            正在听… 还有 {{ VOICE_MAX_SEC - voiceSeconds }} 秒自动结束，说完点一下话筒即可
          </p>
        </label>

        <!-- ★ 2026-10-27 这里原来是个 <label>，害了个隐蔽的 bug：
             <label> 会把「点到自己内部非控件区域」的点击转发给它关联的第一个控件 ——
             也就是里面那个「🏝 新建岛屿」按钮。于是切到「已有岛屿」、在下拉里选一座岛之后，
             tab 又被这层转发顶回「新建岛屿」，保存时等于新建了一座空岛。
             这一项本来也不需要 label 关联（不是文本输入），改成 <div> 后彻底没有转发行为。 -->
        <div class="field">
          <span class="field-label">所属空间（保存后放入哪座岛屿）</span>
          <!-- 两步选岛: 先选「新建岛屿」还是「已有岛屿」; 选已有则列出「我的记忆空间」里已有的岛, 一座都没有时提示"暂时还没有" -->
          <div class="space-target">
            <div class="st-tabs">
              <button type="button" :class="{ on: spaceTarget.mode === 'new' }" @click="setTargetMode('new')">
                🏝 新建岛屿
              </button>
              <button
                type="button"
                :class="{ on: spaceTarget.mode === 'existing' }"
                @click="setTargetMode('existing')"
              >
                📚 已有岛屿
              </button>
            </div>
            <template v-if="spaceTarget.mode === 'new'">
              <input
                v-model="spaceTarget.newName"
                type="text"
                maxlength="24"
                :placeholder="`新岛屿名称（留空则默认为：我的第 ${mySpaces.length + 1} 座岛）`"
              />
            </template>
            <template v-else>
              <!-- ★ 自己画下拉（2026-10-27）：原生 <select> 的展开浮层在 Windows/Edge 上由系统绘制，
                   只认 background-color，选中项永远是系统灰底白字（截图里那条灰的），
                   改不出「和触发器同色系、再浅一档」的效果。所以改成自定义列表。 -->
              <div v-if="mySpaces.length" class="st-dd">
                <button
                  class="st-dd-trigger"
                  type="button"
                  :aria-expanded="stOpen"
                  @click.stop="stOpen = !stOpen"
                >
                  <span class="st-dd-cur">{{ curSpaceText }}</span>
                  <svg class="st-dd-chev" :class="{ up: stOpen }" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <transition name="dd-pop">
                  <ul v-if="stOpen" class="st-dd-list" role="listbox">
                    <li
                      v-for="s in mySpaces"
                      :key="s.id"
                      role="option"
                      :aria-selected="Number(s.id) === Number(spaceTarget.existingId)"
                      :class="{ on: Number(s.id) === Number(spaceTarget.existingId) }"
                      @click.stop="pickSpace(s)"
                    >
                      {{ s.name }}（{{ s.item_count || 0 }}/{{ ROOM_CAPACITY }} 条记忆{{
                        islandFull(s) ? ' · 已满' : ''
                      }}）
                    </li>
                  </ul>
                </transition>
              </div>
              <p v-else class="st-empty">暂时还没有岛屿，先新建一座吧 ✦</p>
            </template>
          </div>
        </div>
        <label class="field">
          <span class="field-label">日期</span>
          <input v-model="form.date" type="date" />
        </label>

        <!-- ★ 可见范围：按隐私设置「记忆可见性」走（2026-10-27）
             - 仅自己可见：不出现选择器，只提示一句；保存时 is_public 恒为 0
             - 创建时手动选择：出现两个选项，默认仍选「仅自己」，想公开才点第二个 -->
        <template v-if="!form.id">
          <div v-if="visMode === 'manual'" class="field">
            <span class="field-label">这条记忆谁能看见</span>
            <div class="vis-pick">
              <button
                class="vp-row"
                :class="{ on: !form.is_public }"
                type="button"
                @click="form.is_public = 0"
              >
                <i class="vp-dot"></i>
                <span class="vp-text">
                  <b>仅自己可见</b>
                  <span>只有你在记忆库里能看到这条</span>
                </span>
              </button>
              <button
                class="vp-row"
                :class="{ on: !!form.is_public }"
                type="button"
                @click="form.is_public = 1"
              >
                <i class="vp-dot"></i>
                <span class="vp-text">
                  <b>公开到拾光广场</b>
                  <span>其他人可以在广场看到并评论</span>
                </span>
              </button>
            </div>
          </div>
          <p v-else class="vis-note">
            🔒 按隐私设置「仅自己可见」，这条记忆保存后只有你能看到；想公开可以在记忆卡片上点「分享到广场」。
          </p>
        </template>

        <!-- 媒体: 照片可多张(≤9), 视频/音频各限一个; 存入数据库(memory_media type 1/3/2) -->
        <div class="field">
          <span class="field-label">照片（可多上传, 最多9张）</span>
          <div class="photo-row">
            <span v-if="!form.photos.length" class="photo-empty">未添加照片</span>
            <span v-for="(p, i) in form.photos" :key="i" class="photo-thumb">
              <img class="photo-preview" :src="p" alt="" />
              <button class="thumb-x" type="button" aria-label="移除这张图片" @click="removePhoto(i)">×</button>
            </span>
            <label v-if="form.photos.length < 9" class="photo-pick">
              请添加与记忆有关的图片
              <input type="file" accept="image/*" multiple @change="onPhotos" />
            </label>
          </div>
        </div>

        <div class="field">
          <span class="field-label">视频（最多1个）</span>
          <div class="photo-row">
            <span class="audio-name">{{ form.videoName || '未添加视频' }}</span>
            <label v-if="!form.video" class="photo-pick">
              请添加与记忆有关的视频
              <input type="file" accept="video/mp4,video/webm,video/quicktime" @change="onVideo" />
            </label>
            <button v-if="form.video" class="photo-remove" type="button" @click="clearVideo">
              移除
            </button>
          </div>
        </div>

        <div class="field">
          <span class="field-label">音频（最多1个）</span>
          <div class="photo-row">
            <span class="audio-name">{{ form.audioName || '未添加音频' }}</span>
            <label v-if="!form.audio" class="photo-pick">
              请添加与记忆有关的音频
              <input type="file" accept="audio/*" @change="onAudio" />
            </label>
            <button v-if="form.audio" class="photo-remove" type="button" @click="clearAudio">
              移除
            </button>
          </div>
        </div>
        <!-- ★ 2026-10-27 用户要求「记忆库的添加数据学习广场那个版式」：
             媒体区下面拉一条淡虚线，再用一句 ✨ 交代这条记忆会存到哪座岛、公开与否
             （对应广场弹窗的 .sq-dialog-hint），放在按钮上方，不和上面的可见性选择抢注意力。 -->
        <p class="dlg-dest">
          ✨ 保存后会存进记忆库 <b>{{ destName }}</b
          >，{{ form.is_public ? '同时出现在拾光广场; 之后在两处改的是同一条内容。' : '只有你自己能看到。' }}
        </p>
        <div class="dialog-actions">
          <button
            class="btn-cancel"
            type="button"
            :class="{ pressed: cancelPressed }"
            @pointerdown="cancelPressed = true"
            @pointerup="cancelPressed = false"
            @pointerleave="cancelPressed = false"
            @click="closeDialog"
          >
            取消
          </button>
          <!-- ★ 不再用 disabled 拦住"没填完"的情况：禁用的按钮点了没反应，用户不知道差什么。
               现在允许点，缺什么就用**另一种高亮**（红底下边框 + 抖动 + 一句说明）指出来。 -->
          <button
            class="btn-save"
            type="button"
            :class="{ warn: saveWarn, pressed: savePressed, busy: saving }"
            :disabled="saving"
            @pointerdown="savePressed = true"
            @pointerup="savePressed = false"
            @pointerleave="savePressed = false"
            @click="trySave"
          >
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
        <p v-if="saveHint" class="save-hint">{{ saveHint }}</p>
      </div>
    </div>

    <!-- 记忆详情弹窗 -->
    <div v-if="detailEntry" class="dialog-mask" @click.self="detailEntry = null">
      <div class="dialog detail-dialog">
        <div class="dialog-head">
          <span class="dialog-title">{{ detailEntry.title }}</span>
          <button class="dialog-close" type="button" aria-label="关闭" @click="detailEntry = null">x</button>
        </div>
        <div class="detail-meta">
          <span>{{ detailEntry.island || detailEntry.space }}</span>
          <span>{{ detailEntry.date }}</span>
        </div>
        <div v-if="detailPhotos.length" class="detail-photo detail-photo-scroll">
          <img v-for="(p, i) in detailPhotos" :key="i" :src="p" alt="" loading="lazy" decoding="async" />
        </div>
        <!-- AI 产出：封面图 / AI 视频。与用户自己传的照片分开展示，并注明来源 -->
        <div v-if="detailEntry.aiCover || detailEntry.aiVideo" class="detail-ai">
          <p class="detail-ai-head">✨ AI 生成</p>
          <img v-if="detailEntry.aiCover" :src="assetSrc(detailEntry.aiCover)" alt="AI 封面" />
          <video v-if="detailEntry.aiVideo" :src="assetSrc(detailEntry.aiVideo)" controls playsinline preload="metadata"></video>
        </div>
        <div class="detail-content">{{ detailEntry.content }}</div>
        <!-- 生成公开分享链接：拿到链接的人不用登录也能看这一条，
             出现在的「我的 → 隐私设置 → 分享管理」里，可随时取消。 -->
        <div v-if="!browseUid" class="detail-acts">
          <button
            class="detail-share"
            type="button"
            :disabled="shareBusy"
            @click="makeShareLink(detailEntry)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
              <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
            </svg>
            {{ shareBusy ? '正在生成…' : '生成分享链接' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 分享链接弹层：链接可复制，关闭后还能在分享管理里再拿 -->
    <div v-if="shareLink" class="sl-mask" @click.self="shareLink = ''">
      <div class="sl-card">
        <p class="sl-title">分享链接已生成</p>
        <p class="sl-sub">把链接发给朋友，对方不用登录就能看到这一条</p>
        <input
          class="sl-input"
          :value="shareLink"
          readonly
          @focus="$event.target.select()"
          @click="$event.target.select()"
        />
        <div class="sl-acts">
          <button class="sl-btn" type="button" @click="shareLink = ''">关闭</button>
          <button class="sl-btn primary" type="button" @click="copyShareLink">复制链接</button>
        </div>
        <p class="sl-tip">随时可在「我的 → 隐私设置 → 分享管理」里取消或删除</p>
      </div>
    </div>

    <!-- 删除记忆二次确认（★ 2026-10-29，对应验证报告 FIND-03）：
         原来点「删除」立刻调接口，只弹一个「已删除」提示，误触就没了（不可恢复）。
         同一产品里「删除小岛 / 删除反馈 / 删除所有数据」都有确认，这里补齐并保持一致。 -->
    <div v-if="delTarget" class="sl-mask" @click.self="delTarget = null">
      <div class="sl-card">
        <p class="sl-title">删除这条记忆？</p>
        <p class="sl-sub">
          「{{ delTarget.title || '未命名记忆' }}」删除后无法恢复，附带的照片、音频也会一起删掉。
        </p>
        <div class="sl-acts">
          <button class="sl-btn" type="button" @click="delTarget = null">取消</button>
          <button class="sl-btn danger" type="button" :disabled="deleting" @click="doRemove">
            {{ deleting ? '删除中…' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 粉丝名单: 只有本人能打开(他人视角服务端不返回名单) -->
    <div v-if="showFans" class="fans-mask" @click.self="showFans = false">
      <div class="fans-card">
        <div class="fans-head">
          <span class="fans-title">谁关注我</span>
          <button class="fans-close" type="button" aria-label="关闭" @click="showFans = false">×</button>
        </div>
        <p class="fans-sub">共 {{ fansCount }} 位朋友把你的日子悄悄收进了口袋</p>
        <div class="fans-list">
          <p v-if="fansLoading" class="fans-empty">正在翻看名单…</p>
          <p v-else-if="!fansList.length" class="fans-empty">
            还没有人关注你，把一条回忆分享到广场，就会有人看见你
          </p>
          <div v-for="f in fansList" :key="f.user_id" class="fans-row">
            <span class="fans-ava" :style="fansAvaStyle(f.name)">{{ (f.name || '匿')[0] }}</span>
            <span class="fans-name">{{ f.name }}</span>
            <i v-if="f.followed" class="fans-mutual">互相关注</i>
            <div class="fans-ops">
              <button class="fans-dm" type="button" @click="openDm(f)">
                私信<i v-if="f.unread" class="fans-dm-dot">{{ f.unread }}</i>
              </button>
              <button class="fans-visit" type="button" @click="visitFan(f)">记忆空间</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 私信面板: 从粉丝名单点进来, 是一对一对话(历史 + 输入框) -->
    <div v-if="dmTo" class="dm-mask" @click.self="closeDm">
      <div class="dm-card">
        <div class="dm-head">
          <span class="dm-ava" :style="fansAvaStyle(dmTo.name)">{{ (dmTo.name || '匿')[0] }}</span>
          <div class="dm-meta">
            <b>{{ dmTo.name }}</b>
            <span>{{ dmTo.followed ? '你们互相关注' : 'TA 关注了你' }}</span>
          </div>
          <button class="dm-close" type="button" aria-label="关闭" @click="closeDm">×</button>
        </div>

        <div ref="dmBodyRef" class="dm-thread">
          <p v-if="dmLoading" class="dm-hint">正在打开对话…</p>
          <p v-else-if="!dmThread.length" class="dm-hint">还没有聊过，先说句话吧</p>
          <div
            v-for="m in dmThread"
            :key="m.id"
            class="dm-bubble"
            :class="{ mine: m.sender_id === myUid }"
          >
            <p>{{ m.content }}</p>
            <time>{{ fmtDmTime(m.created_at) }}</time>
          </div>
        </div>

        <div class="dm-compose">
          <textarea
            v-model="dmText"
            class="dm-input"
            rows="2"
            :maxlength="DM_MAX_LEN"
            placeholder="写一段温柔的私信…"
            @keydown.enter.exact.prevent="sendDm"
          ></textarea>
          <button class="dm-send" type="button" :disabled="!dmText.trim() || dmSending" @click="sendDm">
            {{ dmSending ? '发送中…' : '发送' }}
          </button>
        </div>
        <p v-if="dmText.length" class="dm-count" :class="{ over: dmText.length >= DM_MAX_LEN }">
          {{ dmText.length }}/{{ DM_MAX_LEN }}
        </p>
      </div>
    </div>

    <!-- 岛屿已满：请选择其他岛屿或新建一座 -->
    <div v-if="overflowIsland" class="dialog-mask" @click.self="overflowIsland = null">
      <div class="dialog ai-dialog">
        <div class="dialog-head">
          <span class="dialog-title">这座岛屿已经满了</span>
          <button class="dialog-close" type="button" aria-label="关闭" @click="overflowIsland = null">×</button>
        </div>
        <p class="ai-lead">
          「{{ overflowIsland.name }}」已有 {{ overflowIsland.count }} 条记忆，达到了每座岛
          {{ ROOM_CAPACITY }} 条的上限（每条记忆会变成房间里的一件 3D 物品）。
        </p>
        <p class="ai-sub">请选择其他岛屿，或新建一座岛屿来安放这条记忆。</p>
        <div class="dialog-actions">
          <button class="btn-cancel" type="button" @click="overflowPickOther">选择其他岛屿</button>
          <button class="btn-save" type="button" @click="overflowPickNew">新建岛屿</button>
        </div>
      </div>
    </div>

    <!-- 保存后的 AI 增强选项（可多选；无论管理员开没开权限都要弹，
         没开通的项也列出来，勾选时提示无权限、确认时跳过） -->
    <div v-if="aiAssist" class="dialog-mask" @click.self="!aiBusy && (aiAssist = null)">
      <div class="dialog ai-dialog">
        <div class="dialog-head">
          <span class="dialog-title">还要为这条记忆加点什么？</span>
          <button class="dialog-close" type="button" aria-label="关闭" :disabled="aiBusy" @click="aiAssist = null">×</button>
        </div>
        <p class="ai-lead">{{ aiLead }}</p>
        <ul class="ai-opts">
          <li>
            <label class="ai-opt" :class="{ off: !aiPerm.image }">
              <input
                v-model="aiAssist.image"
                type="checkbox"
                :disabled="aiBusy"
                @change="onAiOptChange('image')"
              />
              <span class="ai-opt-text">
                <b>AI 生成封面图片</b>
                <i>为这条记忆画一张插图（约 10 秒）</i>
                <em v-if="!aiPerm.image" class="ai-opt-off">管理员未开启这项权限</em>
              </span>
            </label>
          </li>
          <li>
            <label class="ai-opt" :class="{ off: !aiPerm.video }">
              <input
                v-model="aiAssist.video"
                type="checkbox"
                :disabled="aiBusy"
                @change="onAiOptChange('video')"
              />
              <span class="ai-opt-text">
                <b>AI 生成视频</b>
                <i>把记忆变成一小段流动的画面（约 1~2 分钟）</i>
                <em v-if="!aiPerm.video" class="ai-opt-off">管理员未开启这项权限</em>
              </span>
            </label>
          </li>
          <li>
            <label class="ai-opt" :class="{ off: !aiPerm.reply }">
              <input
                v-model="aiAssist.polish"
                type="checkbox"
                :disabled="aiBusy"
                @change="onAiOptChange('polish')"
              />
              <span class="ai-opt-text">
                <b>润色文字</b>
                <i>把正文润色得更通顺、更有画面感，保留原意</i>
                <em v-if="!aiPerm.reply" class="ai-opt-off">管理员未开启这项权限</em>
              </span>
            </label>
          </li>
        </ul>
        <div class="dialog-actions">
          <button class="btn-cancel" type="button" :disabled="aiBusy" @click="aiAssist = null">暂不需要</button>
          <!-- ★ 一个都没勾就不给点（2026-10-27 用户要求）：默认三项全不选，
               直接点"开始生成"什么也不会发生，按钮必须先置灰。 -->
          <button
            class="btn-save"
            type="button"
            :disabled="aiBusy || !aiAnyPicked"
            :title="aiAnyPicked ? '' : '先勾选至少一项 AI 能力'"
            @click="runAiAssist"
          >
            {{ aiBusy ? '处理中…' : '开始生成' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 通用操作提示：右上角小胶囊浮层。
         ★ 原来是顶部通栏的蓝色横幅（#3d6bd8 铺满整条），视觉压迫感很强，
           用户反馈要清掉 —— 改成不抢视线的小胶囊。 -->
    <Transition name="mem-toast">
      <div v-if="tipText" class="mem-toast">{{ tipText }}</div>
    </Transition>

    <!-- AI 生成进度卡：图片 / 视频 / 润色各自显示
         「开始生成 → 生成中 → 生成完成」（失败则显示失败）。
         弹窗关掉后这张卡仍然留着，视频是分钟级任务，用户能看到它跑完。 -->
    <Transition name="mem-toast">
      <div v-if="aiTasks.length" class="ai-progress">
        <p class="ap-head">
          <span class="ap-title">AI 正在处理「{{ aiTaskTitle }}」</span>
          <button
            v-if="!aiRunning"
            class="ap-close"
            type="button"
            title="收起"
            @click="aiTasks = []"
          >
            ×
          </button>
        </p>
        <ul class="ap-list">
          <li v-for="t in aiTasks" :key="t.key" class="ap-item" :class="'is-' + t.state">
            <span class="ap-dot" aria-hidden="true"></span>
            <span class="ap-label">{{ t.label }}</span>
            <span class="ap-state">{{ aiStateText(t) }}</span>
            <em v-if="t.state === 'fail' && t.err" class="ap-err">{{ t.err }}</em>
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMemoriesStore, TIME_OPTIONS } from '@/stores/memories'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { cloudApi } from '@/api/cloud'
import { useDebouncedRef, throttleSubmit } from '@/composables/useRateLimit'
import { ISLAND_OPTIONS } from '@/data/islands'
import { generateMemoryCover, getLastCoverError, isPermissionDenied } from '@/api/aiCover'
import { chatWithDeepSeek, refreshAiStatus, aiPermInfo } from '@/api/deepseek'
import { useVoiceInput, VOICE_MAX_SEC } from '@/composables/useVoiceInput'
import IdleThought from './idleThought.vue'

const store = useMemoriesStore()
const auth = useCloudAuthStore()
const route = useRoute()
const router = useRouter()

// 浏览他人公开记忆模式: 路由带 uid 时只展示该用户的公开内容(只读)
const browseUid = computed(() => route.query.uid || '')
const browseName = ref('')
const browseEntries = ref([])

function mapPublic(r) {
  const media = Array.isArray(r.media) ? r.media : []
  const photo = media.find((m) => m.type === 1)
  return {
    id: r.id,
    title: r.title,
    date: r.entry_date || '',
    space: r.space_name || '',
    type: r.type || '其他',
    content: r.content || '',
    photo: photo?.url || '',
    audio: '',
    audioName: '',
    is_public: true,
    created_at: r.created_at,
  }
}

async function loadBrowse() {
  browseEntries.value = []
  try {
    const rows = await cloudApi.listUserPublic({ user_id: browseUid.value })
    browseEntries.value = (rows || []).map(mapPublic)
    if (!browseName.value) browseName.value = rows?.[0]?.author_nickname || 'TA'
  } catch (e) {
    browseEntries.value = []
    tip(e.message || '加载公开记忆失败')
  }
}

function exitBrowse() {
  router.push({ name: 'memory' })
}

// 数据源: 浏览模式用他人公开条目, 否则用自己的记忆库
const sourceEntries = computed(() => (browseUid.value ? browseEntries.value : store.entries))

// 操作提示横幅
const tipText = ref('')
let tipTimer = null
function tip(text) {
  tipText.value = text
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => {
    tipText.value = ''
  }, 2200)
}

// ---- 粉丝: 自己能看到具体名单, 看别人只看到数量 ----
const fansCount = ref(0)
const fansList = ref([])
const fansLoading = ref(false)
const showFans = ref(false)

async function loadFansCount() {
  try {
    // browseUid 为空 = 看自己; 服务端只在「自己就是被关注者」时才返回名单
    const data = await cloudApi.listFollowers({ user_id: browseUid.value || 0 })
    fansCount.value = data?.count || 0
    fansList.value = data?.list || []
  } catch {
    // 未登录/网络异常时静默: 粉丝数不是本页主内容, 不该拖垮记忆库
    fansCount.value = 0
    fansList.value = []
  }
}

async function openFans() {
  // 别人主页上的粉丝数只给数字, 名单不公开(服务端同样只给数量)
  if (browseUid.value) {
    tip(`${browseName.value || 'TA'} 有 ${fansCount.value} 位粉丝，粉丝名单不公开`)
    return
  }
  showFans.value = true
  fansLoading.value = true
  try {
    await loadFansCount()
  } finally {
    fansLoading.value = false
  }
}

// 昵称首字哈希出色相, 与广场/作者卡同一套配色逻辑
function fansAvaStyle(name) {
  const hue = ((name || '匿').charCodeAt(0) * 7) % 360
  return { background: `linear-gradient(135deg, hsl(${hue} 80% 78%), hsl(${(hue + 40) % 360} 70% 66%))` }
}

// 名单里点某人 -> 进入对方的公开记忆库(只读)
function visitFan(f) {
  showFans.value = false
  router.push({ name: 'memory', query: { uid: f.user_id, uname: f.name || '' } })
}

// ---- 私信: 与关注自己的人一对一对话 ----
// 复用既有 pm/* 接口: 打开时按 user_id 拉这段对话, 发完就地追加气泡(服务端回传 id/时间)
const DM_MAX_LEN = 500
const myUid = computed(() => auth.user?.id || 0)
const dmTo = ref(null)
const dmThread = ref([])
const dmText = ref('')
const dmLoading = ref(false)
const dmSending = ref(false)
const dmBodyRef = ref(null)

function fmtDmTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function scrollDmToBottom() {
  // 等 DOM 更新完再滚, 否则新气泡还没进布局
  requestAnimationFrame(() => {
    const el = dmBodyRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function openDm(f) {
  if (!auth.isLogin) {
    auth.openAuth()
    tip('登录后才能发私信')
    return
  }
  dmTo.value = { user_id: f.user_id, name: f.name || 'TA', followed: !!f.followed }
  dmThread.value = []
  dmText.value = ''
  dmLoading.value = true
  try {
    const list = await cloudApi.listPm({ user_id: f.user_id })
    dmThread.value = list || []
    // 打开了就是看过了: 顺手把 TA 发来的消息标为已读, 名单里的红点也要跟着消
    if (f.unread) {
      cloudApi.markPmRead({ user_id: f.user_id }).catch(() => {})
      f.unread = 0
    }
    scrollDmToBottom()
  } catch (e) {
    tip(e.message || '打开对话失败')
  } finally {
    dmLoading.value = false
  }
}

function closeDm() {
  dmTo.value = null
  dmThread.value = []
  dmText.value = ''
}

async function sendDm() {
  const text = dmText.value.trim()
  if (!text || !dmTo.value || dmSending.value) return
  if (text.length > DM_MAX_LEN) {
    tip(`私信不能超过 ${DM_MAX_LEN} 个字`)
    return
  }
  dmSending.value = true
  try {
    const res = await cloudApi.sendPm({ receiver_id: dmTo.value.user_id, content: text })
    dmThread.value.push({
      id: res?.id || `local-${Date.now()}`,
      sender_id: myUid.value,
      receiver_id: dmTo.value.user_id,
      content: text,
      created_at: res?.created_at || Date.now(),
      is_read: 0,
    })
    dmText.value = ''
    scrollDmToBottom()
    tip(`已给 ${dmTo.value.name} 发送私信`)
  } catch (e) {
    tip(e.message || '发送失败')
  } finally {
    dmSending.value = false
  }
}

// 记忆库数据来自服务器: 每个用户一份, 登录后加载; 浏览模式则拉取他人公开记忆
onMounted(() => {
  loadFansCount()
  // 探测本用户可用的 AI 能力（总开关 × 用户级开关），供「保存后 AI 选项」使用
  loadAiPerm()
  // 从首页「记忆地图」点进来会带 ?island=小岛名，直接定位到那座岛
  const wantIsland = typeof route.query.island === 'string' ? route.query.island.trim() : ''
  // 广场卡片「⋯ → 修改」会带 ?edit=<记忆 id> 跳过来：
  // 正文只有一份(在记忆库), 所以广场不另做编辑器, 直接在这里打开同一条的修改弹窗。
  const wantEdit = Number(route.query.edit) || 0
  // 广场横幅「分享一段时光」带 ?compose=1 跳过来: 直接打开写日记的弹窗
  const wantCompose = route.query.compose === '1'
  if (browseUid.value) {
    browseName.value = route.query.uname || ''
    loadBrowse()
  } else {
    store
      .load(true)
      .then(() => {
        if (wantCompose) openAdd()
        if (!wantEdit) return
        const hit = store.entries.find((e) => Number(e.id) === wantEdit)
        if (hit) openEdit(hit)
        else tip('这条记忆可能已经被删除了')
      })
      .catch((e) => tip(e.message || '加载记忆失败'))
  }
  if (wantIsland) {
    // 数据是异步来的，等下一拍让 islandOptions 先算出来再决定能不能落到这个值上
    setTimeout(() => {
      if (islandOptions.value.includes(wantIsland)) island.value = wantIsland
    }, 300)
  }
  // 兼容旧的 ?share=1 入口(广场那边已经没有「共享记忆」按钮了): 提示一下怎么分享
  if (route.query.share === '1') {
    setTimeout(() => tip('挑一条回忆，点卡片上的「分享到广场」，它就会出现在广场信息流里'), 500)
  }
})

// 从别处(广场/首页/另一个标签页)回到记忆库时重新拉一次:
// 记忆库现在和「拾光广场」共用同一批记忆, 切回来必须看到最新条数,
// 否则会出现「广场明明发了, 记忆库还是空」(2026-10-21 用户反馈)。
let lastHiddenAt = 0
function onMemoryVisible() {
  if (document.visibilityState !== 'visible') {
    lastHiddenAt = Date.now()
    return
  }
  if (Date.now() - lastHiddenAt < 3000) return
  if (browseUid.value) loadBrowse()
  else store.load(true).catch(() => {})
}
onMounted(() => {
  document.addEventListener('visibilitychange', onMemoryVisible)
  document.addEventListener('click', onDocClickForDd)
})
onUnmounted(() => {
  document.removeEventListener('visibilitychange', onMemoryVisible)
  document.removeEventListener('click', onDocClickForDd)
})

watch(browseUid, (uid) => {
  // 换人浏览/回到自己, 粉丝数与名单都要跟着换
  loadFansCount()
  if (uid) {
    browseName.value = route.query.uname || ''
    loadBrowse()
  } else {
    browseEntries.value = []
    store.load(true).catch((e) => tip(e.message || '加载记忆失败'))
  }
})

// 背景图右下角睡猫的随机想法
const CAT_THOUGHTS = [
  '这本日记…写的是我?',
  '睡前的记忆最温柔了…',
  '嗯…这条记忆有小鱼干味…',
  '再眯一会…就一会…',
  '呼噜…呼噜…',
]

// 搜索关键词: 输入即时响应, 列表过滤经防抖, 避免逐字重算
const { source: keyword, debounced: keywordDeb } = useDebouncedRef('', 200)
const openMenu = ref('')

// 第一栏默认项：用「全部空间」而不是「全部记忆空间」——
// 按钮宽度是按背景图定位的百分比，6 个字会被省略号截断，4 个字刚好完整显示
const ALL_SPACE = '全部空间'
// 所属空间由用户输入, 筛选选项从已有数据动态生成
const spaceOptions = computed(() => [ALL_SPACE, ...new Set(sourceEntries.value.map((e) => e.space))])

// 第二栏「小岛」：选项就是你已有小岛的名字（岛上得真有记忆，空岛不列）
const ALL_ISLAND = '全部小岛'
const islandOptions = computed(() => [ALL_ISLAND, ...new Set(sourceEntries.value.map((e) => e.island).filter(Boolean))])
const timeOptions = TIME_OPTIONS

const space = ref(ALL_SPACE)
const island = ref(ALL_ISLAND)
const time = ref(timeOptions[0])

const pickers = { space, island, time }

function toggle(menu) {
  openMenu.value = openMenu.value === menu ? '' : menu
}

function pick(field, value) {
  pickers[field].value = value
  openMenu.value = ''
}

function inTime(date, range) {
  const target = new Date(date).getTime()
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 86400000
  if (range === '今天') return target >= startOfDay
  if (range === '本周') return target >= startOfDay - 6 * day
  if (range === '本月') {
    const d = new Date(date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }
  return true
}

// ★ 2026-10-29 语义搜索兜底
// 字面搜索只比标题/类型/空间名/小岛名（连正文都不搜）：「大理」永远搜不到
// 「那天风很大，我们坐在洱海边」。所以字面一条都不命中时，交给服务端按**意思**找——
// 用的是 3D 摆件那套 text-embedding-v3（server/memorySearch.js）。
// 只在"搜不到"时触发：常规搜索零延迟，也不白花向量额度。
const semanticIds = ref(null) // null = 没走兜底 | Set = 意思相近的记忆 id
const semSearching = ref(false)
const semDisabled = ref(false)
let semSeq = 0

// 字面命中条数：不套空间/岛屿/时间筛选，只判断"这个词本身有没有搜到东西"
const literalHitCount = computed(() => {
  const k = keywordDeb.value
  if (!k) return 0
  return sourceEntries.value.filter(
    (e) =>
      String(e.title || '').includes(k) ||
      String(e.type || '').includes(k) ||
      String(e.space || '').includes(k) ||
      String(e.island || '').includes(k),
  ).length
})

async function runSemanticSearch() {
  const k = keywordDeb.value.trim()
  const my = ++semSeq
  if (!k || literalHitCount.value) {
    semanticIds.value = null
    semSearching.value = false
    return
  }
  semSearching.value = true
  try {
    const r = await cloudApi.semanticSearch({ q: k })
    if (my !== semSeq) return
    semDisabled.value = !!r?.disabled
    semanticIds.value = new Set(Array.isArray(r?.ids) ? r.ids : [])
  } catch {
    if (my !== semSeq) return
    semanticIds.value = null
  } finally {
    if (my === semSeq) semSearching.value = false
  }
}
watch([keywordDeb, literalHitCount], runSemanticSearch)

const semHint = computed(() => {
  if (semSearching.value) return '正在按意思找相近的记忆…'
  if (semDisabled.value) return '换个具体的词试试，或清空搜索看全部记忆'
  return '换个说法试试，或清空搜索看全部记忆'
})

// 搜索(标题/类型/所属空间/小岛) + 三个筛选共同作用于列表
const filtered = computed(() =>
  sourceEntries.value.filter((e) => {
    if (keywordDeb.value) {
      const k = keywordDeb.value
      // 几个字段都做空值兜底：老数据里 type/island 可能为空，直接 includes 会抛错
      const hit =
        String(e.title || '').includes(k) ||
        String(e.type || '').includes(k) ||
        String(e.space || '').includes(k) ||
        String(e.island || '').includes(k)
      // 字面没命中就看语义兜底的结果（两条都没有才算真没找到）
      if (!hit) {
        const sem = semanticIds.value
        if (!sem || !sem.has(e.id)) return false
      }
    }
    if (space.value !== ALL_SPACE && e.space !== space.value) return false
    if (island.value !== ALL_ISLAND && e.island !== island.value) return false
    if (time.value !== timeOptions[0] && !inTime(e.date, time.value)) return false
    return true
  }),
)

// 这条是"字面没命中、靠意思找出来的"（只在这种卡片上打标，字面命中的不必标）
function isSemanticHit(e) {
  const sem = semanticIds.value
  if (!sem || !sem.has(e.id)) return false
  const k = keywordDeb.value
  if (!k) return false
  return !(
    String(e.title || '').includes(k) ||
    String(e.type || '').includes(k) ||
    String(e.space || '').includes(k) ||
    String(e.island || '').includes(k)
  )
}

// 时光统计：按**小岛**统计你写下的记忆条数（原来按 type，而 type 早就不能填了，永远只有"其他"）
const stats = computed(() => {
  const byIsland = {}
  for (const e of sourceEntries.value) {
    const k = e.island || e.space || '未命名小岛'
    byIsland[k] = (byIsland[k] ?? 0) + 1
  }
  return byIsland
})

// ---- 添加/修改小弹窗 ----
// ★ 表单里已经没有 标题 / 类型 / 内容种类(kind) / 作者 了：
//   标题由服务端读 content 用 AI 生成（server/index.js 的 generateTitle），
//   所以 emptyForm 里也不再有这些键 —— 保存时自然不会把它们提交上去。
// 本地日期(YYYY-MM-DD)。★ 不能用 toISOString(): 那是 UTC, 国内 00:00~08:00 写记忆
// 会被记成"昨天", 记忆库里看到日期差一天。
function today() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function emptyForm() {
  return {
    id: null,
    // 默认落在第一个主题屿; select 只认 ISLAND_OPTIONS 里的值, 空串会导致显示与数据不一致
    space: ISLAND_OPTIONS[0],
    date: today(),
    content: '',
    photo: '',
    photos: [],
    video: '',
    videoName: '',
    audio: '',
    audioName: '',
    // ★ 新建记忆默认「仅自己可见」。隐私设置里选「创建时手动选择」时，
    //   弹窗会多出一个可见范围选择器，把这个值改成 1 才会公开到广场。
    is_public: 0,
  }
}

const showDialog = ref(false)
const form = ref(emptyForm())

// ---- 隐私设置里的「新建记忆的默认可见性」----
// 'self'   = 仅自己可见：新建的记忆一律私密，弹窗里只给一句说明
// 'manual' = 创建时手动选择：弹窗里出现「这条记忆谁能看见」，由用户当次决定
// ★ 2026-10-27：之前这两个单选项只写进了 user_settings，前端从来没人读，所以怎么点都没效果。
const visMode = ref('self')
async function loadVisMode() {
  if (!auth.isLogin) {
    visMode.value = 'self'
    return
  }
  try {
    const s = await cloudApi.getSettings()
    visMode.value = s?.default_vis === 'manual' ? 'manual' : 'self'
  } catch {
    // 读不到设置时按"仅自己可见"处理：宁可存得更严，用户随时能手动分享
    visMode.value = 'self'
  }
}

// ---- 弹窗拖动: 按住标题栏拖动, 用 translate 偏移实现(标题栏上的关闭按钮不参与拖动) ----
const dialogDrag = ref({ x: 0, y: 0 })
let dialogDragState = null
const dialogDragStyle = computed(() =>
  dialogDrag.value.x || dialogDrag.value.y
    ? { transform: `translate(${dialogDrag.value.x}px, ${dialogDrag.value.y}px)` }
    : {}
)
function onDialogDragStart(e) {
  if (e.target.closest('button')) return
  dialogDragState = {
    sx: e.clientX,
    sy: e.clientY,
    ox: dialogDrag.value.x,
    oy: dialogDrag.value.y,
  }
  window.addEventListener('pointermove', onDialogDragMove)
  window.addEventListener('pointerup', onDialogDragEnd)
}
function onDialogDragMove(e) {
  if (!dialogDragState) return
  dialogDrag.value = {
    x: dialogDragState.ox + (e.clientX - dialogDragState.sx),
    y: dialogDragState.oy + (e.clientY - dialogDragState.sy),
  }
}
function onDialogDragEnd() {
  dialogDragState = null
  window.removeEventListener('pointermove', onDialogDragMove)
  window.removeEventListener('pointerup', onDialogDragEnd)
}

// ---- 两步选岛: 保存时决定记忆放入哪座岛屿 ----
// mode='new'   新建一座岛(名字取自输入, 留空则自动命名); 后端按名字自动建空间
// mode='existing' 选「我的记忆空间」里已有的岛; 若一座都没有, 界面提示"暂时还没有"
const mySpaces = ref([])
const spaceTarget = ref({ mode: 'new', newName: '', existingId: null })
// 自定义岛屿下拉的展开状态（原生 <select> 的下拉浮层颜色改不动，见模板注释）
const stOpen = ref(false)
const curSpaceText = computed(() => {
  const s = mySpaces.value.find((x) => Number(x.id) === Number(spaceTarget.value.existingId))
  if (!s) return '请选择一座岛屿'
  return `${s.name}（${s.item_count || 0}/${ROOM_CAPACITY} 条记忆${islandFull(s) ? ' · 已满' : ''}）`
})
// 弹窗底部「这条会存到哪」要显示的岛名：选已有的取名字，新建的取输入框（留空就用默认名）
const destName = computed(() => {
  if (spaceTarget.value.mode === 'new') {
    return spaceTarget.value.newName.trim() || `我的第 ${mySpaces.value.length + 1} 座岛`
  }
  const s = mySpaces.value.find((x) => Number(x.id) === Number(spaceTarget.value.existingId))
  return s?.name || '所选岛屿'
})
function pickSpace(s) {
  spaceTarget.value.existingId = s.id
  stOpen.value = false
}
function onDocClickForDd(e) {
  if (stOpen.value && !e.target.closest('.st-dd')) stOpen.value = false
}

async function loadMySpaces() {
  try {
    mySpaces.value = (await cloudApi.listSpaces()) || []
  } catch {
    mySpaces.value = []
  }
}

// 把两步选择解析成最终要保存的「空间名」(后端 ensureSpace 按名建/找 —— 只在"新建"时才用到)
const resolvedSpaceName = computed(() => {
  if (spaceTarget.value.mode === 'new') {
    return (spaceTarget.value.newName || '').trim() || `我的第 ${mySpaces.value.length + 1} 座岛`
  }
  const s = mySpaces.value.find((x) => Number(x.id) === Number(spaceTarget.value.existingId))
  return s ? s.name : ''
})

// 「已有岛屿」选中的空间 id(可能为空)
const existingSpaceId = computed(() =>
  spaceTarget.value.mode === 'existing' ? Number(spaceTarget.value.existingId) || 0 : 0,
)

function setTargetMode(mode) {
  spaceTarget.value.mode = mode
  stOpen.value = false
  if (mode === 'existing' && mySpaces.value.length && !spaceTarget.value.existingId) {
    // 优先选一座**没满**的岛；全都满了就停在列表第一座（选中时会立刻弹提示）
    const free = mySpaces.value.find((s) => !islandFull(s))
    spaceTarget.value.existingId = (free || mySpaces.value[0]).id
  }
}

// ---- 岛屿容量上限（与后端 MAX_ITEMS_PER_SPACE 严格保持一致）----
// 一间 3D 房间最多摆 13 件记忆家具；达到上限后不能再往这座岛里加。
const ROOM_CAPACITY = 13
// 用户选中了已满的岛时，用它驱动「请选择其他岛屿或新建岛屿」提示框
const overflowIsland = ref(null)
function islandCount(s) {
  return Number(s && s.item_count) || 0
}
function islandFull(s) {
  return islandCount(s) >= ROOM_CAPACITY
}
// 选中「已有岛屿」后立刻校验：选到满岛就弹框，并把选择切到一座没满的岛（没有则切到新建）
watch(
  () => spaceTarget.value.existingId,
  (id) => {
    if (!id || spaceTarget.value.mode !== 'existing') return
    const s = mySpaces.value.find((x) => Number(x.id) === Number(id))
    if (!s || !islandFull(s)) return
    overflowIsland.value = { name: s.name, count: islandCount(s) }
    const free = mySpaces.value.find((x) => !islandFull(x))
    if (free) spaceTarget.value.existingId = free.id
    else {
      spaceTarget.value.mode = 'new'
      spaceTarget.value.existingId = null
    }
  },
)

// 满岛提示框的两个出口：换一座没满的岛 / 直接去新建
function overflowPickOther() {
  overflowIsland.value = null
  spaceTarget.value.mode = 'existing'
  const free = mySpaces.value.find((x) => !islandFull(x))
  spaceTarget.value.existingId = free ? free.id : null
}
function overflowPickNew() {
  overflowIsland.value = null
  setTargetMode('new')
}

// ---- 保存后的 AI 增强选项 ----
// 需求（第二版）：保存后**无论管理员有没有开权限都要弹**这个多选框；
// 没开通的能力仍然列出来，勾选时提示「未获取到权限」，确认时跳过它。
const aiPerm = ref({ reply: false, image: false, video: false })
const aiAssist = ref(null) // { entry, image, video, polish } | null
const aiBusy = ref(false)
// 三项都没勾 → "开始生成"必须不可点（默认就是全不选，避免用户点了没反应）
const aiAnyPicked = computed(() => {
  const a = aiAssist.value
  return !!(a && (a.image || a.video || a.polish))
})
// 弹窗顶部说明：新建说「已经放进房间了」，修改说「修改已保存」
const aiLead = computed(() => {
  const a = aiAssist.value
  if (!a) return ''
  const name = a.entry?.title || '这条记忆'
  return a.mode === 'edit'
    ? `「${name}」的修改已保存。以下 AI 能力可以多选，也可以都不选。`
    : `「${name}」已经放进房间了。以下 AI 能力可以多选，也可以都不选。`
})

// ---- AI 生成进度卡 ----
// 图片 / 视频 / 润色各自的实时状态，让用户看得见「开始生成 → 生成中 → 生成完成」。
// state: wait 即将开始 | run 生成中 | done 生成完成 | fail 生成失败
const aiTasks = ref([])
const aiTaskTitle = ref('')
const aiRunning = computed(() =>
  aiTasks.value.some((t) => t.state === 'wait' || t.state === 'run'),
)
let aiClearTimer = null
// 全部跑完后再留 5 秒让用户看到「生成完成」，然后自动收起
watch(aiRunning, (run) => {
  clearTimeout(aiClearTimer)
  if (run) return
  if (!aiTasks.value.length) return
  aiClearTimer = setTimeout(() => {
    aiTasks.value = []
  }, 5000)
})

function aiStateText(t) {
  if (t.state === 'wait') return '开始生成'
  if (t.state === 'run') return '生成中…'
  if (t.state === 'done') return '生成完成'
  return '生成失败'
}

function aiSetState(key, state) {
  const t = aiTasks.value.find((x) => x.key === key)
  if (t) t.state = state
}

// 视频是分钟级异步任务：提交不等于完成，真正的完成由 store 轮询回来后告知
watch(
  () => store.lastVideoFinish,
  (n) => {
    if (!n || !n.at) return
    if (!aiTasks.value.some((t) => t.key === 'video')) return
    aiSetState('video', n.ok ? 'done' : 'fail')
  },
)

// 能力 → 中文名（提示用）
const AI_LABEL = { image: 'AI 封面图片', video: 'AI 记忆视频', polish: '文字润色' }
// 界面勾选字段 → 权限字段（润色走 reply 权限）
const AI_PERM_KEY = { image: 'image', video: 'video', polish: 'reply' }

async function loadAiPerm() {
  try {
    // ★ 必须 force：refreshAiStatus 会把结果缓存住，如果首次调用发生在登录前
    //   （aiPerm=null），之后一直返回 null，弹窗就永远判成"无权限"。强制刷新一次最稳。
    await refreshAiStatus(true)
    aiPerm.value = aiPermInfo()
  } catch {
    aiPerm.value = { reply: false, image: false, video: false }
  }
}

function aiOptionAllowed(kind) {
  return !!aiPerm.value[AI_PERM_KEY[kind]]
}

function openAiAssist(entry, mode = 'create') {
  // 需求：AI 生图 / 润色语言 / 生视频三项「默认为不选择」。
  // 一律全不勾，用户自己点，避免误触发额度和误生成。
  // ★ 2026-10-29：mode='edit' 是「修改后保存」也弹这个框（用户要求，替换原来只弹
  //   一句「修改已保存」的做法）。文案要区分「已放进房间」和「修改已保存」。
  aiAssist.value = {
    entry,
    mode,
    image: false,
    video: false,
    polish: false,
  }
}

// ---- 语音输入：说完转成文字，直接接在正文末尾（不清空已经手打的内容）----
const {
  state: voiceState,
  seconds: voiceSeconds,
  stop: voiceStop,
  cancel: voiceCancel,
  toggle: voiceToggle,
} = useVoiceInput({
  onText(text) {
    const cur = String(form.content || '').trimEnd()
    form.content = cur ? `${cur}\n${text}` : text
  },
  onError(msg) {
    tip(msg)
  },
})

const voiceLabel = computed(() => {
  if (voiceState.value === 'busy') return '识别中…'
  if (voiceState.value === 'rec') return `录音中 ${voiceSeconds.value}s`
  return '语音输入'
})

function onVoiceClick() {
  if (!auth.isLogin) {
    tip('请先登录后再使用语音输入')
    return
  }
  // 正在录音时点一下就结束并转文字（不搞长按，鼠标/触屏都能用）
  if (voiceState.value === 'rec') voiceStop()
  else voiceToggle()
}

// 勾选了没权限的项：立刻提示（需求：选择时提示没获取权限）
function onAiOptChange(kind) {
  const a = aiAssist.value
  if (!a || !a[kind]) return
  if (!aiOptionAllowed(kind)) {
    tip(`还没有获取到「${AI_LABEL[kind]}」的权限，需要管理员在管理中心开启`)
  }
}

async function runAiAssist() {
  const a = aiAssist.value
  if (!a || aiBusy.value) return
  const entry = a.entry
  const queue = []
  const denied = []
  if (a.image) {
    if (aiOptionAllowed('image')) queue.push('image')
    else denied.push(AI_LABEL.image)
  }
  if (a.video) {
    if (aiOptionAllowed('video')) queue.push('video')
    else denied.push(AI_LABEL.video)
  }
  if (a.polish) {
    if (aiOptionAllowed('polish')) queue.push('polish')
    else denied.push(AI_LABEL.polish)
  }
  if (!queue.length) {
    // 一个能用的都没选：直接关掉并说明原因，不必转圈
    tip(denied.length ? `未获取到「${denied.join('、')}」的权限，请让管理员开启后再试` : '没有选择任何 AI 处理')
    aiAssist.value = null
    return
  }
  aiBusy.value = true
  aiTaskTitle.value = entry.title || '这条记忆'
  aiTasks.value = queue.map((k) => ({ key: k, label: AI_LABEL[k], state: 'wait' }))
  // 弹窗让位给进度卡：视频是分钟级任务，不该把用户锁在弹窗里干等
  aiAssist.value = null
  try {
    await Promise.allSettled(queue.map((k, i) => runAiTask(k, entry, i)))
  } finally {
    aiBusy.value = false
  }
  if (denied.length) tip(`「${denied.join('、')}」未获取权限，已跳过`)
}

/**
 * 跑一项 AI 任务，并同步它在进度卡上的状态。
 * 逐个错开 260ms 起步：三个任务同时点亮再同时完成，进度卡就晃一下没意义了。
 */
async function runAiTask(kind, entry, i) {
  await new Promise((r) => setTimeout(r, i * 260))
  aiSetState(kind, 'run')
  try {
    if (kind === 'image') await runAiImage(entry)
    else if (kind === 'video') await runAiVideo(entry)
    else await runAiPolish(entry)
    // 视频提交完还在后台跑，完成状态由 lastVideoFinish 的 watch 来置
    if (kind !== 'video') aiSetState(kind, 'done')
  } catch (e) {
    aiSetState(kind, 'fail')
    // 把失败原因挂到卡片上 —— 只显示「生成失败」用户没法判断是权限、额度还是网络
    const t = aiTasks.value.find((x) => x.key === kind)
    if (t) t.err = e?.message || '未知错误'
    console.warn(`[AI] ${kind} 失败:`, e)
  }
}

// 三个执行体都不再自己吞掉异常：抛出去让 runAiTask 把进度卡标成「生成失败」
async function runAiImage(entry) {
  const cover = await generateMemoryCover(entry.title, entry.content, { force: true })
  const err = getLastCoverError()
  const denied = !cover && isPermissionDenied(err)
  await cloudApi.updateItem({ id: entry.id, ai_cover: cover || '', ai_denied: denied ? 1 : 0 })
  const idx = store.entries.findIndex((e) => e.id === entry.id)
  if (idx >= 0) {
    if (cover) store.entries[idx].aiCover = cover
    store.entries[idx].aiDenied = denied
  }
  if (entry) entry.aiCover = cover || entry.aiCover
  if (!cover) {
    if (denied) throw new Error('管理员未开启 AI 生图权限')
    throw new Error(err || '没有拿到图片')
  }
  // 出图失败时 generateMemoryCover 会退回本地 Canvas 配色封面（dataURL）。
  // 仍然存下来（总比没有好），但要如实告诉用户这次不是 AI 画的。
  if (err) tip('AI 出图暂时不可用，已先用本地配色封面代替：' + err)
}

async function runAiVideo(entry) {
  await store.startVideo(entry.id, 5)
}

async function runAiPolish(entry) {
  const src = String(entry.content || '').trim()
  if (!src) throw new Error('这条记忆还没有正文，没什么可润色的')
  // ★ 按用户要求：润色以「标题 + 正文」为依据，结果**直接替换**原来的正文。
  const out = await chatWithDeepSeek([
    {
      role: 'system',
      content:
        '你是「拾光」记忆 App 的文字润色助手。用户会给你一条记忆的标题和正文，' +
        '请以标题为线索，把正文润色得更通顺、更有画面感、更适合当作日记读。' +
        '必须保留原意、第一人称和所有事实细节（人名、地点、时间、数字都不能改），' +
        '不要添加原文没有的内容，不要写成作文腔，也不要复述标题。' +
        '只输出润色后的正文，不要任何解释、标题、前缀、引号或 markdown。',
    },
    {
      role: 'user',
      content: `标题：${entry.title || '（无标题）'}\n正文：${src}`,
    },
  ])
  const polished = String(out || '')
    .trim()
    // 模型偶尔会带「正文：」前缀或整体加引号，去掉再比对/落库
    .replace(/^(正文|润色后(的)?(正文)?)[：:]\s*/i, '')
    .replace(/^["“']+|["”']+$/g, '')
    .trim()
  if (!polished) throw new Error('没有拿到润色结果')
  if (polished === src) {
    tip('这条记忆的正文已经足够顺畅，润色后没有变化')
    return
  }
  // 只改正文：不走 updateEntry，避免它顺带重新生成封面（会和「AI 图片」打架）
  await cloudApi.updateItem({ id: entry.id, content: polished })
  entry.content = polished
  const idx = store.entries.findIndex((e) => e.id === entry.id)
  if (idx >= 0) store.entries[idx].content = polished
  if (detailEntry.value && detailEntry.value.id === entry.id) detailEntry.value.content = polished
  tip('已润色，正文已替换为润色后的内容')
}

async function openAdd() {
  form.value = emptyForm()
  dialogDrag.value = { x: 0, y: 0 }
  // 先把「我的记忆空间」的岛列表拉回来, 再决定弹窗默认停在哪一步。
  // 若先把弹窗打开、列表还在路上, 用户看到的默认项是「新建岛屿」(
  // spaceTarget 的初值), 一不小心保存就会多出一座岛。
  await loadMySpaces()
  // 顺手刷新一次 AI 权限：管理员可能刚改过总开关，保存后弹不弹 AI 选项取决于它
  await loadAiPerm()
  // 隐私设置可能刚在「设置」页改过，每次打开都读一遍，保证当次新建就按新规则走
  await loadVisMode()
  // 默认落在一座**没满**的岛上；全满（或一座都没有）就切到「新建岛屿」
  const free = mySpaces.value.find((s) => !islandFull(s))
  spaceTarget.value = free
    ? { mode: 'existing', newName: '', existingId: free.id }
    : { mode: 'new', newName: '', existingId: null }
  showDialog.value = true
}

async function openEdit(entry) {
  form.value = { ...emptyForm(), ...entry }
  // ★ 标题不带进表单：标题归 AI 管，保存时后端会拿新正文重新起一个。
  //   留着它只会让后端以为"调用方显式指定了标题"从而跳过重新生成。
  delete form.value.title
  // 同理，类型/内容种类/作者这些已废弃的字段也不要回传
  delete form.value.kind
  delete form.value.author
  delete form.value.type
  // photos 保证是数组(旧条目只有 photo 单图时也收进来); video/audio 字段缺失时兜底为空
  form.value.photos = Array.isArray(entry.photos) ? [...entry.photos] : entry.photo ? [entry.photo] : []
  form.value.video = entry.video || ''
  form.value.videoName = entry.videoName || ''
  form.value.audio = entry.audio || ''
  form.value.audioName = entry.audioName || ''
  dialogDrag.value = { x: 0, y: 0 }
  // 编辑时: 若当前记忆所在岛还在「我的空间」里, 默认选「已有」并定位到它; 否则默认「新建」并预填原名
  await loadMySpaces()
  const hit = mySpaces.value.find((s) => s.name === entry.space)
  if (hit) spaceTarget.value = { mode: 'existing', newName: '', existingId: hit.id }
  else spaceTarget.value = { mode: 'new', newName: entry.space || '', existingId: null }
  showDialog.value = true
}

// 分享到拾光广场 / 取消分享(只留在记忆空间)。
// ★ 2026-10-27 起广场不再有独立的「共享记忆」页: 分享这一步就等于把这条记忆
//   发到广场信息流里(服务端会为它生成一条对应动态), 人人可见、可点赞可评论。
//   所以这里是**全站唯一的发布入口**, 广场那边不再提供「添加数据」。
async function doToggleShare(entry) {
  const next = !entry.is_public
  try {
    await store.setShared(entry.id, next)
    tip(next ? '已分享到拾光广场, 其他人可以在广场里点赞、评论' : '已取消分享, 这条记忆只留在记忆空间')
  } catch (e) {
    tip(e.message || '操作失败')
  }
}

// 分享是双向开关, 连点会来回抖动; 冷却期内直接丢弃后续点击
const toggleShare = throttleSubmit(doToggleShare, 1200)

// 公开/隐私与「分享到广场」是同一状态的两个入口, 共用同一个接口, 状态永远一致
async function toggleVisibility(entry) {
  const next = !entry.is_public
  try {
    await store.setShared(entry.id, next)
    tip(next ? '已共享, 这条记忆已经出现在拾光广场' : '已设为隐私, 这张卡片已从广场撤下')
  } catch (e) {
    tip(e.message || '操作失败')
  }
}

function closeDialog() {
  // 关弹窗时把还在录的麦克风收掉，否则会一直占着设备（浏览器地址栏小圆点不消失）
  if (voiceState.value === 'rec') voiceCancel()
  showDialog.value = false
  dialogDrag.value = { x: 0, y: 0 }
}

const detailEntry = ref(null)

// ---- 生成分享链接 ----
// 「分享管理」页早就能列/取消/删除，但一直没有创建入口，列表永远是空的。
// 这里补上唯一缺的那一环：把一条记忆生成公开链接（后端 share/create）。
const shareBusy = ref(false)
const shareLink = ref('')

async function makeShareLink(e) {
  if (!e || shareBusy.value) return
  shareBusy.value = true
  try {
    // 同一条记忆重复点不该生成一堆链接：先找已有的有效分享直接复用
    let rec = null
    try {
      const list = await cloudApi.listShares()
      rec = (list || []).find((s) => s.memory_id === e.id && s.status === 'valid') || null
    } catch {
      /* 列表拿不到就照常新建，不挡主流程 */
    }
    if (!rec) {
      rec = await cloudApi.createShare({
        memory_id: e.id,
        name: e.title || '一段时光',
        // 分享页副标题用的就是这条 meta
        meta: [e.island || e.space, e.date].filter(Boolean).join(' · '),
      })
    }
    if (!rec?.token) throw new Error('生成失败，请稍后再试')
    shareLink.value = `${location.origin}/share/${rec.token}`
    try {
      await navigator.clipboard.writeText(shareLink.value)
      tip('链接已复制，发给朋友就能打开')
    } catch {
      tip('链接已生成，点弹层里的按钮复制')
    }
  } catch (err) {
    tip(err?.message || '生成分享链接失败')
  } finally {
    shareBusy.value = false
  }
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    tip('链接已复制')
  } catch {
    tip('复制失败，请点输入框全选手动复制')
  }
}

// AI 产物是 /uploads/... 的相对路径，dev 下前端(5173)与后端(8787)不同源，
// 需要补成后端地址；线上同源时 ASSET_BASE 为空、原样返回。
const ASSET_BASE = (import.meta.env.VITE_CLOUD_API_BASE || '').replace(/\/api\/?$/, '')
function assetSrc(u) {
  const s = String(u || '')
  if (!s) return ''
  if (/^(https?:|data:|blob:)/i.test(s)) return s
  return s.startsWith('/') ? ASSET_BASE + s : s
}

// 详情弹窗展示全部照片(旧条目只有 photo 单图时也兜底进来)
const detailPhotos = computed(() => {
  const e = detailEntry.value
  if (!e) return []
  if (Array.isArray(e.photos) && e.photos.length) return e.photos.filter(Boolean)
  return e.photo ? [e.photo] : []
})

function openDetail(entry) {
  detailEntry.value = entry
}

// 单个 File -> dataURL 的通用读取
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(file)
  })
}

// 选择照片(可多选, 最多9张, 单张≤6MB): 全部读成 dataURL 存入表单, 保存时再统一上传
const PHOTO_MAX = 9
const PHOTO_SIZE_MAX = 6 * 1024 * 1024
async function onPhotos(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return
  const room = PHOTO_MAX - form.value.photos.length
  if (room <= 0) return tip('最多只能添加 ' + PHOTO_MAX + ' 张照片')
  const picked = files.slice(0, room)
  if (files.length > room) tip('最多 ' + PHOTO_MAX + ' 张, 已只取前 ' + room + ' 张')
  for (const f of picked) {
    if (f.size > PHOTO_SIZE_MAX) {
      tip('「' + f.name + '」超过 6MB, 已跳过')
      continue
    }
    try {
      const dataUrl = await fileToDataUrl(f)
      form.value.photos.push(dataUrl)
    } catch (e) {
      tip(e.message || '图片读取失败')
    }
  }
  form.value.photo = form.value.photos[0] || '' // 兼容旧展示逻辑: photo 始终指向第一张
}

function removePhoto(i) {
  form.value.photos.splice(i, 1)
  form.value.photo = form.value.photos[0] || ''
}

// 选择视频(最多1个, ≤40MB): 读成 dataURL, 保存时上传为文件
const VIDEO_SIZE_MAX = 40 * 1024 * 1024
async function onVideo(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > VIDEO_SIZE_MAX) {
    tip('视频不能超过 40MB, 请压缩后再选')
    return
  }
  try {
    form.value.video = await fileToDataUrl(file)
    form.value.videoName = file.name
  } catch (e) {
    tip(e.message || '视频读取失败')
  }
}

function clearVideo() {
  form.value.video = ''
  form.value.videoName = ''
}

// 选择音频(最多1个, ≤15MB): 读成 dataURL 存入表单(岛屿收音机/首页音乐面板可播放)
const AUDIO_SIZE_MAX = 15 * 1024 * 1024
async function onAudio(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > AUDIO_SIZE_MAX) {
    tip('音频不能超过 15MB, 请压缩后再选')
    return
  }
  try {
    form.value.audio = await fileToDataUrl(file)
    form.value.audioName = file.name
  } catch (e) {
    tip(e.message || '音频读取失败')
  }
}

function clearAudio() {
  form.value.audio = ''
  form.value.audioName = ''
}

// 提交中标志: 入库 + 附件上传期间锁住按钮, 避免连点产生重复记忆
// (AI 封面已改成后台任务, 不再让用户对着弹窗干等 10s)
const saving = ref(false)

// 保存按钮节流: 1.5s 内只认第一次点击, 冷却期内的连点直接丢弃(不做尾部补刀),
// 与 saving 锁配合双重防重复提交
const onSaveClick = throttleSubmit(() => save(), 1500)

// ---- 保存按钮的三种高亮：常态 / 按下 / 不符合 ----
// 「不符合」用红色下边框 + 抖动 + 一句说明，和"按下"的深色下边框明显区分开。
const savePressed = ref(false)
const cancelPressed = ref(false)
const saveWarn = ref(false)
const saveHint = ref('')
let saveWarnTimer = 0

function trySave() {
  if (saving.value) return
  const content = form.value.content.trim()
  const spaceName = resolvedSpaceName.value.trim()
  clearTimeout(saveWarnTimer)
  if (!content || !spaceName) {
    saveWarn.value = true
    savePressed.value = false
    saveHint.value = !content
      ? '正文还是空的 —— 内容必填，标题会由 AI 读这段内容自动生成'
      : '还没选好放进哪座岛屿，选一个或新建一座吧'
    saveWarnTimer = setTimeout(() => (saveWarn.value = false), 1600)
    return
  }
  saveWarn.value = false
  saveHint.value = ''
  onSaveClick()
}

async function save() {
  // 生图需 10s 左右, 期间按钮显示进度并锁住, 避免连点产生重复记忆
  if (saving.value) return
  // ★ 现在是「内容必填」：没有正文，服务端就没法用 AI 生成标题
  const content = form.value.content.trim()
  // 两步选岛解析出的目标空间名(后端按名自动建/找空间)
  const spaceName = resolvedSpaceName.value.trim()
  if (!content) {
    tip('写点什么吧 —— 内容必填，标题会由 AI 读这段内容自动生成')
    return
  }
  if (!spaceName) {
    tip(
      spaceTarget.value.mode === 'existing'
        ? '你还没有岛屿，请先选择「新建岛屿」'
        : '请填写新岛屿的名称，或选择已有岛屿',
    )
    return
  }
  // 标题不提交（留给服务端生成）；openEdit 已经把 entry 里的 title 删掉了，
  // 这里再兜一次，防止哪天有人从别处把 title 塞回表单。
  const data = { ...form.value, content, space: spaceName }
  delete data.title
  delete data.kind
  delete data.author
  delete data.type
  // 「已有岛屿」: 把 space_id 直接带给后端 —— 后端按 id 精确落位, 不再走「按名字找空间,
  // 找不到就新建」那条路, 所以绝不会因为名字有差异而悄悄多出一座岛。
  if (existingSpaceId.value) data.space_id = existingSpaceId.value
  saving.value = true
  try {
    // 媒体先上传为文件 URL(避免 base64 直接入库), 再入库:
    // 照片每张单独传(media/upload), 视频/音频走 media/upload-av(带类型/大小校验)
    const photos = Array.isArray(data.photos) ? [...data.photos] : data.photo ? [data.photo] : []
    const uploaded = []
    for (const ph of photos) {
      if (ph && ph.startsWith('data:')) {
        try {
          const { url } = await cloudApi.uploadMedia({ dataUrl: ph })
          uploaded.push(url || ph)
        } catch (e) {
          console.warn('图片上传失败, 将使用原始数据:', e.message)
          uploaded.push(ph)
        }
      } else if (ph) {
        uploaded.push(ph)
      }
    }
    data.photos = uploaded
    data.photo = uploaded[0] || ''
    if (data.video && data.video.startsWith('data:')) {
      try {
        const { url } = await cloudApi.uploadMediaAv({ kind: 'video', dataUrl: data.video, name: data.videoName })
        if (url) data.video = url
      } catch (e) {
        tip(e.message || '视频上传失败, 已放弃该视频')
        data.video = ''
        data.videoName = ''
      }
    }
    if (data.audio && data.audio.startsWith('data:')) {
      try {
        const { url } = await cloudApi.uploadMediaAv({ kind: 'audio', dataUrl: data.audio, name: data.audioName })
        if (url) data.audio = url
      } catch (e) {
        tip(e.message || '音频上传失败, 已放弃该音频')
        data.audio = ''
        data.audioName = ''
      }
    }
    // 新增: 条目立刻入库并出现在列表(约几百毫秒)。
    // ★ 若当前用户有任意 AI 能力, 这里**先不让后台自动画封面** ——
    //   保存后我们会弹出「AI 图片/视频/润色」多选, 由用户自己决定要不要, 避免两处同时出图打架。
    const isNew = !data.id
    // 有任一 AI 权限时不自动画封面（交给弹窗里的勾选决定）；
    // 一项权限都没有时仍按老习惯后台出封面，弹窗照样弹（只作告知）。
    const anyPerm = aiPerm.value.image || aiPerm.value.video || aiPerm.value.reply
    let saved = null
    if (isNew) {
      saved = await store.addEntry(data, { cover: !anyPerm })
    } else {
      // ★ 修改后保存也弹 AI 弹窗（用户要求，替换原来只 tip「修改已保存」）：
      //   updateEntry 会把更新后的条目返回，直接拿它当弹窗目标 —— 润色/出图
      //   都要靠 entry.id 回写同一条记忆，不能传旧对象。
      const updated = await store.updateEntry(data.id, data)
      showDialog.value = false
      tip('修改已保存')
      if (updated) openAiAssist(updated, 'edit')
      return
    }
    showDialog.value = false
    tip('已添加记忆')
    // ★ 无论管理员开没开权限都要弹（需求），没权限的项在选择时提示
    if (saved) openAiAssist(saved)
  } catch (e) {
    tip(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 后台封面任务的回执: 保存时已立即提示「已添加记忆」, 封面画完再提示一次,
// 让用户知道这件事真的做完了(失败也如实说, 可以在记忆详情手动重试)
watch(
  () => store.lastCoverFinish,
  (e) => {
    if (!e) return
    const name = e.title.length > 12 ? `${e.title.slice(0, 12)}…` : e.title
    if (!e.ok) tip(`「${name}」封面生成失败, 可稍后在记忆详情重新生成`)
    else if (e.error) tip(`「${name}」已用备用封面, 可在记忆详情重新生成`)
    else tip(`「${name}」的封面画好啦`)
  },
)

// 删除改成「先弹确认、再删」：delTarget 非空时显示确认框（对应验证报告 FIND-03）
const delTarget = ref(null)
const deleting = ref(false)

function remove(entry) {
  delTarget.value = entry
}

async function doRemove() {
  const entry = delTarget.value
  if (!entry || deleting.value) return
  deleting.value = true
  try {
    await store.removeEntry(entry.id)
    tip('已删除')
    delTarget.value = null
  } catch (e) {
    tip(e.message || '删除失败')
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.memory,
.memory * {
  box-sizing: border-box;
}

.memory {
  position: absolute;
  inset: 0;
}

/* 手机专用标题条：桌面不占位（海报上有烤好的标题） */
.mem-m-head {
  display: none;
}

.memory-figure {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  container-type: size;
}

/* 与 contain 绘制出的图片区域同比例同位置, 控件按图片坐标定位 */
/* ★ 内层框必须和 object-fit:contain 画出来的图片区域**完全重合**。
   老写法是 width:100% + aspect-ratio + max-height:100%：容器比图更宽时，
   max-height 把高度卡住、宽度却还是 100%，比例就破了 —— 卡片按 % 定位会整体往外偏，
   换个屏幕比例（比如 16:9 笔记本接到 4:3 投影）看起来就是"排版乱了"。
   现在用容器查询单位算出 contain 盒的真实宽高，两种极端都能对上。
   （不支持容器查询的旧浏览器仍走上面那组老声明，行为与以前一致。） */
.memory-figure-inner {
  position: relative;
  aspect-ratio: 1452 / 941;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  /* 精确的 contain 盒：宽度取「容器宽」与「按高换算的宽」的较小者 */
  width: min(100cqw, calc(100cqh * 1452 / 941));
  height: min(100cqh, calc(100cqw * 941 / 1452));
  max-width: none;
  max-height: none;
}

.memory-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.ico {
  flex: none;
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 搜索框: 盖住背景图上的搜索框 */
.search-pill {
  position: absolute;
  left: 4.1%;
  top: 20.4%;
  width: 31.6%;
  height: 4.5%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 14px;
  border-radius: 999px;
  background: rgba(255, 252, 249, 0.95);
  color: #8a7a6d;
}

.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14.5px;
  color: #5c4f45;
}

/*
.search-input::placeholder {
  color: #b3a79c;
}
*/

.search-go {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: #f6e8dc;
  color: #a08063;
  cursor: pointer;
}

/* 筛选下拉按钮: 盖住背景图上的三个筛选胶囊 */
.filter-wrap {
  position: absolute;
  top: 20.4%;
  height: 4.3%;
}

.filter-space {
  left: 36.8%;
  width: 10.3%;
}

.filter-type {
  left: 48.2%;
  width: 9.4%;
}

.filter-time {
  left: 58.8%;
  width: 8.4%;
}

/* 谁关注我: 紧贴时间筛选右侧(同一套"盖住背景图"的定位体系) */
.filter-fans {
  left: 68.3%;
  width: 11.8%;
}

.fans-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-btn {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 252, 249, 0.95);
  color: #5c4f45;
  /* 13.5px 而不是 14.5: 「全部记忆空间」「全部小岛」这种 4~6 字文案
     在 10% 宽的按钮里刚好一行放得下, 不会折成两行 */
  font-size: 13.5px;
  cursor: pointer;
}

/* 文字长了就省略，绝不再折行 */
.filter-btn > span {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.filter-btn .chevron {
  margin-left: auto;
  width: 12px;
  height: 12px;
}

.menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 100%;
  display: flex;
  flex-direction: column;
  padding: 4px;
  border-radius: 10px;
  background: #fffdfb;
  box-shadow: 0 10px 24px rgba(92, 79, 69, 0.18);
  z-index: 5;
}

.menu button {
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #5c4f45;
  font-size: 14.5px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.menu button:hover {
  background: #f6efe7;
}

.menu button.on {
  color: #e0865a;
  font-weight: 600;
}

/* 筛选行与纸页之间的装饰带: 遮住模糊背景并承上启下 */
.band-deco {
  position: absolute;
  left: 4%;
  top: 25.4%;
  width: 82.4%;
  height: 7%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
  background: linear-gradient(
    180deg,
    rgba(255, 248, 240, 0),
    rgba(255, 248, 240, 0.6) 35%,
    rgba(255, 248, 240, 0.6) 75%,
    rgba(255, 248, 240, 0)
  );
}

.band-line {
  flex: 1;
  height: 0;
  border-top: 1.5px dashed rgba(190, 160, 130, 0.45);
}

.band-spark {
  font-size: 13px;
  color: #e8b08a;
}

.band-motto {
  font-size: 14.5px;
  font-style: italic;
  letter-spacing: 3px;
  white-space: nowrap;
  color: #a08063;
}

/* 中间正文: 数据列表区, 与背景图白色面板重合; 做成点阵手账纸页 */
.body-panel {
  position: absolute;
  left: 4%;
  top: 32.6%;
  width: 66%;
  height: 51.9%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background-color: rgba(255, 252, 247, 0.92);
  background-image: radial-gradient(rgba(214, 192, 164, 0.28) 1px, transparent 1.4px);
  background-size: 16px 16px;
  box-shadow: 0 10px 30px rgba(120, 90, 60, 0.12);
}

/* 纸页上缘的两条和纸胶带 */
.body-panel::before,
.body-panel::after {
  content: '';
  position: absolute;
  top: -9px;
  width: 64px;
  height: 18px;
  border-radius: 2px;
  opacity: 0.75;
}

.body-panel::before {
  left: 26px;
  background: rgba(242, 184, 198, 0.6);
  transform: rotate(-6deg);
}

.body-panel::after {
  right: 26px;
  background: rgba(160, 200, 230, 0.6);
  transform: rotate(5deg);
}

.body-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 浏览他人公开记忆的只读横幅 */
.browse-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-radius: 10px;
  background: rgba(255, 236, 214, 0.85);
}

.browse-back {
  flex: none;
  padding: 4px 12px;
  border: none;
  border-radius: 999px;
  background: #fff;
  box-shadow: inset 0 0 0 1px #eadfd2;
  color: #8a7a6d;
  font-size: 13px;
  cursor: pointer;
}

.browse-title {
  font-size: 14.5px;
  letter-spacing: 1px;
  color: #a08063;
}

.body-count {
  font-size: 14.5px;
  letter-spacing: 1px;
  color: #8a7a6d;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #ffb27a, #ff9db1);
  color: #fff;
  font-size: 14.5px;
  letter-spacing: 1px;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(255, 158, 177, 0.35);
}

.entry-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
  align-content: start;
}

.entry-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fffdfb;
  box-shadow: 0 6px 16px rgba(92, 79, 69, 0.1);
}
 
.entry-photo {
  width: 100%;
  height: 96px;
  border-radius: 10px;
  overflow: hidden;
}

.entry-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 没有照片时的占位块 */
.entry-no-photo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 96px;
  border: 1px dashed #e0d4c4;
  border-radius: 10px;
  background: #fbf7f1;
  font-size: 13px;
  letter-spacing: 2px;
  color: #c9bbae;
}

.entry-title {
  font-size: 15.5px;
  font-weight: 600;
  color: #4a3f37;
}

/* 卡片底部: 修改 / 公开隐私 / 删除 */
.entry-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: auto;
}

.entry-edit,
.entry-del,
.entry-vis {
  border: none;
  background: transparent;
  font-size: 13px;
  letter-spacing: 1px;
  cursor: pointer;
}

.entry-edit {
  color: #a08063;
}

.entry-vis {
  color: #6b8e6b;
}

.entry-del {
  color: #c9bbae;
}

.entry-edit:hover,
.entry-del:hover,
.entry-vis:hover {
  color: #e0865a;
}

/* 分享到广场: 卡片右上角胶囊。未分享时暖橙底强调, 已分享后退为绿色淡底表示「已在广场」 */
.entry-share {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  padding: 3px 9px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 245, 236, 0.94);
  color: #cf7a45;
  font-size: 12px;
  letter-spacing: 0.5px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(207, 138, 83, 0.25);
  transition: background 0.18s, color 0.18s;
}

.entry-share:hover {
  background: #ffe9d6;
  color: #e0865a;
}

.entry-share.on {
  background: rgba(238, 245, 238, 0.94);
  color: #6b8e6b;
  box-shadow: 0 2px 8px rgba(107, 142, 107, 0.2);
}

.entry-share.on:hover {
  background: #f6e6e0;
  color: #d2714f;
}

.entry-meta {
  font-size: 13px;
  color: #a08063;
}

/* 「≈ 意思相近」标记：字面搜不到、靠语义找出来的卡片才显示 */
.entry-sem {
  align-self: flex-start;
  padding: 2px 9px;
  border-radius: 999px;
  background: rgba(240, 145, 124, 0.12);
  border: 1px solid rgba(240, 145, 124, 0.28);
  font-size: 11.5px;
  letter-spacing: 0.3px;
  color: #c9705c;
}

.entry-content {
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13px;
  color: #8a7a6d;
}

.entry-detail-btn {
  align-self: flex-start;
  border: none;
  background: none;
  color: #c9a87c;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.entry-detail-btn:hover {
  color: #e0865a;
}

/* 空态: 漂浮拍立得小插画 + 引导按钮 */
.entry-empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px 0;
}

.empty-art {
  position: relative;
  width: 118px;
  height: 108px;
  animation: floaty 3.2s ease-in-out infinite;
}

.empty-polaroid {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 8px 6px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(120, 90, 60, 0.16);
  transform: rotate(-4deg);
}

.empty-photo {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed #e8c8cf;
  border-radius: 6px;
  background: #fdf7f4;
}

.empty-photo svg {
  width: 26px;
  height: 26px;
  fill: none;
  stroke: #eba7b6;
  stroke-width: 1.6;
  stroke-linejoin: round;
}

.empty-caption {
  font-size: 11px;
  font-style: italic;
  letter-spacing: 1px;
  text-align: center;
  color: #c9bbae;
}

.spark {
  position: absolute;
  font-size: 14.5px;
  color: #f2b8c6;
  animation: twinkle 2.4s ease-in-out infinite;
}

.spark.s1 {
  top: -6px;
  left: -14px;
}

.spark.s2 {
  top: 18px;
  right: -16px;
  color: #f6c99a;
  animation-delay: 0.8s;
}

.spark.s3 {
  bottom: -4px;
  left: -6px;
  color: #a8c6e8;
  animation-delay: 1.6s;
}

.empty-title {
  margin: 4px 0 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #8a7a6d;
}

.empty-sub {
  margin: 0;
  font-size: 13px;
  letter-spacing: 1px;
  color: #b3a79c;
}

.empty-cta {
  margin-top: 6px;
  padding: 8px 20px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #ffb27a, #ff9db1);
  box-shadow: 0 6px 16px rgba(255, 157, 177, 0.35);
  color: #fff;
  font-size: 14.5px;
  letter-spacing: 2px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.empty-cta:hover {
  transform: translateY(-1px);
}

@keyframes floaty {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

@keyframes twinkle {
  0%,
  100% {
    opacity: 0.25;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.15);
  }
}

/* 右侧统计面板: 有数据后盖住背景图上的空状态占位 */
.stats-panel {
  position: absolute;
  left: 70.9%;
  top: 32.6%;
  width: 15.5%;
  height: 40.4%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 16px;
  background: #f8f4ee;
  overflow: auto;
}

.stats-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15.5px;
  font-weight: 700;
  color: #3d6bd8;
}

.stats-total {
  font-size: 14.5px;
  color: #8a7a6d;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  font-size: 14.5px;
  color: #5c4f45;
}

/* ---- 添加/修改小弹窗 ---- */
.dialog-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(43, 35, 29, 0.35);
  z-index: 20;
}

.dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(420px, 86%);
  max-height: 86%;
  overflow: auto;
  padding: 18px 20px;
  /* border-radius: 14px; */
  background: #fffdfb;
  box-shadow: 0 20px 50px rgba(60, 45, 35, 0.3);
}

.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.dialog-head:active {
  cursor: grabbing;
}

.dialog-title {
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #4a3f37;
}

.dialog-close {
  border: none;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  color: #c9bbae;
  cursor: pointer;
}

/* ---- 详情弹窗 ---- */
.detail-dialog {
  max-height: 80%;
  overflow-y: auto;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: #a08063;
}

.detail-meta span::after {
  content: '·';
  margin-left: 8px;
  color: #d8c9b8;
}

.detail-meta span:last-child::after {
  content: '';
}

.detail-photo {
  width: 100%;
  max-height: 240px;
  overflow: hidden;
  border-radius: 10px;
}

.detail-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 多图详情: 超出部分滚轮滚动, 图片按原始比例完整显示 */
.detail-photo-scroll {
  max-height: 340px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: thin;
}

.detail-photo-scroll img {
  width: 100%;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
}

.detail-content {
  font-size: 15.5px;
  line-height: 1.8;
  color: #5c4f45;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 详情底部：生成分享链接 */
.detail-acts {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed #eadfd2;
}

.detail-share {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid #eadfd2;
  border-radius: 999px;
  background: #fff;
  font-size: 13.5px;
  color: #b5715a;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease;
}

.detail-share svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.detail-share:hover:not(:disabled) {
  border-color: #f0917c;
  background: #fff7f3;
}

.detail-share:disabled {
  opacity: 0.55;
  cursor: default;
}

/* 分享链接弹层 */
.sl-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(40, 34, 28, 0.34);
  backdrop-filter: blur(2px);
}

.sl-card {
  width: 420px;
  max-width: 100%;
  padding: 22px 22px 16px;
  border-radius: 16px;
  background: rgba(255, 252, 248, 0.98);
  box-shadow: 0 22px 54px rgba(90, 70, 40, 0.28);
  animation: sl-in 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes sl-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.97);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.sl-title {
  margin: 0 0 4px;
  font-size: 16.5px;
  font-weight: 700;
  color: #3d352e;
}

.sl-sub {
  margin: 0 0 12px;
  font-size: 13px;
  color: #a08d78;
}

.sl-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #fdf8f2;
  font-size: 13px;
  color: #5c4f45;
  outline: none;
}

.sl-input:focus {
  border-color: #f0917c;
}

.sl-acts {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.sl-btn {
  padding: 7px 18px;
  border: 1px solid #eadfd2;
  border-radius: 999px;
  background: #fff;
  font-size: 13.5px;
  color: #8a7a6d;
  cursor: pointer;
}

.sl-btn.primary {
  border-color: transparent;
  background: linear-gradient(135deg, #f7a58f, #e0705a);
  color: #fff;
  font-weight: 600;
}

/* 删除确认框里的危险操作: 比「取消」更实, 但用低饱和砖红, 不抢整页的暖色调 */
.sl-btn.danger {
  border-color: transparent;
  background: linear-gradient(135deg, #e0866e, #c25b45);
  color: #fff;
  font-weight: 600;
}

.sl-btn.danger:disabled {
  opacity: 0.6;
  cursor: default;
}

.sl-tip {
  margin: 12px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: #b3a08d;
}

/* AI 生成区（封面 / 视频） */
.detail-ai {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0 4px;
  padding: 10px;
  border: 1px solid rgba(217, 145, 92, 0.28);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(255, 248, 238, 0.95), rgba(255, 252, 247, 0.95));
}

.detail-ai-head {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #c08a52;
}

.detail-ai img {
  width: 100%;
  max-height: 300px;
  object-fit: cover;
  border-radius: 10px;
}

.detail-ai video {
  width: 100%;
  border-radius: 10px;
  background: #000;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 14.5px;
  letter-spacing: 1px;
  color: #8a7a6d;
}

/* ---- 新建时的可见范围（隐私设置「创建时手动选择」才出现）---- */
.vis-pick {
  display: flex;
  gap: 10px;
}
.vp-row {
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 12px;
  border: 1.5px solid #eadfd2;
  border-radius: 12px;
  background: #fffdf9;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}
.vp-row:hover {
  border-color: #f0c6b2;
}
/* 选中：暖色描边 + 淡淡底，和隐私设置页的同款单选保持一致 */
.vp-row.on {
  border-color: #e0705a;
  background: #fff6f1;
  box-shadow: 0 2px 8px rgba(224, 112, 90, 0.12);
}
.vp-dot {
  flex: none;
  width: 15px;
  height: 15px;
  margin-top: 2px;
  border: 1.5px solid #d9c8b8;
  border-radius: 50%;
  background: #fff;
}
.vp-row.on .vp-dot {
  border: 4px solid #e0705a;
}
.vp-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.vp-text b {
  font-size: 14px;
  font-weight: 600;
  color: #5c4f45;
}
.vp-text span {
  font-size: 12px;
  line-height: 1.5;
  color: #a2938a;
}
.vp-text span:empty {
  display: none;
}

/* 仅自己可见模式下的一句说明，压成一条浅色小字，别抢内容栏的注意力 */
.vis-note {
  margin: -2px 0 0;
  padding: 8px 12px;
  border-left: 3px solid #e8d6c4;
  border-radius: 0 8px 8px 0;
  background: #fdf7f0;
  color: #9d8b7c;
  font-size: 12.5px;
  line-height: 1.65;
}
@media (max-width: 620px) {
  /* 窄屏两列会挤成两行字，改成上下堆叠 */
  .vis-pick {
    flex-direction: column;
  }
}
/* 「必填」小角标（弹窗里只有内容这一项需要） */
.req {
  padding: 1px 6px;
  border-radius: 6px;
  background: #ffeef0;
  color: #d2657a;
  font-size: 11.5px;
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0;
}

.field input,
.field select,
.field textarea {
  padding: 8px 10px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #fff;
  font-size: 14.5px;
  font-family: inherit;
  color: #5c4f45;
  outline: none;
}

.field textarea {
  resize: vertical;
}

/* ---- 语音输入 ---- */
.voice-box {
  position: relative;
  display: flex;
  flex-direction: column;
}

/* 正文右下角留出按钮位，长文本不会压到话筒 */
.voice-box textarea {
  padding-bottom: 34px;
}

.voice-btn {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid #e8dccb;
  border-radius: 999px;
  background: #fdf7ef;
  color: #8a6f5b;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  cursor: pointer;
  transition: background 0.16s, border-color 0.16s, color 0.16s, transform 0.12s;
}
.voice-btn:hover {
  background: #fff1e0;
  border-color: #e5c9a6;
  color: #7a5b45;
}
.voice-btn:active {
  transform: translateY(1px);
}
.voice-btn:disabled {
  cursor: progress;
  opacity: 0.75;
}
.voice-mic {
  font-size: 13px;
  line-height: 1;
}
.voice-txt {
  font-variant-numeric: tabular-nums;
}

/* 录音中：红一点 + 呼吸，一眼能看出在听 */
.voice-box.rec .voice-btn {
  background: #ffe9e6;
  border-color: #f0b9ae;
  color: #c0453a;
  animation: voice-breathe 1.1s ease-in-out infinite;
}
@keyframes voice-breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(224, 88, 74, 0);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(224, 88, 74, 0.16);
  }
}
.voice-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e0584a;
}
.voice-hint {
  margin: 5px 0 0;
  color: #b0806a;
  font-size: 12px;
  line-height: 1.5;
}

.voice-spin {
  width: 11px;
  height: 11px;
  border: 2px solid #e0c9ae;
  border-top-color: #b0806a;
  border-radius: 50%;
  animation: voice-spin 0.7s linear infinite;
}
@keyframes voice-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 两步选岛控件 */
.space-target {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.st-tabs {
  display: flex;
  gap: 8px;
}

.st-tabs button {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #fff;
  font-size: 14.5px;
  color: #8a7a6d;
  cursor: pointer;
}

.st-tabs button.on {
  border-color: #ff9db1;
  background: #fff0f8;
  color: #e0865a;
  font-weight: 600;
}

.space-target input {
  padding: 8px 10px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #fff;
  font-size: 14.5px;
  font-family: inherit;
  color: #5c4f45;
  outline: none;
}

/* ---- 自定义岛屿下拉（2026-10-27 / 13:20 再调）----
   ★ 触发器不再用蓝紫底：改成和「新建岛屿」输入框**完全一致**的白底 + 米色边框，
     同一个字段的两种模式（新建 / 已有）才是同一套控件，切过去不会像换了皮肤。
   展开列表用用户指定的浅天蓝 rgb(167, 222, 250) = #a7defa。 */
.st-dd {
  position: relative;
}

.st-dd-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #fff;
  color: #5c4f45;
  font-size: 14.5px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}
.st-dd-trigger:hover {
  background: #fffaf4;
  border-color: #e3cfbb;
}
/*控制已有记忆岛选择主背景颜色*/ 
.st-dd-trigger:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(125, 199, 248, 0.55);
}
.st-dd-cur {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.st-dd-chev {
  flex: none;
  width: 16px;
  height: 16px;
  transition: transform 0.2s ease;
}
.st-dd-chev.up {
  transform: rotate(180deg);
}
/*控制已有记忆岛选择主背景颜色*/
.st-dd-list {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 40;
  margin: 0;
  padding: 5px;
  list-style: none;
  border: 1px solid rgba(125, 199, 248, 0.55);;
  border-radius: 12px;
  /* 用户指定：浅天蓝 rgb(167, 222, 250) */
  background: #bfe8fc;
  box-shadow: 0 12px 28px rgba(60, 120, 160, 0.2);
  max-height: 232px;
  overflow-y: auto;
}
.st-dd-list li {
  padding: 9px 10px;
  border-radius: 8px;
  /* color: #16405c; */
  font-size: 14px;
  letter-spacing: 0.2px;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}
.st-dd-list li:hover {
  background: #bfe8fc;
  color: #0f3348;
}

.st-dd-list li.on {
  /* background: #8ed3f6; */
  color: #0b2a3c;
  font-weight: 600;
}

.dd-pop-enter-active,
.dd-pop-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.dd-pop-enter-from,
.dd-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.st-empty {
  margin: 0;
  padding: 8px 10px;
  border: 1px dashed #e0d4c4;
  border-radius: 10px;
  background: #fbf7f1;
  font-size: 14px;
  letter-spacing: 1px;
  color: #c9bbae;
}

.photo-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.photo-preview {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  object-fit: cover;
}

/* 多图缩略图: 右上角一个 × 可单张移除 */
.photo-thumb {
  position: relative;
  display: inline-flex;
}

.thumb-x {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(90, 70, 60, 0.75);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb-x:hover {
  background: #e0865a;
}

.photo-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border: 1px dashed #d8c9b8;
  border-radius: 10px;
  font-size: 12px;
  color: #b3a79c;
}

.photo-pick {
  position: relative;
  overflow: hidden;
  padding: 6px 12px;
  border-radius: 999px;
  background: #f6e8dc;
  color: #a08063;
  font-size: 14.5px;
  cursor: pointer;
}

.photo-pick input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.photo-remove {
  border: none;
  background: transparent;
  font-size: 14.5px;
  color: #c9bbae;
  cursor: pointer;
}

.audio-name {
  max-width: 160px;
  overflow: hidden;
  font-size: 13px;
  color: #8a7a6d;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 底部「这条会去哪」的说明（2026-10-27，照广场 .sq-dialog-hint 的版式）：
   上方一条淡虚线把媒体区和按钮隔开，字比正文小一号、灰色，岛名用暖棕加粗。 */
.dlg-dest {
  margin: 6px 0 0;
  padding-top: 12px;
  border-top: 1px dashed #eadfd2;
  font-size: 12.5px;
  line-height: 1.75;
  color: #a89c90;
}

.dlg-dest b {
  color: #b9714a;
  font-weight: 600;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel,
.btn-save {
  padding: 8px 18px;
  /* ★ 2026-10-27 用户要求：保存/取消各带一条下边框，按下去和下边框会一起变深，
     这样"能点"和"已经点到了"一眼分得清。 */
  border: none;
  border-bottom: 3px solid transparent;
  border-radius: 999px;
  font-size: 14.5px;
  letter-spacing: 1px;
  cursor: pointer;
  transition:
    border-bottom-color 0.15s,
    background 0.15s,
    transform 0.08s,
    box-shadow 0.15s;
}

.btn-cancel {
  background: #f0e8de;
  color: #8a7a6d;
  border-bottom-color: #d6c7b5;
}

.btn-cancel:hover {
  background: #eae0d4;
  border-bottom-color: #c2ae98;
}

/* 按下：下边框压深 + 轻微下沉，像真的被按了一下 */
.btn-cancel.pressed,
.btn-cancel:active {
  transform: translateY(1px);
  background: #e2d7c9;
  border-bottom-color: #a9947d;
}

.btn-save {
  background: linear-gradient(135deg, #ffb27a, #ff9db1);
  color: #fff;
  border-bottom-color: #e0705a;
}

.btn-save:hover {
  border-bottom-color: #d05a44;
}

.btn-save.pressed,
.btn-save:active {
  transform: translateY(1px);
  border-bottom-color: #b8492f;
  box-shadow: 0 0 0 3px rgba(240, 145, 124, 0.22);
}

/* 不符合条件：红色下边框 + 红字 + 抖两下，与"按下"明显不同 */
.btn-save.warn {
  background: #ffe3de;
  color: #c0453a;
  border-bottom-color: #e0453a;
  animation: save-warn-shake 0.34s ease;
}

@keyframes save-warn-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  45% { transform: translateX(4px); }
  70% { transform: translateX(-2px); }
}

/* 不可点（例如 AI 增强弹窗一个都没勾）：灰底灰字 + 下边框同步变浅，
   和"可点/按下/不符合条件"三种状态区分得开 */
.btn-save:disabled,
.btn-save:disabled:hover,
.btn-save:disabled:active {
  background: #f2e9e2;
  color: #bcab9d;
  border-bottom-color: #ded1c5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
  animation: none;
}

.save-hint {
  margin: 8px 2px 0;
  text-align: right;
  font-size: 12.5px;
  color: #d1574a;
}

/* ---- 满岛提示 / 保存后 AI 增强选项 ---- */
.ai-dialog {
  width: min(468px, 90%);
}
.ai-lead {
  margin: 2px 0 6px;
  font-size: 14.5px;
  line-height: 1.8;
  color: #5c4f45;
}
.ai-sub {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.7;
  color: #8a7a6d;
}
.ai-opts {
  margin: 4px 0;
  padding: 0;
  list-style: none;
}
.ai-opt {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid #efe3d6;
  border-radius: 12px;
  background: #fffaf4;
  cursor: pointer;
}
.ai-opt input {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 3px;
  accent-color: #d9915c;
}
.ai-opt-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ai-opt-text b {
  font-size: 14px;
  font-weight: 700;
  color: #4a3f37;
}
.ai-opt-text i {
  font-size: 12.5px;
  font-style: normal;
  color: #a08063;
}
/* 管理员没开通的能力：仍可勾选，但视觉上弱化并标注 */
.ai-opt.off {
  background: #f3efe9;
  border-color: #e6ddd2;
}
.ai-opt-off {
  margin-top: 2px;
  font-size: 11.5px;
  font-style: normal;
  color: #b08968;
}
.btn-save:disabled {
  /* 视觉细节（灰底灰字/浅下边框）见上方统一的 .btn-save:disabled 规则；
     这里只保留一点整体弱化，两者叠加后"不可点"一眼可辨 */
  opacity: 0.9;
  cursor: not-allowed;
}

/* 粉丝名单弹窗: 仅本人可打开 */
.fans-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgba(60, 48, 38, 0.34);
  backdrop-filter: blur(2px);
}

.fans-card {
  display: flex;
  flex-direction: column;
  width: min(340px, 88vw);
  max-height: 70vh;
  padding: 18px 20px;
  border-radius: 16px;
  background: #fffdfb;
  box-shadow: 0 24px 60px rgba(90, 70, 40, 0.28);
}

.fans-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fans-title {
  font-size: 17.5px;
  color: #4a3f37;
}

.fans-close {
  padding: 0 4px;
  border: none;
  background: transparent;
  color: #b3a79b;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.fans-sub {
  margin: 4px 0 12px;
  color: #a08063;
  font-size: 13px;
}

.fans-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.fans-empty {
  margin: 12px 0;
  color: #b3a79c;
  font-size: 14.5px;
  text-align: center;
}

.fans-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: #fdf6ef;
}

.fans-ava {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
}

.fans-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #4a3f37;
  font-size: 15.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fans-mutual {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e8f0e6;
  color: #6b8e6b;
  font-size: 12px;
  font-style: normal;
}

.fans-visit {
  flex: none;
  padding: 4px 10px;
  border: none;
  border-radius: 999px;
  background: #fff;
  box-shadow: inset 0 0 0 1px #eadfd2;
  color: #8a7a6d;
  font-size: 13px;
  cursor: pointer;
}

.fans-visit:hover {
  color: #e0865a;
}

/* 每行右侧的两个操作: 私信 / 记忆空间 */
.fans-ops {
  flex: none;
  display: flex;
  gap: 6px;
}

.fans-dm {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 999px;
  background: #fdeee3;
  color: #d9764a;
  font-size: 13px;
  cursor: pointer;
}

.fans-dm:hover {
  background: #f8ddc9;
}

/* TA 发来还没读的条数 */
.fans-dm-dot {
  padding: 0 4px;
  border-radius: 999px;
  background: #e0574f;
  color: #fff;
  font-size: 11px;
  font-style: normal;
  line-height: 14px;
}

/* 私信面板: 盖在粉丝名单之上(z-index 高于 .fans-mask 的 60) */
.dm-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  background: rgba(60, 48, 38, 0.42);
  backdrop-filter: blur(2px);
}

.dm-card {
  display: flex;
  flex-direction: column;
  width: min(360px, 90vw);
  max-height: 74vh;
  padding: 16px 18px 12px;
  border-radius: 16px;
  background: #fffdfb;
  box-shadow: 0 24px 60px rgba(90, 70, 40, 0.3);
  animation: dm-pop 0.22s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@keyframes dm-pop {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
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
  padding-bottom: 10px;
  border-bottom: 1px solid #f3e7da;
}

.dm-ava {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #fff;
  font-size: 16.5px;
  font-weight: 700;
}

.dm-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.dm-meta b {
  overflow: hidden;
  color: #4a3f37;
  font-size: 15.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dm-meta span {
  color: #a08063;
  font-size: 12px;
}

.dm-close {
  flex: none;
  padding: 0 4px;
  border: none;
  background: transparent;
  color: #b3a79b;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.dm-thread {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 120px;
  max-height: 46vh;
  margin: 10px 0;
  padding-right: 2px;
  overflow-y: auto;
}

.dm-hint {
  margin: 24px 0;
  color: #b3a79c;
  font-size: 14.5px;
  text-align: center;
}

/* 气泡: 对方靠左浅色, 自己靠右品牌色 */
.dm-bubble {
  align-self: flex-start;
  max-width: 80%;
  padding: 7px 11px;
  border-radius: 12px 12px 12px 4px;
  background: #fdf2e8;
}

.dm-bubble.mine {
  align-self: flex-end;
  border-radius: 12px 12px 4px 12px;
  background: #f6d9c4;
}

.dm-bubble p {
  margin: 0;
  color: #4a3f37;
  font-size: 14.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.dm-bubble time {
  display: block;
  margin-top: 2px;
  color: #b0917a;
  font-size: 11px;
}

.dm-compose {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.dm-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #eddfd0;
  border-radius: 10px;
  background: #fffaf5;
  color: #4a3f37;
  font-size: 14.5px;
  font-family: inherit;
  line-height: 1.6;
  resize: none;
  outline: none;
}

.dm-input:focus {
  border-color: #e0a984;
  background: #fff;
}

.dm-send {
  flex: none;
  padding: 8px 14px;
  border: none;
  border-radius: 10px;
  background: #e0865a;
  color: #fff;
  font-size: 14.5px;
  cursor: pointer;
}

.dm-send:disabled {
  background: #eadfd4;
  color: #b5a79b;
  cursor: not-allowed;
}

.dm-count {
  margin: 4px 0 0;
  color: #c4b5a8;
  font-size: 12px;
  text-align: right;
}

.dm-count.over {
  color: #e0574f;
}

/* 操作提示: 原先是顶部全宽蓝色横幅(#3d6bd8)，已按要求去掉，
   改成右上角一枚不抢视线的小胶囊 */
.mem-toast {
  position: fixed;
  top: 84px;
  right: 22px;
  z-index: 2600;
  max-width: min(78vw, 340px);
  padding: 9px 15px;
  border: 1px solid rgba(217, 145, 92, 0.32);
  border-radius: 999px;
  background: rgba(255, 250, 242, 0.96);
  color: #6a5544;
  font-size: 13.5px;
  line-height: 1.45;
  box-shadow: 0 8px 22px rgba(78, 52, 24, 0.14);
  backdrop-filter: blur(6px);
}

.mem-toast-enter-active,
.mem-toast-leave-active {
  transition: all 0.22s ease;
}
.mem-toast-enter-from,
.mem-toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* AI 生成进度卡: 图片 / 视频 / 润色的「开始生成 → 生成中 → 生成完成」 */
/* 位置：页面正中间上方（原来钉在右下角，用户要求挪到顶部居中）。
   宽度固定 268px，用 margin-left:-134px 做水平居中 —— 不用 translateX，
   是为了不和 mem-toast 的 translateY 过渡互相覆盖。 */
.ai-progress {
  position: fixed;
  top: 84px;
  left: 50%;
  margin-left: -134px;
  z-index: 2600;
  width: 268px;
  padding: 12px 14px 10px;
  border: 1px solid rgba(217, 145, 92, 0.34);
  border-radius: 14px;
  background: rgba(255, 250, 242, 0.97);
  box-shadow: 0 12px 30px rgba(78, 52, 24, 0.18);
  backdrop-filter: blur(8px);
}

.ap-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
}

.ap-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #5c4a3c;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-close {
  flex: none;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 50%;
  background: rgba(120, 96, 74, 0.12);
  color: #6a5544;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.ap-close:hover {
  background: rgba(120, 96, 74, 0.22);
}

.ap-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ap-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 13px;
  color: #6a5544;
}

/* 失败原因另起一行，别把状态文字挤成一团 */
.ap-err {
  flex-basis: 100%;
  font-style: normal;
  font-size: 11.5px;
  line-height: 1.5;
  color: #c9554c;
  word-break: break-word;
}

.ap-item + .ap-item {
  border-top: 1px dashed rgba(190, 165, 140, 0.32);
}

.ap-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d8c6b4;
}

.ap-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-state {
  flex: none;
  font-size: 12px;
  color: #a08a76;
}

/* 开始生成 / 生成中：暖色呼吸；完成：绿色；失败：红色 */
.ap-item.is-run .ap-dot {
  background: #f0b357;
  animation: ap-breathe 1.4s ease-in-out infinite;
}
.ap-item.is-run .ap-state {
  color: #c98a2e;
}
.ap-item.is-done .ap-dot {
  background: #6cc08a;
}
.ap-item.is-done .ap-state {
  color: #4f9d6b;
}
.ap-item.is-fail .ap-dot {
  background: #e8756c;
}
.ap-item.is-fail .ap-state {
  color: #c9554c;
}
@keyframes ap-breathe {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1.25);
  }
}

/* ============================================================================
   手机版式（≤767.98）
   ★ 桌面是「1452×941 海报 + 百分比热点」的整页版式：手机上整张海报被 contain 成
     390×253，所有控件按百分比挤进那个盒子 —— 筛选按钮只有 9px 高、搜索框 18px，
     内容区缩成中间一条。这里改的是一整套布局：
       · 海报退成顶部 128px 装饰条（只取插画最下面的书桌一段，避开烤进图里的标题）
       · 标题/副标题用真实文字重画（见模板 .mem-m-head）
       · 搜索 + 四个筛选回到文档流，排成一行（自动换行）
       · 纸页面板、统计卡变整宽、随页面滚动
   ★ 所有规则都在断点里，桌面一条都不匹配。
   ============================================================================ */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  .memory {
    /* 手机上整页可滚：桌面靠 fixed 海报 + 面板内部滚动，竖屏没有那么高 */
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    background: #fdf7ef;
  }

  .memory-figure {
    position: relative;
    display: block;
    height: auto;
    min-height: 100%;
  }

  /* 解除容器查询的"等比缩放盒子"，改回普通流式容器 */
  .memory-figure-inner {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 8px;
    width: 100%;
    height: auto;
    max-height: none;
    aspect-ratio: auto;
    /* 顶部让出装饰条的位置（装饰条是绝对定位的） */
    padding: 128px 12px calc(18px + env(safe-area-inset-bottom));
  }

  /* 装饰条：只取插画底部的书桌一段（书本/拍立得/手账），完全避开烤在图里的标题字。
     width 262% + object-position 左下 = 放大 2.6 倍后只看到左侧书桌，右侧超出部分被裁掉。 */
  .memory-bg {
    width: 262%;
    height: 128px;
    max-width: none;
    object-fit: cover;
    object-position: 0% 100%;
    /* 底边渐隐到米色，接住下面的内容，不然是一条硬边 */
    -webkit-mask-image: linear-gradient(180deg, #000 54%, rgba(0, 0, 0, 0.35) 82%, transparent 100%);
    mask-image: linear-gradient(180deg, #000 54%, rgba(0, 0, 0, 0.35) 82%, transparent 100%);
    pointer-events: none;
  }

  /* 标题压在装饰条上：左侧米色渐隐做底，保证文字可读，右侧留出插画 */
  .mem-m-head {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    z-index: 2;
    height: 128px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding: 0 16px;
    background: linear-gradient(
      90deg,
      rgba(253, 247, 239, 0.97) 0%,
      rgba(253, 247, 239, 0.9) 42%,
      rgba(253, 247, 239, 0.2) 74%,
      rgba(253, 247, 239, 0) 100%
    );
    pointer-events: none;
  }

  .mem-m-head h1 {
    margin: 0;
    font-size: 27px;
    font-weight: 700;
    letter-spacing: 4px;
    color: #57402f;
    font-family: 'Songti SC', 'STSong', 'SimSun', serif;
  }

  .mem-m-head p {
    margin: 0;
    font-size: 12.5px;
    letter-spacing: 0.5px;
    color: #967f6a;
  }

  /* 搜索：整宽、44px 高（指尖标准热区），圆钮跟着放大 */
  .search-pill {
    position: static;
    flex: 1 1 100%;
    width: auto;
    height: 44px;
    padding: 0 8px 0 14px;
    background: rgba(255, 253, 250, 0.96);
    box-shadow: inset 0 0 0 1px #eaddcd;
    order: 1;
  }

  .search-input {
    font-size: 16px; /* iOS 聚焦不放大 */
    height: 100%; /* 整条胶囊都能点进输入框, 不用瞄准中间那 20px */
  }

  .search-go {
    width: 34px;
    height: 34px;
  }

  /* 四个筛选：回到流里，和搜索同一行自动换行，每个 38px 高 */
  .filter-wrap {
    position: relative;
    top: auto;
    left: auto;
    width: auto;
    height: 38px;
    order: 2;
  }

  .filter-btn {
    height: 38px;
    padding: 0 10px;
    gap: 5px;
    font-size: 13px;
  }

  /* 下拉菜单：贴住自己的按钮，宽度按内容走（原来的 100% 只有 80px 宽，选项被截） */
  .filter-wrap .menu {
    width: max-content;
    min-width: 132px;
    max-width: 70vw;
    max-height: 46dvh;
    overflow: auto;
  }

  .filter-wrap .menu button {
    min-height: 40px;
    font-size: 14px;
  }

  /* 海报上那条「把日子过成值得收藏的样子」装饰带在手机上会挤在筛选和纸页之间，去掉 */
  .band-deco {
    display: none;
  }

  /* 纸页面板：整宽、高度随内容、不再内部滚动（页面整体滚） */
  .body-panel {
    position: static;
    flex: 1 1 100%;
    width: auto;
    height: auto;
    min-height: 0;
    margin-top: 4px;
    padding: 12px;
    order: 3;
  }

  .body-head {
    gap: 8px;
  }

  .add-btn {
    min-height: 40px;
    padding: 0 12px;
  }

  .entry-list {
    overflow: visible;
    grid-template-columns: 1fr;
    gap: 9px;
  }

  .entry-card {
    padding: 12px;
  }

  /* 卡片右上角「已分享」、详情、三个操作按钮：原来是 23/21px 高，手指点不准 */
  .entry-share {
    min-height: 38px;
    padding: 0 10px;
    top: 8px;
    right: 8px;
  }

  .entry-detail-btn {
    min-height: 36px;
    padding: 0 10px;
  }

  .entry-actions {
    gap: 8px;
  }

  .entry-actions button {
    flex: 1 1 0;
    min-height: 38px;
    padding: 0 8px;
  }

  /* 统计卡：从右侧浮层变成列表下面的一块横排 */
  .stats-panel {
    position: static;
    flex: 1 1 100%;
    width: auto;
    height: auto;
    padding: 12px 14px;
    order: 4;
  }

  .stats-row {
    display: inline-flex;
    gap: 6px;
    margin-right: 12px;
  }

  /* 写日记 / 详情的弹窗：底部抽屉，高度封在 88dvh，底部留安全区 */
  .dialog-mask {
    position: fixed;
    align-items: flex-end;
    z-index: 60;
  }

  .dialog {
    width: 100%;
    max-width: 100%;
    max-height: 88dvh;
    border-radius: 18px 18px 0 0;
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
  }

  /* 弹窗里的日期/空间等小控件也抬到 40px */
  .field input,
  .field select,
  .field textarea {
    min-height: 40px;
  }

  .dialog-actions button {
    min-height: 44px;
  }

  /* 手机上没有 hover，睡猫的想法气泡会浮在卡片上，藏掉 */
  .idle-thought {
    display: none;
  }
}
</style>
