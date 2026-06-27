/* ============================================================================
 * lukas_a2hs.js — the LUKAS_APPS standard "Add to Home Screen" affordance. v2.
 * One drop-in, every app. So you never type "Hit Share, scroll, Add to Home
 * Screen" to anyone again — the app says it, proactively.
 *
 * USE: copy this file into the app folder and add ONE line before </body>:
 *      <script src="lukas_a2hs.js" defer></script>
 *   (no markup, no config — it injects its own banner + styles.)
 *   Optional manual entry point (e.g. a Settings row):  onclick="lukasA2HS.show()"
 *
 * BEHAVIOR (platform-aware, the way PWAs actually install):
 *   • Already installed (standalone)        → shows nothing.
 *   • Host page has its own #installToast    → stays out of the way (legacy FFF).
 *   • Android / Chrome / Edge (incl desktop) → captures beforeinstallprompt; the
 *                                              banner's "Add" fires the NATIVE dialog.
 *   • iOS (Safari)                           → "Add" opens an illustrated
 *                                              Share → Add to Home Screen sheet.
 *   • Dismiss (×)                            → remembered; won't nag again.
 *   • lukasA2HS.show()                       → force it (ignores dismiss) for a
 *                                              manual "Install" menu item.
 *
 * THEME: override --a2hs-bg / --a2hs-fg / --a2hs-go on :root to match the app.
 * Zero dependencies. Safe in jsdom (guards matchMedia/localStorage).
 * ========================================================================== */
