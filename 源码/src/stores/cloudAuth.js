import { acceptHMRUpdate, defineStore } from 'pinia'
import { cloudApi, getToken, setToken } from '../api/cloud'
import { clearPetTypeCache } from './companion'

// 云端账号状态: 登录/注册/登出, token 持久化在 localStorage

// 会话结论的复用窗口: 这段时间内不再重复向服务端验证。
// 用于衔接「欢迎页校验 → 紧接着的路由守卫」, 两处不必各打一次请求;
// 过期后会重新验证, 所以 token 中途失效最长 SESSION_TTL 就能被发现。
const SESSION_TTL = 30_000

export const useCloudAuthStore = defineStore('cloudAuth', {
  state: () => ({
    token: getToken(),
    user: null,
    profile: null,
    ready: false,
    modal: false,
    // 最近一次「服务端确认有效」的时刻; 短窗口内不重复发校验请求,
    // 避免欢迎页校验完 → 路由守卫又立刻验一次的浪费
    sessionVerifiedAt: 0,
  }),
  getters: {
    isLogin: (state) => !!state.token,
    isAdmin: (state) => !!(state.user && state.user.role),
  },
  actions: {
    async login(username, password) {
      const data = await cloudApi.login({ username, password })
      setToken(data.token)
      this.token = data.token
      this.user = data.user
      await this.refresh()
      // 刚拿到新 token, 服务端已确认有效, 无需再验一次
      this.sessionVerifiedAt = Date.now()
      this.modal = false
      return data
    },
    async register(username, password, nickname, passphrase) {
      const data = await cloudApi.register({ username, password, nickname, passphrase })
      setToken(data.token)
      this.token = data.token
      this.user = data.user
      await this.refresh()
      this.sessionVerifiedAt = Date.now()
      this.modal = false
      return data
    },
    async refresh() {
      if (!this.token) {
        this.ready = true
        return null
      }
      try {
        const data = await cloudApi.me()
        this.user = data.user
        this.profile = data.profile
      } catch (e) {
        this.logout()
      }
      this.ready = true
      return this.user
    },
    async updateProfile(patch) {
      this.profile = await cloudApi.updateProfile(patch)
      return this.profile
    },

    /**
     * 会话门禁: 真正问一次服务端「这个 token 还有效吗」。
     *
     * 不能直接信 isLogin —— 它只表示 localStorage 里存过 token,
     * 伪造的、过期的、已被改密/禁用而作废的 token 都会让它为真。
     *
     * 返回值语义(调用方据此决定放行还是拦下来弹登录框):
     *   true  —— 服务端确认会话有效, user/profile 已刷新
     *   false —— 会话无效(未登录/过期/被改密或禁用); 也可能是服务端不可达。
     *            一律按「未确认」处理并清理本地登录态, 不静默放行:
     *            本应用的数据全在服务端, 连不上时放进去也只会看到一堆加载失败,
     *            不如拦在门口, 让用户去登录弹窗里看到真实原因(如「无法连接服务器」)。
     */
    async ensureSession() {
      if (!this.token) return false
      // 刚验过不久: 直接复用结论, 不重复打服务端
      if (this.user && this.sessionVerifiedAt && Date.now() - this.sessionVerifiedAt < SESSION_TTL) {
        return true
      }
      try {
        const data = await cloudApi.session()
        this.user = data.user
        this.profile = data.profile
        this.sessionVerifiedAt = Date.now()
        return true
      } catch (e) {
        // call() 在收到 401 时已清掉 localStorage, 这里同步清理内存中的 store
        this.logout()
        return false
      }
    },
    logout() {
      setToken('')
      this.token = ''
      this.user = null
      this.profile = null
      this.sessionVerifiedAt = 0
      // 花色的本地缓存按账号走: 不清的话, 换个人登录会先闪一下上一个人的猫
      clearPetTypeCache()
    },
    openAuth() {
      this.modal = true
    },
    closeAuth() {
      this.modal = false
    },
  },
})

// dev 下让 store 定义可被热替换(详见 memories.js 里的说明)
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useCloudAuthStore, import.meta.hot))
}
