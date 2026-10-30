<template>
  <div class="admin">
    <div class="admin-figure">
      <div class="admin-figure-inner">
        <img
    class="admin-bg"
    src="../assets/opt/profileBackground.webp"
    srcset="../assets/opt/profileBackground-sm.webp 1000w, ../assets/opt/profileBackground.webp 1442w"
    sizes="100vw"
    alt=""
    decoding="async"
  />

        <div class="admin-card">
          <div class="admin-head">
            <b>管理中心</b>
            <span>拾光后台</span>
          </div>

          <!-- Tab 导航 -->
          <div class="admin-tabs">
            <button
              v-for="t in TABS"
              :key="t.key"
              class="admin-tab"
              :class="{ on: tab === t.key }"
              type="button"
              @click="switchTab(t.key)"
            >
              {{ t.label }}
              <i v-if="t.badge" class="admin-badge">{{ t.badge }}</i>
            </button>
          </div>

          <!-- 反馈管理 -->
          <div v-if="tab === 'feedback'" class="admin-panel">
            <div class="panel-filter">
              <select v-model="fbFilter.type" class="panel-select" @change="loadFeedback">
                <option value="">全部类型</option>
                <option value="1">功能建议</option>
                <option value="2">问题反馈</option>
                <option value="3">体验优化</option>
              </select>
            </div>
            <div class="panel-list">
              <div v-for="item in feedbackList" :key="item.id" class="panel-item">
                <div class="item-head">
                  <i class="item-status" :class="fbStatusClass(item.status)">{{ fbStatusText(item.status) }}</i>
                  <span class="item-type">{{ fbTypeText(item.type) }}</span>
                  <span class="item-user">{{ item.u_nickname || item.u_username || '匿名用户' }}</span>
                  <span v-if="item.contact" class="item-contact">📧 {{ item.contact }}</span>
                  <span class="item-date">{{ fmtDate(item.created_at) }}</span>
                </div>
                <p class="item-content">{{ item.content }}</p>
                <div v-if="item.reply" class="item-reply" :class="{ rejected: item.status === 3 }">
                  {{ item.status === 3 ? '驳回原因' : '官方回复' }}: {{ item.reply }}
                </div>
                <div v-if="item.user_reply" class="item-user-reply">
                  用户追问: {{ item.user_reply }}
                </div>
                <div class="item-actions">
                  <select v-model="item._status" class="item-select" @change="updateFeedback(item)">
                    <option value="0">待处理</option>
                    <option value="1">已采纳</option>
                    <option value="2">已解决</option>
                    <option value="3">已驳回</option>
                  </select>
                  <input v-model="item._reply" class="item-input" placeholder="官方回复/驳回原因..." />
                  <button class="item-btn save" type="button" @click="updateFeedback(item)">发送</button>
                  <button class="item-btn del" type="button" @click="confirmDelete('feedback', item.id)">删除</button>
                </div>
              </div>
              <div v-if="!feedbackList.length" class="panel-empty">暂无反馈</div>
            </div>
          </div>

          <!-- 举报管理 -->
          <div v-if="tab === 'report'" class="admin-panel">
            <div class="panel-filter">
              <select v-model="rpFilter.status" class="panel-select" @change="loadReports">
                <option value="">全部状态</option>
                <option value="0">待处理</option>
                <option value="1">已处理</option>
                <option value="2">已驳回</option>
              </select>
            </div>
            <div class="panel-list">
              <div v-for="item in reportList" :key="item.id" class="panel-item">
                <div class="item-head">
                  <i class="item-status" :class="rpStatusClass(item.status)">{{ rpStatusText(item.status) }}</i>
                  <span class="item-type">{{ rpTargetText(item.target_type) }}</span>
                  <span class="item-user">举报人: {{ item.reporter_name || '未知' }}</span>
                  <span class="item-date">{{ fmtDate(item.created_at) }}</span>
                </div>
                <p class="item-content">举报原因: {{ item.reason }}</p>
                <div v-if="item.handle_note" class="item-reply">处理备注: {{ item.handle_note }}</div>
                <div class="item-actions">
                  <button class="item-btn view" type="button" @click="openReportDetail(item)">详情</button>
                  <select v-model="item._status" class="item-select" @change="updateReport(item)">
                    <option value="0">待处理</option>
                    <option value="1">已处理</option>
                    <option value="2">已驳回</option>
                  </select>
                  <input v-model="item._note" class="item-input" placeholder="处理备注..." />
                  <button class="item-btn save" type="button" @click="updateReport(item)">保存</button>
                  <!-- 下架：把被举报内容撤下来 + 私信通知双方（2026-10-29 需求） -->
                  <button
                    v-if="item.target_type !== 3"
                    class="item-btn down"
                    type="button"
                    :disabled="item._downing"
                    @click="takeDownReport(item)"
                  >
                    {{ item._downing ? '处理中…' : '下架并通知' }}
                  </button>
                  <button class="item-btn del" type="button" @click="confirmDelete('report', item.id)">删除</button>
                </div>
              </div>
              <div v-if="!reportList.length" class="panel-empty">暂无举报</div>
            </div>
          </div>

          <!-- 活动管理 -->
          <div v-if="tab === 'activity'" class="admin-panel">
            <div class="panel-filter">
              <button class="item-btn create" type="button" @click="showActivityForm = !showActivityForm">
                {{ showActivityForm ? '取消' : '+ 新建活动' }}
              </button>
            </div>
            <div v-if="showActivityForm" class="activity-form">
              <div class="polish-row">
                <input v-model="actForm.title" class="item-input full" placeholder="活动标题" />
                <!-- AI 润色: 按管理员已写的内容扩写详细化(2026-10-20 用户要求) -->
                <button
                  class="item-btn polish"
                  type="button"
                  :disabled="polishing === 'activity' || (!actForm.title.trim() && !actForm.content.trim())"
                  @click="polishActivity"
                >
                  {{ polishing === 'activity' ? '润色中…' : '✨ AI 润色' }}
                </button>
              </div>
              <textarea v-model="actForm.content" class="item-textarea" placeholder="活动详情"></textarea>
              <div class="cover-upload">
                <input ref="coverInput" type="file" accept="image/*" style="display: none" @change="onCoverChange" />
                <button class="item-btn" type="button" @click="$refs.coverInput.click()">
                  {{ actForm.cover ? '更换封面' : '上传封面' }}
                </button>
                <img v-if="actForm.cover" :src="actForm.cover" class="cover-preview" />
              </div>
              <div class="form-row">
                <select v-model="actForm.type" class="item-select">
                  <option :value="1">公告</option>
                  <option :value="2">活动</option>
                  <option :value="3">更新</option>
                </select>
                <label class="form-check">
                  <input v-model="actForm.is_public" type="checkbox" :true-value="1" :false-value="0" />
                  公开
                </label>
                <label class="form-check">
                  <input v-model="actForm.is_major" type="checkbox" :true-value="1" :false-value="0" />
                  大型活动
                </label>
                <input v-model.number="actForm.sort" class="item-select" type="number" placeholder="排序" style="width: 80px" />
              </div>
              <div class="form-row">
                <div class="time-field">
                  <label>开始时间</label>
                  <input v-model="actForm.start_time" class="item-input" type="datetime-local" />
                </div>
                <div class="time-field">
                  <label>结束时间</label>
                  <input v-model="actForm.end_time" class="item-input" type="datetime-local" />
                </div>
              </div>
              <button class="item-btn save" type="button" @click="saveActivity">{{ editingActivity ? '更新' : '创建' }}</button>
            </div>
            <div class="panel-list">
              <!-- 活动状态筛选: 顺序按用户要求改成 全部 → 进行中 → 已完成(2026-10-20) -->
              <div class="act-filter-tabs">
                <button :class="{ active: actFilter === 'all' }" @click="actFilter = 'all'">全部 ({{ activityList.length }})</button>
                <button :class="{ active: actFilter === 'ongoing' }" @click="actFilter = 'ongoing'">进行中 ({{ ongoingActivities.length }})</button>
                <button :class="{ active: actFilter === 'completed' }" @click="actFilter = 'completed'">已完成 ({{ completedActivities.length }})</button>
              </div>
              <div v-for="item in filteredActivities" :key="item.id" class="panel-item">
                <div class="item-head">
                  <i class="item-status" :class="item.is_public ? 'ok' : 'wait'">{{ item.is_public ? '公开' : '隐藏' }}</i>
                  <span class="item-type">{{ actTypeText(item.type) }}</span>
                  <i v-if="item.is_major" class="item-status major">大型</i>
                  <i v-if="item.status === 0" class="item-status wait">未开始</i>
                  <i v-else-if="item.status === 1" class="item-status ok">进行中</i>
                  <i v-else-if="item.status === 2" class="item-status expired">已结束</i>
                  <span class="item-date">{{ fmtDate(item.created_at) }}</span>
                </div>
                <p class="item-content"><b>{{ item.title }}</b></p>
                <p class="item-content" style="font-size: 13px; color: #8a7a6d">{{ item.content }}</p>
                <p v-if="item.start_time || item.end_time" class="item-content" style="font-size: 13px; color: #6b8e9e">
                  {{ item.start_time ? fmtDateTime(item.start_time) : '?' }} ~ {{ item.end_time ? fmtDateTime(item.end_time) : '不限' }}
                </p>
                <p class="item-content" style="font-size: 13px; color: #a07070">
                  👍 {{ item.likes || 0 }} · 💬 {{ item.comments || 0 }} · 👥 {{ item.joined || 0 }}
                </p>
                <div class="item-actions">
                  <button class="item-btn save" type="button" @click="editActivity(item)">编辑</button>
                  <!-- 「撤销」改名「标记为已结束」(2026-10-20 用户要求):
                       原来叫撤销, 用户看不出点完之后活动会变成什么状态。 -->
                  <button v-if="item.status === 1" class="item-btn" type="button" @click="cancelActivity(item)">标记为已结束</button>
                  <button v-if="item.status === 2" class="item-btn" type="button" @click="restartActivity(item)">重新开始</button>
                  <button class="item-btn del" type="button" @click="confirmDelete('activity', item.id)">删除</button>
                </div>
              </div>
              <div v-if="!filteredActivities.length" class="panel-empty">暂无活动</div>
            </div>
          </div>

          <!-- 用户管理 -->
          <div v-if="tab === 'user'" class="admin-panel">
            <div class="panel-filter">
              <input v-model="userKeyword" class="item-input search" placeholder="搜索用户手机号名/昵称..." @keyup.enter="loadUsers" />
              <button class="item-btn save" type="button" @click="loadUsers">搜索</button>
            </div>
            <div class="user-role-tabs">
              <button class="user-role-tab" :class="{ on: userRoleFilter === 'all' }" type="button" @click="userRoleFilter = 'all'">全部 ({{ userList.length }})</button>
              <button class="user-role-tab" :class="{ on: userRoleFilter === 'admin' }" type="button" @click="userRoleFilter = 'admin'">管理员 ({{ userList.filter(u => u.role).length }})</button>
              <button class="user-role-tab" :class="{ on: userRoleFilter === 'normal' }" type="button" @click="userRoleFilter = 'normal'">普通用户 ({{ userList.filter(u => !u.role && !u.is_wechat).length }})</button>
              <!-- 微信扫码免注册的账号单独一类: 它们没有手机号密码, 只有微信身份 -->
              <button class="user-role-tab" :class="{ on: userRoleFilter === 'wechat' }" type="button" @click="userRoleFilter = 'wechat'">微信用户 ({{ userList.filter(u => u.is_wechat).length }})</button>
            </div>
            <div class="panel-list">
              <div v-for="item in filteredUsers" :key="item.id" class="panel-item">
                <div class="item-head">
                  <i class="item-status" :class="item.role ? 'ok' : 'wait'">{{ item.role ? '管理员' : '普通' }}</i>
                  <!-- 超级管理员: 最高权限, 且这一行是锁死的(不可删除 / 不可取消 / 不可禁用 / 密码不可重置) -->
                  <i v-if="isSuperRow(item)" class="item-status super" title="最高权限账号，受保护">超级管理员</i>
                  <!-- 微信扫码免注册的账号：来源单独标出来，方便运营区分 -->
                  <i v-if="item.is_wechat" class="item-status wx" title="微信扫码注册">微信</i>
                  <i class="item-status" :class="item.status === 1 ? 'done' : 'del'">{{ item.status === 1 ? '正常' : '禁用' }}</i>
                  <span class="item-user">{{ item.phone || (item.is_wechat ? '微信用户' : item.username) }}</span>
                  <span class="item-user" style="color: #8a7a6d">{{ item.nickname }}</span>
                  <span class="item-date">{{ fmtDate(item.created_at) }}</span>
                </div>
                <!-- ★ 2026-10-29: 口令不再显示（验证报告 FIND-02）。
                     服务端现在只回 has_password，明文彻底不出网；需要时用右侧「重置」。 -->
                <div class="item-pwd-row">
                  <span class="item-pwd-label">密码</span>
                  <code class="item-pwd">{{ item.has_password ? '已设置 · 出于安全不显示' : '未设置' }}</code>
                  <button
                    class="item-btn"
                    type="button"
                    :disabled="isSuperRow(item)"
                    :title="isSuperRow(item) ? '超级管理员的密码不可重置（后端同样拦截）' : '给该用户设置新密码'"
                    @click="openResetPwd(item)"
                  >
                    {{ isSuperRow(item) ? '不可重置' : '重置' }}
                  </button>
                </div>
                <div class="item-actions">
                  <button
                    v-if="isSuperAdmin"
                    class="item-btn"
                    :class="item.role ? 'del' : 'save'"
                    type="button"
                    :disabled="isSuperRow(item)"
                    :title="isSuperRow(item) ? '超级管理员不可被取消管理员身份' : ''"
                    @click="confirmUserAction('toggleAdmin', item)"
                  >
                    {{ isSuperRow(item) ? '不可取消' : item.role ? '取消管理员' : '设为管理员' }}
                  </button>
                  <button
                    class="item-btn"
                    :class="item.status === 1 ? 'del' : 'save'"
                    type="button"
                    :disabled="isSuperRow(item)"
                    :title="isSuperRow(item) ? '超级管理员不可被禁用' : ''"
                    @click="confirmUserAction('toggleStatus', item)"
                  >
                    {{ item.status === 1 ? '禁用' : '解禁' }}
                  </button>
                  <button
                    class="item-btn del"
                    type="button"
                    :disabled="isSuperRow(item)"
                    :title="isSuperRow(item) ? '超级管理员不可被删除' : ''"
                    @click="confirmUserAction('remove', item)"
                  >
                    删除
                  </button>
                  <button
                    class="item-btn"
                    :class="chatAllowedOf(item) ? 'save' : 'del'"
                    type="button"
                    :disabled="!aiCfg.reply"
                    :title="aiCfg.reply ? '单独控制该用户能否使用 AI 对话' : '总控制已关闭: 所有用户均不可使用 AI'"
                    @click="toggleUserAi(item, 'chat')"
                  >
                    AI回复 · {{ aiCfg.reply ? (chatAllowedOf(item) ? '允许' : '禁止') : '总控禁止' }}
                  </button>
                  <button
                    class="item-btn"
                    :class="imageAllowedOf(item) ? 'save' : 'del'"
                    type="button"
                    :disabled="!aiCfg.reply || !aiCfg.image"
                    :title="aiCfg.reply && aiCfg.image ? '单独控制该用户能否使用 AI 生图' : '总控制已关闭: 所有用户均不可使用 AI 生图'"
                    @click="toggleUserAi(item, 'image')"
                  >
                    AI生图 · {{ aiCfg.reply && aiCfg.image ? (imageAllowedOf(item) ? '允许' : '禁止') : '总控禁止' }}
                  </button>
                  <button
                    class="item-btn"
                    :class="videoAllowedOf(item) ? 'save' : 'del'"
                    type="button"
                    :disabled="!aiCfg.reply || !aiCfg.image || !aiCfg.video"
                    :title="aiCfg.reply && aiCfg.image && aiCfg.video ? '单独控制该用户能否使用 AI 生视频' : '总控制已关闭: 所有用户均不可使用 AI 生视频'"
                    @click="toggleUserAi(item, 'video')"
                  >
                    AI生视频 · {{
                      aiCfg.reply && aiCfg.image && aiCfg.video
                        ? videoAllowedOf(item)
                          ? '允许'
                          : '禁止'
                        : '总控禁止'
                    }}
                  </button>
                </div>
              </div>
              <div v-if="!filteredUsers.length" class="panel-empty">暂无用户</div>
            </div>
          </div>

          <!-- 通知管理 -->
          <div v-if="tab === 'notification'" class="admin-panel">
            <div class="notify-form">
              <h4>发送通知</h4>
              <p class="notify-hint">通知会出现在拾光广场顶部的「官方通知」公告条里，只读、不可评论点赞</p>
              <div class="polish-row">
                <input v-model="notifyTitle" class="item-input" placeholder="通知标题" />
                <!-- AI 润色: 按管理员已写的内容扩写详细化(2026-10-20 用户要求) -->
                <button
                  class="item-btn polish"
                  type="button"
                  :disabled="polishing === 'notice' || (!notifyTitle.trim() && !notifyContent.trim())"
                  @click="polishNotice"
                >
                  {{ polishing === 'notice' ? '润色中…' : '✨ AI 润色' }}
                </button>
              </div>
              <textarea v-model="notifyContent" class="notify-textarea" placeholder="通知内容..." rows="4"></textarea>
              <button
                class="item-btn save"
                type="button"
                :disabled="!notifyTitle.trim() || !notifyContent.trim()"
                @click="sendNotification"
              >
                发送通知
              </button>
            </div>
            <div class="panel-list">
              <div v-for="item in notificationList" :key="item.id" class="panel-item">
                <div class="item-head">
                  <span class="item-user">{{ item.title }}</span>
                  <!-- 群发是按用户逐条存的, 这里显示这条通知实际发给了多少人 -->
                  <span v-if="item.recv_count" class="item-recv">已发给 {{ item.recv_count }} 人</span>
                  <span class="item-date">{{ fmtDate(item.created_at) }}</span>
                </div>
                <p class="item-content">{{ item.content }}</p>
                <div class="item-actions">
                  <button class="item-btn del" type="button" @click="confirmDelete('notification', item.id)">删除</button>
                </div>
              </div>
              <div v-if="!notificationList.length" class="panel-empty">暂无通知</div>
            </div>
          </div>

          <!-- AI 使用管理 -->
          <div v-if="tab === 'ai'" class="admin-panel">
            <!-- AI 密钥: 只有超级管理员看得到。点保存立刻写后端并生效, 不用重启服务 -->
            <div v-if="isSuperAdmin" class="ai-keys">
              <h4>
                AI 密钥
                <span class="ai-keys-scope">仅超级管理员可见 / 可改</span>
              </h4>
              <p class="notify-hint">
                每一栏写清了这把密钥控制的功能；保存后立刻写入服务器并生效（不用重启、不用重新部署）。
                页面只显示掩码，明文密钥不会下发到浏览器；清空输入直接点「清除」= 删除后台设置，回落到服务器
                .env 里的密钥。
              </p>
              <div v-for="k in aiKeys" :key="k.kind" class="ai-key-row">
                <div class="ai-key-meta">
                  <div class="ai-key-title">
                    <b>{{ k.label }}</b>
                    <i class="ai-key-state" :class="k.set ? 'ok' : 'none'">
                      {{ k.set ? (k.source === 'db' ? '后台设置 · 生效中' : '来自 .env · 生效中') : '未配置' }}
                    </i>
                  </div>
                  <!-- 明确这一个密钥管的是哪些功能 -->
                  <span class="ai-key-desc">{{ k.desc }}</span>
                  <code class="ai-key-mask" :title="k.env">{{ k.masked || '（空）' }}</code>
                </div>
                <div class="ai-key-edit">
                  <input
                    v-model="k.draft"
                    class="item-input"
                    type="password"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="k.set ? '粘贴新密钥以替换…' : '粘贴密钥…'"
                    @keyup.enter="saveAiKey(k)"
                  />
                  <button class="item-btn save" type="button" :disabled="k.busy || !k.draft.trim()" @click="saveAiKey(k)">
                    {{ k.busy ? '保存中…' : '保存' }}
                  </button>
                  <button
                    class="item-btn"
                    type="button"
                    :disabled="k.busy || k.source !== 'db'"
                    :title="k.source === 'db' ? '删除后台设置，回落到 .env' : '当前用的就是 .env，没有可清除的后台设置'"
                    @click="clearAiKey(k)"
                  >
                    清除
                  </button>
                </div>
              </div>
              <p v-if="aiKeysError" class="ai-key-err">{{ aiKeysError }}</p>
            </div>

            <div class="ai-config">
              <h4>AI 能力总开关</h4>
              <p class="notify-hint">
                对全站所有用户生效：开启「AI 生图」会自动开启「AI 自动回复」；开启「AI 生视频」会自动开启「AI
                自动回复」与「AI 生图」；关闭「AI 自动回复」时，生图与生视频会一并关闭。
              </p>
              <div class="ai-switch-list">
                <div class="ai-switch-row">
                  <span class="ai-switch-name">AI 自动回复</span>
                  <span class="ai-switch-desc">用户可与小橘 AI 对话</span>
                  <button
                    class="item-btn"
                    :class="aiCfg.reply ? 'save' : 'del'"
                    type="button"
                    :disabled="aiCfg.busy"
                    @click="toggleAiGlobal('reply')"
                  >
                    {{ aiCfg.reply ? '已开启' : '已关闭' }}
                  </button>
                </div>
                <div class="ai-switch-row">
                  <span class="ai-switch-name">AI 生图</span>
                  <span class="ai-switch-desc">AI 生成记忆封面（开启会自动打开自动回复）</span>
                  <button
                    class="item-btn"
                    :class="aiCfg.image ? 'save' : 'del'"
                    type="button"
                    :disabled="aiCfg.busy"
                    @click="toggleAiGlobal('image')"
                  >
                    {{ aiCfg.image ? '已开启' : '已关闭' }}
                  </button>
                </div>
                <div class="ai-switch-row">
                  <span class="ai-switch-name">AI 生视频</span>
                  <span class="ai-switch-desc">功能开发中，开启后自动打开自动回复与生图</span>
                  <button
                    class="item-btn"
                    :class="aiCfg.video ? 'save' : 'del'"
                    type="button"
                    :disabled="aiCfg.busy"
                    @click="toggleAiGlobal('video')"
                  >
                    {{ aiCfg.video ? '已开启' : '已关闭' }}
                  </button>
                </div>
              </div>
            </div>
            <div class="panel-filter">
              <input v-model="userKeyword" class="item-input search" placeholder="搜索手机号/昵称..." @keyup.enter="loadUsers" />
              <button class="item-btn save" type="button" @click="loadUsers">搜索</button>
            </div>
            <div class="panel-list">
              <div v-for="item in filteredUsers" :key="item.id" class="panel-item">
                <div class="item-head">
                  <i class="item-status" :class="item.role ? 'ok' : 'wait'">{{ item.role ? '管理员' : '普通' }}</i>
                  <span class="item-user">{{ item.username }}</span>
                  <span class="item-user" style="color: #8a7a6d">{{ item.nickname }}</span>
                  <span class="item-date">{{ fmtDate(item.created_at) }}</span>
                </div>
                <div class="item-actions">
                  <button
                    class="item-btn"
                    :class="chatAllowedOf(item) ? 'save' : 'del'"
                    type="button"
                    :disabled="!aiCfg.reply"
                    :title="aiCfg.reply ? '单独控制该用户能否使用 AI 对话' : '总控制已关闭: 所有用户均不可使用 AI'"
                    @click="toggleUserAi(item, 'chat')"
                  >
                    AI回复 · {{ aiCfg.reply ? (chatAllowedOf(item) ? '允许' : '禁止') : '总控禁止' }}
                  </button>
                  <button
                    class="item-btn"
                    :class="imageAllowedOf(item) ? 'save' : 'del'"
                    type="button"
                    :disabled="!aiCfg.reply || !aiCfg.image"
                    :title="aiCfg.reply && aiCfg.image ? '单独控制该用户能否使用 AI 生图' : '总控制已关闭: 所有用户均不可使用 AI 生图'"
                    @click="toggleUserAi(item, 'image')"
                  >
                    AI生图 · {{ aiCfg.reply && aiCfg.image ? (imageAllowedOf(item) ? '允许' : '禁止') : '总控禁止' }}
                  </button>
                  <button
                    class="item-btn"
                    :class="videoAllowedOf(item) ? 'save' : 'del'"
                    type="button"
                    :disabled="!aiCfg.reply || !aiCfg.image || !aiCfg.video"
                    :title="aiCfg.reply && aiCfg.image && aiCfg.video ? '单独控制该用户能否使用 AI 生视频' : '总控制已关闭: 所有用户均不可使用 AI 生视频'"
                    @click="toggleUserAi(item, 'video')"
                  >
                    AI生视频 · {{
                      aiCfg.reply && aiCfg.image && aiCfg.video
                        ? videoAllowedOf(item)
                          ? '允许'
                          : '禁止'
                        : '总控禁止'
                    }}
                  </button>
                </div>
              </div>
              <div v-if="!filteredUsers.length" class="panel-empty">暂无用户</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 自定义确认弹窗 -->
    <div v-if="confirmModal.show" class="custom-confirm-overlay" @click.self="closeConfirm">
      <div class="custom-confirm">
        <div class="cc-head">
          <h3>{{ confirmModal.title }}</h3>
          <button class="cc-close" type="button" @click="closeConfirm">&times;</button>
        </div>
        <div class="cc-body">
          <p>{{ confirmModal.message }}</p>
        </div>
        <div class="cc-foot">
          <button class="cc-btn cancel" type="button" @click="closeConfirm">取消</button>
          <button class="cc-btn confirm" type="button" @click="executeConfirm">确定</button>
        </div>
      </div>
    </div>

    <!-- 管理员密码验证弹窗 -->
    <div v-if="pwdModal.show" class="custom-confirm-overlay" @click.self="closePwdModal">
      <div class="custom-confirm">
        <div class="cc-head">
          <h3>管理员验证</h3>
          <button class="cc-close" type="button" @click="closePwdModal">&times;</button>
        </div>
        <div class="cc-body">
          <p>请输入管理员密码以确认操作</p>
          <input v-model="pwdModal.password" type="password" class="cc-pwd-input" placeholder="管理员密码" @keyup.enter="verifyAndExecute" />
          <p v-if="pwdModal.error" class="cc-error">{{ pwdModal.error }}</p>
        </div>
        <div class="cc-foot">
          <button class="cc-btn cancel" type="button" @click="closePwdModal">取消</button>
          <button class="cc-btn confirm" type="button" @click="verifyAndExecute">确认</button>
        </div>
      </div>
    </div>

    <!-- 重置用户密码弹窗 -->
    <div v-if="resetPwd.show" class="custom-confirm-overlay" @click.self="closeResetPwd">
      <div class="custom-confirm">
        <div class="cc-head">
          <h3>重置密码</h3>
          <button class="cc-close" type="button" @click="closeResetPwd">&times;</button>
        </div>
        <div class="cc-body">
          <p class="cc-target">
            目标用户: <b>{{ resetPwd.nickname || resetPwd.username }}</b>@{{ resetPwd.username }}
          </p>
          <p class="cc-note">重置后新密码会立即生效, 该用户需要用新密码登录。</p>
          <input
            v-model="resetPwd.adminPwd"
            type="password"
            class="cc-pwd-input"
            placeholder="你的管理员密码(验证身份)"
          />
          <div class="cc-row">
            <input
              v-model="resetPwd.newPwd"
              type="text"
              class="cc-pwd-input"
              placeholder="新密码, 至少 6 位"
              @keyup.enter="doResetPwd"
            />
            <button class="cc-btn mini" type="button" @click="resetPwd.newPwd = randomPwd()">随机</button>
          </div>
          <p v-if="resetPwd.error" class="cc-error">{{ resetPwd.error }}</p>
          <p v-if="resetPwd.done" class="cc-done">
            已重置为 <b>{{ resetPwd.done }}</b>, 请自行告知该用户。
          </p>
        </div>
        <div class="cc-foot">
          <button class="cc-btn cancel" type="button" @click="closeResetPwd">
            {{ resetPwd.done ? '关闭' : '取消' }}
          </button>
          <button
            v-if="!resetPwd.done"
            class="cc-btn confirm"
            type="button"
            :disabled="resetPwd.busy"
            @click="doResetPwd"
          >
            {{ resetPwd.busy ? '提交中…' : '确认重置' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 举报详情弹窗: 查看举报对象的实际内容 -->
    <div v-if="rpDetail.show" class="custom-confirm-overlay" @click.self="closeReportDetail">
      <div class="custom-confirm rp-detail">
        <div class="cc-head">
          <h3>举报详情</h3>
          <button class="cc-close" type="button" @click="closeReportDetail">&times;</button>
        </div>
        <div class="cc-body rp-detail-body">
          <div v-if="rpDetail.loading" class="rp-loading">加载中…</div>
          <template v-else>
            <div class="rp-meta">
              <span class="rp-chip">{{ rpTargetText(rpDetail.report?.target_type) }}</span>
              <span class="rp-chip" :class="rpStatusClass(rpDetail.report?.status)">{{ rpStatusText(rpDetail.report?.status) }}</span>
              <span class="rp-meta-text">举报人: {{ rpDetail.report?.reporter_name || '未知' }}</span>
              <span class="rp-meta-text">{{ fmtDate(rpDetail.report?.created_at) }}</span>
            </div>
            <p class="rp-reason">举报原因: {{ rpDetail.report?.reason }}</p>
            <div v-if="rpDetail.target" class="rp-target">
              <div class="rp-target-head">
                <span class="rp-target-kind">被举报{{ rpDetail.target.kind }}</span>
                <span class="rp-target-author">作者: {{ rpDetail.target.author }}</span>
                <span v-if="rpDetail.target.created_at" class="rp-target-date">{{ fmtDate(rpDetail.target.created_at) }}</span>
              </div>
              <p class="rp-target-content">{{ rpDetail.target.content }}</p>
              <div v-if="rpDetail.target.images" class="rp-target-imgs">
                <img v-for="(src, i) in parseImages(rpDetail.target.images)" :key="i" class="rp-target-img" :src="src" alt="" loading="lazy" decoding="async" />
              </div>
              <div v-if="rpDetail.target.tags" class="rp-target-tags">
                <span v-for="(t, i) in parseTags(rpDetail.target.tags)" :key="i" class="rp-tag">#{{ t }}</span>
              </div>
            </div>
            <div v-else class="rp-target-gone">举报对象已被删除或不存在</div>
          </template>
        </div>
        <div class="cc-foot">
          <button class="cc-btn cancel" type="button" @click="closeReportDetail">关闭</button>
        </div>
      </div>
    </div>

    <!-- Toast 提示 -->
    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toast.show" class="admin-toast" :class="toast.type">
          {{ toast.message }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
// 管理中心: 反馈/举报/活动/用户 增删改查
import { computed, onMounted, reactive, ref } from 'vue'
import { cloudApi } from '@/api/cloud'
import { useCloudAuthStore } from '@/stores/cloudAuth'

const auth = useCloudAuthStore()
// 超级管理员手机号: 敏感操作的口令复核都以它为准(后端 SUPER_ADMIN_USERNAME 的同名常量)
const SUPER_ADMIN_USERNAME = '18801314366'
const isSuperAdmin = computed(() => auth.user && auth.user.username === SUPER_ADMIN_USERNAME)
// 某一行是不是超级管理员(决定这一行的删除/取消/禁用/重置是否锁死)
function isSuperRow(item) {
  return !!item && item.username === SUPER_ADMIN_USERNAME
}

const TABS = [
  { key: 'feedback', label: '反馈管理' },
  { key: 'report', label: '举报管理' },
  { key: 'activity', label: '活动管理' },
  { key: 'user', label: '用户管理' },
  { key: 'notification', label: '通知管理' },
  { key: 'ai', label: 'AI 使用' },
]

const tab = ref('feedback')
const feedbackList = ref([])
const reportList = ref([])
const activityList = ref([])
const userList = ref([])
const userKeyword = ref('')
const userRoleFilter = ref('all') // all | admin | normal
const showActivityForm = ref(false)
const editingActivity = ref(null)
const actFilter = ref('ongoing') // ongoing | completed | all

const ongoingActivities = computed(() => activityList.value.filter((a) => a.status === 1))
const completedActivities = computed(() => activityList.value.filter((a) => a.status === 2))
const filteredActivities = computed(() => {
  if (actFilter.value === 'ongoing') return ongoingActivities.value
  if (actFilter.value === 'completed') return completedActivities.value
  return activityList.value
})

const filteredUsers = computed(() => {
  if (userRoleFilter.value === 'admin') return userList.value.filter((u) => u.role)
  // 三类互斥: 普通用户 = 非管理员且不是微信注册; 微信用户单独一类
  if (userRoleFilter.value === 'normal') return userList.value.filter((u) => !u.role && !u.is_wechat)
  if (userRoleFilter.value === 'wechat') return userList.value.filter((u) => u.is_wechat)
  return userList.value
})

// 通知
const notifyTitle = ref('')
const notifyContent = ref('')
const notificationList = ref([])

// 确认弹窗状态
const confirmModal = reactive({ show: false, title: '', message: '', action: null })
// 密码验证弹窗状态
const pwdModal = reactive({ show: false, password: '', error: '', pendingAction: null })
// 重置用户密码弹窗状态
const resetPwd = reactive({
  show: false,
  id: 0,
  username: '',
  nickname: '',
  adminPwd: '',
  newPwd: '',
  error: '',
  done: '',
  busy: false,
})

// 列表里显示真实密码; 太长就截一段, 完整值放在 title 里
// pwdBrief 已删除（2026-10-29）：服务端不再下发口令，界面只显示「已设置/未设置」

// 随机新密码: 去掉 0/O/1/l/I 等易混字符
function randomPwd() {
  const pool = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 10 }, () => pool[Math.floor(Math.random() * pool.length)]).join('')
}

function openResetPwd(item) {
  Object.assign(resetPwd, {
    show: true,
    id: item.id,
    username: item.username || '',
    nickname: item.nickname || '',
    adminPwd: '',
    newPwd: randomPwd(),
    error: '',
    done: '',
    busy: false,
  })
}

function closeResetPwd() {
  resetPwd.show = false
  resetPwd.adminPwd = ''
  resetPwd.error = ''
  resetPwd.done = ''
  resetPwd.busy = false
}

async function doResetPwd() {
  resetPwd.error = ''
  if (!resetPwd.adminPwd) return (resetPwd.error = '请输入你的管理员密码')
  if (String(resetPwd.newPwd || '').length < 6) return (resetPwd.error = '新密码至少 6 位')
  resetPwd.busy = true
  try {
    // 与「设为管理员 / 禁用 / 删除」同一道闸门: 用超管口令复核一次
    const res = await cloudApi.login({ username: SUPER_ADMIN_USERNAME, password: resetPwd.adminPwd })
    if (!res?.token) {
      resetPwd.error = '管理员密码错误'
      return
    }
    const r = await cloudApi.adminResetUserPassword({ id: resetPwd.id, password: resetPwd.newPwd })
    resetPwd.done = (r && r.password) || resetPwd.newPwd
    await loadUsers()
  } catch (e) {
    resetPwd.error = e.message || '重置失败'
  } finally {
    resetPwd.busy = false
  }
}

// Toast 提示
const toast = reactive({ show: false, message: '', type: 'success' })
let toastTimer = null

function showToast(message, type = 'success') {
  toast.show = true
  toast.message = message
  toast.type = type
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.show = false
  }, 2500)
}

