<template>
  <div class="profile">
    <!-- 保存结果提示(昵称重复/成功都会浮出来) -->
    <Transition name="fade">
      <div v-if="profileMsg" class="profile-toast" :class="{ ok: profileMsgOk }">{{ profileMsg }}</div>
    </Transition>
    <!-- 上传音乐出错弹框: 必须明确说明错误原因, 不能只闪一条提示 -->
    <Transition name="fade">
      <div v-if="bgmError" class="bgm-mask" @click.self="bgmError = ''">
        <div class="bgm-dialog" role="alertdialog" aria-modal="true">
          <span class="bgm-dialog-title">音乐上传失败</span>
          <p class="bgm-dialog-text">{{ bgmError }}</p>
          <button class="bgm-dialog-btn" type="button" @click="bgmError = ''">我知道了</button>
        </div>
      </div>
    </Transition>
    <div class="profile-figure">
      <div class="profile-figure-inner">
        <!-- 手机端标题（≤767 才显示）：海报上的标题是画进图片里的 -->
        <header class="pf-m-head">
          <h1>我的</h1>
          <p>收藏生活里的 小小闪光</p>
        </header>

        <img
    class="profile-bg"
    src="../assets/opt/profileBackground.webp"
    srcset="../assets/opt/profileBackground-sm.webp 1000w, ../assets/opt/profileBackground.webp 1442w"
    sizes="100vw"
    alt=""
    decoding="async"
  />

        <!-- 左页: 关于我 -->
        <section class="page-left">
          <span class="tape">关于我</span>

          <div class="about-row">
            <figure class="polaroid">
              <!-- 照片预留位: 编辑模式下点击上传一张照片 -->
              <button v-if="editing" class="photo-slot-btn" type="button" @click="pickAvatar">
                <img class="photo-img" :src="avatarOf({ avatar })" alt="" />
                <span class="photo-hint">点一下换头像</span>
              </button>
              <!-- 没上传时显示默认橘猫（src/data/avatar.js），用户传过就用他自己那张 -->
              <img v-else class="photo-img" :src="avatarOf({ avatar })" alt="头像" />
              <figcaption>收藏生活里的 小小闪光 ✧✧</figcaption>
            </figure>

            <div class="about-info">
              <div class="name-row">
                <input v-if="editing" v-model="name" class="name-input" type="text" />
                <span v-else class="name">{{ name }}</span>
                <button
                  class="icon-btn"
                  type="button"
                  aria-label="编辑"
                  @click="editing = !editing"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" />
                  </svg>
                </button>
              </div>
              <span class="uid">{{
                auth.isLogin
                  ? `ID: ${auth.user?.wechat ? '微信账号' : auth.user?.username || '云端用户'}`
                  : 'ID: shiguang__1207'
              }}</span>
              <div v-if="editing" class="quote-edit">
                <input v-model="quote" class="quote-input" type="text" placeholder="输入个人格言..." />
              </div>
              <p v-else class="quote">"{{ quote }}"</p>
              <div v-if="editing" class="tags-edit">
                <input v-model="tagsInput" class="tags-input" type="text" placeholder="用逗号分隔标签..." />
              </div>
              <div v-else class="tags">
                <span v-for="t in tags" :key="t" class="tag">{{ t }}</span>
              </div>
              <button class="edit-btn" type="button" @click="editing = !editing">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" />
                </svg>
                {{ editing ? '完成' : '编辑资料' }}
              </button>
            </div>
          </div>

          <div class="note-row">
            <div class="sticky-note">
              <span class="note-title">我的一句话介绍</span>
              <textarea v-if="editing" v-model="intro" class="note-input" rows="3"></textarea>
              <p v-else class="note-text">{{ intro }}</p>
            </div>
            <figure class="polaroid polaroid-sm">
              <!-- 与大图同一张照片 -->
              <img class="photo-img" :src="avatarOf({ avatar })" alt="头像" />
            </figure>
          </div>

          <span class="script-line">A Brighter Me ✧</span>
        </section>

        <!-- 头像上传隐藏 input -->
        <input ref="avatarInput" type="file" accept="image/*" hidden @change="onAvatarFile" />

        <!-- 右页: 个性化设置 -->
        <section class="page-right">
          <header class="set-head">
            <div>
              <h2 class="set-title">✦ 个性化设置</h2>
              <p class="set-sub">打造属于你的拾光空间, 让陪伴更温柔。</p>
            </div>
            <!-- 猫咪插画: 当前宠物精灵图 -->
            <span v-if="companion.hasSprite" class="cat-slot sprite-box"><pet-sprite :height="48" /></span>
            <span v-else class="img-slot cat-slot">猫咪插画预留</span>
          </header>

          <div class="card pet-card">
            <div class="card-head">
              <div class="card-head-text">
                <span class="card-title">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="7" cy="8" r="2" />
                    <circle cx="12" cy="6" r="2" />
                    <circle cx="17" cy="8" r="2" />
                    <path
                      d="M12 11c-3 0-5.5 2.6-5.5 4.8 0 1.3 1 2.2 2.3 2.2 1.2 0 2-.5 3.2-.5s2 .5 3.2.5c1.3 0 2.3-.9 2.3-2.2C17.5 13.6 15 11 12 11Z"
                    />
                  </svg>
                  我的陪伴宠物
                </span>
                <span class="card-sub">让一只小猫, 陪你一起收藏时光。</span>
              </div>
              <label class="toggle-row">
                <span class="toggle-label">开启陪伴宠物</span>
                <button
                  class="switch"
                  :class="{ on: petOn }"
                  type="button"
                  @click="petOn = !petOn"
                ></button>
              </label>
            </div>

            <div class="pet-grid">
              <button
                v-for="p in pets"
                :key="p"
                class="pet-tile"
                :class="{ on: pet === p }"
                type="button"
                :disabled="!petOn || !hasSprite(p)"
                @click="pet = p"
              >
                <!-- 每格显示对应花色自己的精灵图 -->
                <span v-if="hasSprite(p)" class="pet-slot sprite-slot"
                  ><pet-sprite height="min(50px, 12.5cqw)" :type="p"
                /></span>
                <span v-else class="img-slot pet-slot">图</span>
                <span class="pet-name">{{ p }}</span>
              </button>
              <span class="pet-tile more">
                <span class="more-plus">+</span>
                <span class="pet-name">敬请期待</span>
              </span>
            </div>

            <div class="pet-foot">
              <label class="foot-item">
                <span class="foot-label">宠物名字</span>
                <input v-model="petName" class="foot-input" type="text" :disabled="!petOn" />
              </label>
            </div>
          </div>

          <div class="two-cards">
            <div class="card">
              <span class="card-title">空间偏好</span>
              <span class="card-sub">让空间更符合你的使用习惯。</span>
              <div class="row">
                <span class="row-label">背景音乐</span>
                <button
                  class="switch"
                  :class="{ on: bgm }"
                  type="button"
                  @click="bgm = !bgm"
                ></button>
              </div>
              <!-- 曲目列表: 预置四首 + 自传; 点选即换曲, 自传的可删 -->
              <div v-if="bgm" class="bgm-list">
                <button
                  v-for="t in allBgmTracks"
                  :key="t.id"
                  class="bgm-row"
                  :class="{ sel: t.id === effectiveTrackId }"
                  type="button"
                  @click="chooseBgm(t)"
                >
                  <span class="bgm-dot" aria-hidden="true"></span>
                  <span class="bgm-text">
                    <span class="bgm-name">{{ t.name }}<i v-if="t.id === effectiveTrackId" class="bgm-tag">正在播放</i></span>
                    <em class="bgm-artist">{{ t.artist }}</em>
                  </span>
                  <span v-if="t.custom" class="bgm-del" title="删除这首自传音乐" @click.stop="removeBgm(t)">×</span>
                </button>
              </div>
              <div class="row">
                <span class="row-label">上传音乐</span>
                <label class="bgm-upload" :class="{ busy: bgmUploading }">
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/flac,.mp3,.m4a,.wav,.ogg,.flac"
                    :disabled="bgmUploading"
                    @change="onBgmFile"
                  />
                  {{ bgmUploading ? '上传中…' : '+ 上传音乐' }}
                </label>
              </div>
              <div v-if="bgmHint" class="pref-hint">{{ bgmHint }}</div>
              <div class="row">
                <span class="row-label">动态效果</span>
                <select v-model="motion" class="mini-select">
                  <option>低</option>
                  <option>适中</option>
                  <option>高</option>
                </select>
              </div>
              <div class="row">
                <span class="row-label">暖色 / 冷色氛围</span>
                <select v-model="tone" class="mini-select">
                  <option>暖色</option>
                  <option>冷色</option>
                </select>
              </div>
              <!-- 字号(大/中/小): 设备级偏好, 存 localStorage 即改即生效, 不随云端设置保存 -->
              <div class="row">
                <span class="row-label">界面字号</span>
                <select v-model="fontSize" class="mini-select" @change="saveFontSize">
                  <option value="small">小（默认）</option>
                  <option value="mid">中</option>
                  <option value="large">大</option>
                </select>
              </div>
            </div>

            <div class="card">
              <span class="card-title">其他设置</span>
              <span class="card-sub">管理你的账号与数据。</span>
              <button
                v-for="r in linkRows"
                :key="r.label"
                class="link-row"
                type="button"
                @click="handleLink(r)"
              >
                <span class="link-main">
                  <span>{{ r.label }}</span>
                  <!-- 拾光云那行直接带状态，省得再点进去才知道有没有连上 -->
                  <i v-if="r.action === 'cloud' && cloudConnected" class="link-badge">已连接</i>
                </span>
              </button>
              <!-- 云端账号区: 已登录显示昵称+退出, 未登录显示登录/注册入口 -->
              <div v-if="auth.isLogin" class="acct-row">
                <span class="acct-user">☁ {{ auth.user?.nickname || auth.user?.username }}</span>
                <button class="link-row danger" type="button" @click="logout">退出登录</button>
              </div>
              <button v-else class="link-row" type="button" @click="auth.openAuth()">
                登录 / 注册云端账号
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- 拾光云备份：卡片形态取消，只保留弹窗；入口在「其他设置」列表里。
         放在分区外面，切 tab 时不会反复重新拉一次云登录态。 -->
    <cloud-panel ref="cloudRef" :card="false" @state="onCloudState" />

    <!-- 账号与安全弹窗 -->
    <div v-if="modalType === 'account'" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content account-modal">
        <div class="modal-head">
          <h3>账号与安全</h3>
          <button class="modal-close" type="button" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="info-row">
            <span class="info-label">手机号</span>
            <span class="info-value">
              <!-- 微信扫码授权拿不到手机号时，允许用户自己补一个：
                   绑完登录名会一并换成该号码，之后就能用「手机号 + 密码」登录 -->
              <template v-if="phoneEditing">
                <input
                  v-model.trim="phoneInput"
                  class="phone-input"
                  type="tel"
                  maxlength="11"
                  placeholder="11 位手机号"
                  @keyup.enter="savePhone"
                />
                <button class="phone-btn save" type="button" @click="savePhone">保存</button>
                <button class="phone-btn" type="button" @click="phoneEditing = false">取消</button>
              </template>
              <template v-else>
                {{ phoneDisplay }}
                <!-- 只有微信扫码账号才需要手动补手机号：普通账号的登录名本来就是手机号 -->
                <button
                  v-if="auth.user?.wechat && !phoneBound"
                  class="phone-btn"
                  type="button"
                  @click="startBindPhone"
                >
                  绑定
                </button>
                <button
                  v-else-if="auth.user?.wechat && phoneBound"
                  class="phone-btn"
                  type="button"
                  @click="startBindPhone"
                >
                  换绑
                </button>
              </template>
            </span>
          </div>
          <p v-if="phoneMsg" class="phone-msg">{{ phoneMsg }}</p>
          <div v-if="auth.user?.wechat" class="info-row">
            <span class="info-label">登录方式</span>
            <span class="info-value">微信扫码</span>
          </div>
          <div class="info-row">
            <span class="info-label">昵称</span>
            <span class="info-value">{{ auth.user?.nickname || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">注册时间</span>
            <span class="info-value">{{ auth.user?.created_at ? new Date(auth.user.created_at).toLocaleDateString() : '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">账号状态</span>
            <span class="info-value status-ok">正常</span>
          </div>

          <!-- 修改密码。
               微信扫码免注册的账号建号时存的是随机密码，用户并不知道，所以不给"原密码"输入框：
               他的身份已经由扫码登录态证明过了，直接设新密码即可（后端同规则，见 auth/password/change）。 -->
          <div class="pwd-section">
            <h4 class="pwd-title">{{ auth.user?.wechat ? '设置密码' : '修改密码' }}</h4>
            <p v-if="auth.user?.wechat" class="pwd-tip">
              你是微信扫码注册的，还没有自己的密码。设置之后就能用手机号 + 密码登录（微信扫码也继续可用）。
            </p>
            <input
              v-if="!auth.user?.wechat"
              v-model="pwdForm.oldPassword"
              type="password"
              class="pwd-input"
              placeholder="原密码"
            />
            <input v-model="pwdForm.newPassword" type="password" class="pwd-input" placeholder="新密码 (至少 6 位)" />
            <input v-model="pwdForm.confirmPassword" type="password" class="pwd-input" placeholder="确认新密码" />
            <button class="pwd-btn" type="button" :disabled="!canChangePwd" @click="changePassword">
              {{ pwdMsg || (auth.user?.wechat ? '设置密码' : '确认修改') }}
            </button>
          </div>

          <!-- 注销账号 -->
          <div class="danger-section">
            <h4 class="danger-title">危险操作</h4>
            <p class="danger-desc">注销账号后，所有数据将被永久删除且无法恢复。</p>
            <button class="danger-btn" type="button" @click="showDeleteConfirm = true">注销账号</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 数据与存储弹窗 -->
    <div v-if="modalType === 'data'" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-head">
          <h3>数据与存储</h3>
          <button class="modal-close" type="button" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-desc">你的数据存储在本机浏览器中，清除浏览器数据会导致本地缓存丢失。</p>
          <div class="data-stats">
            <div class="stat-item">
              <span class="stat-num">{{ auth.user?.username ? '已连接' : '未登录' }}</span>
              <span class="stat-label">云端状态</span>
            </div>
          </div>
          <button class="modal-btn primary" type="button" @click="go('privacy'); closeModal()">
            前往隐私设置管理数据
          </button>
        </div>
      </div>
    </div>

    <!-- 关于拾光弹窗 -->
    <div v-if="modalType === 'about'" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-head">
          <h3>关于拾光</h3>
          <button class="modal-close" type="button" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body about-body">
          <div class="about-logo"></div>
          <h4 class="about-title">拾光 TimePick</h4>
          <p class="about-version">版本 1.0.0</p>
          <p class="about-desc">收藏生活里的每一个闪光瞬间。<br/>让记忆有处安放，让陪伴温柔绵长。</p>
          <div class="about-links">
            <a href="#" class="about-link">用户协议</a>
            <a href="#" class="about-link">隐私政策</a>
            <a href="#" class="about-link">联系我们</a>
          </div>
        </div>
      </div>
    </div>

    <!-- 注销账号确认弹窗 -->
    <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
      <div class="modal-content delete-modal">
        <div class="modal-head">
          <h3>注销账号</h3>
          <button class="modal-close" type="button" @click="showDeleteConfirm = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="delete-warning">️ 此操作不可恢复！</p>
          <p>注销后，你的所有记忆、帖子、收藏、关注等数据将被永久删除。</p>
          <input v-model="deletePassword" type="password" class="pwd-input" placeholder="请输入密码确认" />
          <p v-if="deleteError" class="delete-error">{{ deleteError }}</p>
        </div>
        <div class="modal-foot">
          <button class="modal-btn cancel" type="button" @click="showDeleteConfirm = false">取消</button>
          <button class="modal-btn danger" type="button" @click="executeDeleteAccount">确认注销</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { cloudApi } from '@/api/cloud'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { PET_TYPES, PET_WITH_SPRITE, normalizePetType, useCompanionStore } from '@/stores/companion'
import { useSpacePrefsStore } from '@/stores/spacePrefs'
import { BGM_PRESETS, BGM_DEFAULT_TRACK } from '@/data/bgmTracks'
import { avatarOf } from '@/data/avatar'
import { applyFontSize, getFontSize } from '@/fontSize'
import petSprite from './petSprite.vue'
import CloudPanel from './cloudPanel.vue'

const router = useRouter()
const auth = useCloudAuthStore()
const companion = useCompanionStore()

// 资料(昵称/介绍可编辑)
const editing = ref(false)
const name = ref('小拾光')
const intro = ref('正在把平凡的日子, 过成属于自己的节奏。')
const quote = ref('认真生活, 也认真收藏生活。')
const tags = ref(['爱猫人士', '喜欢拍照', '在路上', '永远好奇'])
const tagsInput = ref('')

// 个人照片(编辑资料时上传, 同步显示在大小照片位与侧栏头像)
const avatar = ref('')
const avatarInput = ref(null)

function pickAvatar() {
  avatarInput.value?.click()
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

async function onAvatarFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const dataUrl = await readAsDataUrl(file)
    const { url } = await cloudApi.uploadMedia({ dataUrl })
    avatar.value = url
    await cloudApi.updateProfile({ avatar: url })
    await auth.refresh()
  } catch (err) {
    console.error('照片上传失败:', err.message)
  }
}

// 陪伴宠物 (可选花色与精灵图注册表一一对应, 新增素材只要改 store)
const petOn = ref(true)
const pets = PET_TYPES
const pet = ref(PET_TYPES[0])
const petName = ref('小米')

// 宠物精灵图: 没有图的宠物不可选择
function hasSprite(type) {
  return !!PET_WITH_SPRITE[type]
}

// 空间偏好(保存后经 spacePrefs store 全局生效)
const bgm = ref(true)
const motion = ref('适中')
const tone = ref('暖色')
const bgmHint = ref('')
const spacePrefs = useSpacePrefsStore()

// ---- 背景音乐列表(预置四首 + 用户自传) ----
const bgmTrackId = ref('') // '' = 默认曲; 预置 'preset-xxx'; 自传 'url:/uploads/bgm/xxx'
const bgmUploads = ref([])
const bgmUploading = ref(false)
const bgmError = ref('') // 非空时弹出错误弹框
// 未选曲时实际生效的是默认曲(供销社乐队), 列表选中态要保持一致
const effectiveTrackId = computed(() => bgmTrackId.value || BGM_DEFAULT_TRACK)
const allBgmTracks = computed(() => [
  ...BGM_PRESETS,
  ...bgmUploads.value.map((t) => ({ id: `url:${t.url}`, name: t.name, artist: t.artist || '我上传的音乐', custom: true, rid: t.id })),
])

// 点选曲目: 立即切歌并持久化到云端设置
function chooseBgm(t) {
  if (t.id === bgmTrackId.value) return
  bgmTrackId.value = t.id
  spacePrefs.setBgmTrack(t.id)
  saveSettings()
}

// 删除自传曲目
async function removeBgm(t) {
  if (!t.custom || !t.rid) return
  try {
    await cloudApi.removeBgm({ id: t.rid })
  } catch (e) {
    bgmError.value = e?.message || '删除失败, 请稍后再试'
    return
  }
  bgmUploads.value = bgmUploads.value.filter((x) => x.id !== t.rid)
  spacePrefs.setUploads(bgmUploads.value)
  if (bgmTrackId.value === t.id) {
    bgmTrackId.value = ''
    spacePrefs.setBgmTrack('')
    saveSettings()
    bgmHint.value = '已删除该音乐, 背景音乐恢复为默认曲目'
  }
}

// 前端音频魔数嗅探: 返回错误原因, '' = 通过(与后端 sniffAudio 同一套规则, 双保险)
async function audioSniffError(file) {
  const badExt = /\.(mgg|ncm|kgm|kgma|qmc\d?|mflac|mogg)$/i.test(file.name)
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const ascii = String.fromCharCode(...head.subarray(0, 12))
  const ok =
    ascii.startsWith('OggS') ||
    ascii.startsWith('ID3') ||
    (ascii.startsWith('RIFF') && ascii.substr(8, 4) === 'WAVE') ||
    ascii.startsWith('fLaC') ||
    ascii.substr(4, 4) === 'ftyp' ||
    (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)
  if (ok) return ''
  if (badExt) {
    return '这是音乐平台的加密文件 (如 QQ 音乐 .mgg / 网易云 .ncm), 网页无法播放。请先用「格式工厂 / fre:ac」等工具转换成 mp3、m4a、wav 或 ogg 再上传。'
  }
  return `无法识别的音频格式${file.name ? ` («${file.name}»)` : ''}: 请上传 mp3 / m4a / wav / ogg / flac 格式的音频文件。`
}
function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = () => rej(new Error('读取文件失败'))
    fr.readAsDataURL(file)
  })
}
async function onBgmFile(e) {
  const file = e.target.files?.[0]
  e.target.value = '' // 允许重复选同一个文件
  if (!file) return
  if (!auth.isLogin) {
    bgmError.value = '请先登录, 上传的音乐会保存到你的账号下。'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    bgmError.value = `文件过大(${(file.size / 1048576).toFixed(1)}MB), 背景音乐限制 10MB。请裁剪或压缩后再上传。`
    return
  }
  const reason = await audioSniffError(file)
  if (reason) {
    bgmError.value = reason
    return
  }
  bgmUploading.value = true
  try {
    const t = await cloudApi.uploadBgm({
      dataUrl: await fileToDataUrl(file),
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || '我上传的音乐',
      artist: '我上传的音乐',
    })
    bgmUploads.value = [t, ...bgmUploads.value]
    spacePrefs.setUploads(bgmUploads.value)
    // 上传成功自动选中并播放
    bgmTrackId.value = `url:${t.url}`
    spacePrefs.setBgmTrack(bgmTrackId.value)
    saveSettings()
    bgmHint.value = '上传成功, 已自动选中播放'
  } catch (e2) {
    bgmError.value = e2?.message || '上传失败, 请稍后再试'
  } finally {
    bgmUploading.value = false
  }
}

