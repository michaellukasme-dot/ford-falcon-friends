/* ============================================================================
   lukas_gateway.js — The Gateway, as a hardened WHITE-LABEL SURFACE.
   v1.0 · 2026-06-26

   One thought -> many clear, channel-native voices. The host app's user SENDS.
   Nothing here ever auto-sends, auto-posts, or contacts anyone.

   DESIGN FOR EMBEDDING IN SOMEONE ELSE'S APP (we are licensees too):
     • No globals leak — everything lives behind window.LukasGateway.
     • No inline handlers / no global functions — pure event delegation.
     • Every CSS rule is scoped under .lg-root and every class is lg-prefixed,
       so it cannot collide with or restyle the host app (.ic/.send/.line/.card…).
     • No element ids — fields are addressed by data-fld within the instance root,
       so two instances (or a host page) never clash on id.
     • Storage is namespaced per brand key and fully try/catch-guarded.
     • Defensive mount: bad element or thrown engine never breaks the host page.
     • The differentiation engine is a SEAM (cfg.engine) — the rule-based default
       ships today; production swaps in a single cached Claude call. Honest-state.

   USAGE:
     var gw = LukasGateway.mount("#myEl", {
       brand:{ key:"deaddance", name:"dead_dance", accent:"#7a3cc0" },
       sig:"— The Band",
       channels:["email","sms","fb","ig","x","li","tt"],   // subset ok
       tone:"warm",
       tags:{ fb:["livemusic"], ig:["livemusic","smallrooms"] },
       lists:{ email:{ "Fans":[{name:"Kara",to:"kara@x.com"}] } },
       onSend: function(channelId, draft, recipient){ ... }   // optional; default = open user's app
       engine: function(thought, ctx){ return {subject,body,media}; } // optional; default = rule engine
     });
     gw.destroy();
   ============================================================================ */