const fbFilter = reactive({ status: '', type: '' })
const rpFilter = reactive({ status: '' })
// 举报详情弹窗状态
const rpDetail = reactive({ show: false, loading: false, report: null, target: null })

const actForm = reactive({ title: '', content: '', cover: '', type: 1, is_public: 1, is_major: 0, sort: 0, start_time: '', end_time: '' })

function switchTab(key) {
  tab.value = key
  if (key === 'feedback') loadFeedback()
  else if (key === 'report') loadReports()
  else if (key === 'activity') loadActivities()
  else if (key === 'user') {
    loadUsers()
    loadAiConfig() // 用户行 AI 按钮的「总控禁止」显示依赖总开关状态
  }
  else if (key === 'ai') {
    loadAiConfig()
    loadUsers()
    loadAiKeys()
  }
}

// ---------- AI 使用管理 ----------
// 总开关(全站) + 用户级权限。级联规则在服务端算好回显, 前端只负责展示
const aiCfg = reactive({ reply: true, image: true, video: false, busy: false })

// ---------- AI 密钥(只有超级管理员看得到这一块) ----------
// 服务端只回掩码, 明文密钥永远不下发; 保存后立即生效, 不需要重启。
const aiKeys = ref([])
const aiKeysError = ref('')

async function loadAiKeys() {
  if (!isSuperAdmin.value) return
  try {
    const r = await cloudApi.adminGetAiKeys()
    aiKeys.value = (r.keys || []).map((k) => ({ ...k, draft: '', busy: false }))
    aiKeysError.value = ''
  } catch (e) {
    // 非超级管理员调这个接口会被拒 —— 不弹错, 只是不显示这块
    aiKeys.value = []
    aiKeysError.value = e.message || ''
  }
}