// 界面字号(大/中/小): 设备级, 即改即生效(App 启动时已在 main.js 挂过一次)
const fontSize = ref(getFontSize())
function saveFontSize() {
  applyFontSize(fontSize.value)
}

// 其他设置：隐私设置跳转到对应子路由，其他打开弹窗
const linkRows = [
  { label: '账号与安全', action: 'account' },
  { label: '隐私设置', route: 'privacy' },
  { label: '数据与存储', action: 'data' },
  { label: '拾光云备份', action: 'cloud' },
  { label: '帮助与反馈', route: 'feedback' },
  { label: '关于拾光', action: 'about' },
]

// 拾光云备份弹窗（原来是一张独立卡片，现在收进上面的列表）
const cloudRef = ref(null)
const cloudConnected = ref(false)
function onCloudState(s) {
  cloudConnected.value = !!s?.connected
}

// 弹窗控制
const modalType = ref('')

// 修改密码
const pwdForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwdMsg = ref('')
let pwdTimer = null

// 绑定 / 换绑手机号（微信扫码拿不到手机号时用）
const phoneEditing = ref(false)
const phoneInput = ref('')
const phoneMsg = ref('')
let phoneTimer = null

// 手机号展示：微信账号优先看 phone 列；普通账号的登录名本身就是手机号，直接显示它
const phoneDisplay = computed(() => {
  const u = auth.user || {}
  if (u.phone) return u.phone
  if (/^1\d{10}$/.test(u.username || '')) return u.username
  return u.wechat ? '未绑定' : u.username || '-'
})
const phoneBound = computed(() => {
  const u = auth.user || {}
  return !!u.phone || /^1\d{10}$/.test(u.username || '')
})

