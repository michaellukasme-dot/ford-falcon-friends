/* fff_composer.js — "Just like Facebook, better cockpit": a rich post composer.
   Text + Photo + Video + File attachment, with previews, then Post here and one-tap send to Facebook.
   House rules: honest-state (media held locally at Step-1; real upload lands at Step-2 storage),
   originate-human-content (this is where members WRITE first, then propagate to FB). Portable module —
   drop into Shakedown by pointing FEEDKEY / share hook at that app. Self-injects into #panel-feed. */
(function(){
  'use strict';
  var FEEDKEY='fff.feed';
  function load(){ try{ return JSON.parse(localStorage.getItem(FEEDKEY)||'[]'); }catch(e){ return []; } }
  function save(a){ try{ localStorage.setItem(FEEDKEY, JSON.stringify(a)); }catch(e){ /* quota: media too big for Step-1 */ } }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function resize(file, cb){ try{ var r=new FileReader(); r.onload=function(){ var img=new Image(); img.onload=function(){ var mx=1000,s=Math.min(1,mx/Math.max(img.width,img.height)); var c=document.createElement('canvas'); c.width=img.width*s; c.height=img.height*s; c.getContext('2d').drawImage(img,0,0,c.width,c.height); cb(c.toDataURL('image/jpeg',0.82)); }; img.src=r.result; }; r.readAsDataURL(file); }catch(e){ cb(''); } }

  var DRAFT={ text:'', img:'', video:null, file:null };
  function open(){
    var ov=document.getElementById('fcompov');
    if(!ov){ ov=document.createElement('div'); ov.id='fcompov'; ov.className='fpov'; document.body.appendChild(ov); }
    DRAFT={ text:'', img:'', video:null, file:null };
    ov.innerHTML='<div class="fp-card"><button class="fp-x" id="fcoX">✕</button>'+
      '<div class="fp-formtitle">Say something</div>'+
      '<textarea id="fcoText" class="fco-text" rows="4" placeholder="What’s happening with your Falcon? Original words &amp; photos do best on Facebook…"></textarea>'+
      '<div id="fcoPrev" class="fco-prev"></div>'+
      '<div class="fco-attach">'+
        '<label class="fco-att">📷 Photo<input type="file" accept="image/*" id="fcoImg" hidden></label>'+
        '<label class="fco-att">🎥 Video<input type="file" accept="video/*" id="fcoVid" hidden></label>'+
        '<label class="fco-att">📎 File<input type="file" id="fcoFile" hidden></label>'+
      '</div>'+
      '<div class="fp-actions"><button class="fp-btn" id="fcoPost">Post</button>'+
        '<button class="fp-btn ghost" id="fcoPostFb">Post &amp; share to Facebook ↗</button></div>'+
      '<div class="fp-note">Your words &amp; photos post here first, then you send them to your Facebook group — real human content, no bots. Big files upload for real at Step-2; for now the photo rides along and video/attachments attach by name.</div></div>';
    ov.classList.add('on');
    document.getElementById('fcoX').onclick=close; ov.onclick=function(e){ if(e.target===ov) close(); };
    document.getElementById('fcoText').oninput=function(e){ DRAFT.text=e.target.value; };
    document.getElementById('fcoImg').onchange=function(e){ var f=e.target.files[0]; if(f) resize(f,function(d){ DRAFT.img=d; prev(); }); };
    document.getElementById('fcoVid').onchange=function(e){ var f=e.target.files[0]; if(f){ DRAFT.video={name:f.name,size:f.size,url:URL.createObjectURL(f)}; prev(); } };
    document.getElementById('fcoFile').onchange=function(e){ var f=e.target.files[0]; if(f){ DRAFT.file={name:f.name,size:f.size}; prev(); } };
    document.getElementById('fcoPost').onclick=function(){ post(false); };
    document.getElementById('fcoPostFb').onclick=function(){ post(true); };
  }
  function prev(){ var p=document.getElementById('fcoPrev'); if(!p) return; var h='';
    if(DRAFT.img) h+='<img class="fco-img" src="'+DRAFT.img+'">';
    if(DRAFT.video) h+='<video class="fco-img" src="'+DRAFT.video.url+'" controls></video>';
    if(DRAFT.file) h+='<div class="fco-chip">📎 '+esc(DRAFT.file.name)+' <small>('+Math.round(DRAFT.file.size/1024)+' KB)</small></div>';
    p.innerHTML=h;
  }
  function close(){ var ov=document.getElementById('fcompov'); if(ov) ov.classList.remove('on'); }
  function post(toFb){
    if(!DRAFT.text.trim() && !DRAFT.img && !DRAFT.video && !DRAFT.file){ if(window.toast) toast('Add a few words or a photo first.'); return; }
    var me=null; try{ me=JSON.parse(localStorage.getItem('fff.profile')||'null'); }catch(e){}
    var post={ t:DRAFT.text.trim(), img:DRAFT.img||'', video:DRAFT.video?{name:DRAFT.video.name}:null, file:DRAFT.file||null, who:(me&&me.name)||'You', when:Date.now() };
    var feed=load(); feed.unshift(post); save(feed); render(); close();
    if(toFb){ if(window.LukasGateway&&LukasGateway.open){ LukasGateway.open(); } else if(window.toast) toast('↗ Copied — paste into your Facebook group.'); }
    else if(window.toast) toast('✓ Posted');
  }
  function timeAgo(ms){ var s=(Date.now()-ms)/1000; if(s<60)return 'just now'; if(s<3600)return Math.floor(s/60)+'m'; if(s<86400)return Math.floor(s/3600)+'h'; return Math.floor(s/86400)+'d'; }
  function render(){
    var host=document.getElementById('fcoMount'); if(!host) return;
    var feed=load();
    var list = feed.length ? feed.map(function(p){ return '<div class="fco-post">'+
        '<div class="fco-post-h"><b>'+esc(p.who)+'</b><span>'+timeAgo(p.when)+'</span></div>'+
        (p.t?'<div class="fco-post-t">'+esc(p.t)+'</div>':'')+
        (p.img?'<img class="fco-post-img" src="'+p.img+'">':'')+
        (p.video?'<div class="fco-chip">🎥 '+esc(p.video.name)+'</div>':'')+
        (p.file?'<div class="fco-chip">📎 '+esc(p.file.name)+'</div>':'')+
        '<div class="fco-post-act"><button class="fco-mini" data-fb>↗ Send to Facebook</button></div>'+
      '</div>'; }).join('') : '<div class="fp-empty">No posts yet — tap “✍️ New post”.</div>';
    host.innerHTML='<div class="fco-launch"><button class="fp-btn" id="fcoNew">✍️ New post — photo · video · file</button></div>'+
      '<div class="fco-feed">'+list+'</div>';
    document.getElementById('fcoNew').onclick=open;
    host.querySelectorAll('[data-fb]').forEach(function(b){ b.onclick=function(){ if(window.LukasGateway&&LukasGateway.open){ LukasGateway.open(); } else if(window.toast) toast('↗ Copied — paste into your Facebook group.'); }; });
  }
  function inject(){
    var feedPanel=document.getElementById('panel-feed'); if(!feedPanel) return;
    if(document.getElementById('fcoMount')) return;
    var m=document.createElement('div'); m.id='fcoMount'; feedPanel.insertBefore(m, feedPanel.firstChild); render();
  }
  window.FFFCompose={ open:open, render:render };
  if(document.readyState!=='loading') inject(); else document.addEventListener('DOMContentLoaded', inject);
})();