async function saveAiKey(k) {
  const val = String(k.draft || '').trim()
  if (!val || k.busy) return
  k.busy = true
  try {
    await cloudApi.adminSetAiKey({ kind: k.kind, value: val })
    k.draft = ''
    showToast(`${k.label} 的密钥已保存，立刻生效`)
    await loadAiKeys()
    loadAiConfig()
  } catch (e) {
    showToast(e.message || '保存失败，请重试', 'error')
  } finally {
    k.busy = false
  }
}

async function clearAiKey(k) {
  if (k.busy) return
  k.busy = true
  try {
    await cloudApi.adminSetAiKey({ kind: k.kind, value: '' })
    showToast(`已清除后台设置，${k.label} 回落到服务器 .env`)
    await loadAiKeys()
    loadAiConfig()
  } catch (e) {
    showToast(e.message || '清除失败，请重试', 'error')
  } finally {
    k.busy = false
  }
}

async function loadAiConfig() {
  try {
    const r = await cloudApi.adminGetAiConfig()
    aiCfg.reply = !!r.reply
    aiCfg.image = !!r.image
    aiCfg.video = !!r.video
  } catch (e) {
    showToast('加载 AI 配置失败，请重试', 'error')
  }
}

async function toggleAiGlobal(key) {
  if (aiCfg.busy) return
  aiCfg.busy = true
  try {
    const r = await cloudApi.adminSetAiConfig({ [key]: !aiCfg[key] })
    aiCfg.reply = !!r.reply
    aiCfg.image = !!r.image
    aiCfg.video = !!r.video
    // 关闭动作提示「已禁止」, 开启动作提示「已保存」
    showToast(aiCfg[key] ? '已开启' : '已禁止')
  } catch (e) {
    showToast(e.message || '保存失败，请重试', 'error')
  } finally {
    aiCfg.busy = false
  }
}