function startBindPhone() {
  phoneInput.value = auth.user?.phone || ''
  phoneMsg.value = ''
  phoneEditing.value = true
}

async function savePhone() {
  const v = String(phoneInput.value || '').replace(/\D/g, '')
  if (!/^1\d{10}$/.test(v)) {
    phoneMsg.value = '请输入正确的 11 位手机号'
    return
  }
  try {
    const r = await cloudApi.bindPhone({ phone: v })
    await auth.refresh()
    phoneEditing.value = false
    phoneMsg.value = r?.login_name_changed ? '绑定成功，以后可以用手机号 + 密码登录' : '绑定成功'
  } catch (e) {
    phoneMsg.value = e.message || '绑定失败'
  }
  clearTimeout(phoneTimer)
  phoneTimer = setTimeout(() => (phoneMsg.value = ''), 3200)
}

const canChangePwd = computed(() => {
  const f = pwdForm.value
  // 微信账号免原密码（后端同规则），其他账号必须填原密码
  const oldOk = auth.user?.wechat || !!f.oldPassword
  return oldOk && f.newPassword.length >= 6 && f.newPassword === f.confirmPassword
})

// 注销账号
const showDeleteConfirm = ref(false)
const deletePassword = ref('')
const deleteError = ref('')

async function changePassword() {
  if (!canChangePwd.value) return
  try {
    await cloudApi.changePassword({
      oldPassword: pwdForm.value.oldPassword,
      newPassword: pwdForm.value.newPassword,
    })
    pwdMsg.value = '密码修改成功'
    pwdForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
    clearTimeout(pwdTimer)
    pwdTimer = setTimeout(() => { pwdMsg.value = '' }, 2000)
  } catch (e) {
    pwdMsg.value = e.message || '修改失败'
    clearTimeout(pwdTimer)
    pwdTimer = setTimeout(() => { pwdMsg.value = '' }, 3000)
  }
}

