/* ============================================================================
 * lukas_a2hs.js — the LUKAS_APPS standard "Add to Home Screen" button.
 * One drop-in, every app. So you never say "Hit Share, scroll, Add to Home
 * Screen" again — the app says it.
 *
 * USE: copy this file into the app folder and add ONE line before </body>:
 *      <script src="lukas_a2hs.js" defer></script>
 *   (no markup, no config needed — it injects its own button + styles.)
 *
 * BEHAVIOR (platform-aware, the way PWAs actually install):
 *   • Already installed (standalone)  → shows nothing.
 *   • Android / Chrome / Edge         → captures beforeinstallprompt; the button
 *                                        fires the NATIVE one-tap install dialog.
 *   • iOS Safari (no install API)      → the button opens an illustrated
 *                                        Share → Add to Home Screen sheet.
 *   • Dismiss (×)                      → remembered; won't nag again.
 *
 * THEME: override --a2hs-bg / --a2hs-fg / --a2hs-bottom on :root to match the app.
 * Zero dependencies. Safe in jsdom (guards matchMedia/localStorage).
 * ========================================================================== */
(function () {
  "use strict";
  if (window.__lukasA2HS) return; window.__lukasA2HS = true;

  function safeMM(q) { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } }
  function standalone() { return safeMM("(display-mode: standalone)") || window.navigator.standalone === true; }
  var ua = navigator.userAgent || "";
  function isIOS() { return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document); }
  function isSafari() { return /^((?!chrome|android|crios|fxios|edgios|edg).)*safari/i.test(ua); }
  var DKEY = "lukas_a2hs_dismissed";
  function dismissed() { try { return localStorage.getItem(DKEY) === "1"; } catch (e) { return false; } }
  function remember() { try { localStorage.setItem(DKEY, "1"); } catch (e) {} }

  if (standalone()) return; // already installed — nothing to do

  var deferred = null, btn = null;

  var css = document.createElement("style");
  css.textContent =
    "#lukasA2HS{position:fixed;left:50%;transform:translateX(-50%);bottom:var(--a2hs-bottom,84px);z-index:2147483600;" +
    "display:none;align-items:center;gap:9px;background:var(--a2hs-bg,#1c1c1e);color:var(--a2hs-fg,#fff);" +
    "border:0;border-radius:999px;padding:11px 16px;font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
    "box-shadow:0 8px 28px rgba(0,0,0,.32);cursor:pointer;max-width:calc(100vw - 28px)}" +
    "#lukasA2HS .a2hs-x{margin-left:4px;opacity:.6;font-size:16px;line-height:1;padding:0 2px}" +
    "#lukasA2HSov{position:fixed;inset:0;z-index:2147483601;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center}" +
    "#lukasA2HSov .a2hs-card{background:#fff;color:#15151a;width:min(440px,100%);border-radius:18px 18px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom));" +
    "font:400 15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;animation:a2hsUp .24s ease}" +
    "@keyframes a2hsUp{from{transform:translateY(30px);opacity:.5}to{transform:none;opacity:1}}" +
    "#lukasA2HSov h3{margin:0 0 4px;font-size:18px;font-weight:800}" +
    "#lukasA2HSov ol{margin:14px 0 0;padding-left:0;list-style:none;counter-reset:s}" +
    "#lukasA2HSov li{counter-increment:s;display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid #eee}" +
    "#lukasA2HSov li::before{content:counter(s);flex:0 0 24px;height:24px;border-radius:50%;background:#1c1c1e;color:#fff;" +
    "display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}" +
    "#lukasA2HSov .a2hs-ic{margin-left:auto;font-size:20px}" +
    "#lukasA2HSov .a2hs-done{margin-top:16px;width:100%;border:0;border-radius:12px;background:#1c1c1e;color:#fff;padding:13px;font-weight:800;font-size:15px;cursor:pointer}" +
    "#lukasA2HSov .a2hs-skip{display:block;width:100%;text-align:center;margin-top:10px;background:none;border:0;color:#888;font-size:13px;cursor:pointer}";
  (document.head || document.documentElement).appendChild(css);

  function shareGlyph() {
    return '<svg class="a2hs-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7"/></svg>';
  }
  function appName() {
    var m = document.querySelector('link[rel="manifest"]');
    var t = (document.title || "this app").replace(/\s*[—|·-].*$/, "").trim();
    return t || "this app";
  }

  function openSheet() {
    var nm = appName();
    var ov = document.createElement("div"); ov.id = "lukasA2HSov";
    var iosSteps =
      '<li>Tap the <b>Share</b> button below ' + shareGlyph() + '</li>' +
      '<li>Scroll and tap <b>Add to Home Screen</b> <span class="a2hs-ic">➕</span></li>' +
      '<li>Tap <b>Add</b> — done <span class="a2hs-ic">✅</span></li>';
    var genSteps =
      '<li>Open your browser <b>menu</b> <span class="a2hs-ic">⋮</span></li>' +
      '<li>Tap <b>Install app</b> / <b>Add to Home Screen</b> <span class="a2hs-ic">➕</span></li>' +
      '<li>Confirm <b>Add / Install</b> <span class="a2hs-ic">✅</span></li>';
    ov.innerHTML =
      '<div class="a2hs-card" role="dialog" aria-label="Add to Home Screen">' +
      '<h3>📲 Add ' + nm.replace(/[&<>]/g, "") + ' to your Home Screen</h3>' +
      '<div style="color:#666;font-size:13.5px">Get the full-screen app — opens instantly, works offline. Takes 5 seconds:</div>' +
      '<ol>' + (isIOS() ? iosSteps : genSteps) + '</ol>' +
      '<button class="a2hs-done">Got it</button>' +
      '<button class="a2hs-skip">Don’t show this again</button>' +
      '</div>';
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.className === "a2hs-done") ov.remove(); });
    ov.querySelector(".a2hs-skip").addEventListener("click", function () { remember(); ov.remove(); hide(); });
    document.body.appendChild(ov);
  }

  function onClick(e) {
    if (e && e.target && e.target.className === "a2hs-x") { remember(); hide(); return; }
    if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; hide(); }); return; }
    openSheet();
  }
  function show() { if (!standalone() && !dismissed() && btn) btn.style.display = "inline-flex"; }
  function hide() { if (btn) btn.style.display = "none"; }
  function eligible() { return !!deferred || (isIOS() && isSafari()); }

  function mount() {
    if (btn) return;
    btn = document.createElement("button");
    btn.id = "lukasA2HS"; btn.type = "button";
    btn.innerHTML = '<span>📲 Add to Home Screen</span><span class="a2hs-x" aria-label="Dismiss">×</span>';
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
    if (eligible()) show();
  }
  function ready(fn) { if (document.body) fn(); else document.addEventListener("DOMContentLoaded", fn); }

  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; ready(function () { mount(); show(); }); });
  window.addEventListener("appinstalled", function () { remember(); hide(); });
  ready(mount);

  // expose for manual triggering if an app wants its own entry point
  window.lukasA2HS = { show: function () { ready(function () { mount(); btn.style.display = "inline-flex"; onClick({}); }); }, _eligible: eligible };
})();
