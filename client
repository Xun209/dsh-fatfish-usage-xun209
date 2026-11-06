// DSH 客户端入口（渲染进程侧）。
//
// 为什么需要这个文件：
// 挂件的界面本体是 assets/whale-widget.js，由宿主路由 /dsh-whale/widget.js 提供（lib/index.js 注册）。
// 旧方案靠宿主的 index 注入表把 <script> 塞进页面，但桌面壳那张表是**宿主启动时一次性收集**的，
// 插件稍晚挂载就永远收不到 → 界面整个不出现（插件自己的 issue #152/#153/#154 记的就是这个坑，
// lib/index.js 里那段 DESKTOP_WIDGET_ROW_TEXT 注释也写了同样的结论）。
// 这里改成正规的 client bundle：由渲染器自己注入脚本，不再依赖那张一次性注入表，
// 桌面端与网页端两条路都成立。
//
// 注入前做三重去重，避免和旧的 tapIndex / 桌面注入行把同一个脚本跑两遍：
//   ① 挂件脚本已经跑过（window.__dshw* 标记）；
//   ② 页面里已经存在指向同一路由的 script 标签；
//   ③ 本 bundle 自己已经注入过。
//
// 脚本本体 1.2MB，自带全部界面逻辑与事件绑定；这里只负责把它挂上去，不碰它的 DOM。

const SCRIPT_ID = 'dsh-whale-widget-script'
const SCRIPT_SRC = '/dsh-whale/widget.js'

function widgetAlreadyRunning() {
  return !!(
    window.__dshwCustBound
    || window.__dshwQeditBound
    || window.__dshwColorBound
    || window.__dshwFrameMenuBound
  )
}

function scriptTagPresent() {
  const tags = document.getElementsByTagName('script')
  for (let i = 0; i < tags.length; i++) {
    const src = tags[i].src || tags[i].getAttribute('src') || ''
    if (src.indexOf(SCRIPT_SRC) >= 0) return true
  }
  return false
}

function injectWidgetScript() {
  try {
    if (widgetAlreadyRunning()) return
    if (document.getElementById(SCRIPT_ID)) return
    if (scriptTagPresent()) return
    const el = document.createElement('script')
    el.id = SCRIPT_ID
    el.src = SCRIPT_SRC
    el.defer = true
    // 路由不在时静默失败，绝不因为挂件起不来而拖垮宿主
    el.onerror = function () {}
    ;(document.head || document.documentElement).appendChild(el)
  } catch (err) {
    // 挂件失败不影响宿主
  }
}

window.__ModuleLoader__.load({
  id: 'dsh-whale-widget',
  factory() {
    return {
      apply(ctx) {
        const timers = []
        const tick = function () { injectWidgetScript() }
        // 立刻试一次；1.2s / 3.5s 再补两次 —— 桌面壳的注入行是页面启动后才异步应用的，
        // 太早注入会跟它撞车（同一个脚本被执行两遍）。
        timers.push(setTimeout(tick, 0))
        timers.push(setTimeout(tick, 1200))
        timers.push(setTimeout(tick, 3500))
        const dispose = function () {
          for (const t of timers) clearTimeout(t)
        }
        if (typeof ctx.effect === 'function') {
          ctx.effect(function () { return dispose })
          return
        }
        return dispose
      },
    }
  },
})