async function executeDeleteAccount() {
  if (!deletePassword.value) {
    deleteError.value = '请输入密码'
    return
  }
  try {
    await cloudApi.deleteAccount({ password: deletePassword.value })
    // 注销成功，退出登录
    auth.logout()
    router.replace({ name: 'welcome' })
  } catch (e) {
    deleteError.value = e.message || '注销失败'
  }
}

function go(route) {
  router.push({ name: route })
}

function handleLink(row) {
  if (row.route) {
    go(row.route)
  } else if (row.action === 'cloud') {
    cloudRef.value?.openPanel()
  } else if (row.action) {
    modalType.value = row.action
  }
}

function closeModal() {
  modalType.value = ''
}

function logout() {
  auth.logout()
  router.replace({ name: 'welcome' })
}

// 加载用户资料和设置
async function loadData() {
  if (!auth.isLogin) return
  try {
    // 加载资料
    const me = await cloudApi.me()
    if (me.user) {
      name.value = me.user.nickname || me.user.username || '小拾光'
    }
    if (me.profile?.bio) {
      intro.value = me.profile.bio
    }
    if (me.profile?.avatar) {
      avatar.value = me.profile.avatar
    }
    // 加载设置
    const settings = await cloudApi.getSettings()
    if (settings) {
      bgm.value = !!settings.bgm
      motion.value = settings.motion || '适中'
      tone.value = settings.tone || '暖色'
      bgmTrackId.value = settings.bgm_track || ''
    }
    // 加载自传背景音乐
    try {
      const r = await cloudApi.listBgm()
      bgmUploads.value = r?.list || []
      spacePrefs.setUploads(bgmUploads.value)
    } catch {}
    // 加载宠物配置
    const petConfig = await cloudApi.getPet()
    if (petConfig) {
      petOn.value = true
      pet.value = normalizePetType(petConfig.pet_type)
      petName.value = petConfig.pet_name || '小米'
      companion.setPetType(pet.value, auth.user?.id)
    }
  } catch (e) {
    console.error('加载资料失败:', e.message)
  }
}