async function toggleUserAi(item, kind) {
  const cur =
    kind === 'chat' ? item.ai_chat : kind === 'image' ? item.ai_image : item.ai_video
  try {
    const r = await cloudApi.adminSetUserAiPerm({ id: item.id, kind, value: cur ? 0 : 1 })
    item.ai_chat = r.ai_chat
    item.ai_image = r.ai_image
    item.ai_video = r.ai_video
    // 禁用动作提示「已禁止」, 恢复动作提示「已保存」
    const on = kind === 'chat' ? r.ai_chat : kind === 'image' ? r.ai_image : r.ai_video
    showToast(on ? '已开启' : '已禁止')
  } catch (e) {
    showToast(e.message || '保存失败，请重试', 'error')
  }
}

// ---------- 反馈 ----------
// 生效权限 = 总开关 && 用户级 —— 总控制优先级更高:
// 总控一关, 即便单控里是「允许」, 用户实际也用不了(服务端闸门同样按此判定)
const chatAllowedOf = (item) => Boolean(aiCfg.reply) && Boolean(item.ai_chat)
const imageAllowedOf = (item) => Boolean(aiCfg.reply && aiCfg.image) && Boolean(item.ai_image)
const videoAllowedOf = (item) =>
  Boolean(aiCfg.reply && aiCfg.image && aiCfg.video) && Boolean(item.ai_video)

