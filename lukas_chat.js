/* ============================================================================
   lukas_chat.js — House Unified Chat client (self-contained, app-agnostic)
   Ported 1:1 from the PROVEN TCTP Hiker-to-Hiker (H2HC) client, generalized to
   the (app, scope) schema so the SAME backend serves dead_dance, FFF, TCTP.

   What carried over intact (passed TCTP P6 attorney + P7 red-team):
     • magic-link identity spine (signInWithOtp) — client never sees email/hash
     • one-time 18+ attestation gates identity; minor self-ID hard-locks, persisted
     • reading is anonymous/open; POSTING requires identity (server-enforced via RLS)
     • Report + Mute one tap from every message; server moderation trigger + 30-day purge
     • Realtime (postgres_changes INSERT) with a 25s poll fallback; per-room unread

   New in the house version:
     • rooms scoped by (app, scope) instead of a single trail
     • RPC chat_upsert_identity(p_display_name) (single arg)
     • friends graph hooks (friend_request) — DMs remain counsel-gated, not shipped
     • self-mounting: injects its own CSS + panel + auth modal; no host DOM required

   USAGE (host page):
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
     <script src="./lukas_chat.js"></script>
     <script> LukasChat.init({ app:'dead_dance', brand:{ name:'dead_dance', accent:'#b8002e', icon:'🌹' } }); </script>
   Open programmatically: LukasChat.open()  ·  LukasChat.openScope('bayarea')
   ============================================================================ */
