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
// 2026-11-09：DSH 給外掛 bundle 的 rev 是「安裝時」記錄的，改了磁碟上的檔案後
// bundle URL 不變，Chromium 會直接用 HTTP 快取裡的舊內容（紅框探針不出來就是這個原因）。
// 掛件的腳本是自己用 <script src> 注入的，帶一個時間戳參數就能強制每次拉最新的。
const SCRIPT_SRC = '/dsh-whale/widget.js?v=' + Date.now()

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

// ── DSH 主視窗拖曳條（Windows 修補）────────────────────────────
// 背景：DSH 的自製標題欄是 CSS 偽元素（::before）。Electron 註冊拖曳區只認真實元素，
// 偽元素的 -webkit-app-region: drag 不會被註冊 → Windows 上那條 40px 拖不動、右鍵也沒選單。
// 這裡補一個真實的拖曳條，高度跟 app 自己的標題欄一致。
// 不擋按鈕：那條區域本來就是 app 的假標題欄（內容被 padding-top 推到 40px 以下）。
function installWindowDragBar() {
  try {
    if (document.getElementById('dsh-window-drag-bar')) return
    var h = 40
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--dsh-windows-titlebar-height')
      var n = parseInt(v, 10)
      if (n > 0) h = n
    } catch (e) {}
    var bar = document.createElement('div')
    bar.id = 'dsh-window-drag-bar'
    bar.setAttribute('aria-hidden', 'true')
    bar.style.cssText = 'position:fixed;top:0;left:88px;right:0;height:' + h + 'px;' +
      '-webkit-app-region:drag;app-region:drag;z-index:2147483000;background:transparent'
    ;(document.documentElement || document.body).appendChild(bar)
  } catch (e) {}
}
try {
  // ★ 必須掛在 documentElement（body 之外）：Chromium 只認 body 子樹外的元素當拖曳區。
  //   實測：塞 body → computed app-region=no-drag；塞 html → drag ✓
  installWindowDragBar()
  document.addEventListener('DOMContentLoaded', installWindowDragBar)
} catch (e) {}
// DSH 是 SPA：換頁後 body 會換掉，拖曳條要跟著補
try {
  document.addEventListener('DOMContentLoaded', installWindowDragBar)
  var mo = new MutationObserver(function () { installWindowDragBar() })
  mo.observe(document.documentElement, { childList: true, subtree: true })
} catch (e) {}

// ── 右上角視窗控件（frame:false 下 Electron 不畫原生控件，自畫一組）────────────
function installWindowButtons() {
  try {
    if (document.getElementById('dsh-window-buttons')) return
    var api = (window.dshDesktop && window.dshDesktop.window)
    if (!api || typeof api.act !== 'function') return          // 只有桌面版 app 有這個 API
    var box = document.createElement('div')
    box.id = 'dsh-window-buttons'
    box.style.cssText = 'position:fixed;top:0;right:0;height:32px;display:flex;' +
      'align-items:stretch;z-index:2147483002;font-family:system-ui,-apple-system,sans-serif'
    var defs = [
      { act: 'minimize', label: '\u2500', title: '\u6700\u5c0f\u5316' },
      { act: 'maximize', label: '\u25a1', title: '\u6700\u5927\u5316' },
      { act: 'close', label: '\u2715', title: '\u95dc\u9589' }
    ]
    for (var i = 0; i < defs.length; i++) {
      (function (d) {
        var b = document.createElement('button')
        b.type = 'button'
        b.title = d.title
        b.setAttribute('aria-label', d.title)
        b.style.cssText = 'width:44px;height:32px;border:0;background:transparent;color:#c9c9cf;' +
          'font-size:13px;line-height:32px;cursor:default;outline:none;-webkit-app-region:no-drag'
        b.textContent = d.label
        b.addEventListener('mouseenter', function () {
          b.style.background = d.act === 'close' ? 'rgba(229,72,77,0.92)' : 'rgba(255,255,255,0.08)'
          if (d.act === 'close') b.style.color = '#fff'
        })
        b.addEventListener('mouseleave', function () {
          b.style.background = 'transparent'
          b.style.color = '#c9c9cf'
        })
        b.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation()
          try { api.act(d.act) } catch (err) {}
        })
        box.appendChild(b)
      })(defs[i])
    }
    ;(document.documentElement || document.body).appendChild(box)
  } catch (e) {}
}
try { installWindowButtons() } catch (e) {}
try { document.addEventListener('DOMContentLoaded', installWindowButtons) } catch (e) {}
try {
  var mo2 = new MutationObserver(function () { installWindowButtons() })
  mo2.observe(document.documentElement, { childList: true, subtree: true })
} catch (e) {}

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