// ---------- 反馈 ----------
async function loadFeedback() {
  try {
    const params = {}
    if (fbFilter.status !== '') params.status = fbFilter.status
    if (fbFilter.type) params.type = fbFilter.type
    feedbackList.value = (await cloudApi.adminListFeedback(params)).map((item) => ({
      ...item,
      _status: String(item.status),
      _reply: item.reply || '',
    }))
  } catch (e) {
    console.error('加载反馈失败:', e.message)
    showToast('加载失败，请重试', 'error')
  }
}
async function updateFeedback(item) {
  try {
    await cloudApi.adminUpdateFeedback({ id: item.id, status: Number(item._status), reply: item._reply })
    await loadFeedback()
    showToast('保存成功')
  } catch (e) {
    showToast('保存失败，请重试', 'error')
  }
}

// ---------- 确认弹窗 ----------
function confirmDelete(type, id) {
  const titles = { feedback: '删除反馈', report: '删除举报', activity: '删除活动', notification: '删除通知' }
  confirmModal.show = true
  confirmModal.title = titles[type] || '确认删除'
  confirmModal.message = `确定要删除这条${type === 'feedback' ? '反馈' : type === 'report' ? '举报' : type === 'activity' ? '活动' : '通知'}吗？`
  confirmModal.action = async () => {
    try {
      if (type === 'feedback') await cloudApi.adminRemoveFeedback({ id })
      else if (type === 'report') await cloudApi.adminRemoveReport({ id })
      else if (type === 'activity') await cloudApi.adminRemoveActivity({ id })
      else if (type === 'notification') await cloudApi.adminRemoveNotification({ id })
      if (type === 'feedback') await loadFeedback()
      else if (type === 'report') await loadReports()
      else if (type === 'activity') await loadActivities()
      else if (type === 'notification') await loadNotifications()
    } catch (e) {
      showToast('删除失败，请重试', 'error')
    }
  }
}

function closeConfirm() {
  confirmModal.show = false
  confirmModal.action = null
}

async function executeConfirm() {
  if (confirmModal.action) {
    await confirmModal.action()
  }
  closeConfirm()
}

// ---------- 举报 ----------
async function loadReports() {
  try {
    const params = {}
    if (rpFilter.status !== '') params.status = rpFilter.status
    reportList.value = (await cloudApi.adminListReports(params)).map((item) => ({
      ...item,
      _status: String(item.status),
      _note: item.handle_note || '',
    }))
  } catch (e) {
    console.error('加载举报失败:', e.message)
    showToast('加载失败，请重试', 'error')
  }
}
async function updateReport(item) {
  try {
    await cloudApi.adminUpdateReport({ id: item.id, status: Number(item._status), handle_note: item._note })
    await loadReports()
    showToast('保存成功')
  } catch (e) {
    showToast('保存失败，请重试', 'error')
  }
}
// 下架被举报内容 + 以「拾光管理员」身份私信通知举报人和被举报人（2026-10-29）
// 走 confirmModal 二次确认：这个动作会把记忆取消公开，用户自己的分享状态跟着变，
// 不是"改个状态码"那么轻。
function takeDownReport(item) {
  confirmModal.show = true
  confirmModal.title = '下架这条内容'
  confirmModal.message =
    '下架后：这条记忆会取消公开、从广场消失；系统会以「拾光管理员」名义私信通知举报人和被举报人，并附上处理备注。确定继续吗？'
  confirmModal.action = async () => {
    item._downing = true
    try {
      const r = await cloudApi.adminTakedownReport({ id: item.id, note: item._note || '' })
      const n = (r?.notified || []).length
      showToast(`已下架${n ? `，已通知 ${n} 人` : ''}`)
      await loadReports()
    } catch (e) {
      showToast(e.message || '下架失败，请重试', 'error')
    } finally {
      item._downing = false
    }
  }
}