// 保存资料
const profileMsg = ref('')
let profileMsgTimer = null
function showProfileMsg(text, ok = false) {
  profileMsg.value = text
  clearTimeout(profileMsgTimer)
  profileMsgTimer = setTimeout(() => (profileMsg.value = ''), 3000)
  profileMsgOk.value = ok
}
const profileMsgOk = ref(false)

async function saveProfile() {
  if (!auth.isLogin) return
  try {
    await cloudApi.updateProfile({
      nickname: name.value,
      bio: intro.value,
      quote: quote.value,
      hobbies: tags.value.join(','),
      avatar: avatar.value,
    })
    // 更新 store 中的用户信息
    await auth.refresh()
    showProfileMsg('资料已保存', true)
  } catch (e) {
    // 昵称重复等校验失败必须让用户看到, 不能只进控制台
    showProfileMsg(e?.message || '保存失败, 请稍后再试')
  }
}

// 保存设置
async function saveSettings() {
  if (!auth.isLogin) return
  try {
    await cloudApi.updateSettings({
      bgm: bgm.value ? 1 : 0,
      motion: motion.value,
      tone: tone.value,
      bgm_track: bgmTrackId.value,
    })
    // 保存后立即全局生效(动效/氛围/音频)
    spacePrefs.apply({
      bgm: bgm.value,
      motion: motion.value,
      tone: tone.value,
      bgmTrack: bgmTrackId.value,
    })
  } catch (e) {
    console.error('保存设置失败:', e.message)
  }
}

// 保存宠物配置
async function savePet() {
  if (!auth.isLogin) return
  try {
    await cloudApi.updatePet({
      pet_type: pet.value,
      pet_name: petName.value,
    })
  } catch (e) {
    console.error('保存宠物配置失败:', e.message)
  }
}

// 监听编辑状态，完成时保存
watch(editing, (val) => {
  if (!val) {
    // 解析标签输入
    if (tagsInput.value.trim()) {
      tags.value = tagsInput.value.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
    }
    saveProfile()
  } else {
    // 开始编辑时，填充标签输入
    tagsInput.value = tags.value.join(', ')
  }
})

// 监听设置变化，自动保存并全局生效
watch([bgm, motion, tone], () => {
  saveSettings()
})

// 监听宠物变化，自动保存
watch([petOn, pet, petName], () => {
  companion.setPetEnabled(petOn.value)
  companion.setPetType(pet.value, auth.user?.id)
  savePet()
})

onMounted(() => { loadData() })
</script>

<style scoped>
.profile,
.profile * {
  box-sizing: border-box;
}

.profile {
  position: absolute;
  inset: 0;
}

/* 保存结果浮提示 */
.profile-toast {
  position: absolute;
  left: 50%;
  top: 4.5%;
  transform: translateX(-50%);
  padding: 9px 22px;
  border-radius: 999px;
  background: rgba(163, 74, 56, 0.92);
  color: #fff5f0;
  font-size: 16px;
  z-index: 60;
  box-shadow: 0 8px 24px rgba(90, 40, 30, 0.3);
  pointer-events: none;
}

.profile-toast.ok {
  background: rgba(94, 128, 82, 0.92);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.profile-figure {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  container-type: size;
}

/* 与 contain 绘制出的图片区域同比例同位置 */
/* ★ 内层框必须和 object-fit:contain 画出来的图片区域**完全重合**。
   老写法是 width:100% + aspect-ratio + max-height:100%：容器比图更宽时，
   max-height 把高度卡住、宽度却还是 100%，比例就破了 —— 卡片按 % 定位会整体往外偏，
   换个屏幕比例（比如 16:9 笔记本接到 4:3 投影）看起来就是"排版乱了"。
   现在用容器查询单位算出 contain 盒的真实宽高，两种极端都能对上。
   （不支持容器查询的旧浏览器仍走上面那组老声明，行为与以前一致。） */
.profile-figure-inner {
  position: relative;
  aspect-ratio: 1442 / 941;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  /* 精确的 contain 盒：宽度取「容器宽」与「按高换算的宽」的较小者 */
  width: min(100cqw, calc(100cqh * 1442 / 941));
  height: min(100cqh, calc(100cqw * 941 / 1442));
  max-width: none;
  max-height: none;
}

.profile-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

/* 图片预留位统一样式 */
.img-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed #d8c9b8;
  border-radius: 6px;
  background: #faf6ef;
  color: #c9bbae;
  font-size: 12px;
  letter-spacing: 2px;
}

