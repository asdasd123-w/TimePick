// HostBridge.ts —— sg3d 与宿主(TimePick room3d.vue)的 postMessage 桥
// 协议：
//   sg3d -> 宿主: { type:'tp:ready' }                       房间加载完成
//               { type:'tp:openMemory', itemId }           点家具，请求展示该记忆详情
//               { type:'tp:catMenu', nx, ny }              点击小猫：把菜单摆到猫头上
//                                                          （nx/ny 是归一化屏幕坐标 0..1、y 向下）
//               { type:'tp:catMenuClose' }                 收起菜单（点了别处 / 菜单超时）
//               { type:'tp:catBubble', text, kind, nx, ny, ms }
//                                                          小猫的说话/想法气泡，kind=say|thought
//                                                          ★ 说话期间会周期性重发（气泡要跟着猫走），
//                                                            ms 是"还剩多少毫秒"而不是总时长
//   宿主 -> sg3d: { type:'tp:catAction', action }           点了菜单里的哪一项
//                 action = chat|find|stop
//                 （摸摸头/打招呼/望望天/要抱抱已按需求删掉）
//               { type:'tp:catMenuClose' }                 宿主侧主动收起菜单
//               { type:'tp:catGoto', x, z, stop?, near?, itemId? }
//                                                          「找找内容」搜到物品后让猫走过去；
//                                                          itemId 给了的话，猫走到之后自动打开这条记忆的详情
//               { type:'tp:view', name }                   视角快捷定位（CameraRig 的预设机位）
//                                                          name = house|indoor|garden|desk|island
//                                                          x/z = 物品的世界坐标；
//                                                          stop = 在离目标多远处停住（0 = 直接走到点上）；
//                                                          near = true 表示只走到旁边（东西摆在桌上/柜子里）
//               { type:'tp:closeDetail' }                  关闭详情浮层（预留）
// 说明：本地同源 iframe 用 '*' 即可；若跨域部署，请改为校验具体 origin。
export type CatAction = 'chat' | 'find' | 'stop'

export type HostMessage =
  | { type: 'tp:ready' }
  | { type: 'tp:openMemory'; itemId: number }
  | { type: 'tp:catMenu'; nx: number; ny: number }
  | { type: 'tp:catMenuClose' }
  | { type: 'tp:catBubble'; text: string; kind: 'say' | 'thought'; nx: number; ny: number; ms?: number }
  | { type: 'tp:catAction'; action: CatAction }
  | { type: 'tp:catGoto'; x: number; z: number; stop?: number; near?: boolean; itemId?: number }
  | { type: 'tp:view'; name: string }
  | { type: 'tp:closeDetail' }

export class HostBridge {
  static post(msg: HostMessage) {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*')
    } else if (typeof window !== 'undefined') {
      // 独立预览（未嵌在 iframe 里）时打到自己的 window，方便本地调试
      window.postMessage(msg, '*')
    }
  }

  static onMessage(cb: (msg: any) => void) {
    if (typeof window === 'undefined') return
    window.addEventListener('message', (e: MessageEvent) => {
      try {
        cb(e.data)
      } catch {
        /* 忽略非法消息 */
      }
    })
  }
}