// 打开举报详情: 拉取举报对象(帖子/评论/用户)的实际内容
async function openReportDetail(item) {
  rpDetail.show = true
  rpDetail.loading = true
  rpDetail.report = { ...item, reporter_name: item.reporter_name }
  rpDetail.target = null
  try {
    const data = await cloudApi.adminReportDetail({ id: item.id })
    rpDetail.report = data.report || rpDetail.report
    rpDetail.target = data.target || null
    // 兜底: 后端未解析出对象时(如旧版服务/广场举报存成评论类型), 直接拉广场帖子内容
    if (!rpDetail.target && rpDetail.report?.target_id) {
      try {
        const post = await cloudApi.postDetail({ id: rpDetail.report.target_id })
        if (post) {
          rpDetail.target = {
            kind: '帖子',
            author: post.author?.nickname || post.author?.username || '匿名用户',
            content: post.content,
            images: post.images || '',
            tags: post.tags || '',
            created_at: post.created_at,
          }
        }
      } catch { /* 帖子不可见时保持 target 为空 */ }
    }
  } catch (e) {
    console.error('加载举报详情失败:', e.message)
    showToast('加载详情失败', 'error')
  } finally {
    rpDetail.loading = false
  }
}
function closeReportDetail() {
  rpDetail.show = false
  rpDetail.report = null
  rpDetail.target = null
}
// images/tags 存储为逗号分隔字符串(update 时可能为 JSON 数组), 兼容解析
function parseImages(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  const s = String(raw).trim()
  if (s.startsWith('[')) {
    try { return JSON.parse(s).filter(Boolean) } catch { /* 退回逗号分割 */ }
  }
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}
function parseTags(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  const s = String(raw).trim()
  if (s.startsWith('[')) {
    try { return JSON.parse(s).filter(Boolean) } catch { /* 退回逗号分割 */ }
  }
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

// ---------- 活动 ----------
async function loadActivities() {
  try {
    activityList.value = await cloudApi.adminListActivities()
  } catch (e) {
    console.error('加载活动失败:', e.message)
  }
}
function editActivity(item) {
  editingActivity.value = item.id
  actForm.title = item.title
  actForm.content = item.content
  actForm.cover = item.cover || ''
  actForm.type = item.type
  actForm.is_public = item.is_public
  actForm.is_major = item.is_major || 0
  actForm.sort = item.sort
  // Unix 毫秒 -> datetime-local 格式 "YYYY-MM-DDTHH:mm"
  actForm.start_time = item.start_time ? tsToLocal(item.start_time) : ''
  actForm.end_time = item.end_time ? tsToLocal(item.end_time) : ''
  showActivityForm.value = true
}

// 封面图片上传
function onCoverChange(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    actForm.cover = ev.target.result
  }
  reader.readAsDataURL(file)
}

// 重新开始已结束的活动
async function restartActivity(item) {
  if (!confirm(`确定要重新开始活动「${item.title}」吗？`)) return
  try {
    await cloudApi.adminUpdateActivity({ id: item.id, end_time: null })
    await loadActivities()
    showToast('活动已重新开始')
  } catch (e) {
    showToast('操作失败', 'error')
  }
}

// 把进行中的活动标记为已结束(即把 end_time 设成当前时间)
// 按钮名叫「标记为已结束」而不是「撤销」, 2026-10-20 用户反馈原来的叫法看不出后果。
async function cancelActivity(item) {
  if (!confirm(`确定把活动「${item.title}」标记为已结束吗？结束后它会从拾光广场消失。`)) return
  try {
    // 设置 end_time 为当前时间，使活动变为已结束
    await cloudApi.adminUpdateActivity({ id: item.id, end_time: Date.now() })
    await loadActivities()
    showToast('已标记为结束，广场里已不再显示')
  } catch (e) {
    showToast('操作失败', 'error')
  }
}
// Unix 毫秒 -> "YYYY-MM-DDTHH:mm"
function tsToLocal(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
// "YYYY-MM-DDTHH:mm" -> Unix 毫秒
function localToTs(s) {
  if (!s) return null
  return new Date(s).getTime()
}
// Unix 毫秒 -> "MM-DD HH:mm"
function fmtDateTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
async function saveActivity() {
  if (!actForm.title.trim()) return showToast('请输入活动标题', 'error')
  if (!actForm.content.trim()) return showToast('请输入活动详情', 'error')
  // datetime-local 字符串 -> Unix 秒
  const payload = {
    ...actForm,
    start_time: localToTs(actForm.start_time),
    end_time: localToTs(actForm.end_time),
  }
  try {
    if (editingActivity.value) {
      await cloudApi.adminUpdateActivity({ id: editingActivity.value, ...payload })
    } else {
      await cloudApi.adminCreateActivity(payload)
    }
    resetActivityForm()
    await loadActivities()
    showToast('保存成功')
  } catch (e) {
    showToast('保存失败，请重试', 'error')
  }
}
async function removeActivity(id) {
  // This function is no longer used - confirmDelete handles it
}
function resetActivityForm() {
  editingActivity.value = null
  actForm.title = ''
  actForm.content = ''
  actForm.cover = ''
  actForm.type = 1
  actForm.is_public = 1
  actForm.is_major = 0
  actForm.sort = 0
  actForm.start_time = ''
  actForm.end_time = ''
  showActivityForm.value = false
}

// ---------- 用户 ----------
async function loadUsers() {
  try {
    const params = {}
    if (userKeyword.value.trim()) params.keyword = userKeyword.value.trim()
    userList.value = await cloudApi.adminListUsers(params)
  } catch (e) {
    console.error('加载用户失败:', e.message)
  }
}

// 用户操作需要密码验证
function confirmUserAction(action, item) {
  pwdModal.show = true
  pwdModal.password = ''
  pwdModal.error = ''
  pwdModal.pendingAction = { action, item }
}

async function verifyAndExecute() {
  if (!pwdModal.password) {
    pwdModal.error = '请输入密码'
    return
  }
  // 验证管理员密码（优乐美的密码）
  try {
    const res = await cloudApi.login({ username: SUPER_ADMIN_USERNAME, password: pwdModal.password })
    if (!res.token) {
      pwdModal.error = '密码错误'
      return
    }
    // 密码正确，执行操作
    const { action, item } = pwdModal.pendingAction
    if (action === 'toggleAdmin') {
      await cloudApi.adminSetAdmin({ id: item.id, role: item.role ? 0 : 1 })
    } else if (action === 'toggleStatus') {
      await cloudApi.adminUpdateUser({ id: item.id, status: item.status === 1 ? 0 : 1 })
    } else if (action === 'remove') {
      await cloudApi.adminRemoveUser({ id: item.id })
    }
    await loadUsers()
    closePwdModal()
  } catch (e) {
    pwdModal.error = e.message || '验证失败'
  }
}

function closePwdModal() {
  pwdModal.show = false
  pwdModal.password = ''
  pwdModal.error = ''
  pwdModal.pendingAction = null
}

// ---------- 工具 ----------
function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const FB_STATUS = { 0: '待处理', 1: '已采纳', 2: '已解决', 3: '已驳回' }
const FB_TYPE = { 1: '功能建议', 2: '问题反馈', 3: '体验优化' }
function fbStatusText(s) { return FB_STATUS[s] || '未知' }
function fbTypeText(t) { return FB_TYPE[t] || '其他' }
function fbStatusClass(s) { return s === 1 ? 'ok' : s === 2 ? 'done' : s === 3 ? 'del' : 'wait' }

const RP_STATUS = { 0: '待处理', 1: '已处理', 2: '已驳回' }
const RP_TARGET = { 1: '帖子', 2: '评论', 3: '用户' }
function rpStatusText(s) { return RP_STATUS[s] || '未知' }
function rpTargetText(t) { return RP_TARGET[t] || '未知' }
function rpStatusClass(s) { return s === 1 ? 'ok' : s === 2 ? 'del' : 'wait' }

const ACT_TYPE = { 1: '公告', 2: '活动', 3: '更新' }
function actTypeText(t) { return ACT_TYPE[t] || '其他' }

// 通知功能
// ★ 走 admin/notification/list 而不是 notification/list: 后者是「我自己收到的」且只回最近 10 条
// (广场顶部公告条用), 管理中心要能看到全部历史通知。
async function loadNotifications() {
  try {
    notificationList.value = await cloudApi.adminListNotifications()
  } catch (e) {
    console.error('加载通知失败:', e.message)
  }
}

// ---- AI 润色(2026-10-20 用户要求) ----
// 活动详情和通知内容各一个 ✨ 按钮: 把管理员已经写下的草稿交给服务端扩写详细化,
// 回填到表单里让管理员再审一遍。刻意**不自动发送** —— 润色结果必须人看一眼再发。
// polishing 记住当前哪个按钮在转圈, 避免两个按钮同时点和重复提交。
const polishing = ref('')

async function polishActivity() {
  if (polishing.value) return
  if (!actForm.title.trim() && !actForm.content.trim()) {
    showToast('先写点内容再润色', 'error')
    return
  }
  polishing.value = 'activity'
  try {
    const r = await cloudApi.aiPolish({ kind: 'activity', title: actForm.title, content: actForm.content })
    if (r.title) actForm.title = r.title
    if (r.content) actForm.content = r.content
    showToast('已润色，请检查后保存')
  } catch (e) {
    showToast('润色失败：' + (e.message || '请稍后重试'), 'error')
  } finally {
    polishing.value = ''
  }
}

async function polishNotice() {
  if (polishing.value) return
  if (!notifyTitle.value.trim() && !notifyContent.value.trim()) {
    showToast('先写点内容再润色', 'error')
    return
  }
  polishing.value = 'notice'
  try {
    const r = await cloudApi.aiPolish({ kind: 'notice', title: notifyTitle.value, content: notifyContent.value })
    if (r.title) notifyTitle.value = r.title
    if (r.content) notifyContent.value = r.content
    showToast('已润色，请检查后发送')
  } catch (e) {
    showToast('润色失败：' + (e.message || '请稍后重试'), 'error')
  } finally {
    polishing.value = ''
  }
}

async function sendNotification() {
  if (!notifyTitle.value.trim() || !notifyContent.value.trim()) return
  try {
    const res = await cloudApi.sendNotification({
      title: notifyTitle.value,
      content: notifyContent.value,
    })
    notifyTitle.value = ''
    notifyContent.value = ''
    showToast(`通知已发送，共 ${res.count || 0} 位用户收到`)
    loadNotifications()
  } catch (e) {
    const msg = e.message || ''
    if (msg.includes('未知 action')) {
      showToast('服务未就绪，请重启服务器后重试', 'error')
    } else {
      showToast('发送失败：' + msg, 'error')
    }
  }
}

onMounted(() => {
  loadFeedback()
  loadNotifications()
  loadAiConfig() // 总开关状态决定用户列表里 AI 按钮的生效显示, 进页面就拉一次
})
</script>

<style scoped>
.admin,
.admin * {
  box-sizing: border-box;
}

.admin {
  position: absolute;
  inset: 0;
}

.admin-figure {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.admin-figure-inner {
  position: relative;
  width: 100%;
  height: 100%;
}

.admin-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  user-select: none;
}

.admin-card {
  position: absolute;
  left: 10%;
  top: 12%;
  width: 80%;
  height: 78%;
  padding: 28px 32px;
  /* 必须完全不透明：背景图在卡片上沿附近烘焙着「个人中心 ♡」的字，
     只要留一点透明度（0.92 / 0.97 都试过）残影就会从卡片里透出来。 */
  background: #fffcf8;
  border-radius: 18px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.admin-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 16px;
}

.admin-head b {
  font-size: 20px;
  color: #4a3f37;
}

.admin-head span {
  font-size: 14.5px;
  color: #a89c90;
}

.admin-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid #eadfd2;
  padding-bottom: 8px;
}

