import { createRouter, createWebHistory } from 'vue-router'
import { useCloudAuthStore } from '@/stores/cloudAuth'

// index.vue 是布局外壳('/' 与 '/index/*' 都渲染它), 必须常驻, 因此同步引入;
// 其余页面改为按需加载, 避免把 8 个子页面一次性打进首屏 bundle。
import Index from '../components/index.vue'

// ★ 首页(home.vue)已按需求整页删除(2026-10-27): 那一页的问候语/相伴天数/今日一句
//   已经搬到 3D 房间页面顶部。进站默认落到「我的记忆空间」。
const IslandIndex = () => import('../components/islandIndex.vue')
const Memory = () => import('../components/memory.vue')
const Privacy = () => import('../components/privacy.vue')
const ShareView = () => import('../components/shareView.vue')
const Profile = () => import('../components/profile.vue')
const Square = () => import('../components/square.vue')
const Feedback = () => import('../components/feedback.vue')
const Admin = () => import('../components/admin.vue')
// 3D 房间承载页: 全屏 iframe 嵌入 sg3d 的 Web 产物, 独立于首页布局
const Room3d = () => import('../components/room3d.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // 切换页面后回到内容区顶部, 避免沿用上一页的滚动位置
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    // '/' 也渲染 index 布局(此时 progress=0, 视觉上只看到欢迎页), 保证两页常驻可滑动衔接
    { path: '/', name: 'welcome', component: Index },
    // 公开分享页: 免登录, 独立于主布局
    { path: '/share/:token', name: 'share-view', component: ShareView },
    // 3D 记忆房间: 点「我的记忆空间」里的岛屿进入, 全屏承载 sg3d 的 Web 产物
    { path: '/room/:spaceId', name: 'room3d', component: Room3d, meta: { fullscreen: true } },
    {
      // index 为主路由(布局): 左侧导航固定, 子路由仅在右侧内容区切换
      path: '/index',
      name: 'index',
      component: Index,
      redirect: { name: 'space' },
      children: [
        // 我的记忆空间 = 岛屿总览; 岛内不再有独立 2D 页面(已全量改为 3D 房间)
        { path: 'space', name: 'space', component: IslandIndex },
        { path: 'memory', name: 'memory', component: Memory },
        { path: 'privacy', name: 'privacy', component: Privacy },
        { path: 'square', name: 'square', component: Square },
        { path: 'feedback', name: 'feedback', component: Feedback },
        { path: 'admin', name: 'admin', component: Admin },
        { path: 'profile', name: 'profile', component: Profile },
      ],
    },
    // 兜底: 未知路径回到欢迎页, 避免白屏
    { path: '/:pathMatch(.*)*', redirect: { name: 'welcome' } },
  ],
})

// 进入主页的门禁。
// 欢迎页的上滑/点击已经在 welcome.vue 里验过一次(echo through ensureSession),
// 但直接在地址栏输入 /index/memory 会绕过欢迎页, 所以这里再兜一道。
// /share/:token 是公开分享页, 不在拦截范围内。
// /room/:spaceId(3D 房间)只做「本地有没有 token」这一层轻校验: 房间内容全部来自后端且需要 token,
// 没登录进来只会是一间空屋, 不如直接回欢迎页去登录。这里**不**调 ensureSession ——
// 后端临时不可达时把用户踢回欢迎页, 看起来就像"点岛跳欢迎页"。
router.beforeEach(async (to, from) => {
  const auth = useCloudAuthStore()
  if (to.path.startsWith('/room')) return auth.isLogin ? true : { name: 'welcome' }
  if (!to.path.startsWith('/index')) return true
  // 已经在主页内部切换子路由(左侧导航), 不必重复校验
  if (from.path.startsWith('/index')) return true
  if (!auth.isLogin) return { name: 'welcome' }
  // 刚在欢迎页验过的话会命中短期缓存, 不会重复请求服务端
  const ok = await auth.ensureSession()
  // 服务端没确认就挡回去(含后端不可达), 不做静默放行
  if (!ok) return { name: 'welcome' }
  return true
})

export default router
