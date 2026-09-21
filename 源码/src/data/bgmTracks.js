// 背景音乐预置曲目(打包在 public/music, 浏览器经根路径直取)
// 默认曲 = 用户提供的新曲(bgm-default.mp3); 旧预置曲《最想说的话》按要求已从列表移除,
// 老用户 settings 里存着 preset-zuixiangshuo 时 resolveBgmSrc 返回空, 播放器会自动回退到新默认曲。
export const BGM_PRESETS = [
  { id: 'preset-bgm-default', name: '默认音乐', artist: '拾光', src: '/music/bgm-default.mp3' },
]

// 未选择/选择失效时兜底播放的曲目
export const BGM_DEFAULT_TRACK = 'preset-bgm-default'

// 根据曲目 id 解析出可播放地址; 自传曲目 id 形如 'url:/uploads/bgm/xxx'
export function resolveBgmSrc(id, uploads = []) {
  if (id && id.startsWith('url:')) {
    const url = id.slice(4)
    return uploads.some((t) => t.url === url) ? url : ''
  }
  const p = BGM_PRESETS.find((t) => t.id === id)
  return p ? p.src : ''
}

// 曲目 id -> 展示信息(名字/歌手)
export function bgmMeta(id, uploads = []) {
  if (id && id.startsWith('url:')) {
    const url = id.slice(4)
    const hit = uploads.find((t) => t.url === url)
    return hit ? { name: hit.name, artist: hit.artist || '我上传的音乐' } : null
  }
  const p = BGM_PRESETS.find((t) => t.id === id)
  return p ? { name: p.name, artist: p.artist } : null
}