/* ---- 左页: 关于我 ---- */
.page-left {
  position: absolute;
  left: 6.5%;
  top: 20%;
  width: 34.5%;
  height: 76%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 22px;
}

.tape {
  align-self: flex-start;
  padding: 4px 16px;
  background: #cfe3f2;
  color: #5b7d99;
  font-size: 14.5px;
  letter-spacing: 2px;
  transform: rotate(-2deg);
}

.about-row {
  display: flex;
  gap: 14px;
}

.polaroid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 46%;
  margin: 0;
  padding: 8px 8px 6px;
  background: #fff;
  box-shadow: 0 6px 16px rgba(120, 90, 60, 0.18);
  transform: rotate(-2deg);
}

.photo-slot {
  aspect-ratio: 3 / 4;
}

/* 编辑模式下的照片上传按钮 */
.photo-slot-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

/* 已上传的照片 / 默认头像
   ★ 2026-10-27 用户反馈「头像要铺满或放到中间」：原来是 3:4 的竖框套一张方图，
     cover 之后两侧被裁、整只猫又缩在中间显得很小。改成 1:1 正方框，
     头像正好整块铺满（默认头像本身是 256×256 的方形），不再留一圈空底。 */
.photo-img {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 6px;
}

/* 编辑态：照片上压一条"点一下换头像"，否则默认头像看起来只是张图、不知道能点 */
.photo-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 5px 0;
  background: rgba(60, 46, 34, 0.55);
  color: #fff;
  font-size: 12px;
  text-align: center;
  border-radius: 0 0 6px 6px;
}

.photo-slot-btn {
  position: relative;
}

.polaroid figcaption {
  font-size: 12px;
  text-align: center;
  color: #8a7a6d;
}

.polaroid-sm {
  width: 34%;
  transform: rotate(3deg);
}

.about-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.name {
  font-size: 17.5px;
  font-weight: 700;
  color: #4a3f37;
}

.name-input {
  width: 90px;
  padding: 2px 6px;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  font-size: 17px;
  font-weight: 700;
  color: #4a3f37;
  outline: none;
}

.icon-btn {
  display: flex;
  border: none;
  background: transparent;
  color: #b3a79c;
  cursor: pointer;
}

.icon-btn svg,
.edit-btn svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.uid {
  font-size: 12px;
  color: #a08063;
}

.quote {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #8a7a6d;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  padding: 3px 10px;
  border-radius: 999px;
  background: #e7e3f4;
  color: #7d76a8;
  font-size: 12px;
}

.quote-edit,
.tags-edit {
  margin: 8px 0;
}

.quote-input,
.tags-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #d8c9b8;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  color: #6b5d52;
  outline: none;
}

.quote-input:focus,
.tags-input:focus {
  border-color: #c4a882;
}

.edit-btn {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border: 1px solid #d8c9b8;
  border-radius: 999px;
  background: #fff;
  color: #8a7a6d;
  font-size: 13px;
  cursor: pointer;
}

.note-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.sticky-note {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: #f7e8b7;
  box-shadow: 0 6px 14px rgba(120, 90, 60, 0.15);
  transform: rotate(-1deg);
}

.note-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #8a6d3b;
}

.note-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: #7a6438;
}

.note-input {
  border: none;
  background: transparent;
  resize: none;
  outline: none;
  font-size: 13px;
  line-height: 1.8;
  font-family: inherit;
  color: #7a6438;
}

.script-line {
  align-self: center;
  margin-top: auto;
  font-size: 14.5px;
  font-style: italic;
  letter-spacing: 1px;
  color: #d8a273;
}

/* ---- 右页: 个性化设置 ---- */
.page-right {
  position: absolute;
  left: 43.5%;
  top: 20%;
  width: 43.5%;
  height: 76%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 22px;
}

.set-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.set-title {
  margin: 0;
  font-size: 16.5px;
  color: #4a3f37;
}

.set-sub {
  margin: 3px 0 0;
  font-size: 12px;
  color: #a08063;
}

.cat-slot {
  width: 92px;
  height: 56px;
  border-radius: 10px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 253, 250, 0.92);
  box-shadow: 0 8px 20px rgba(120, 90, 60, 0.12);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.card-head-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14.5px;
  font-weight: 700;
  color: #4a3f37;
}

.card-title svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: #e0865a;
  stroke-width: 1.6;
}

.card-sub {
  font-size: 12px;
  color: #a08063;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-label {
  font-size: 12px;
  color: #5c4f45;
}

.switch {
  position: relative;
  width: 34px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: #e3d9cc;
  cursor: pointer;
  transition: background 0.2s ease;
}

.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.2s ease;
}

.switch.on {
  background: #4d8be0;
}

.switch.on::after {
  left: 18px;
}

.pet-grid {
  display: grid;
  /* 5 个花色 + 1 个「敬请期待」占位, 一行排完 */
  /* minmax(0, 1fr) 而不是 1fr: 1fr 的隐含最小值是 auto(内容最小宽度),
     6 只猫的最小宽度加起来会超过卡片宽度 → 整行横向溢出。写成 0 才能真的等分收缩。 */
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
  /* 让格子里的猫可以按容器宽度缩放(cqw), 卡片变窄时猫跟着缩而不是撑爆 */
  container-type: inline-size;
}

.pet-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
}

.pet-tile:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pet-tile.on {
  border-color: #7ba7d8;
  background: #eef4fb;
}

.pet-slot {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
}

/* 精灵图容器: 居中显示猫咪 */
.sprite-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed #d8c9b8;
  border-radius: 8px;
  background: #faf6ef;
}

/* 插画位: 无边框纯展示 */
.sprite-box {
  display: flex;
  align-items: center;
  justify-content: center;
}

.pet-name {
  font-size: 12px;
  color: #8a7a6d;
}

.pet-tile.more {
  cursor: default;
}

.more-plus {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  border: 1.5px dashed #d8c9b8;
  border-radius: 8px;
  background: #faf6ef;
  color: #b3a79c;
  font-size: 17px;
}

.pet-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.foot-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.foot-label {
  font-size: 12px;
  color: #8a7a6d;
}