(function (root) {
  "use strict";

  // ---- project credentials (anon key is public by design; pepper/service_role never here) ----
  var SUPA_URL = "https://vmbqfzxhrqxpwgidogfm.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtYnFmenhocnF4cHdnaWRvZ2ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDUzODUsImV4cCI6MjA5Nzk4MTM4NX0.aa2guYvXJ7SLAEdYOpDKb6xzHP-ypMpZFPFSdwLc6xM";

  // ---- column map: single source of truth, matches 01_schema.sql / 03_friends.sql ----
  var COLS = {
    room:  { table:"chat_rooms",    id:"id", app:"app", scope:"scope", label:"label", kind:"kind", active:"is_active", sort:"sort_order" },
    msg:   { table:"chat_messages", id:"id", room:"room_id", sender:"sender_id", body:"body", kind:"kind", created:"created_at" },
    rep:   { table:"chat_reports",  msg:"message_id", room:"room_id", reporter:"reporter_id", reported:"reported_id", reason:"reason", snap:"message_snapshot" },
    mute:  { table:"chat_mutes",    muter:"muter_id", muted:"muted_id" },
    names: { view:"chat_display_names", id:"id", name:"display_name" }
  };

  var CFG = { app:"app", brand:{ name:"Chat", accent:"#b8002e", icon:"💬" }, launcher:true, onIdentity:null };
  var sb = null, rooms = [], room = null, muted = {}, names = {}, poll = null, chan = null, mountedDom = false;

  // ---- localStorage keys, namespaced per app ----
  function K(suffix){ return "lc." + CFG.app + "." + suffix; }
  function kMinor(){ return K("minor"); }
  function kAttest(){ return K("attest"); }
  function kId(){ return K("id"); }
  function kRead(roomId){ return K("read." + roomId); }

  function minorLocked(){ try { return localStorage.getItem(kMinor()) === "1"; } catch(_) { return false; } }
  function attested(){ try { return !!localStorage.getItem(kAttest()); } catch(_) { return false; } }
  function identity(){ try { return JSON.parse(localStorage.getItem(kId()) || "null"); } catch(_) { return null; } }

  function client(){
    if (!sb && root.supabase) { sb = root.supabase.createClient(SUPA_URL, SUPA_KEY); }
    return sb;
  }
  function esc(t){ return String(t==null?"":t).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
  function toast(msg){
    var t = document.getElementById("lc-toast-note");
    if (!t) { t = document.createElement("div"); t.id = "lc-toast-note"; t.className = "lc-note"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(t._tm); t._tm = setTimeout(function(){ t.classList.remove("on"); }, 3600);
  }

  // =========================================================================
  // IDENTITY SPINE (magic link · 18+ gate · minor lock) — proven, carried intact
  // =========================================================================
  function authStep(step){
    ["attest","minor","email","sent","name"].forEach(function(k){
      var el = document.getElementById("lc-step-" + k);
      if (el) el.classList.toggle("on", k === step);
    });
  }
  function openAuth(){
    if (minorLocked()) { authStep("minor"); showModal(); return; }
    if (identity()) { toast("Signed in as " + (identity().name || "you") + " · you’re set"); return; }
    var c = client();
    if (!c) { toast("Sign-in needs a connection — try again with signal"); return; }
    c.auth.getSession().then(function(r){
      var sess = r && r.data && r.data.session;
      if (sess) { authStep("name"); }
      else if (!attested()) { authStep("attest"); }
      else { authStep("email"); }
      showModal();
    });
  }
  function attestYes(){ try { localStorage.setItem(kAttest(), String(Date.now())); } catch(_){} authStep("email"); }
  function attestNo(){ // D21: hard-disable, persist, no bypass, never re-prompted
    try { localStorage.setItem(kMinor(), "1"); localStorage.removeItem(kAttest()); } catch(_){}
    authStep("minor");
  }
  function sendLink(){
    if (minorLocked()) return;
    var em = (document.getElementById("lc-email").value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { toast("That email doesn’t look right — check it?"); return; }
    var btn = document.getElementById("lc-send-btn"); btn.disabled = true; btn.textContent = "Sending…";
    client().auth.signInWithOtp({ email: em, options: { emailRedirectTo: location.origin + location.pathname } })
      .then(function(r){
        btn.disabled = false; btn.textContent = "Email my link";
        if (r.error) { toast("Couldn’t send the link — " + (r.error.message || "try again")); return; }
        var to = document.getElementById("lc-sent-to"); if (to) to.textContent = em; // shown to owner only, never stored
        document.getElementById("lc-email").value = "";
        authStep("sent");
      });
  }
  function finishIdentity(){
    if (minorLocked()) return;
    var nm = (document.getElementById("lc-name").value || "").trim();
    if (nm.length < 2) { toast("Pick a name — 2 characters or more"); return; }
    var btn = document.getElementById("lc-name-btn"); btn.disabled = true; btn.textContent = "Saving…";
    client().rpc("chat_upsert_identity", { p_display_name: nm }).then(function(r){
      btn.disabled = false; btn.textContent = "That’s me";
      if (r.error || !r.data) { toast("Couldn’t finish sign-in — " + ((r.error && r.error.message) || "try again")); return; }
      var ident = { id: r.data, name: nm };
      try { localStorage.setItem(kId(), JSON.stringify(ident)); } catch(_){}
      hideModal();
      toast("Signed in as " + nm + " · your profile travels with you");
      try { if (typeof CFG.onIdentity === "function") CFG.onIdentity(ident); } catch(_){}
      renderGate(); loadRooms();
    });
  }
  function signOut(){
    var c = client();
    try { if (c) c.auth.signOut(); } catch(_){}
    try { localStorage.removeItem(kId()); } catch(_){}
    toast("Signed out · reading stays open");
    renderGate();
  }
  function authInit(){
    var c = client(); if (!c || !c.auth) return;
    try {
      c.auth.onAuthStateChange(function(evt, sess){
        if (evt === "SIGNED_IN" && sess && !identity() && !minorLocked()) { authStep("name"); showModal(); }
      });
    } catch(_){}
  }

  // =========================================================================
  // ROOMS + MESSAGES — proven, carried intact (scoped by app instead of trail)
  // =========================================================================
  function open(){ buildDom(); var p = document.getElementById("lc-panel"); p.classList.add("open"); backToRooms(); loadRooms(); }
  function close(){ teardown(); var p = document.getElementById("lc-panel"); if (p) p.classList.remove("open"); }
  function openScope(scope){ open(); var iv = setInterval(function(){ // open straight into a room once rooms load
      if (rooms.length) { clearInterval(iv); for (var i=0;i<rooms.length;i++) if (rooms[i][COLS.room.scope]===scope){ openRoom(rooms[i][COLS.room.id]); break; } }
    }, 120); setTimeout(function(){ clearInterval(iv); }, 4000); }

  function backToRooms(){
    room = null; stopPoll(); unsub();
    document.getElementById("lc-rooms").style.display = "";
    document.getElementById("lc-msgs").style.display = "none";
    document.getElementById("lc-comp").style.display = "none";
    document.getElementById("lc-gate").style.display = "none";
    document.getElementById("lc-back").style.display = "none";
    document.getElementById("lc-title").textContent = CFG.brand.name + " chat";
  }
  function loadRooms(){
    var c = client(), L = document.getElementById("lc-rooms"), R = COLS.room;
    if (!c) { L.innerHTML = '<div class="lc-empty">Chat needs a connection — you’re offline.</div>'; return; }
    L.innerHTML = '<div class="lc-empty">Finding the rooms…</div>';
    c.from(R.table).select("*").eq(R.app, CFG.app).eq(R.active, true).order(R.sort)
      .then(function(r){
        if (r.error) { L.innerHTML = '<div class="lc-empty">Couldn’t load rooms — ' + esc(r.error.message) + "</div>"; return; }
        rooms = r.data || [];
        if (!rooms.length) { L.innerHTML = '<div class="lc-empty">No rooms yet.</div>'; return; }
        // group chapters then topics
        var chap = rooms.filter(function(x){ return x[R.kind] !== "topic"; });
        var top  = rooms.filter(function(x){ return x[R.kind] === "topic"; });
        function rowHtml(rm){
          var ic = rm[R.kind] === "topic" ? "💬" : (CFG.brand.icon || "⚑");
          return '<button class="lc-room-row" onclick="LukasChat._openRoom(\'' + esc(rm[R.id]) + '\')">' +
            '<span class="lc-room-ic">' + ic + '</span><span><div class="lc-room-nm">' + esc(rm[R.label]) + "</div>" +
            '<div class="lc-room-sub">' + (rm[R.kind] === "topic" ? "topic room" : "chapter room") + "</div></span></button>";
        }
        var html = "";
        if (chap.length) html += '<div class="lc-grp">Chapters</div>' + chap.map(rowHtml).join("");
        if (top.length)  html += '<div class="lc-grp">Topics</div>' + top.map(rowHtml).join("");
        L.innerHTML = html;
        unreadScan(function(u){ paintUnread(u); });
      });
  }
  function openRoom(id){
    var R = COLS.room; room = null;
    for (var i=0;i<rooms.length;i++) if (String(rooms[i][R.id]) === String(id)) room = rooms[i];
    if (!room) return;
    document.getElementById("lc-rooms").style.display = "none";
    document.getElementById("lc-msgs").style.display = "";
    document.getElementById("lc-back").style.display = "";
    document.getElementById("lc-title").textContent = room[R.label] || "Room";
    renderGate();
    loadMutes(function(){ loadMsgs(); });
    startPoll();
    sub(room[R.id]);
  }
  function renderGate(){
    var comp = document.getElementById("lc-comp"), gate = document.getElementById("lc-gate");
    if (!comp || !gate) return;
    if (minorLocked()) { comp.style.display = "none"; gate.style.display = "";
      gate.innerHTML = '<div class="lc-tx">Chat is for 18+, so posting is off on this device. Reading is open to all.</div>'; return; }
    if (identity()) { gate.style.display = "none"; comp.style.display = ""; return; }
    comp.style.display = "none"; gate.style.display = "";
    gate.innerHTML = '<button class="lc-btn" onclick="LukasChat._openAuth()">✉ Sign in to post (free, 18+)</button>' +
      '<div class="lc-tx" style="margin-top:6px">Reading is open — posting takes a 30-second magic-link sign-in.</div>';
  }
  function loadMutes(cb){
    muted = {}; var c = client(), id = identity(), M = COLS.mute;
    if (!c || !id) { cb && cb(); return; }
    c.from(M.table).select(M.muted).eq(M.muter, id.id).then(function(r){
      (r.data || []).forEach(function(row){ muted[row[M.muted]] = 1; }); cb && cb();
    });
  }
  function resolveNames(ids, cb){
    var c = client(), N = COLS.names, need = [];
    ids.forEach(function(i){ if (i && !names[i] && need.indexOf(i) < 0) need.push(i); });
    if (!c || !need.length) { cb && cb(); return; }
    c.from(N.view).select(N.id + "," + N.name).in(N.id, need).then(function(r){
      (r.data || []).forEach(function(row){ names[row[N.id]] = row[N.name]; }); cb && cb();
    });
  }
  function loadMsgs(){
    var c = client(), box = document.getElementById("lc-msgs"), C = COLS.msg, R = COLS.room;
    if (!c || !room) return;
    c.from(C.table).select("*").eq(C.room, room[R.id]).order(C.created, { ascending:false }).limit(60)
      .then(function(r){
        if (r.error) { box.innerHTML = '<div class="lc-empty">Couldn’t load messages — ' + esc(r.error.message) + "</div>"; return; }
        var list = (r.data || []).reverse().filter(function(m){ return !muted[m[C.sender]]; });
        resolveNames(list.map(function(m){ return m[C.sender]; }), function(){
          var me = identity(), html = "";
          if (!list.length) html = '<div class="lc-empty">Quiet in here. Say hello — every show starts with one note.</div>';
          list.forEach(function(m){
            var mine = me && String(m[C.sender]) === String(me.id);
            var when = new Date(m[C.created]);
            var tm = when.toLocaleDateString(undefined, { month:"short", day:"numeric" }) + " " + when.toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" });
            var nm = mine ? (me.name || "you") : (names[m[C.sender]] || "friend");
            html += '<div class="lc-msg' + (mine ? " mine" : "") + '"><div class="lc-m-top">' +
              '<span class="lc-m-nm">' + esc(nm) + '</span><span class="lc-m-tm">' + tm + "</span>" +
              (mine ? "" : '<span class="lc-m-acts">' +
                '<button onclick="LukasChat._badge(\'' + esc(m[C.sender]) + "','" + esc(nm) + "')\" title=\"See their badge\">🎫</button>" +
                '<button onclick="LukasChat._friend(\'' + esc(m[C.sender]) + "')\" title=\"Send a friend request\">⊕</button>" +
                '<button onclick="LukasChat._report(\'' + esc(m[C.id]) + "')\" title=\"Report to the operator\">⚑</button>" +
                '<button onclick="LukasChat._mute(\'' + esc(m[C.sender]) + "')\" title=\"Hide this person on this device\">⃠</button></span>") +
              '</div><div class="lc-m-body">' + esc(m[C.body]) + "</div></div>";
          });
          box.innerHTML = html; box.scrollTop = box.scrollHeight;
          if (list.length) markRead(room[R.id], list[list.length - 1][C.created]);
        });
      });
  }
  function send(){
    var inp = document.getElementById("lc-input"), txt = (inp.value || "").trim();
    if (!txt) return;
    var id = identity(); if (!id) { openAuth(); return; }
    if (minorLocked()) return;
    var c = client(), C = COLS.msg, R = COLS.room, row = {};
    row[C.room] = room[R.id]; row[C.sender] = id.id; row[C.body] = txt; row[C.kind] = "text";
    inp.disabled = true;
    c.from(C.table).insert([row]).then(function(r){
      inp.disabled = false;
      if (r.error) { toast("Didn’t send — " + (r.error.message || "try again")); return; }
      inp.value = ""; loadMsgs();
    });
  }
  function report(msgId){
    var id = identity();
    if (!id) { toast("Sign in to report — it keeps reports accountable"); openAuth(); return; }
    var c = client(), C = COLS.msg, P = COLS.rep;
    c.from(C.table).select("*").eq(C.id, msgId).limit(1).then(function(q){
      var m = (q.data || [])[0]; if (!m) { toast("Couldn’t find that message"); return; }
      var row = {};
      row[P.msg] = m[C.id]; row[P.room] = m[C.room]; row[P.reporter] = id.id; row[P.reported] = m[C.sender];
      row[P.reason] = "reported_in_app";
      row[P.snap] = { body: m[C.body], kind: m[C.kind], created_at: m[C.created] }; // survives the 30-day purge
      c.from(P.table).insert([row]).then(function(r){
        if (r.error) { toast("Report didn’t go through — " + (r.error.message || "try again")); return; }
        toast("Reported · the operator will review. Thank you. ⚑");
      });
    });
  }
  function mute(identId){
    var id = identity();
    if (!id) { toast("Sign in to mute — mutes follow your identity"); openAuth(); return; }
    if (String(identId) === String(id.id)) return;
    var c = client(), M = COLS.mute, row = {};
    row[M.muter] = id.id; row[M.muted] = identId;
    c.from(M.table).insert([row]).then(function(r){
      if (r.error && !/duplicate/i.test(r.error.message || "")) { toast("Mute didn’t stick — " + (r.error.message || "try again")); return; }
      muted[identId] = 1; loadMsgs();
      toast("Muted · you won’t see them again. They’re not told.");
    });
  }
  function friend(identId){ // friends graph is live; DMs stay counsel-gated
    var id = identity();
    if (!id) { toast("Sign in to add friends"); openAuth(); return; }
    if (String(identId) === String(id.id)) return;
    client().rpc("friend_request", { p_app: CFG.app, p_addressee: identId }).then(function(r){
      if (r.error) { toast("Couldn’t send request — " + (r.error.message || "try again")); return; }
      toast(r.data === "friends" ? "You’re friends now — they’d already asked." : "Friend request sent.");
    });
  }

  // ---- realtime + unread (proven) ----
  function startPoll(){ stopPoll(); poll = setInterval(function(){
    var p = document.getElementById("lc-panel");
    if (p && p.classList.contains("open") && room) loadMsgs(); else stopPoll();
  }, 25000); }
  function stopPoll(){ if (poll) { clearInterval(poll); poll = null; } }
  function markRead(roomId, ts){ try { var k = kRead(roomId), old = localStorage.getItem(k); if (!old || ts > old) localStorage.setItem(k, ts); } catch(_){} }
  function sub(roomId){
    unsub(); var c = client(); if (!c || !c.channel) return;
    try {
      chan = c.channel("lc-room-" + roomId)
        .on("postgres_changes", { event:"INSERT", schema:"public", table: COLS.msg.table, filter: COLS.msg.room + "=eq." + roomId },
            function(){ loadMsgs(); })
        .subscribe(function(status){
          if (status === "SUBSCRIBED") stopPoll();
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") startPoll();
        });
    } catch(_) { startPoll(); }
  }
  function unsub(){ if (chan) { try { var c = client(); if (c && c.removeChannel) c.removeChannel(chan); } catch(_){} chan = null; } }
  function teardown(){ unsub(); stopPoll(); }
  function unreadScan(cb){
    var c = client(), R = COLS.room, C = COLS.msg;
    if (!c || !rooms.length) { cb && cb({}); return; }
    var ids = rooms.map(function(r){ return r[R.id]; });
    c.from(C.table).select(C.room + "," + C.created).in(C.room, ids).order(C.created, { ascending:false }).limit(160)
      .then(function(r){
        var latest = {}; (r.data || []).forEach(function(m){ if (!latest[m[C.room]]) latest[m[C.room]] = m[C.created]; });
        var unread = {};
        ids.forEach(function(id){ var l = latest[id]; if (!l) return;
          var seen = null; try { seen = localStorage.getItem(kRead(id)); } catch(_){}
          if (!seen || l > seen) unread[id] = 1; });
        cb && cb(unread);
      });
  }
  function paintUnread(unread){
    var any = false, R = COLS.room;
    rooms.forEach(function(rm){ if (unread[rm[R.id]]) any = true; });
    // rows are rendered chapters-then-topics; rebuild that order to align with the DOM
    var rowsEls = document.querySelectorAll("#lc-rooms .lc-room-row");
    var ordered = rooms.filter(function(x){return x[R.kind]!=="topic";}).concat(rooms.filter(function(x){return x[R.kind]==="topic";}));
    rowsEls.forEach(function(btn, i){
      var rm = ordered[i]; if (!rm) return;
      var dot = btn.querySelector(".lc-dot");
      if (unread[rm[R.id]]) { if (!dot) { var d = document.createElement("span"); d.className = "lc-dot"; btn.appendChild(d); } }
      else if (dot) dot.remove();
    });
    var lb = document.getElementById("lc-launch");
    if (lb) { var ld = lb.querySelector(".lc-dot");
      if (any) { if (!ld) { var d2 = document.createElement("span"); d2.className = "lc-dot"; lb.appendChild(d2); } }
      else if (ld) ld.remove(); }
  }
  function badge(){ // light async unread check, fails silent (and stub/offline-safe)
    var c = client(), R = COLS.room; if (!c) return;
    var go = function(){ try { unreadScan(function(u){ paintUnread(u); }); } catch(_){} };
    if (rooms.length) { go(); return; }
    try {
      var q = c.from(R.table).select("*").eq(R.app, CFG.app).eq(R.active, true).order(R.sort);
      if (!q || typeof q.then !== "function") return;   // no real client (offline/test stub): skip silently
      q.then(function(r){ if (!r.error) { rooms = r.data || []; go(); } });
    } catch(_){}
  }

  // =========================================================================
  // DOM + CSS injection (self-mounting; no host markup required)
  // =========================================================================
  function injectCss(){
    if (document.getElementById("lc-css")) return;
    var ac = CFG.brand.accent || "#b8002e";
    var css = "" +
      "#lc-launch{position:fixed;right:16px;bottom:16px;z-index:9998;width:54px;height:54px;border-radius:50%;border:none;cursor:pointer;" +
      "background:" + ac + ";color:#fff;font-size:24px;box-shadow:0 6px 18px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center}" +
      "#lc-panel{position:fixed;right:16px;bottom:80px;z-index:9999;width:min(380px,92vw);height:min(560px,72vh);background:#fff;color:#1a1a1a;" +
      "border-radius:16px;box-shadow:0 14px 44px rgba(0,0,0,.34);display:none;flex-direction:column;overflow:hidden;font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif}" +
      "#lc-panel.open{display:flex}" +
      "#lc-hd{display:flex;align-items:center;gap:8px;padding:11px 13px;background:" + ac + ";color:#fff}" +
      "#lc-hd .lc-h-ttl{font-weight:700;flex:1;font-size:15px}" +
      "#lc-hd button{background:rgba(255,255,255,.18);border:none;color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px}" +
      "#lc-rooms,#lc-msgs{flex:1;overflow:auto;padding:8px}" +
      ".lc-grp{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#888;margin:8px 6px 4px}" +
      ".lc-room-row{display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:#f6f6f7;border:1px solid #ececef;border-radius:11px;padding:10px;margin-bottom:7px;cursor:pointer;position:relative}" +
      ".lc-room-ic{font-size:20px}.lc-room-nm{font-weight:600}.lc-room-sub{color:#999;font-size:12px}" +
      ".lc-dot{position:absolute;top:9px;right:9px;width:9px;height:9px;border-radius:50%;background:" + ac + "}" +
      "#lc-launch .lc-dot{top:8px;right:8px}" +
      ".lc-empty{color:#999;text-align:center;padding:26px 14px}" +
      ".lc-msg{margin:7px 4px;max-width:84%}.lc-msg.mine{margin-left:auto;text-align:right}" +
      ".lc-m-top{display:flex;gap:6px;align-items:center;font-size:11px;color:#999;margin-bottom:2px}.lc-msg.mine .lc-m-top{justify-content:flex-end}" +
      ".lc-m-nm{font-weight:600;color:#555}.lc-m-acts button{background:none;border:none;color:#bbb;cursor:pointer;font-size:12px;padding:0 2px}" +
      ".lc-m-body{display:inline-block;background:#f1f1f3;border-radius:12px;padding:7px 11px;white-space:pre-wrap;word-break:break-word}" +
      ".lc-msg.mine .lc-m-body{background:" + ac + ";color:#fff}" +
      "#lc-comp{display:none;padding:9px;border-top:1px solid #eee;gap:7px}#lc-comp.row{display:flex}" +
      "#lc-input{flex:1;border:1px solid #ddd;border-radius:20px;padding:9px 13px;font-size:14px;outline:none}" +
      "#lc-comp button{background:" + ac + ";color:#fff;border:none;border-radius:20px;padding:0 16px;cursor:pointer;font-weight:600}" +
      "#lc-gate{display:none;padding:13px;border-top:1px solid #eee}" +
      ".lc-btn{background:" + ac + ";color:#fff;border:none;border-radius:10px;padding:10px 14px;cursor:pointer;font-weight:600;font-size:14px}" +
      ".lc-btn.ghost{background:#eee;color:#333}.lc-tx{color:#777;font-size:13px}" +
      "#lc-modal{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;padding:18px}" +
      "#lc-modal.on{display:flex}.lc-card{background:#fff;border-radius:16px;max-width:380px;width:100%;padding:20px;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}" +
      ".lc-card h3{margin:0 0 6px}.lc-step{display:none}.lc-step.on{display:block}.lc-card input{width:100%;box-sizing:border-box;border:1px solid #ccc;border-radius:10px;padding:11px;margin:10px 0;font-size:15px}" +
      ".lc-card .lc-row{display:flex;gap:8px;margin-top:8px}.lc-card .lc-row button{flex:1}";
    var s = document.createElement("style"); s.id = "lc-css"; s.textContent = css; document.head.appendChild(s);
  }
  function buildDom(){
    if (mountedDom) return; mountedDom = true; injectCss();
    var b = CFG.brand;
    if (CFG.launcher && !document.getElementById("lc-launch")) {
      var lb = document.createElement("button"); lb.id = "lc-launch"; lb.title = b.name + " chat";
      lb.innerHTML = (b.icon || "💬"); lb.onclick = function(){ var p = document.getElementById("lc-panel"); if (p && p.classList.contains("open")) close(); else open(); };
      document.body.appendChild(lb);
    }
    var panel = document.createElement("div"); panel.id = "lc-panel";
    panel.innerHTML =
      '<div id="lc-hd"><button id="lc-back" style="display:none" onclick="LukasChat._back()">‹</button>' +
      '<div class="lc-h-ttl" id="lc-title">' + esc(b.name) + ' chat</div><button onclick="LukasChat.close()">×</button></div>' +
      '<div id="lc-rooms"></div>' +
      '<div id="lc-msgs" style="display:none"></div>' +
      '<div id="lc-gate"></div>' +
      '<div id="lc-comp" class="row"><input id="lc-input" placeholder="Message…" onkeydown="if(event.key===\'Enter\')LukasChat._send()"><button onclick="LukasChat._send()">Send</button></div>';
    document.body.appendChild(panel);
    var modal = document.createElement("div"); modal.id = "lc-modal";
    modal.innerHTML =
      '<div class="lc-card">' +
        '<div class="lc-step" id="lc-step-attest"><h3>One quick thing</h3><p class="lc-tx">Chat sign-in is for folks 18 or older. Are you 18+?</p>' +
          '<div class="lc-row"><button class="lc-btn" onclick="LukasChat._attestYes()">Yes, I’m 18+</button><button class="lc-btn ghost" onclick="LukasChat._attestNo()">No</button></div></div>' +
        '<div class="lc-step" id="lc-step-minor"><h3>All good</h3><p class="lc-tx">Sign-in and chat are for 18+, so they’re off on this device. Everything else is yours — enjoy.</p>' +
          '<div class="lc-row"><button class="lc-btn" onclick="LukasChat._hide()">Got it</button></div></div>' +
        '<div class="lc-step" id="lc-step-email"><h3>Sign in</h3><p class="lc-tx">We’ll email you a magic link — no password. Your email is never shown to anyone.</p>' +
          '<input id="lc-email" type="email" placeholder="you@email.com" autocomplete="email">' +
          '<div class="lc-row"><button class="lc-btn" id="lc-send-btn" onclick="LukasChat._sendLink()">Email my link</button><button class="lc-btn ghost" onclick="LukasChat._hide()">Cancel</button></div></div>' +
        '<div class="lc-step" id="lc-step-sent"><h3>Check your email</h3><p class="lc-tx">Magic link sent to <b id="lc-sent-to"></b>. Open it on this device and you’ll come right back, signed in.</p>' +
          '<div class="lc-row"><button class="lc-btn ghost" onclick="LukasChat._hide()">Close</button></div></div>' +
        '<div class="lc-step" id="lc-step-name"><h3>Pick a name</h3><p class="lc-tx">This is the name others see in chat. Your email stays private.</p>' +
          '<input id="lc-name" placeholder="Your name" maxlength="40">' +
          '<div class="lc-row"><button class="lc-btn" id="lc-name-btn" onclick="LukasChat._finish()">That’s me</button></div></div>' +
      '</div>';
    document.body.appendChild(modal);
  }
  function showModal(){ buildDom(); document.getElementById("lc-modal").classList.add("on"); }
  function hideModal(){ var m = document.getElementById("lc-modal"); if (m) m.classList.remove("on"); }

  // =========================================================================
  // PUBLIC API
  // =========================================================================
  root.LukasChat = {
    init: function(opts){
      opts = opts || {};
      CFG.app = opts.app || CFG.app;
      if (opts.brand) CFG.brand = { name: opts.brand.name || CFG.brand.name, accent: opts.brand.accent || CFG.brand.accent, icon: opts.brand.icon || CFG.brand.icon };
      if (opts.launcher === false) CFG.launcher = false;
      CFG.onIdentity = opts.onIdentity || null;
      var go = function(){ buildDom(); authInit(); setTimeout(badge, 700); };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
      return root.LukasChat;
    },
    open: open, openScope: openScope, close: close, signOut: signOut, identity: identity,
    // shared plumbing for companion modules (e.g. lukas_badge.js):
    getClient: client, app: function(){ return CFG.app; }, brand: function(){ return CFG.brand; },
    requireAuth: openAuth, toast: toast,
    // internal handlers referenced by injected markup:
    _openRoom: openRoom, _openAuth: openAuth, _back: backToRooms, _send: send, _report: report, _mute: mute, _friend: friend,
    _badge: function(id, nm){ if (root.LukasBadge && root.LukasBadge.viewIdentity) root.LukasBadge.viewIdentity(id, nm); else toast("Badge isn’t available here"); },
    _attestYes: attestYes, _attestNo: attestNo, _sendLink: sendLink, _finish: finishIdentity, _hide: hideModal
  };
})(window);