(function(){
"use strict";
if (typeof window === "undefined") return;
if (window.LukasGateway && window.LukasGateway.__v) return; // idempotent load

var INSTANCES = [];
var BURST='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="2.4" fill="#fff" stroke="none"/><path d="M7.5 7.5a6 6 0 0 0 0 9M16.5 7.5a6 6 0 0 1 0 9M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15"/></svg>';

var CHANNELS = [
 {id:"email",name:"Email",ic:"✉",col:"#e8932e",kind:"direct"},
 {id:"sms",  name:"Text", ic:"✆",col:"#28a35a",kind:"direct"},
 {id:"fb",   name:"Facebook", ic:"f", col:"#3b6fd6",kind:"cast"},
 {id:"ig",   name:"Instagram",ic:"◎",col:"#d6326b",kind:"cast"},
 {id:"x",    name:"X", ic:"✕",col:"#222633",kind:"cast",cap:280},
 {id:"li",   name:"LinkedIn",ic:"in",col:"#2f74b5",kind:"cast"},
 {id:"tt",   name:"TikTok",ic:"♪",col:"#12c0c8",kind:"cast"}
];

/* ---------- list plans: the meter is the TOTAL number of lists across Email + Text ---------- */
var PLANS = [
 {id:"free",     label:"Free",     lists:10,       price:""},
 {id:"less",     label:"Less",     lists:20,       price:"$19/yr"},
 {id:"more",     label:"More",     lists:40,       price:"$49/yr"},
 {id:"most",     label:"Most",     lists:60,       price:"$99/yr"},
 {id:"unlimited",label:"Unlimited",lists:Infinity, price:"$99/mo"}
];
function planOf(id){for(var i=0;i<PLANS.length;i++){if(PLANS[i].id===id)return PLANS[i];}return PLANS[0];}

/* ---------- tiny safe helpers ---------- */
/* esc() escapes ' as well as " so attribute escaping is correct regardless of quote delimiter (Claudia E2) */
function esc(t){return String(t==null?"":t).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}
function escAttr(t){return esc(t);}
function first(n){return (String(n||"there")).trim().split(/\s+/)[0]||"there";}
function clamp(s,n){s=String(s==null?"":s);return s.length>n?s.slice(0,n):s;}
/* fully-guarded clipboard write — swallows the async rejection on insecure origins (Claudia H6) */
function cw(t){try{var p=navigator.clipboard&&navigator.clipboard.writeText(t);if(p&&p.catch)p.catch(function(){});}catch(e){}}
var USED_KEYS={};

/* ---------- scoped stylesheet (injected once) ---------- */
function injectStyle(){
 if (document.getElementById("lg-style")) return;
 var css =
 ".lg-root{--lg-accent:#5b4bdb;--lg-line:#e7e6e1;--lg-card:#fff;--lg-ink:#1d2230;--lg-muted:#8a8f9e;--lg-bg:#f6f5f2;"+
 "font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--lg-ink);box-sizing:border-box;text-align:left}"+
 ".lg-root *{box-sizing:border-box}"+
 ".lg-root .lg-app{display:flex;gap:18px;align-items:flex-start}"+
 ".lg-root .lg-left{flex:0 0 40%}.lg-root .lg-right{flex:1;min-width:0}"+
 ".lg-root .lg-brand{font-size:15px;font-weight:800;letter-spacing:.5px;color:var(--lg-accent);margin:0 2px 12px}"+
 ".lg-root .lg-say{width:100%;border:none;background:var(--lg-card);border-radius:18px;padding:18px;font-size:20px;line-height:1.4;color:var(--lg-ink);box-shadow:0 4px 22px rgba(40,40,80,.06);resize:none;min-height:120px;outline:none;font-family:inherit}"+
 ".lg-root .lg-say::placeholder{color:#c2c2c0}"+
 ".lg-root .lg-rail{display:flex;gap:8px;flex-wrap:wrap;margin:14px 2px 0}"+
 ".lg-root .lg-ic{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;background:#ececea;color:#9a9a98;cursor:pointer;transition:transform .08s;user-select:none}"+
 ".lg-root .lg-ic:active{transform:scale(.92)}.lg-root .lg-ic.on{color:#fff}"+
 ".lg-root .lg-hp{position:relative;background:linear-gradient(135deg,#6a4bf0,#b14bd6);color:#fff;width:46px;height:46px;overflow:visible}"+
 ".lg-root .lg-hp.on{box-shadow:0 0 0 3px rgba(106,75,240,.28)}"+
 ".lg-root .lg-hp:hover{transform:translateY(-1px) scale(1.05);box-shadow:0 8px 22px rgba(123,75,224,.45),0 0 0 3px rgba(106,75,240,.30)}"+
 ".lg-root .lg-hp:hover svg{animation:lg-hpspin 1.6s linear infinite}"+
 "@keyframes lg-hpspin{to{transform:rotate(360deg)}}"+
 ".lg-root .lg-tip{position:absolute;left:50%;bottom:calc(100% + 12px);transform:translateX(-50%) translateY(6px) scale(.96);width:228px;background:linear-gradient(135deg,#3a2a6e,#5e2f73);color:#fff;border-radius:14px;padding:12px 14px;box-shadow:0 16px 40px rgba(40,20,80,.42);opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;z-index:50;text-align:left}"+
 ".lg-root .lg-hp:hover .lg-tip{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}"+
 ".lg-root .lg-tip:after{content:'';position:absolute;left:50%;top:100%;transform:translateX(-50%);border:7px solid transparent;border-top-color:#5e2f73}"+
 ".lg-root .lg-tip .t{font-weight:800;font-size:13.5px;margin-bottom:3px}.lg-root .lg-tip .d{font-size:12px;line-height:1.45;opacity:.92}.lg-root .lg-tip .s{margin-top:7px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;opacity:.8}"+
 ".lg-root .lg-opts{margin:14px 2px 0;font-size:13px;color:var(--lg-muted)}"+
 ".lg-root .lg-pill{display:inline-block;padding:5px 11px;border-radius:20px;background:var(--lg-card);border:1px solid var(--lg-line);margin:0 6px 6px 0;cursor:pointer;font-weight:600;color:var(--lg-muted)}"+
 ".lg-root .lg-pill.on{background:var(--lg-accent);color:#fff;border-color:var(--lg-accent)}"+
 ".lg-root .lg-line{margin:12px 2px 0;font-size:13.5px;color:var(--lg-muted);cursor:pointer}.lg-root .lg-line b{color:var(--lg-ink)}"+
 ".lg-root .lg-editor{background:var(--lg-card);border:1px solid var(--lg-line);border-radius:14px;padding:11px;margin-top:8px}"+
 ".lg-root .lg-editor select{width:100%;border:1px solid var(--lg-line);border-radius:10px;padding:9px 10px;font-size:14px;margin-bottom:9px;background:#fff;font-weight:600;font-family:inherit}"+
 ".lg-root .lg-er{display:flex;gap:7px;margin-bottom:6px}.lg-root .lg-er input{flex:1;border:1px solid var(--lg-line);border-radius:9px;padding:8px 10px;font-size:14px;outline:none;font-family:inherit}"+
 ".lg-root .lg-add{background:#eee;border:none;border-radius:9px;padding:8px 11px;cursor:pointer;font-weight:700;color:#555;font-size:13px}"+
 ".lg-root .lg-up{background:#fff7e9;border:1px solid #f0d9a8;border-radius:11px;padding:10px 12px;font-size:13px;color:#7a5a14;margin-top:6px}"+
 ".lg-root .lg-up b{color:#5a4310}.lg-root .lg-up button{margin-top:7px;background:var(--lg-accent);color:#fff;border:none;border-radius:20px;padding:8px 16px;font-weight:800;cursor:pointer}"+
 ".lg-root .lg-voices{font-size:13px;color:var(--lg-muted);text-transform:uppercase;letter-spacing:.06em;margin:2px 2px 12px;font-weight:700}"+
 ".lg-root .lg-v{background:var(--lg-card);border-radius:16px;padding:14px;margin-bottom:13px;box-shadow:0 3px 16px rgba(40,40,80,.05)}"+
 ".lg-root .lg-vh{display:flex;align-items:center;gap:9px;margin-bottom:9px}"+
 ".lg-root .lg-badge{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px}"+
 ".lg-root .lg-nm{font-weight:700;font-size:14.5px}"+
 ".lg-root .lg-subj{width:100%;border:none;border-bottom:1px solid var(--lg-line);padding:5px 2px 8px;font-size:15px;font-weight:600;color:var(--lg-ink);outline:none;margin-bottom:8px;font-family:inherit}"+
 ".lg-root .lg-ta{width:100%;border:none;resize:vertical;min-height:62px;font:15px/1.5 inherit;color:#2a2f3e;outline:none;background:transparent}"+
 ".lg-root .lg-picks{margin-top:10px;border-top:1px solid var(--lg-line);padding-top:10px}"+
 ".lg-root .lg-picks select{width:100%;border:1px solid var(--lg-line);border-radius:9px;padding:7px 9px;font-size:13px;font-weight:600;color:var(--lg-ink);background:#fff;margin-bottom:8px;font-family:inherit}"+
 ".lg-root .lg-cks{display:flex;flex-wrap:wrap;gap:6px}"+
 ".lg-root .lg-ck{font-size:12.5px;background:#f3f3f1;border-radius:8px;padding:4px 9px 4px 7px;display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none}"+
 ".lg-root .lg-ck input{margin:0;cursor:pointer}"+
 ".lg-root .lg-pn{font-size:11px;color:var(--lg-muted);margin-top:6px}"+
 ".lg-root .lg-foot{display:flex;align-items:center;gap:8px;margin-top:9px}"+
 ".lg-root .lg-media{font-size:11px;color:#7a86b8;background:#eef0ff;border-radius:8px;padding:3px 8px;margin-right:6px}"+
 ".lg-root .lg-cc{font-size:11px;color:var(--lg-muted)}"+
 ".lg-root .lg-send{margin-left:auto;border:none;border-radius:22px;padding:9px 18px;font-weight:800;font-size:14px;color:#fff;cursor:pointer}"+
 ".lg-root .lg-send:active{opacity:.85}"+
 ".lg-root .lg-copy{background:#f0f0ee;border:none;border-radius:22px;padding:9px 13px;font-weight:700;color:#666;cursor:pointer;font-size:13px}"+
 ".lg-root .lg-empty{color:#b9b9b6;text-align:center;padding:40px 10px;font-size:15px}"+
 ".lg-root .lg-hint{font-size:11.5px;color:#b6b6b2;text-align:center;margin-top:6px}"+
 "@media(max-width:720px){.lg-root .lg-app{flex-direction:column;gap:14px}.lg-root .lg-left{flex:1 1 auto;width:100%}.lg-root .lg-say{font-size:18px}}"+
 /* self-contained launcher (floating button + modal) — appended to <body>, touches no host markup */
 ".lg-fab{position:fixed;z-index:2147483600;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#6a4bf0,#b14bd6);color:#fff;box-shadow:0 8px 26px rgba(106,75,240,.45);cursor:pointer;border:none;transition:transform .12s}"+
 ".lg-fab:hover{transform:scale(1.07)}.lg-fab:active{transform:scale(.94)}"+
 ".lg-ovl{position:fixed;inset:0;z-index:2147483601;background:rgba(20,16,40,.55);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px}"+
 ".lg-ovl.on{display:flex}"+
 ".lg-panel{background:#f6f5f2;border-radius:20px;max-width:1000px;width:100%;margin:auto;padding:14px 14px 22px;box-shadow:0 30px 80px rgba(20,10,50,.5);position:relative}"+
 ".lg-x{position:absolute;top:10px;right:12px;z-index:5;background:#fff;border:1px solid #e7e6e1;border-radius:50%;width:34px;height:34px;font-size:17px;cursor:pointer;color:#555;line-height:1}";
 var st = document.createElement("style");
 st.id = "lg-style";
 st.textContent = css;
 (document.head||document.documentElement).appendChild(st);
}

/* ---------- storage (namespaced + safe) ---------- */
function store(key){
 var k = "lg:"+key+":state";
 return {
  load:function(){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } },
  save:function(o){ try{ localStorage.setItem(k, JSON.stringify(o)); }catch(e){} }
 };
}

/* ---------- the default (rule-based) differentiation engine ----------
   This is the SEAM. Production replaces cfg.engine with a single cached
   Claude call. Honest-state: the default below is deterministic, not AI. */
function makeEngine(cfg){
 var sig = cfg.sig || "";
 var tags = cfg.tags || {};
 function tg(id, fallback){ var a=tags[id]||fallback||[]; return a.map(function(h){return "#"+h;}).join(" "); }
 function topic(t){var s=t.trim().split(/[.!?\n]/)[0]||t;return s.length>52?s.slice(0,52).trim()+"…":s.trim();}
 function firstLine(t){return t.split(/[.!?\n]/)[0].trim();}
 function greetName(tone){return {warm:"Hi %Name%,",pro:"Dear %Name%,",excited:"Hey %Name%!",concise:"%Name% —"}[tone];}
 function lead(tone){return {warm:"Hi %Name% — ",pro:"%Name%, ",excited:"Hey %Name%! ",concise:""}[tone];}
 function flair(tone){return {warm:" 🌹",pro:"",excited:" 🎉",concise:""}[tone];}
 function signoff(tone){return {warm:"With love,\n"+sig,pro:"Best regards,\n"+sig,excited:"See you there!\n"+sig,concise:sig}[tone];}
 function energize(t,tone){ if(tone==="concise")return firstLine(t); if(tone==="excited")return t.replace(/\.(\s|$)/g,"! ").trim(); return t.trim(); }
 function isVid(m){return /\.(mp4|mov|webm)/i.test(m)||/video/i.test(m);}
 var liBoost = cfg.liBooster || {excited:"Proud of what we're building!", other:"Proud of what we're building."};
 return function(thought, ctx){
  var c=ctx.channel, tone=ctx.tone, media=ctx.media||[];
  var vids=media.filter(isVid), imgs=media.filter(function(m){return !isVid(m);});
  if(c.id==="email") return {subject:topic(thought)+(tone==="excited"?" 🎉":""), body:greetName(tone)+"\n\n"+energize(thought,tone)+"\n\n"+signoff(tone), media:media};
  if(c.id==="sms"){var s=energize(thought,tone).replace(/\n+/g," ").trim();if(tone!=="concise"&&s.length>150)s=s.slice(0,147).trim()+"…";return {body:lead(tone)+s+flair(tone)+(media.length&&tone!=="concise"?" (pics/clip coming)":""), media:[]};}
  if(c.id==="fb") return {body:energize(thought,tone)+flair(tone)+"\n\n"+tg("fb",["community","local"]), media:media};
  if(c.id==="ig") return {body:firstLine(energize(thought,tone))+(tone==="pro"?"":" ✨")+"\n\n"+tg("ig",["community","local","behindthescenes"]), media:vids.length?vids:imgs};
  if(c.id==="x"){var b=energize(thought,tone).replace(/\n+/g," ").trim(),h=tg("x",["community"]),room=(c.cap||280)-h.length-2;if(b.length>room)b=b.slice(0,room-1).trim()+"…";return {body:b+"\n"+h, media:[]};}
  if(c.id==="li") return {body:energize(thought,tone)+"\n\n"+(tone==="excited"?liBoost.excited:liBoost.other)+" "+tg("li",["smallbusiness","community"]), media:media};
  if(c.id==="tt") return {body:"POV: "+firstLine(energize(thought,tone))+" 🎶\n"+tg("tt",["fyp"]), media:vids};
  return {body:energize(thought,tone), media:media};
 };
}

/* ---------- mount one instance ---------- */
function mount(elOrSel, cfg){
 cfg = cfg || {};
 var root = (typeof elOrSel==="string") ? document.querySelector(elOrSel) : elOrSel;
 if(!root || !root.nodeType){ if(window.console)console.warn("[LukasGateway] mount target not found"); return {destroy:function(){}, render:function(){}}; }
 injectStyle();

 var brand = cfg.brand || {};
 var brandKey = brand.key || "default";
 var accent = brand.accent || "#5b4bdb";
 if(USED_KEYS[brandKey] && window.console){ console.warn("[LukasGateway] two live instances share brand.key '"+brandKey+"' — they will share/clobber the same saved lists. Give each instance a unique brand.key."); }
 USED_KEYS[brandKey]=(USED_KEYS[brandKey]||0)+1;
 var io = store(brandKey);

 // channel set (subset, order preserved)
 var wanted = cfg.channels && cfg.channels.length ? cfg.channels : CHANNELS.map(function(c){return c.id;});
 var CH = CHANNELS.filter(function(c){return wanted.indexOf(c.id)>=0;});
 if(!CH.length) CH = CHANNELS.slice();

 var engine = (typeof cfg.engine==="function") ? cfg.engine : makeEngine(cfg);

 // ---- state (per instance; never global) ----
 /* deep-clone cfg.lists so we never mutate the host's passed object (Claudia J1) */
 var seedLists;
 try{ seedLists = cfg.lists ? JSON.parse(JSON.stringify(cfg.lists)) : null; }catch(e){ seedLists=null; }
 var S = {
  on:{}, tone: cfg.tone||"warm", media:[], plan: cfg.plan||"free",
  lists: seedLists || { email:{ "My list":[] }, text:{ "My list":[] } },
  active:{}, listMode:"email", DRAFTS:[], medOpen:false, edOpen:false, upgradeOpen:false
 };
 if(!planOf(S.plan) || planOf(S.plan).id==="free"){ /* normalize unknown/legacy plan ids to free */ if(S.plan!=="free" && PLANS.map(function(x){return x.id;}).indexOf(S.plan)<0) S.plan="free"; }
 CH.forEach(function(c){ S.on[c.id]=1; });
 if(!S.lists.email) S.lists.email={ "My list":[] };
 if(!S.lists.text)  S.lists.text ={ "My list":[] };
 S.active.email = Object.keys(S.lists.email)[0] || "My list";
 S.active.text  = Object.keys(S.lists.text)[0]  || "My list";
 // hydrate from saved
 var saved = io.load();
 if(saved && saved.lists){ try{ S.lists=saved.lists; S.active=saved.active||S.active; S.plan=saved.plan||S.plan; if(saved.tone)S.tone=saved.tone; }catch(e){} }

 function listCount(){ return Object.keys(S.lists.email||{}).length + Object.keys(S.lists.text||{}).length; }
 function listCap(){ return planOf(S.plan).lists; }
 function canAddList(){ return listCount() < listCap(); }
 function recsOf(m){ if(!S.lists[m]) S.lists[m]={}; if(!S.lists[m][S.active[m]]) S.lists[m][S.active[m]]=[]; return S.lists[m][S.active[m]]; }
 function selectedOf(m){ return recsOf(m).filter(function(r){return r.sel!==false && r.to;}); }
 function save(){ io.save({lists:S.lists, active:S.active, plan:S.plan, tone:S.tone}); }
 function col(c){ return c.col || "#888"; }
 function allOn(){ return CH.every(function(c){return S.on[c.id];}); }
 function q(name){ return root.querySelector('[data-fld="'+name+'"]'); }

 // ---- markup pieces ----
 root.classList.add("lg-root");
 root.style.setProperty("--lg-accent", accent);
 root.innerHTML =
  '<div class="lg-app"><div class="lg-left">'+
   '<div class="lg-brand">'+esc(brand.name || "⌁ GATEWAY")+'</div>'+
   '<textarea class="lg-say" data-fld="say" data-act="say" placeholder="'+escAttr(cfg.placeholder||"Say it once…")+'">'+esc(cfg.seed||"")+'</textarea>'+
   '<div class="lg-rail" data-fld="rail"></div>'+
   '<div class="lg-opts" data-fld="tones"></div>'+
   '<div data-fld="toLines"></div>'+
   '<div class="lg-editor" data-fld="ed" style="display:none"></div>'+
   '<div class="lg-line" data-act="medToggle">📎 <b>Attach</b> photos / video</div>'+
   '<div class="lg-editor" data-fld="med" style="display:none"></div>'+
  '</div><div class="lg-right">'+
   '<div class="lg-voices">'+esc(cfg.voicesLabel||"Your voices")+'</div>'+
   '<div data-fld="out"><div class="lg-empty">Type a thought — your voices appear here.</div></div>'+
   '<div class="lg-hint" data-fld="hint"></div>'+
  '</div></div>';

 function rail(){
  var hp='<div class="lg-ic lg-hp '+(allOn()?"on":"")+'" data-act="hyper">'+BURST+
   '<div class="lg-tip"><div class="t">✦ HyperPost</div><div class="d">One thought, every voice — each written to fit, all at once.</div><div class="s">'+(allOn()?"All channels lit":"Tap to light them all")+'</div></div></div>';
  q("rail").innerHTML = hp + CH.map(function(c){
   return '<div class="lg-ic '+(S.on[c.id]?"on":"")+'" style="'+(S.on[c.id]?"background:"+col(c):"")+'" data-act="tog" data-id="'+c.id+'">'+esc(c.ic)+'</div>';
  }).join("");
 }
 function tones(){
  var ts=[["warm","Warm"],["pro","Professional"],["excited","Excited"],["concise","Concise"]];
  q("tones").innerHTML = ts.map(function(t){return '<span class="lg-pill '+(S.tone===t[0]?"on":"")+'" data-act="tone" data-t="'+t[0]+'">'+t[1]+'</span>';}).join("");
 }
 function lineHtml(m,ic,lab){var r=recsOf(m);return '<div class="lg-line" data-act="openEd" data-m="'+m+'">'+ic+' <b>'+lab+'</b> '+esc(S.active[m])+' · '+r.length+' <span style="opacity:.5">▾</span></div>';}
 function toLines(){var h="";if(S.on.email)h+=lineHtml("email","✉","To");if(S.on.sms)h+=lineHtml("text","✆","Text");q("toLines").innerHTML=h;}
 function upgradeHtml(){
  return '<div class="lg-up"><b>You\'ve used all '+listCap()+' free lists.</b><br>More room for your Email + Text lists combined:'+
   '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">'+PLANS.slice(1).map(function(pl){
     return '<button class="lg-add" style="background:var(--lg-accent);color:#fff" data-act="setPlan" data-plan="'+pl.id+'">'+pl.label+' · '+(pl.lists===Infinity?"Unlimited":pl.lists+" lists")+' · '+pl.price+'</button>';
   }).join("")+'</div><div class="lg-pn" style="margin-top:6px">Billing is counsel-gated; selecting unlocks the demo.</div>'+
   '<button class="lg-add" style="margin-top:7px" data-act="closeUpgrade">Back</button></div>';
 }
 function renderEd(){
  if(!S.edOpen){ q("ed").style.display="none"; return; }
  q("ed").style.display="";
  if(S.upgradeOpen){ q("ed").innerHTML = upgradeHtml(); return; }
  var m=S.listMode, names=Object.keys(S.lists[m]||{}), r=recsOf(m);
  var used=listCount(), capv=listCap(), full=(capv!==Infinity&&used>=capv);
  var head='<div class="lg-pn" style="margin:0 0 7px">Lists used: <b style="color:var(--lg-ink)">'+used+'</b> / '+(capv===Infinity?"∞":capv)+' · Email + Text'+(full?' — <span style="color:var(--lg-accent);font-weight:700;cursor:pointer" data-act="askUpgrade">upgrade</span>':'')+'</div>';
  var sel='<select data-act="pickList" data-m="'+m+'">'+names.map(function(n){return '<option '+(n===S.active[m]?"selected":"")+'>'+esc(n)+'</option>';}).join("")+'<option value="__new">＋ New list…</option></select>';
  var rows=r.map(function(p,i){return '<div class="lg-er"><input value="'+escAttr(p.name)+'" placeholder="Name" data-act="recName" data-m="'+m+'" data-i="'+i+'"><input value="'+escAttr(p.to)+'" placeholder="'+(m==="email"?"email":"phone")+'" data-act="recTo" data-m="'+m+'" data-i="'+i+'"><button class="lg-add" data-act="delRec" data-m="'+m+'" data-i="'+i+'">✕</button></div>';}).join("");
  var addBtn = '<button class="lg-add" data-act="addRec" data-m="'+m+'">＋ person</button>';
  q("ed").innerHTML = head+sel+rows+addBtn;
 }
 function renderMed(){
  if(!S.medOpen){ q("med").style.display="none"; return; }
  q("med").style.display="";
  q("med").innerHTML='<div class="lg-er"><input data-fld="mi" placeholder="paste a cloud link or filename"><button class="lg-add" data-act="medAdd">add</button></div>'+
   (S.media.length?'<div>'+S.media.map(function(m,i){var v=/\.(mp4|mov|webm)/i.test(m)||/video/i.test(m);return '<span class="lg-media">'+(v?"🎬":"🖼")+' '+esc(String(m).split("/").pop())+' <span style="cursor:pointer" data-act="medDel" data-i="'+i+'">✕</span></span>';}).join("")+'</div>':'');
 }
 function listBlock(c,i){
  var m=c.id==="email"?"email":"text", names=Object.keys(S.lists[m]||{});
  var sel='<select data-act="cardPick" data-m="'+m+'">'+names.map(function(n){return '<option '+(n===S.active[m]?"selected":"")+'>'+esc(n)+'</option>';}).join("")+'<option value="__new">＋ New list…</option></select>';
  var cks=recsOf(m).map(function(r,k){return '<label class="lg-ck"><input type="checkbox" '+(r.sel!==false?"checked":"")+' data-act="ck" data-m="'+m+'" data-k="'+k+'"> '+esc(first(r.name)||r.to||"—")+'</label>';}).join("");
  return '<div class="lg-picks">'+sel+'<div class="lg-cks">'+(cks||'<span class="lg-pn">no one in this list yet — add people on the left</span>')+'</div><div class="lg-pn">%Name% personalizes each send</div></div>';
 }
 function buildOne(c, thought){
  try{ return engine(thought, {channel:c, tone:S.tone, media:S.media.slice()}); }
  catch(e){ if(window.console)console.warn("[LukasGateway] engine error",e); return {body:String(thought), media:[]}; }
 }
 function render(){
  var t=String(q("say").value||"").trim();
  var out=q("out"), hint=q("hint");
  if(!t){ out.innerHTML='<div class="lg-empty">Type a thought — your voices appear here.</div>'; hint.textContent=""; return; }
  S.DRAFTS = CH.filter(function(c){return S.on[c.id];}).map(function(c){var d=buildOne(c,t)||{body:""};d.channel=c;d._qi=0;return d;});
  out.innerHTML = S.DRAFTS.map(function(d,i){
   var c=d.channel, direct=c.kind==="direct", mode=c.id==="email"?"email":"text";
   var media=d.media||[];
   var mh=media.length?media.map(function(m){var v=/\.(mp4|mov|webm)/i.test(m)||/video/i.test(m);return '<span class="lg-media">'+(v?"🎬":"🖼")+' '+esc(String(m).split("/").pop())+'</span>';}).join(""):"";
   var sendLbl=direct?("Send to "+selectedOf(mode).length+" ▸"):"Send ▸";
   return '<div class="lg-v"><div class="lg-vh"><span class="lg-badge" style="background:'+col(c)+'">'+esc(c.ic)+'</span><span class="lg-nm">'+esc(c.name)+'</span></div>'
    +(d.subject!=null?'<input class="lg-subj" data-fld="s'+i+'" value="'+escAttr(d.subject)+'">':'')
    +'<textarea class="lg-ta" data-fld="b'+i+'" data-act="cc" data-i="'+i+'">'+esc(d.body)+'</textarea>'
    +(direct?listBlock(c,i):'')
    +'<div class="lg-foot">'+mh+(c.cap?'<span class="lg-cc" data-fld="x'+i+'"></span>':'')+'<button class="lg-copy" data-act="copy" data-i="'+i+'">Copy</button>'
    +'<button class="lg-send" data-fld="send'+i+'" data-act="send" data-i="'+i+'" style="background:'+col(c)+'">'+sendLbl+'</button></div></div>';
  }).join("");
  S.DRAFTS.forEach(function(d,i){ if(d.channel.cap) cc(i); });
  hint.textContent = cfg.hint || "Send opens your own Mail · Messages · app — personalized per person.";
 }
 function cc(i){var d=S.DRAFTS[i];if(!d||!d.channel.cap)return;var el=q("x"+i),ta=q("b"+i);if(!el||!ta)return;var n=ta.value.length;el.textContent=n+"/"+d.channel.cap;el.style.color=n>d.channel.cap?"#d6326b":"var(--lg-muted)";}
 function copy(i){var s=q("s"+i),b=q("b"+i);if(!b)return;var txt=(s?"Subject: "+s.value+"\n\n":"")+b.value;cw(txt);}
 function updCount(i,mode){var b=q("send"+i);if(b)b.textContent="Send to "+selectedOf(mode).length+" ▸";}

 function go(i){
  var d=S.DRAFTS[i]; if(!d)return;
  var c=d.channel, btn=q("send"+i), b=q("b"+i), s=q("s"+i);
  if(!b)return;
  try{
   if(c.kind==="direct"){
    var mode=c.id==="email"?"email":"text", sel=selectedOf(mode);
    if(!sel.length){ if(btn)btn.textContent="Pick at least one person ▸"; return; }
    if(d._qi==null||d._qi>=sel.length)d._qi=0;
    var r=sel[d._qi], nm=first(r.name), body=String(b.value).replace(/%Name%/g,nm), subj=s?String(s.value).replace(/%Name%/g,nm):"";
    // honest-state: hand off to the host, else open the user's own app. Never auto-send.
    if(typeof cfg.onSend==="function"){ cfg.onSend(c.id, {subject:subj, body:body}, r); }
    else if(c.id==="email"){ location.href="mailto:"+encodeURIComponent(r.to)+"?subject="+encodeURIComponent(subj)+"&body="+encodeURIComponent(body); }
    else { location.href="sms:"+encodeURIComponent(r.to)+"?&body="+encodeURIComponent(body); }
    d._qi++;
    if(btn){ if(d._qi<sel.length){btn.textContent="Next ▸ "+first(sel[d._qi].name)+" ("+(d._qi+1)+"/"+sel.length+")";} else {btn.textContent="✓ "+sel.length+" opened — restart ▸";d._qi=0;} }
   } else {
    if(typeof cfg.onSend==="function"){ cfg.onSend(c.id, {body:String(b.value)}, null); return; }
    cw(String(b.value));
    var u={fb:"https://www.facebook.com/",ig:"https://www.instagram.com/",x:"https://twitter.com/intent/tweet?text="+encodeURIComponent(String(b.value)),li:"https://www.linkedin.com/feed/",tt:"https://www.tiktok.com/upload"};
    window.open(u[c.id]||"about:blank","_blank","noopener");
   }
  }catch(e){ if(window.console)console.warn("[LukasGateway] send error",e); }
 }

 // ---------- event delegation (single set of listeners) ----------
 var _t;
 function onClick(e){
  var el=e.target.closest && e.target.closest("[data-act]"); if(!el||!root.contains(el))return;
  var a=el.getAttribute("data-act"), i=+el.getAttribute("data-i"), m=el.getAttribute("data-m");
  if(a==="hyper"){ CH.forEach(function(c){S.on[c.id]=1;}); rail();toLines();render(); }
  else if(a==="tog"){ var id=el.getAttribute("data-id"); S.on[id]=!S.on[id]; rail();toLines();render(); }
  else if(a==="tone"){ S.tone=el.getAttribute("data-t"); save(); tones(); render(); }
  else if(a==="openEd"){ S.listMode=m; S.edOpen=true; renderEd(); }
  else if(a==="addRec"){ recsOf(m).push({name:"",to:""});save();renderEd();toLines();render(); }
  else if(a==="delRec"){ recsOf(m).splice(i,1); save(); renderEd(); toLines(); render(); }
  else if(a==="askUpgrade"){ S.upgradeOpen=true; renderEd(); }
  else if(a==="setPlan"){ S.plan=el.getAttribute("data-plan"); S.upgradeOpen=false; save(); renderEd(); toLines(); render(); }
  else if(a==="closeUpgrade"){ S.upgradeOpen=false; renderEd(); }
  else if(a==="medToggle"){ S.medOpen=!S.medOpen; renderMed(); }
  else if(a==="medAdd"){ var mi=q("mi"); if(mi&&mi.value){ S.media.push(mi.value); renderMed(); render(); } }
  else if(a==="medDel"){ S.media.splice(i,1); renderMed(); render(); }
  else if(a==="copy"){ copy(i); }
  else if(a==="send"){ go(i); }
 }
 function onChange(e){
  var el=e.target; var a=el.getAttribute&&el.getAttribute("data-act"); if(!a)return;
  var m=el.getAttribute("data-m");
  if(a==="pickList"){ var v=el.value; if(v==="__new"){ if(!canAddList()){ S.upgradeOpen=true; S.edOpen=true; el.value=S.active[m]; renderEd(); return; } var n=(window.prompt?prompt("Name your new list:"):"");if(n){S.lists[m][n]=[];S.active[m]=n;} }else{S.active[m]=v;} save(); renderEd(); toLines(); render(); }
  else if(a==="cardPick"){ var v2=el.value; if(v2==="__new"){ if(!canAddList()){ S.upgradeOpen=true; S.edOpen=true; S.listMode=m; el.value=S.active[m]; renderEd(); render(); return; } var n2=(window.prompt?prompt("Name your new list:"):"");if(n2){S.lists[m][n2]=[];S.active[m]=n2;} }else{S.active[m]=v2;} save(); toLines(); render(); }
  else if(a==="ck"){ var k=+el.getAttribute("data-k"); var r=recsOf(m)[k]; if(r){ r.sel=el.checked; save(); } var card=el.closest(".lg-v"); var btn=card&&card.querySelector(".lg-send"); if(btn)btn.textContent="Send to "+selectedOf(m).length+" ▸"; }
 }
 function onInput(e){
  var el=e.target; var a=el.getAttribute&&el.getAttribute("data-act"); if(!a)return;
  if(a==="say"){ clearTimeout(_t); _t=setTimeout(render,200); }
  else if(a==="cc"){ cc(+el.getAttribute("data-i")); }
  else if(a==="recName"){ var i=+el.getAttribute("data-i"),m=el.getAttribute("data-m"),r=recsOf(m)[i]; if(r){r.name=el.value;save();toLines();} }
  else if(a==="recTo"){ var i2=+el.getAttribute("data-i"),m2=el.getAttribute("data-m"),r2=recsOf(m2)[i2]; if(r2){r2.to=el.value;save();} }
 }
 root.addEventListener("click", onClick);
 root.addEventListener("change", onChange);
 root.addEventListener("input", onInput);

 rail(); tones(); toLines(); renderEd(); renderMed(); render();

 var handle = {
  __v:"1.0",
  render:render,
  setEngine:function(fn){ if(typeof fn==="function") engine=fn; render(); },
  getState:function(){ return {tone:S.tone, on:JSON.parse(JSON.stringify(S.on)), plan:S.plan}; },
  destroy:function(){
   try{ root.removeEventListener("click",onClick); root.removeEventListener("change",onChange); root.removeEventListener("input",onInput); }catch(e){}
   root.classList.remove("lg-root"); root.removeAttribute("style"); root.innerHTML="";
   if(USED_KEYS[brandKey]) USED_KEYS[brandKey]--;
   var ix=INSTANCES.indexOf(handle); if(ix>=0)INSTANCES.splice(ix,1);
  }
 };
 INSTANCES.push(handle);
 return handle;
}

/* ---------- self-contained launcher: floating button + modal, one-line embed ----------
   LukasGateway.launcher({ brand:{...}, sig, channels, tone, tags, lists, fab:{label,pos} })
   Appends a FAB + overlay to <body>. Touches no host markup. Mounts lazily on first open. */
function launcher(cfg){
 cfg = cfg || {};
 if(!document.body){ try{ window.addEventListener("DOMContentLoaded",function(){launcher(cfg);}); }catch(e){} return {open:function(){},close:function(){},destroy:function(){}}; }
 injectStyle();
 var fabCfg = cfg.fab || {};
 var pos = fabCfg.pos || {bottom:"22px", left:"22px"}; // default bottom-left to avoid host FABs (usually bottom-right)
 var fab = document.createElement("button");
 fab.className = "lg-fab";
 fab.setAttribute("aria-label", fabCfg.label || "Open the Gateway");
 /* fabCfg.icon is TRUSTED licensee config (static HTML/SVG), never end-user input — do not wire host-user data here */
 fab.innerHTML = fabCfg.icon || BURST;
 Object.keys(pos).forEach(function(k){ fab.style[k]=pos[k]; });
 var ovl = document.createElement("div");
 ovl.className = "lg-ovl";
 ovl.innerHTML = '<div class="lg-panel"><button class="lg-x" aria-label="Close">✕</button><div data-fld="mountpt"></div></div>';
 var mountEl = ovl.querySelector('[data-fld="mountpt"]');
 var inst = null, built=false;
 function open(){ if(!built){ inst = mount(mountEl, cfg); built=true; } ovl.classList.add("on"); }
 function close(){ ovl.classList.remove("on"); }
 fab.addEventListener("click", open);
 ovl.querySelector(".lg-x").addEventListener("click", close);
 ovl.addEventListener("click", function(e){ if(e.target===ovl) close(); });
 document.body.appendChild(fab);
 document.body.appendChild(ovl);
 var h = { open:open, close:close, instance:function(){return inst;},
   destroy:function(){ try{ if(inst)inst.destroy(); fab.remove(); ovl.remove(); }catch(e){} } };
 return h;
}

window.LukasGateway = { __v:"1.0", mount:mount, launcher:launcher, channels:CHANNELS.map(function(c){return c.id;}), instances:INSTANCES };
})();