(function () {
  "use strict";
  if (window.__lukasA2HS) return; window.__lukasA2HS = true;

  function safeMM(q) { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } }
  function standalone() { return safeMM("(display-mode: standalone)") || window.navigator.standalone === true; }
  var ua = navigator.userAgent || "";
  function isIOS() { return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document); }
  var DKEY = "lukas_a2hs_dismissed";
  function dismissed() { try { return localStorage.getItem(DKEY) === "1"; } catch (e) { return false; } }
  function remember() { try { localStorage.setItem(DKEY, "1"); } catch (e) {} }
  /* a host app that ships its OWN install banner (legacy, e.g. Ford-Falcon's #installToast)
     keeps it — the standard defers so they never double up. */
  function hostHasOwn() { return !!document.getElementById("installToast"); }

  if (standalone()) return; // already installed — nothing to do

  var deferred = null, bar = null;

  var css = document.createElement("style");
  css.textContent =
    "#lukasA2HS{position:fixed;left:0;right:0;bottom:0;z-index:2147483600;display:none;align-items:center;gap:11px;" +
    "background:var(--a2hs-bg,#1c1c1e);color:var(--a2hs-fg,#fff);padding:13px 15px calc(13px + env(safe-area-inset-bottom));" +
    "box-shadow:0 -6px 24px rgba(0,0,0,.28);font:600 14px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;animation:a2hsUp .26s ease}" +
    "#lukasA2HS.show{display:flex}" +
    "#lukasA2HS .a2hs-i{font-size:22px;flex:0 0 auto}" +
    "#lukasA2HS .a2hs-t{flex:1}#lukasA2HS .a2hs-t b{font-weight:800}" +
    "#lukasA2HS .a2hs-t span{display:block;font-weight:500;opacity:.82;font-size:12px;margin-top:1px}" +
    "#lukasA2HS .a2hs-go{flex:0 0 auto;background:var(--a2hs-go,#0a84ff);color:#fff;border:0;border-radius:10px;padding:9px 16px;font-weight:800;font-size:14px;cursor:pointer}" +
    "#lukasA2HS .a2hs-x{flex:0 0 auto;opacity:.55;font-size:20px;line-height:1;padding:2px 5px;cursor:pointer}" +
    "@keyframes a2hsUp{from{transform:translateY(100%)}to{transform:none}}" +
    "#lukasA2HSov{position:fixed;inset:0;z-index:2147483601;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center}" +
    "#lukasA2HSov .a2hs-card{background:#fff;color:#15151a;width:min(440px,100%);border-radius:18px 18px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom));" +
    "font:400 15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;animation:a2hsUp .24s ease}" +
    "#lukasA2HSov h3{margin:0 0 4px;font-size:18px;font-weight:800}" +
    "#lukasA2HSov ol{margin:14px 0 0;padding-left:0;list-style:none;counter-reset:s}" +
    "#lukasA2HSov li{counter-increment:s;display:flex;align-items:center;gap:11px;padding:9px 0;border-top:1px solid #eee}" +
    "#lukasA2HSov li::before{content:counter(s);flex:0 0 24px;height:24px;border-radius:50%;background:#1c1c1e;color:#fff;" +
    "display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}" +
    "#lukasA2HSov .a2hs-ic{margin-left:auto;font-size:20px}" +
    "#lukasA2HSov .a2hs-note{margin-top:12px;font-size:12.5px;color:#8a6d1a;background:#fff7e6;border:1px solid #f0d9a8;border-radius:9px;padding:9px 11px}" +
    "#lukasA2HSov .a2hs-done{margin-top:14px;width:100%;border:0;border-radius:12px;background:#1c1c1e;color:#fff;padding:13px;font-weight:800;font-size:15px;cursor:pointer}" +
    "#lukasA2HSov .a2hs-skip{display:block;width:100%;text-align:center;margin-top:10px;background:none;border:0;color:#888;font-size:13px;cursor:pointer}";
  (document.head || document.documentElement).appendChild(css);

  function shareGlyph() {
    return '<svg class="a2hs-ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 16V4M12 4l-4 4M12 4l4 4"/><path d="M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7"/></svg>';
  }
  function appName() {
    var t = (document.title || "this app").replace(/\s*[—|·-].*$/, "").trim();
    return (t || "this app").replace(/[&<>"]/g, "");
  }
  var iosOtherBrowser = isIOS() && /crios|fxios|edgios/i.test(ua);

  function openSheet() {
    var nm = appName();
    var ov = document.createElement("div"); ov.id = "lukasA2HSov";
    var iosSteps =
      '<li>Tap the <b>Share</b> button ' + shareGlyph() + '</li>' +
      '<li>Scroll and tap <b>Add to Home Screen</b> <span class="a2hs-ic">➕</span></li>' +
      '<li>Tap <b>Add</b> — done <span class="a2hs-ic">✅</span></li>';
    var genSteps =
      '<li>Open your browser <b>menu</b> <span class="a2hs-ic">⋮</span></li>' +
      '<li>Tap <b>Install app</b> / <b>Add to Home Screen</b> <span class="a2hs-ic">➕</span></li>' +
      '<li>Confirm <b>Add / Install</b> <span class="a2hs-ic">✅</span></li>';
    ov.innerHTML =
      '<div class="a2hs-card" role="dialog" aria-label="Add to Home Screen">' +
      '<h3>📲 Add ' + nm + ' to your Home Screen</h3>' +
      '<div style="color:#666;font-size:13.5px">Get the full-screen app — opens instantly, works offline. Takes 5 seconds:</div>' +
      '<ol>' + (isIOS() ? iosSteps : genSteps) + '</ol>' +
      (iosOtherBrowser ? '<div class="a2hs-note">You’re in another browser — on iPhone, open this page in <b>Safari</b> first, then follow the steps.</div>' : '') +
      '<button class="a2hs-done">Got it</button>' +
      '<button class="a2hs-skip">Don’t show this again</button>' +
      '</div>';
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.className === "a2hs-done") ov.remove(); });
    ov.querySelector(".a2hs-skip").addEventListener("click", function () { remember(); ov.remove(); hide(); });
    document.body.appendChild(ov);
  }

  function act() {
    if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; hide(); }); return; }
    openSheet();
  }
  function canAuto() { return !standalone() && !dismissed() && !hostHasOwn() && (!!deferred || isIOS()); }
  function show() { if (canAuto() && bar) bar.classList.add("show"); }
  function hide() { if (bar) bar.classList.remove("show"); }

  function mount() {
    if (bar || hostHasOwn()) return;       // FFF etc. keep their own banner — don't double up
    bar = document.createElement("div");
    bar.id = "lukasA2HS";
    bar.innerHTML =
      '<span class="a2hs-i">📲</span>' +
      '<div class="a2hs-t"><b>Add ' + appName() + ' to your Home Screen</b>' +
      '<span>Full-screen · works offline · one tap to launch</span></div>' +
      '<button class="a2hs-go">Add</button>' +
      '<span class="a2hs-x" aria-label="Dismiss">×</span>';
    bar.querySelector(".a2hs-go").addEventListener("click", act);
    bar.querySelector(".a2hs-x").addEventListener("click", function () { remember(); hide(); });
    document.body.appendChild(bar);
  }
  function ready(fn) { if (document.body) fn(); else document.addEventListener("DOMContentLoaded", fn); }

  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; ready(function () { mount(); show(); }); });
  window.addEventListener("appinstalled", function () { remember(); hide(); });
  ready(function () { mount(); show(); });

  // manual entry point — opens the prompt/steps even if the banner was dismissed
  window.lukasA2HS = {
    show: function () { ready(function () { mount(); if (bar) bar.classList.add("show"); act(); }); },
    _canAuto: canAuto
  };
})();