.admin-tab {
  padding: 8px 18px;
  border: none;
  border-radius: 10px 10px 0 0;
  background: transparent;
  color: #8a7a6d;
  font-size: 15.5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s, color 0.2s;
}

.admin-tab:hover {
  background: #f6f0e8;
}

.admin-tab.on {
  background: #fdeae2;
  color: #e0705a;
  font-weight: 600;
}

.admin-badge {
  background: #f0917c;
  color: #fff;
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 999px;
  font-style: normal;
}

.admin-panel {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #d8c4b4 transparent;
}

.admin-panel::-webkit-scrollbar {
  width: 6px;
}

.admin-panel::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: #d8c4b4;
}

.panel-filter {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.user-role-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.user-role-tab {
  padding: 5px 16px;
  border: 1px solid #eadfd2;
  border-radius: 999px;
  background: #fff;
  color: #8a7a6d;
  font-size: 14.5px;
  cursor: pointer;
  transition: all 0.2s;
}

.user-role-tab.on {
  background: #f0917c;
  color: #fff;
  border-color: #f0917c;
}

.panel-select {
  padding: 6px 12px;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  color: #4a3f37;
  font-size: 14.5px;
  outline: none;
}

.panel-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-item {
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid #f0e8de;
}

.item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.item-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-style: normal;
}

.item-status.wait {
  background: #fdf1df;
  color: #d89a4e;
}

.item-status.ok {
  background: #e3edf8;
  color: #5b87c7;
}

