/* ============================================================================
   lukas_badge.js — House Social Badge (self-contained, app-agnostic)
   The stuff you've done / own that friends and scope-mates can see.
     dead_dance: SHOWS attended (GD/JGB/…)
     fff:        MEETS attended · CRUISES ridden · MY CAR(S) (no VIN)
   Backed by chat_badge (05_badges.sql). Reuses LukasChat for the supabase
   client + magic-link identity (one spine). Reads are gated server-side to
   you / friends (are_friends) / scope-mates (same home_scope).

   Verification (light, operator's call): photo on file → "stub", a title that
   matches the app's known directory → "listed", otherwise "self-reported".

   USAGE:
     LukasBadge.init({
       app:'dead_dance',
       brand:{ name:'dead_dance', accent:'#b8002e', icon:'🎟️' },
       categories:[
         { key:'show', label:'Shows', icon:'🎶', noun:'show',
           titleLabel:'Venue', artistLabel:'Act', artists:['Grateful Dead','Jerry Garcia Band'],
           directory:['Fillmore West','Winterland', ...] }   // optional → enables "listed"
       ]
     });
   Open yours:        LukasBadge.open()
   View someone's:    LukasBadge.viewIdentity(identityId, displayName)
   ============================================================================ */
(function (root) {
  "use strict";

  var CFG = { app:"app", brand:{ name:"Badge", accent:"#b8002e", icon:"🎟️" }, categories:[], launcher:false };
  var mounted = false, viewing = null;  // viewing = {id,name} when looking at someone else's badge (read-only)

  function CH(){ return root.LukasChat; }
  function client(){ return CH() && CH().getClient ? CH().getClient() : (root.supabase ? null : null); }
  function identity(){ return CH() && CH().identity ? CH().identity() : null; }
  function toast(m){ if (CH() && CH().toast) CH().toast(m); }
  function esc(t){ return String(t==null?"":t).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
  function cat(key){ for (var i=0;i<CFG.categories.length;i++) if (CFG.categories[i].key===key) return CFG.categories[i]; return CFG.categories[0]; }
  function tierChip(t, hasPhoto){
    if (t==="stub") return '<span class="lb-chip stub">📷 stub on file</span>';
    if (t==="listed") return '<span class="lb-chip listed">✓ listed</span>';
    return '<span class="lb-chip self">self-reported</span>' + (hasPhoto?' <span class="lb-chip stub">📷</span>':'');
  }

  // ---- downscale a chosen image to a small JPEG dataURL (keeps rows light) ----
  function shrinkPhoto(file, cb){
    if (!file) { cb(null); return; }
    var rd = new FileReader();
    rd.onload = function(){
      var img = new Image();
      img.onload = function(){
        var max = 480, w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round(h*max/w); w = max; }
        else if (h >= w && h > max) { w = Math.round(w*max/h); h = max; }
        var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        try { cb(cv.toDataURL("image/jpeg", 0.72)); } catch(_) { cb(null); }
      };
      img.onerror = function(){ cb(null); };
      img.src = rd.result;
    };
    rd.onerror = function(){ cb(null); };
    rd.readAsDataURL(file);
  }

  // =========================================================================
  // DATA
  // =========================================================================
  function loadItems(catKey, ownerId, cb){
    var c = client(); if (!c) { cb && cb(null, "offline"); return; }
    var q = c.from("chat_badge").select("*").eq("app", CFG.app).eq("identity_id", ownerId);
    if (catKey) q = q.eq("category", catKey);
    q.order("item_date", { ascending:false, nullsFirst:false }).order("created_at", { ascending:false })
      .then(function(r){ if (r.error) cb && cb(null, r.error.message); else cb && cb(r.data||[]); });
  }
  function saveItem(row, cb){
    var c = client(); if (!c) { cb && cb("offline"); return; }
    c.from("chat_badge").insert([row]).then(function(r){ cb && cb(r.error ? (r.error.message||"failed") : null); });
  }
  function deleteItem(id, cb){
    var c = client(); if (!c) { cb && cb("offline"); return; }
    c.from("chat_badge").delete().eq("id", id).then(function(r){ cb && cb(r.error ? r.error.message : null); });
  }
  function setHomeScope(scope, cb){
    var c = client(); if (!c) { cb && cb("offline"); return; }
    c.rpc("chat_set_home_scope", { p_scope: scope }).then(function(r){ cb && cb(r.error ? r.error.message : null); });
  }
  function computeTier(c, title, hasPhoto){
    if (hasPhoto) return "stub";
    if (c && c.directory && c.directory.length){
      var t = String(title||"").trim().toLowerCase();
      for (var i=0;i<c.directory.length;i++) if (String(c.directory[i]).trim().toLowerCase() === t) return "listed";
    }
    return "self";
  }

  // =========================================================================
  // UI
  // =========================================================================
  function open(){ viewing = null; build(); show(); selectCat(CFG.categories[0].key); }
  function viewIdentity(id, name){ if (!id) return; viewing = { id:id, name:name||"friend" }; build(); show(); selectCat(CFG.categories[0].key); }
  function close(){ var p = document.getElementById("lb-panel"); if (p) p.classList.remove("open"); }
  function show(){ build(); var p = document.getElementById("lb-panel"); p.classList.add("open"); paintHead(); }

  function paintHead(){
    var t = document.getElementById("lb-title");
    if (t) t.textContent = viewing ? (viewing.name + "’s " + CFG.brand.name + " badge") : ("My " + CFG.brand.name + " badge");
    var sc = document.getElementById("lb-scope-wrap");
    if (sc) sc.style.display = viewing ? "none" : "";
  }
  function paintList(key, items){
    var list = document.getElementById("lb-list"); if (!list) return;
    if (!items || !items.length) { list.innerHTML = '<div class="lb-empty">' + (viewing ? "Nothing here yet." : (cat(key).emptyHint || ("No " + esc(cat(key).label.toLowerCase()) + " yet — add your first below."))) + "</div>"; return; }
    list.innerHTML = items.map(function(it){ return itemHtml(it); }).join("");
  }
  /* AUTO-POPULATE: import the owner's own app log (e.g. dead_dance "I was there") into
     the shared badge. Each source item carries a stable ext_id (meta.ext_id) so we never
     double-add on re-open. */
  function importItems(key, list, cb){
    var c = cat(key), cl = client();
    if (!cl || !identity() || !list || !list.length) { cb && cb(); return; }
    var rows = list.map(function(s){
      return { app:CFG.app, identity_id:identity().id, category:key, title:s.title||"", subtitle:s.subtitle||null,
        item_date:s.item_date||null, artist:s.artist||null, city:s.city||null, note:s.note||null,
        photo_url:null, tier:computeTier(c, s.title, false), meta:{ ext_id:s.ext_id, auto:true } };
    });
    cl.from("chat_badge").insert(rows).then(function(){ cb && cb(); });
  }
  function selectCat(key){
    document.querySelectorAll("#lb-tabs .lb-tab").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-k")===key); });
    var addWrap = document.getElementById("lb-addwrap");
    if (addWrap) addWrap.style.display = viewing ? "none" : "";
    renderForm(key);
    var owner = viewing ? viewing.id : (identity() && identity().id);
    var list = document.getElementById("lb-list");
    if (!owner) { list.innerHTML = '<div class="lb-empty">Sign in to start your badge.</div>'; return; }
    list.innerHTML = '<div class="lb-empty">Loading…</div>';
    loadItems(key, owner, function(items, err){
      if (err) { list.innerHTML = '<div class="lb-empty">' + (err==="offline" ? "Offline — connect to see the badge." :
        (viewing ? "You can see this badge once you’re friends or share a chapter/club." : "Couldn’t load — " + esc(err))) + "</div>"; return; }
      var c = cat(key);
      if (!viewing && c.source && identity()){
        try{
          var src = c.source() || [];
          var have = {};
          (items||[]).forEach(function(it){ var e = it.meta && it.meta.ext_id; if (e) have[e] = 1; });
          var missing = src.filter(function(s){ return s && s.ext_id && !have[s.ext_id]; });
          if (missing.length){
            list.innerHTML = '<div class="lb-empty">Syncing your shows…</div>';
            importItems(key, missing, function(){ loadItems(key, owner, function(items2){ paintList(key, items2); }); });
            return;
          }
        }catch(e){}
      }
      paintList(key, items);
    });
  }
  function itemHtml(it){
    var date = it.item_date ? new Date(it.item_date + "T00:00:00").toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}) : "";
    var meta = it.meta || {};
    var line2 = [it.subtitle, it.city, date].filter(Boolean).join(" · ");
    var carline = (it.category==="car") ? [meta.color, meta.year, meta.make, meta.model].filter(Boolean).join(" ") : "";
    return '<div class="lb-item">' +
      (it.photo_url ? '<img class="lb-thumb" src="' + esc(it.photo_url) + '" alt="">' : '<div class="lb-thumb ph">' + esc(cat(it.category).icon||"•") + '</div>') +
      '<div class="lb-it-body"><div class="lb-it-ttl">' + esc(it.title) + (it.artist ? ' <span class="lb-it-art">· ' + esc(it.artist) + '</span>' : '') + '</div>' +
      (carline ? '<div class="lb-it-sub">' + esc(carline) + '</div>' : '') +
      (line2 ? '<div class="lb-it-sub">' + esc(line2) + '</div>' : '') +
      (it.note ? '<div class="lb-it-note">' + esc(it.note) + '</div>' : '') +
      '<div class="lb-it-foot">' + tierChip(it.tier, !!it.photo_url) +
        (viewing ? '' : ' <button class="lb-del" onclick="LukasBadge._del(\'' + esc(it.id) + '\')">remove</button>') + '</div></div></div>';
  }
  function renderForm(key){
    var wrap = document.getElementById("lb-form"); if (!wrap || viewing) { if (wrap) wrap.innerHTML=""; return; }
    var c = cat(key), isCar = !!c.collection;
    var artists = (c.artists||[]).map(function(a){ return '<option value="' + esc(a) + '">'; }).join("");
    var dir = (c.directory||[]).map(function(d){ return '<option value="' + esc(d) + '">'; }).join("");
    if (isCar){
      wrap.innerHTML =
        '<div class="lb-frow"><input id="lb-f-year" placeholder="Year" maxlength="4" style="flex:0 0 64px">' +
          '<input id="lb-f-make" placeholder="Make (Ford)"><input id="lb-f-model" placeholder="Model (Falcon)"></div>' +
        '<div class="lb-frow"><input id="lb-f-color" placeholder="Color"><input id="lb-f-title" placeholder="Nickname / trim (optional)"></div>' +
        '<textarea id="lb-f-note" placeholder="Notes (no VIN) — build, story, anything"></textarea>' +
        photoRow() +
        '<button class="lb-save" onclick="LukasBadge._save(\'' + key + '\')">Add to my badge</button>';
    } else {
      wrap.innerHTML =
        (c.artists&&c.artists.length ? '<input id="lb-f-artist" list="lb-dl-art" placeholder="' + esc(c.artistLabel||"Act") + ' (e.g. ' + esc(c.artists[0]) + ')"><datalist id="lb-dl-art">' + artists + '</datalist>' : '') +
        '<input id="lb-f-title" list="lb-dl-dir" placeholder="' + esc(c.titleLabel||"Name") + '"><datalist id="lb-dl-dir">' + dir + '</datalist>' +
        '<div class="lb-frow"><input id="lb-f-city" placeholder="City"><input id="lb-f-date" type="date"></div>' +
        '<textarea id="lb-f-note" placeholder="Notes (optional)"></textarea>' +
        photoRow() +
        '<button class="lb-save" onclick="LukasBadge._save(\'' + key + '\')">Add to my badge</button>';
    }
  }
  function photoRow(){
    return '<label class="lb-photo"><span id="lb-photo-lbl">📷 Attach stub / photo (optional)</span>' +
      '<input id="lb-f-photo" type="file" accept="image/*" style="display:none" onchange="LukasBadge._pho(this)"></label>';
  }
  var _photoData = null;
  function onPhoto(input){
    var f = input && input.files && input.files[0];
    var lbl = document.getElementById("lb-photo-lbl");
    if (!f) { _photoData = null; if (lbl) lbl.textContent = "📷 Attach stub / photo (optional)"; return; }
    if (lbl) lbl.textContent = "Shrinking photo…";
    shrinkPhoto(f, function(d){ _photoData = d; if (lbl) lbl.textContent = d ? "📷 Photo ready ✓" : "Couldn’t read that image"; });
  }
  function save(key){
    if (!identity()) { if (CH() && CH().requireAuth) CH().requireAuth(); else toast("Sign in first"); return; }
    var c = cat(key), isCar = !!c.collection, val = function(id){ var e=document.getElementById(id); return e ? (e.value||"").trim() : ""; };
    var title, artist=null, subtitle=null, city=null, dt=null, meta={};
    if (isCar){
      var yr=val("lb-f-year"), mk=val("lb-f-make"), md=val("lb-f-model"), col=val("lb-f-color"), nick=val("lb-f-title");
      if (!mk && !md && !nick) { toast("Give the car a make/model or a nickname"); return; }
      title = nick || [yr, mk, md].filter(Boolean).join(" ") || "My car";
      artist = mk || null; meta = { year:yr||null, make:mk||null, model:md||null, color:col||null };
    } else {
      title = val("lb-f-title");
      if (!title) { toast("Add the " + (c.titleLabel||"name").toLowerCase()); return; }
      if (c.artists && c.artists.length) artist = val("lb-f-artist") || null;
      city = val("lb-f-city") || null; dt = val("lb-f-date") || null;
    }
    var note = val("lb-f-note") || null;
    var row = {
      app: CFG.app, identity_id: identity().id, category: key, title: title,
      subtitle: subtitle, item_date: dt, artist: artist, city: city, note: note,
      photo_url: _photoData || null, tier: computeTier(c, title, !!_photoData), meta: meta
    };
    var btn = document.querySelector("#lb-form .lb-save"); if (btn){ btn.disabled=true; btn.textContent="Adding…"; }
    saveItem(row, function(err){
      if (btn){ btn.disabled=false; btn.textContent="Add to my badge"; }
      if (err) { toast("Didn’t save — " + (err==="offline"?"you’re offline":err)); return; }
      _photoData = null; toast("Added to your badge");
      renderForm(key); selectCat(key);
    });
  }
  function del(id){ if (!confirm("Remove this from your badge?")) return; deleteItem(id, function(err){ if (err){ toast("Couldn’t remove — "+err); return; } var on=document.querySelector("#lb-tabs .lb-tab.on"); selectCat(on?on.getAttribute("data-k"):CFG.categories[0].key); }); }
  function saveScope(){
    var v = (document.getElementById("lb-scope").value||"").trim();
    setHomeScope(v, function(err){ if (err){ toast("Couldn’t set — "+err); return; } toast(v ? ("Home set · scope-mates can see your badge") : "Home cleared"); });
  }

  // =========================================================================
  // DOM + CSS
  // =========================================================================
  function injectCss(){
    if (document.getElementById("lb-css")) return;
    var ac = CFG.brand.accent || "#b8002e";
    var css = "" +
      "#lb-panel{position:fixed;right:16px;bottom:80px;z-index:10001;width:min(400px,94vw);height:min(620px,80vh);background:#fff;color:#1a1a1a;border-radius:16px;box-shadow:0 14px 44px rgba(0,0,0,.34);display:none;flex-direction:column;overflow:hidden;font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif}" +
      "#lb-panel.open{display:flex}" +
      "#lb-hd{display:flex;align-items:center;gap:8px;padding:11px 13px;background:" + ac + ";color:#fff}" +
      "#lb-hd .lb-h-ttl{font-weight:700;flex:1;font-size:15px}#lb-hd button{background:rgba(255,255,255,.18);border:none;color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:15px}" +
      "#lb-tabs{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid #eee;overflow:auto}" +
      ".lb-tab{white-space:nowrap;background:#f2f2f4;border:1px solid #e6e6ea;border-radius:18px;padding:6px 12px;cursor:pointer;font-size:13px}" +
      ".lb-tab.on{background:" + ac + ";color:#fff;border-color:" + ac + "}" +
      "#lb-scope-wrap{display:flex;gap:6px;align-items:center;padding:7px 10px;background:#faf7f8;border-bottom:1px solid #f0eaec;font-size:12px;color:#888}" +
      "#lb-scope{flex:1;border:1px solid #ddd;border-radius:8px;padding:6px 9px;font-size:13px}#lb-scope-wrap button{background:#eee;border:none;border-radius:8px;padding:6px 10px;cursor:pointer}" +
      "#lb-list{flex:1;overflow:auto;padding:9px}" +
      ".lb-empty{color:#999;text-align:center;padding:24px 14px}" +
      ".lb-item{display:flex;gap:10px;padding:9px;border:1px solid #eee;border-radius:12px;margin-bottom:8px}" +
      ".lb-thumb{width:54px;height:54px;border-radius:9px;object-fit:cover;flex:0 0 54px;background:#f0f0f2;display:flex;align-items:center;justify-content:center;font-size:22px}" +
      ".lb-thumb.ph{color:#bbb}" +
      ".lb-it-body{flex:1;min-width:0}.lb-it-ttl{font-weight:600}.lb-it-art{color:#999;font-weight:400}.lb-it-sub{color:#888;font-size:12px}.lb-it-note{color:#666;font-size:12px;margin-top:3px;white-space:pre-wrap}" +
      ".lb-it-foot{margin-top:5px;display:flex;align-items:center;gap:7px}" +
      ".lb-chip{font-size:11px;border-radius:10px;padding:2px 8px;background:#eef;color:#558}.lb-chip.stub{background:#fdeef0;color:#b8002e}.lb-chip.listed{background:#e9f7ec;color:#1c7a37}.lb-chip.self{background:#f0f0f2;color:#888}" +
      ".lb-del{margin-left:auto;background:none;border:none;color:#c33;cursor:pointer;font-size:12px}" +
      "#lb-addwrap{border-top:1px solid #eee;padding:9px;max-height:48%;overflow:auto}" +
      "#lb-addwrap h4{margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#999}" +
      "#lb-form input,#lb-form textarea{width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:9px;padding:8px 10px;margin-bottom:6px;font-size:14px;font-family:inherit}" +
      "#lb-form textarea{min-height:48px;resize:vertical}.lb-frow{display:flex;gap:6px}.lb-frow input{margin-bottom:6px}" +
      ".lb-photo{display:block;border:1px dashed #ccc;border-radius:9px;padding:9px;text-align:center;color:#888;cursor:pointer;margin-bottom:6px;font-size:13px}" +
      ".lb-save{width:100%;background:" + ac + ";color:#fff;border:none;border-radius:10px;padding:10px;cursor:pointer;font-weight:600}";
    var s = document.createElement("style"); s.id = "lb-css"; s.textContent = css; document.head.appendChild(s);
  }
  function build(){
    if (mounted) return; mounted = true; injectCss();
    var tabs = CFG.categories.map(function(c){ return '<button class="lb-tab" data-k="' + c.key + '" onclick="LukasBadge._tab(\'' + c.key + '\')">' + (c.icon||"") + " " + esc(c.label) + "</button>"; }).join("");
    var panel = document.createElement("div"); panel.id = "lb-panel";
    panel.innerHTML =
      '<div id="lb-hd"><div class="lb-h-ttl" id="lb-title">My badge</div><button onclick="LukasBadge.close()">×</button></div>' +
      '<div id="lb-tabs">' + tabs + '</div>' +
      '<div id="lb-scope-wrap"><span>Home:</span><input id="lb-scope" placeholder="your chapter / club (lets scope-mates see this)"><button onclick="LukasBadge._scope()">Set</button></div>' +
      '<div id="lb-list"></div>' +
      '<div id="lb-addwrap"><h4>Add</h4><div id="lb-form"></div></div>';
    document.body.appendChild(panel);
  }

  root.LukasBadge = {
    init: function(opts){
      opts = opts || {};
      CFG.app = opts.app || CFG.app;
      if (opts.brand) CFG.brand = { name:opts.brand.name||CFG.brand.name, accent:opts.brand.accent||CFG.brand.accent, icon:opts.brand.icon||CFG.brand.icon };
      CFG.categories = (opts.categories && opts.categories.length) ? opts.categories : [{ key:"item", label:"Items", icon:"•" }];
      return root.LukasBadge;
    },
    open: open, viewIdentity: viewIdentity, close: close,
    _tab: selectCat, _save: save, _del: del, _pho: onPhoto, _scope: saveScope
  };
})(window);