.foot-input {
  width: 72px;
  padding: 4px 8px;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
  color: #5c4f45;
  outline: none;
}

.checks {
  gap: 10px;
}

.check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #5c4f45;
}

.check input {
  accent-color: #7ba7d8;
}

.two-cards {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* 卡片内容超高时卡片自身滚动, 不把书页撑变形(列表内部另有自己的滚动条) */
.two-cards > .card {
  min-height: 0;
  overflow: auto;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.row-label {
  font-size: 12px;
  color: #5c4f45;
}

.mini-select {
  padding: 3px 6px;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
  color: #5c4f45;
  outline: none;
}

.link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  border: none;
  border-bottom: 1px dashed #efe6da;
  background: transparent;
  font-size: 12px;
  color: #5c4f45;
  text-align: left;
  cursor: pointer;
}

.link-row::after {
  content: '›';
  color: #c9bbae;
}

/* 列表行左侧文字 + 状态标签（拾光云那行会带「已连接」小绿标） */
.link-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.link-badge {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-style: normal;
  line-height: 1.5;
  color: #2f7d5b;
  background: rgba(74, 168, 122, 0.16);
}

.link-row.danger {
  border-bottom: none;
  color: #e0705a;
}

.link-row.danger::after {
  content: '';
}

/* 云端账号区: 昵称与退出按钮同行 */
.acct-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 4px;
}

.acct-user {
  font-size: 12px;
  font-weight: 600;
  color: #a08063;
}

.acct-row .link-row.danger {
  flex: none;
  width: auto;
  border-bottom: none;
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 16px;
  width: 90%;
  max-width: 420px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0ebe5;
}

.modal-head h3 {
  margin: 0;
  font-size: 17.5px;
  color: #4a3f37;
}

.modal-close {
  border: none;
  background: transparent;
  font-size: 24px;
  color: #b3a79b;
  cursor: pointer;
  padding: 0 4px;
}

.modal-close:hover {
  color: #8a7a6d;
}

.modal-body {
  padding: 20px;
}

.modal-desc {
  margin: 0 0 16px;
  font-size: 15.5px;
  color: #8a7a6d;
  line-height: 1.6;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #f5f0eb;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 15.5px;
  color: #8a7a6d;
}

.info-value {
  font-size: 15.5px;
  color: #4a3f37;
  font-weight: 500;
}

.status-ok {
  color: #67a767;
}

/* 手机号绑定：输入框与两个小按钮挤在同一行，保持 info-row 的高度不变 */
.info-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.phone-input {
  width: 132px;
  padding: 5px 8px;
  border: 1px solid #eadfd2;
  border-radius: 7px;
  background: #fff;
  font-size: 14px;
  color: #4a3f37;
  outline: none;
}

.phone-input:focus {
  border-color: #f0917c;
}

.phone-btn {
  padding: 4px 10px;
  border: 1px solid #eadfd2;
  border-radius: 999px;
  background: #fff;
  font-size: 12.5px;
  color: #8a7a6d;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.phone-btn:hover {
  background: #fdf3ee;
  color: #e07a63;
}

.phone-btn.save {
  border-color: transparent;
  background: linear-gradient(135deg, #f6a58f, #f0917c);
  color: #fff;
}

.phone-msg {
  margin: 6px 0 0;
  text-align: right;
  font-size: 12.5px;
  color: #e07a63;
}

.data-stats {
  display: flex;
  gap: 16px;
  margin: 16px 0;
}

.stat-item {
  flex: 1;
  padding: 12px;
  background: #f9f5f0;
  border-radius: 10px;
  text-align: center;
}

.stat-num {
  display: block;
  font-size: 17px;
  font-weight: 600;
  color: #4a7fd4;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 13px;
  color: #8a7a6d;
}

.modal-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 17px;
  cursor: pointer;
  margin-top: 8px;
}

.modal-btn.primary {
  background: #4a7fd4;
  color: #fff;
}

.modal-btn.primary:hover {
  background: #3a6fc4;
}

.about-body {
  text-align: center;
}

.about-logo {
  font-size: 48px;
  margin-bottom: 12px;
}

.about-title {
  margin: 0 0 8px;
  font-size: 20px;
  color: #4a3f37;
}

.about-version {
  margin: 0 0 16px;
  font-size: 14.5px;
  color: #b3a79b;
}

.about-desc {
  margin: 0 0 20px;
  font-size: 15.5px;
  color: #8a7a6d;
  line-height: 1.8;
}

.about-links {
  display: flex;
  justify-content: center;
  gap: 20px;
}

.about-link {
  font-size: 14.5px;
  color: #4a7fd4;
  text-decoration: none;
}

.about-link:hover {
  text-decoration: underline;
}

/* 账号弹窗 - 修改密码 */
.account-modal .modal-body {
  max-height: 70vh;
  overflow-y: auto;
}

.pwd-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #f0ebe5;
}

.pwd-title {
  margin: 0 0 12px;
  font-size: 17px;
  color: #4a3f37;
}

/* 微信扫码账号的说明：告诉用户为什么这里不需要原密码 */
.pwd-tip {
  margin: -4px 0 12px;
  padding: 9px 11px;
  border-radius: 9px;
  background: rgba(7, 193, 96, 0.07);
  font-size: 12.5px;
  line-height: 1.7;
  color: #6f7d72;
}

.pwd-input {
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 10px;
  border: 1px solid #eadfd2;
  border-radius: 8px;
  background: #fff;
  font-size: 15.5px;
  color: #4a3f37;
  outline: none;
  box-sizing: border-box;
}

.pwd-input:focus {
  border-color: #4a7fd4;
}

.pwd-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: #4a7fd4;
  color: #fff;
  font-size: 15.5px;
  cursor: pointer;
}

.pwd-btn:disabled {
  background: #d9cfc4;
  cursor: not-allowed;
}

.pwd-btn:hover:not(:disabled) {
  background: #3a6fc4;
}

/* 危险操作区域 */
.danger-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #fde8e8;
}

.danger-title {
  margin: 0 0 8px;
  font-size: 17px;
  color: #c75b5b;
}

.danger-desc {
  margin: 0 0 12px;
  font-size: 14.5px;
  color: #8a7a6d;
  line-height: 1.5;
}

.danger-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: #fde8e8;
  color: #c75b5b;
  font-size: 15.5px;
  cursor: pointer;
}

.danger-btn:hover {
  background: #fde0e0;
}

/* 注销弹窗 */
.delete-modal .modal-body {
  text-align: center;
}