/* 超级管理员: 金色徽标, 一眼看出这一行锁死 */
.item-status.super {
  background: linear-gradient(135deg, #f7e2b0, #efc97e);
  color: #8a5b12;
  font-weight: 600;
}

/* ---- AI 密钥(超级管理员面板) ---- */
.ai-keys {
  padding: 16px 18px;
  margin-bottom: 16px;
  border-radius: 14px;
  background: linear-gradient(180deg, #fffaf3, #fff6ea);
  border: 1px solid #f0e0c9;
}

.ai-keys h4 {
  margin: 0 0 6px;
  font-size: 15.5px;
  color: #6b5546;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-keys-scope {
  font-size: 11.5px;
  font-weight: 400;
  color: #b08956;
  background: #f7e9d5;
  border-radius: 999px;
  padding: 2px 8px;
}

.ai-key-row {
  padding: 12px 0;
  border-top: 1px dashed #f0e2cd;
}

.ai-key-row:first-of-type {
  border-top: none;
}

.ai-key-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-key-title b {
  font-size: 14px;
  color: #4a3f37;
}

.ai-key-state {
  font-size: 11.5px;
  font-style: normal;
  padding: 1px 8px;
  border-radius: 999px;
}

.ai-key-state.ok {
  background: #e5f5e5;
  color: #5c9a5c;
}

.ai-key-state.none {
  background: #fdecec;
  color: #c97b7b;
}

.ai-key-desc {
  display: block;
  margin: 4px 0 6px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #8a7a6d;
}

.ai-key-mask {
  display: inline-block;
  font-size: 12px;
  color: #a58d74;
  background: #fbf1e4;
  border-radius: 6px;
  padding: 2px 8px;
}

.ai-key-edit {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.ai-key-edit .item-input {
  flex: 1;
  min-width: 0;
}

.ai-key-err {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: #c97b7b;
}

.item-status.done {
  background: #e5f5e5;
  color: #67a767;
}

.item-status.del {
  background: #fde8e8;
  color: #c75b5b;
}

.item-status.major {
  background: linear-gradient(135deg, #ffecd2, #fcb69f);
  color: #8a4a2b;
  font-weight: 600;
}

/* 微信扫码注册的账号: 绿色小标签, 与状态标签同一套尺寸 */
.item-status.wx {
  background: rgba(7, 193, 96, 0.12);
  color: #0a8f4a;
  font-weight: 600;
}

.item-status.expired {
  background: #f0e8e8;
  color: #a07070;
}

.item-type {
  font-size: 13px;
  color: #8a7a6d;
}

.item-user {
  font-size: 13px;
  color: #6b5d52;
}

.item-date {
  margin-left: auto;
  font-size: 12px;
  color: #b3a79b;
}

/* 通知接收人数徽标(管理端通知列表) */
.item-recv {
  margin-left: auto;
  font-size: 12px;
  color: #8a7f72;
  background: rgba(122, 92, 250, 0.1);
  border-radius: 999px;
  padding: 2px 10px;
}

/* 密码行: 库里是 scrypt 单向哈希, 只能展示哈希串(等宽 + 截断 + title 全值) */
.item-pwd-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.item-pwd-label {
  flex: none;
  font-size: 12px;
  color: #b3a79b;
}

.item-pwd {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding: 4px 8px;
  border-radius: 6px;
  background: #faf6f0;
  color: #8a7a6d;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: help;
}

.item-content {
  margin: 0 0 8px 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: #4a3f37;
}

.item-reply {
  margin: 0 0 10px 0;
  padding: 6px 10px;
  border-left: 3px solid #f0b28a;
  border-radius: 6px;
  background: #fdf6ee;
  color: #a07048;
  font-size: 13px;
  line-height: 1.5;
}

.item-user-reply {
  margin: 0 0 10px 0;
  padding: 6px 10px;
  border-left: 3px solid #5b87c7;
  border-radius: 6px;
  background: #e3edf8;
  color: #3a5a8a;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.item-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.item-select {
  padding: 5px 10px;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  color: #4a3f37;
  font-size: 13px;
  outline: none;
}

.item-input {
  padding: 5px 10px;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  color: #4a3f37;
  font-size: 13px;
  outline: none;
  flex: 1;
  min-width: 120px;
}

.item-input.full {
  width: 100%;
  margin-bottom: 8px;
}

.item-input.search {
  flex: 1;
  min-width: 200px;
}

.item-textarea {
  width: 100%;
  min-height: 80px;
  padding: 8px 10px;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  color: #4a3f37;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  resize: vertical;
  margin-bottom: 8px;
}

.item-btn {
  padding: 5px 14px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.item-btn:hover {
  opacity: 0.85;
}

/* 禁用态(超级管理员那几颗锁死的按钮): 变灰 + 不允许点, 但仍然看得见,
   让管理员知道"这个操作存在, 只是被保护了" */
.item-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(0.35);
}

.item-btn:disabled:hover {
  opacity: 0.45;
}

.item-btn.save {
  background: #f0917c;
  color: #fff;
}

/* 下架：比"保存"更重、比"删除"更轻 —— 砖红实心，让人意识到这是不可逆的处置 */
.item-btn.down {
  background: #c0503f;
  color: #fff;
  white-space: nowrap;
}

.item-btn.down:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.item-btn.del {
  background: #fde8e8;
  color: #c75b5b;
}

/* ✨ AI 润色按钮: 用紫色和保存按钮的珊瑚色区分开, 一眼看得出"这是 AI 干的" */
.item-btn.polish {
  background: linear-gradient(135deg, #b79bf0, #8e7bf0);
  color: #fff;
  white-space: nowrap;
}

.item-btn.polish:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 标题输入框 + 润色按钮并排; 窄屏时按钮掉到下一行 */
.polish-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.polish-row .item-input {
  flex: 1;
  min-width: 0;
}

@media (max-width: 640px) {
  .polish-row {
    flex-wrap: wrap;
  }
}

.item-btn.view {
  background: #e3edf8;
  color: #5b87c7;
}

.item-btn.create {
  background: #e5f5e5;
  color: #67a767;
  font-weight: 600;
}

.panel-empty {
  text-align: center;
  padding: 40px 0;
  color: #b3a79b;
  font-size: 15.5px;
}

/* 通知表单 */
.notify-form {
  padding: 16px 20px;
  background: #fff;
  border-radius: 12px;
  margin-bottom: 16px;
}

.notify-form h4 {
  margin: 0 0 8px;
  font-size: 16.5px;
  color: #4a3f37;
}

.notify-hint {
  margin: 0 0 12px;
  font-size: 14.5px;
  color: #8a7a6d;
}

/* AI 使用管理: 总开关联动说明 + 单用户权限列表 */
.ai-config {
  padding: 16px 20px;
  background: #fff;
  border-radius: 12px;
  margin-bottom: 16px;
}
.ai-config h4 {
  margin: 0 0 8px;
  font-size: 16.5px;
  color: #4a3f35;
}
.ai-switch-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid #eadfd2;
  border-radius: 10px;
  background: #fdf9f3;
}
.ai-switch-name {
  font-size: 17px;
  font-weight: 600;
  color: #4a3f35;
  min-width: 84px;
}
.ai-switch-desc {
  flex: 1;
  font-size: 14.5px;
  color: #8a7a6d;
}
.ai-switch-row .item-btn {
  min-width: 72px;
}
.ai-switch-row .item-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.notify-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e8e0d8;
  border-radius: 8px;
  font-size: 15.5px;
  resize: vertical;
  font-family: inherit;
  margin-bottom: 12px;
}

.notify-textarea:focus {
  outline: none;
  border-color: #f7a860;
}

.form-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.time-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.time-field label {
  font-size: 13px;
  color: #8a7a6d;
}

.time-field .item-input {
  font-size: 14.5px;
  padding: 6px 8px;
}

.form-check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14.5px;
  color: #4a3f37;
}

.activity-form {
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid #f0e8de;
  margin-bottom: 14px;
}

.cover-upload {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.cover-preview {
  max-height: 60px;
  border-radius: 6px;
  object-fit: cover;
}

.act-filter-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.act-filter-tabs button {
  padding: 4px 12px;
  border: 1px solid #e0d8d0;
  border-radius: 999px;
  background: #fff;
  font-size: 14.5px;
  color: #6b5a4a;
  cursor: pointer;
}

.act-filter-tabs button.active {
  background: #f7a860;
  color: #fff;
  border-color: #f7a860;
}

/* 联系方式 */
.item-contact {
  font-size: 12px;
  color: #5b87c7;
  background: #e3edf8;
  padding: 2px 8px;
  border-radius: 999px;
}

/* 驳回样式 */
.item-reply.rejected {
  border-left-color: #c75b5b;
  background: #fde8e8;
  color: #c75b5b;
}

/* 自定义确认弹窗 */
.custom-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.custom-confirm {
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 380px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.cc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0ebe5;
}

.cc-head h3 {
  margin: 0;
  font-size: 17.5px;
  color: #4a3f37;
}

.cc-close {
  border: none;
  background: transparent;
  font-size: 24px;
  color: #b3a79b;
  cursor: pointer;
  padding: 0 4px;
}

.cc-close:hover {
  color: #8a7a6d;
}

.cc-body {
  padding: 20px;
}

.cc-body p {
  margin: 0 0 12px;
  font-size: 17px;
  color: #4a3f37;
  line-height: 1.6;
}

.cc-pwd-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  font-size: 17px;
  outline: none;
  box-sizing: border-box;
}

.cc-pwd-input:focus {
  border-color: #4a7fd4;
}

.cc-error {
  color: #c75b5b;
  font-size: 14.5px;
  margin-top: 8px;
}

/* 重置密码弹窗 */
.cc-target {
  font-size: 15.5px;
}

.cc-target b {
  color: #e0705a;
}

.cc-note {
  padding: 8px 10px;
  border-radius: 8px;
  background: #fdf6ee;
  color: #8a7a6d !important;
  font-size: 14.5px !important;
}

.cc-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.cc-btn.mini {
  flex: none;
  padding: 8px 12px;
  background: #f0ebe5;
  color: #8a7a6d;
}

.cc-btn.mini:hover {
  background: #e5ddd5;
}

.cc-done {
  margin: 10px 0 0;
  padding: 9px 11px;
  border-radius: 8px;
  background: #eef7ee;
  color: #3f7a3f;
  font-size: 15px;
}

.cc-done b {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.5px;
}

.cc-foot {
  display: flex;
  gap: 10px;
  padding: 0 20px 20px;
  justify-content: flex-end;
}

.cc-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  font-size: 15.5px;
  cursor: pointer;
}

.cc-btn.cancel {
  background: #f0ebe5;
  color: #8a7a6d;
}

.cc-btn.cancel:hover {
  background: #e5ddd5;
}

.cc-btn.confirm {
  background: #f0917c;
  color: #fff;
}

.cc-btn.confirm:hover {
  background: #e0705a;
}

/* 举报详情弹窗 */
.rp-detail {
  max-width: 480px;
}

.rp-detail-body {
  max-height: 60vh;
  overflow-y: auto;
}

.rp-loading,
.rp-target-gone {
  padding: 24px 0;
  text-align: center;
  font-size: 15.5px;
  color: #a2938a;
}

.rp-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.rp-chip {
  padding: 2px 10px;
  border-radius: 999px;
  background: #f0ebe5;
  font-size: 13px;
  color: #6b5d52;
}

.rp-chip.ok {
  background: #e3edf8;
  color: #5b87c7;
}

.rp-chip.del {
  background: #fde8e8;
  color: #c75b5b;
}

.rp-chip.wait {
  background: #fdf1df;
  color: #d89a4e;
}

.rp-meta-text {
  font-size: 14.5px;
  color: #8a7a6d;
}

.rp-reason {
  margin: 0 0 14px !important;
  font-size: 15.5px;
  color: #4a3f37;
}

.rp-target {
  border: 1px solid #eadfd2;
  border-radius: 10px;
  padding: 12px 14px;
  background: #faf6ef;
}

.rp-target-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.rp-target-kind {
  padding: 2px 8px;
  border-radius: 6px;
  background: #f0917c;
  color: #fff;
  font-size: 13px;
}

.rp-target-author {
  font-size: 14.5px;
  font-weight: 600;
  color: #4a3f37;
}

.rp-target-date {
  font-size: 13px;
  color: #a2938a;
}

.rp-target-content {
  margin: 0 0 10px !important;
  font-size: 15.5px;
  line-height: 1.7;
  color: #55493f;
  white-space: pre-line;
  overflow-wrap: break-word;
}

.rp-target-imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.rp-target-img {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 8px;
}

.rp-target-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.rp-tag {
  padding: 2px 10px;
  border-radius: 999px;
  background: #f6e8dc;
  font-size: 13px;
  color: #b5715c;
}
/* ============================================================================
   admin 手机版式（≤767.98）
   ★ 桌面是 80%×78% 的居中大卡 + 一排三列宽的 Tab。竖屏时卡片只剩 312px 宽、
     内边距还占 64px，Tab 直接溢出到屏幕外（实测两个 Tab 落在 x=415 / 474）。
   ============================================================================ */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  .admin {
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: #f6f2ec;
  }

  .admin-figure {
    position: relative;
    display: block;
    height: auto;
  }

  .admin-figure-inner {
    position: static;
    width: 100%;
    height: auto;
  }

  /* 背景图在手机上只是噪声, 直接去掉, 用底色 */
  .admin-bg {
    display: none;
  }

  .admin-card {
    position: static;
    width: auto;
    height: auto;
    min-width: 0;
    margin: 10px;
    padding: 14px;
    border-radius: 14px;
    overflow: visible;
  }

  .admin-head {
    flex-wrap: wrap;
    gap: 6px;
  }

  /* Tab 横向可滑，不再溢出屏幕 */
  .admin-tabs {
    /* ★ min-width: 0 是横向滚动的前提：flex 子项的 min-width 默认是 min-content，
       不归零的话内容会把整条撑到 747px 宽，overflow-x: auto 永远不触发 */
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    gap: 8px;
  }

  .admin-tabs::-webkit-scrollbar {
    display: none;
  }

  .admin-tab {
    flex: none;
    min-height: 40px;
    padding: 0 14px;
  }

  /* 面板里的操作按钮与下拉 */
  .panel-select,
  .item-btn,
  .admin-act {
    min-height: 38px;
  }

  /* 表格/长列表允许横向滑动，不要横向撑破页面 */
  .admin-card table,
  .admin-table {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
  }
}
</style>

<style>
/* Toast 提示 - 非 scoped 以确保 Teleport 到 body 后样式生效 */
.admin-toast {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  min-width: 320px !important;
  max-width: 500px !important;
  padding: 24px 36px !important;
  font-size: 16.5px !important;
  font-weight: 500 !important;
  z-index: 10000 !important;
  text-align: center !important;
  background: linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url('../assets/opt/diaryOrMnemonicBackground.webp') center/cover no-repeat !important;
  color: #fff !important;
  margin: 0 !important;
  border: none !important;
  border-radius: 16px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
}

.admin-toast.error {
  background: linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url('../assets/opt/diaryOrMnemonicBackground.webp') center/cover no-repeat !important;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.9) !important;
}

.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.9) !important;
}

</style>
