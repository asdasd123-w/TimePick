// Net.ts —— 3D 房间与 TimePick 后端通信
// 约定：sg3d 以 Web 产物形式被 TimePick 的 room3d.vue 用 iframe 嵌入；
// URL 上带 ?spaceId=xxx&token=yyy&apiBase=/api（同源时 apiBase 省略即取当前域 /api）。
import { sys } from 'cc'

// 一件家具摆件（与后端 room_prop 表 + getRoomLayout 返回一一对应）
export interface RoomPropData {
  item_id: number
  title: string
  kind: string
  type: string
  content: string
  entry_date: string
  furniture: string // 13 种白名单之一，对应 assets/resources/models/furniture/<名>.glb
  x: number
  y: number
  z: number
  rot_y: number
  scale: number
  reason: string
  media: { type: number; url: string; thumb: string; duration: number }[]
}

export interface RoomLayout {
  room: string // 'house_three'
  space_id: number
  props: RoomPropData[]
}

export class Net {
  // 解析 iframe URL 上的查询参数
  static getQuery(): { spaceId: number; token: string; apiBase: string } {
    // 注意：Cocos 3.8 的 sys.Platform 里没有 WEB 这个成员（写成 sys.Platform.WEB 会得到
    // undefined，判断恒为 false）。判断"是否跑在浏览器里"要用 sys.isBrowser。
    const q = new URLSearchParams(sys.isBrowser ? location.search : '')
    const store = Net.local()
    // 编辑器预览时 URL 上没有参数，可用 localStorage 临时指定（见 resolveApiBase 注释）
    const spaceId = Number(q.get('spaceId') || store.spaceId || '0')
    const token = q.get('token') || store.token || ''
    return { spaceId, token, apiBase: Net.resolveApiBase(q.get('apiBase') || '') }
  }

  // 安全读取 localStorage（隐私模式/非 Web 平台下可能不可用）
  private static local(): { spaceId: string; token: string } {
    try {
      return {
        spaceId: localStorage.getItem('tp_space_id') || '',
        token: localStorage.getItem('tp_token') || '',
      }
    } catch (e) {
      return { spaceId: '', token: '' }
    }
  }

  /**
   * 决定后端地址（TimePick 的 /api 所在）
   *  优先级：URL 参数 ?apiBase= > localStorage['tp_api_base'] > 预览环境自动推断 > 同源相对路径
   *
   * 之所以要"推断"：在 Cocos 编辑器里点预览时，页面跑在 http://localhost:7456，
   * 既没有 URL 参数也不是 TimePick 的域，直接用相对 '/api' 会把请求打到预览服务器上，
   * 返回的是 index.html（于是报 `Unexpected token '<'`）。这里自动指向本机后端 8787。
   */
  static resolveApiBase(raw: string): string {
    if (raw) return raw
    if (!sys.isBrowser) return ''

    // 允许在浏览器控制台里临时改：localStorage.setItem('tp_api_base','http://192.168.1.5:8787')
    try {
      const saved = localStorage.getItem('tp_api_base')
      if (saved) return saved
    } catch (e) {
      /* 隐私模式下 localStorage 可能不可用，忽略 */
    }

    const { protocol, port } = location
    // 编辑器预览（默认 7456）/ 直接双击本地 html 打开（file://）→ 指向本机后端
    if (protocol === 'file:' || port === '7456') return 'http://localhost:8787'
    // 其它情况按同源处理（由宿主同源部署时 /api 即可）
    return ''
  }

  // 拉取本记忆空间的房间布局（记忆 + 各自的家具摆放方案）
  static async fetchLayout(spaceId: number, token: string, apiBase: string): Promise<RoomLayout> {
    const url = apiBase ? `${apiBase.replace(/\/$/, '')}/api` : '/api'
    if (!spaceId) throw new Error('缺少 spaceId（预览时可在控制台执行 localStorage.setItem("tp_space_id","<岛屿ID>") 后刷新）')

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'room/layout', params: { space_id: spaceId }, token }),
    })
    const text = await res.text()
    // 打到非后端地址时会拿到 HTML（预览服务器 / 前端页面的兜底页），这里给出明确提示
    if (/^\s*</.test(text)) {
      throw new Error(`后端地址不对：${url} 返回的是 HTML 而不是接口 JSON（当前 apiBase="${apiBase}"）`)
    }
    let j: any
    try {
      j = JSON.parse(text)
    } catch (e) {
      throw new Error(`接口返回的不是合法 JSON（${url}）: ${text.slice(0, 120)}`)
    }
    if (j.code !== 0) throw new Error(j.msg || '获取房间布局失败')
    return j.data as RoomLayout
  }

  /**
   * 只拉「墙面陈设」状态（比 room/layout 轻得多，可以给轮询用）。
   * 用途：用户先生成了 AI 视频/图片，房间不必刷新就能自己亮电视、换照片。
   */
  static async fetchGallery(spaceId: number, token: string, apiBase: string): Promise<any> {
    const url = apiBase ? `${apiBase.replace(/\/$/, '')}/api` : '/api'
    if (!spaceId) throw new Error('缺少 spaceId')

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'room/gallery', params: { space_id: spaceId }, token }),
    })
    const text = await res.text()
    if (/^\s*</.test(text)) throw new Error(`后端地址不对：${url} 返回的是 HTML`)
    let j: any
    try {
      j = JSON.parse(text)
    } catch (e) {
      throw new Error(`接口返回的不是合法 JSON：${text.slice(0, 120)}`)
    }
    if (j.code !== 0) throw new Error(j.msg || '获取墙面陈设失败')
    return j.data
  }
}