.delete-warning {
  color: #c75b5b;
  font-weight: 600;
  font-size: 17px;
}

.delete-error {
  color: #c75b5b;
  font-size: 14.5px;
  margin-top: 8px;
}

.modal-foot {
  display: flex;
  gap: 10px;
  padding: 0 20px 20px;
  justify-content: flex-end;
}

.modal-btn.cancel {
  background: #f0ebe5;
  color: #8a7a6d;
}

.modal-btn.cancel:hover {
  background: #e5ddd5;
}

.modal-btn.danger {
  background: #c75b5b;
  color: #fff;
}

.modal-btn.danger:hover {
  background: #b04a4a;
}

.pref-hint {
  font-size: 13px;
  color: #b3a79c;
  margin: -4px 0 2px;
}

/* ---- 背景音乐列表 ---- */
.bgm-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: -2px 0 8px;
  /* 限制在卡片内, 超出部分出滚动条, 不把书页撑变形 */
  max-height: 148px;
  overflow-y: auto;
}
.bgm-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 10px;
  border: 1px solid rgba(150, 130, 110, 0.18);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.bgm-row:hover {
  border-color: rgba(150, 130, 110, 0.45);
}
.bgm-row.sel {
  border-color: #d98c5f;
  background: rgba(255, 238, 222, 0.75);
}
.bgm-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(150, 130, 110, 0.3);
}
.bgm-row.sel .bgm-dot {
  background: #d98c5f;
  box-shadow: 0 0 0 3px rgba(217, 140, 95, 0.2);
}
.bgm-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.bgm-name {
  font-size: 13px;
  color: #5a4a3c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bgm-tag {
  font-style: normal;
  font-size: 10px;
  color: #fff;
  background: #d98c5f;
  border-radius: 6px;
  padding: 1px 6px;
  margin-left: 6px;
  vertical-align: 1px;
}
.bgm-artist {
  font-size: 11px;
  font-style: normal;
  color: #a7988a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bgm-del {
  flex: none;
  width: 20px;
  height: 20px;
  line-height: 18px;
  text-align: center;
  border-radius: 50%;
  color: #b09079;
  font-size: 14px;
}
.bgm-del:hover {
  background: rgba(217, 140, 95, 0.15);
  color: #c0562f;
}
.bgm-upload {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 14px;
  border-radius: 10px;
  border: 1px dashed #cf9f74;
  color: #b3703c;
  font-size: 13px;
  cursor: pointer;
  min-height: 40px;
  overflow: hidden;
}
.bgm-upload:hover {
  background: rgba(217, 140, 95, 0.1);
}
.bgm-upload.busy {
  opacity: 0.6;
  pointer-events: none;
}
.bgm-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

/* ---- 上传错误弹框 ---- */
.bgm-mask {
  position: absolute;
  inset: 0;
  background: rgba(60, 45, 35, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}
.bgm-dialog {
  width: min(360px, 86vw);
  background: #fffaf4;
  border-radius: 16px;
  padding: 22px 20px 18px;
  box-shadow: 0 12px 40px rgba(60, 40, 25, 0.25);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bgm-dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: #5a4a3c;
}
.bgm-dialog-text {
  font-size: 13px;
  line-height: 1.7;
  color: #7a6a5c;
  overflow-wrap: break-word;
}
.bgm-dialog-btn {
  align-self: flex-end;
  padding: 7px 18px;
  border: none;
  border-radius: 10px;
  background: #d98c5f;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.bgm-dialog-btn:hover {
  background: #c97a4d;
}

/* 手机专用标题：桌面不占位 */
.pf-m-head {
  display: none;
}

/* ============================================================================
   手机版式（≤767.98）
   ★ 桌面是 1442×941 的左右对开手账（左「关于我」34.5%，右「我的设置」43.5%）。
     竖屏时整张海报被压成 390×254，两栏各自只剩 130px 宽 —— 头像、昵称、
     宠物花色卡（10px 宽）、开关全部挤变形。这里改成竖排两段、通栏卡片。
   ============================================================================ */
@media (max-width: 767.98px), (max-width: 1024px) and (orientation: portrait) {
  .profile {
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    background: #fdf7ef;
  }

  .profile-figure {
    position: relative;
    display: block;
    height: auto;
  }

  .profile-figure-inner {
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

  .profile-bg {
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

  .pf-m-head {
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

  .pf-m-head h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 3px;
    color: #57402f;
    font-family: 'Songti SC', 'STSong', 'SimSun', serif;
  }

  .pf-m-head p {
    margin: 0;
    font-size: 12.5px;
    color: #967f6a;
  }

  /* 左右两页 → 上下两段通栏 */
  .page-left,
  .page-right {
    position: static;
    width: auto;
    height: auto;
    padding: 14px;
    border-radius: 16px;
    background: rgba(255, 253, 250, 0.96);
    box-shadow: 0 6px 18px rgba(120, 90, 60, 0.1);
    gap: 14px;
  }

  /* 头像 + 昵称那一行：竖屏下允许换行，别把昵称挤成一条竖线 */
  .about-row {
    flex-wrap: wrap;
    gap: 12px;
  }

  .polaroid {
    width: 132px;
  }

  .about-info {
    flex: 1 1 150px;
    min-width: 0;
  }

  .icon-btn {
    width: 40px;
    height: 40px;
  }

  /* 昵称输入框：16px 防 iOS 聚焦放大 */
  .name-input {
    min-width: 0;
    width: 100%;
    font-size: 18px;
  }

  /* 宠物花色：桌面是 6 列小图，竖屏挤成 10px 宽；改成两列三行的网格
     ★ 容器类名是 .pet-grid（不是 .pet-row），写错类名这条断点规则之前完全没生效。 */
  .pet-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .pet-tile {
    width: auto;
    min-height: 92px;
    padding: 10px 4px;
  }

  /* 开关 / 下拉：热区 44px */
  .switch {
    flex: none;
    margin: -12px;
    padding: 12px;
    box-sizing: content-box;
  }

  .mini-select {
    min-height: 40px;
    font-size: 14px;
  }

  .foot-input {
    min-height: 42px;
    font-size: 16px;
  }

  /* 底部那两个「保存/退出」之类的按钮 */
  .bgm-dialog {
    width: 100%;
    max-width: 100%;
    border-radius: 18px 18px 0 0;
  }

  .bgm-mask {
    align-items: flex-end;
  }

  .bgm-dialog-btn {
    min-height: 44px;
  }
}
</style>
