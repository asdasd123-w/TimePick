// FurnitureProp.ts —— 挂在每件家具节点上的轻量组件
// 只负责记录"这件家具对应哪条记忆"，点击拾取的逻辑统一在 RoomBootstrap 里集中处理。
//
// ★ 呼吸高亮不再做在这件家具上（缩放家具会"遮挡/变形"物体，用户明确否掉了），
//   改成在物品位置叠加一层会呼吸的柔光（见 PropGlow.ts），不会盖住模型本身。
import { _decorator, Component } from 'cc'
import { RoomPropData } from './Net'

const { ccclass, property } = _decorator

@ccclass('FurnitureProp')
export class FurnitureProp extends Component {
  // 记忆条目 id（点家具时回传给宿主，用于弹详情）
  @property
  itemId = 0

  // 该记忆的完整摆件数据（详情浮层要展示的标题/媒体等都可从这里取）
  prop: RoomPropData | null = null
}
