/* fff_calendar.js — "Calendar of Events": month GRID ⇄ LIST, Chapter ⇄ National scope,
   ANYONE can post a run/meet, and every event has 🧭 GPS directions.
   House rules: honest-state demo events, localStorage Step-1, Supabase-ready. Location is opt-in
   (directions open the user's maps app on tap — no background tracking). Mounts into #fffCalMount. */
(function(){
  'use strict';
  var TYPES={ all:'All', run:'🛣️ Runs', meet:'🤝 Meets', show:'🏁 Shows', cruise:'🚗 Cruises', swap:'🔧 Swaps' };
  var FILTER='all', VIEW='grid', SCOPE='chapter', MONTH=firstOfMonth(new Date()), SEL=null;
  function mk(days,t,title,where,city,chapter,note){ var d=new Date(); d.setDate(d.getDate()+days); d.setHours(9,0,0,0);
    return { d:d, iso:iso(d), type:t, title:title, where:where, city:city, chapter:chapter, note:note||'', demo:true }; }
  var EVENTS=[
    mk(2,'run','Coast run: Novato → Merced','Meet: Starbucks, Main & 3rd, 9am','Novato, CA','Northern CA','“Me & my daughter heading up the coast — overnight en route. Everyone welcome!” —Al A.'),
    mk(3,'meet','Cars & Coffee — Falcon corner','Downtown lot','Santa Cruz, CA','Northern CA',''),
    mk(9,'swap','Fall Swap Meet','County fairgrounds','Pomona, CA','SoCal',''),
    mk(16,'cruise','Coast Highway Cruise','PCH pull-out','Half Moon Bay, CA','Northern CA',''),
    mk(24,'show','Ranchero & Wagon Roundup','Veterans park','Sacramento, CA','Northern CA',''),
    mk(38,'show','FCA Regional Meet','Host hotel','Denver, CO','Rockies','')
  ];
  function load(k,d){ try{ return JSON.parse(localStorage.getItem(k)||JSON.stringify(d)); }catch(e){ return d; } }
  var WANT=load('fff.cal.want',{});
  var MINE=load('fff.cal.mine',[]); MINE.forEach(function(m){ try{ m.d=new Date((m.iso||'')+'T09:00'); }catch(e){} }); EVENTS=EVENTS.concat(MINE);
  function saveWant(){ try{ localStorage.setItem('fff.cal.want', JSON.stringify(WANT)); }catch(e){} }
  function saveMine(){ try{ localStorage.setItem('fff.cal.mine', JSON.stringify(MINE.map(function(m){return {iso:m.iso,type:m.type,title:m.title,where:m.where,city:m.city,chapter:m.chapter,note:m.note,photo:m.photo||'',mine:true};}))); }catch(e){} }
  function myChapter(){ try{ var p=JSON.parse(localStorage.getItem('fff.profile')||'null'); return p&&p.chapter?p.chapter:''; }catch(e){ return ''; } }
  function iso(d){ return d.toISOString().slice(0,10); }
  function firstOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function dirURL(e){ return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent([e.where,e.city].filter(Boolean).join(', ')); }

  function inScope(e){ if(SCOPE==='national') return true; var ch=myChapter(); return ch?(e.chapter===ch):true; }
  function match(e){ return (FILTER==='all'||e.type===FILTER) && inScope(e); }

  function render(){
    var host=document.getElementById('fffCalMount'); if(!host) return;
    var ch=myChapter(), scopeLabel=ch?esc(ch):'Your chapter';
    var head='<div class="fcal-head"><span class="eyebrow">On the calendar</span>'+
      '<span style="display:flex;gap:5px"><button class="fcal-view" id="fcalPost" title="Post an event">＋ Post</button>'+
      '<button class="fcal-view" id="fcalView" title="Grid / list">'+(VIEW==='grid'?'☰ List':'▦ Grid')+'</button></span></div>'+
      '<div class="fcal-scope"><button class="fcal-sc'+(SCOPE==='chapter'?' on':'')+'" data-s="chapter">📍 '+scopeLabel+'</button>'+
        '<button class="fcal-sc'+(SCOPE==='national'?' on':'')+'" data-s="national">🌎 National</button></div>'+
      '<div class="fcal-chips">'+Object.keys(TYPES).map(function(k){return '<button class="fcal-chip'+(FILTER===k?' on':'')+'" data-f="'+k+'">'+TYPES[k]+'</button>';}).join('')+'</div>';
    host.innerHTML='<div class="fcal">'+head+(VIEW==='grid'?gridHTML():listHTML(EVENTS.filter(match)))+
      '<div class="fcal-note">Anyone can post a run or meet with ＋ Post — it shows here and you can send it to your Facebook group. Directions open your maps app.'+(ch?'':' Set your chapter in your profile to default to local events.')+'</div></div>';
    wire(host);
  }
  function gridHTML(){
    var y=MONTH.getFullYear(), m=MONTH.getMonth();
    var first=new Date(y,m,1).getDay(), days=new Date(y,m+1,0).getDate(), evd={};
    EVENTS.filter(match).forEach(function(e){ if(e.d.getFullYear()===y&&e.d.getMonth()===m){ (evd[e.d.getDate()]=evd[e.d.getDate()]||[]).push(e); } });
    var cells=''; ['S','M','T','W','T','F','S'].forEach(function(w){ cells+='<div class="fcal-dow">'+w+'</div>'; });
    for(var i=0;i<first;i++) cells+='<div class="fcal-cell empty"></div>';
    var t=new Date();
    for(var day=1;day<=days;day++){ var has=evd[day], td=(t.getFullYear()===y&&t.getMonth()===m&&t.getDate()===day);
      cells+='<div class="fcal-cell'+(has?' has':'')+(td?' today':'')+(SEL===day?' sel':'')+'" data-day="'+day+'">'+day+(has?'<span class="fcal-dot"></span>':'')+'</div>'; }
    var sel=SEL&&evd[SEL]?listHTML(evd[SEL],true):'';
    return '<div class="fcal-monthbar"><button class="fcal-nav" data-n="-1">‹</button><b>'+MONTH.toLocaleDateString(undefined,{month:'long',year:'numeric'})+'</b><button class="fcal-nav" data-n="1">›</button></div>'+
      '<div class="fcal-grid">'+cells+'</div>'+(sel?'<div class="fcal-selday">'+sel+'</div>':'<div class="fcal-hint">Tap a highlighted day to see its events.</div>');
  }
  function listHTML(list){
    if(!list.length) return '<div class="fcal-empty">Nothing here yet — be the first to ＋ Post.</div>';
    return list.sort(function(a,b){return a.d-b.d;}).map(function(e){ var on=!!WANT[e.iso+e.title];
      return '<div class="fcal-card">'+
        (e.photo?'<img class="fcal-photo" src="'+e.photo+'" alt="">':'')+
        '<div class="fcal-date"><b>'+e.d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+'</b><span>'+e.d.toLocaleDateString(undefined,{weekday:'short'})+'</span></div>'+
        '<div class="fcal-meta"><div class="fcal-title">'+esc(e.title)+(e.mine?' <span class="fcal-mine">yours</span>':'')+'</div>'+
          '<div class="fcal-where">'+esc(e.where)+(e.city?(' · '+esc(e.city)):'')+'</div>'+
          (e.note?'<div class="fcal-say">'+esc(e.note)+'</div>':'')+'</div>'+
        '<div class="fcal-btns"><a class="fcal-dir" href="'+dirURL(e)+'" target="_blank" rel="noopener" title="GPS directions">🧭</a>'+
          '<button class="fcal-go'+(on?' on':'')+'" data-k="'+esc(e.iso+e.title)+'" title="Add to my list">'+(on?'✓':'🔔')+'</button></div>'+
      '</div>'; }).join('');
  }
  function openCreate(){
    var ov=document.getElementById('fcalcreate');
    if(!ov){ ov=document.createElement('div'); ov.id='fcalcreate'; ov.className='fpov'; document.body.appendChild(ov); }
    var topts=Object.keys(TYPES).filter(function(k){return k!=='all';}).map(function(k){return '<option value="'+k+'">'+TYPES[k]+'</option>';}).join('');
    var tmin=iso(new Date());
    ov.innerHTML='<div class="fp-card"><button class="fp-x" id="fccX">✕</button>'+
      '<div class="fp-formtitle">Post a run or meet</div>'+
      '<label class="fp-l">What’s happening<input id="fcT" placeholder="Coast run: Novato → Merced"></label>'+
      '<label class="fp-l">Type<select id="fcType">'+topts+'</select></label>'+
      '<label class="fp-l">Date<input id="fcD" type="date" min="'+tmin+'" value="'+tmin+'"></label>'+
      '<label class="fp-l">Meet spot<input id="fcW" placeholder="Starbucks, Main & 3rd, 9am"></label>'+
      '<label class="fp-l">City<input id="fcC" placeholder="Novato, CA"></label>'+
      '<label class="fp-l">Say something (optional)<textarea id="fcN" rows="2" placeholder="Everyone welcome!"></textarea></label>'+
      '<label class="fp-l">Add a picture (optional)<input id="fcP" type="file" accept="image/*"></label>'+
      '<div id="fcPrev"></div>'+
      '<div class="fp-actions"><button class="fp-btn" id="fcSave">Post it</button></div>'+
      '<div class="fp-note">Posts to your calendar on this device now; when signed in it goes to your chapter and you can send it to Facebook. You’re the organizer — keep it friendly and legal.</div></div>';
    ov.classList.add('on');
    var PHOTO='';
    document.getElementById('fccX').onclick=function(){ ov.classList.remove('on'); };
    ov.onclick=function(e){ if(e.target===ov) ov.classList.remove('on'); };
    var pin=document.getElementById('fcP'); if(pin) pin.onchange=function(e){ var f=e.target.files[0]; if(!f) return; resize(f,function(d){ PHOTO=d; var pv=document.getElementById('fcPrev'); if(pv) pv.innerHTML='<img class="fcal-prev" src="'+d+'" alt="preview">'; }); };
    document.getElementById('fcSave').onclick=function(){
      var title=val('fcT'); if(!title){ if(window.toast) toast('Give it a name.'); return; }
      var d=val('fcD')||tmin; var ev={ iso:d, d:new Date(d+'T09:00'), type:val2('fcType')||'meet', title:title, where:val('fcW'), city:val('fcC'), chapter:myChapter(), note:val('fcN'), photo:PHOTO, mine:true };
      MINE.push(ev); EVENTS.push(ev); saveMine(); ov.classList.remove('on'); VIEW='list'; render();
      if(window.toast) toast('🛣️ Posted — everyone’s welcome.');
    };
  }
  function resize(file, cb){ try{ var r=new FileReader(); r.onload=function(){ var img=new Image(); img.onload=function(){ var mx=900, s=Math.min(1,mx/Math.max(img.width,img.height)); var c=document.createElement('canvas'); c.width=img.width*s; c.height=img.height*s; c.getContext('2d').drawImage(img,0,0,c.width,c.height); cb(c.toDataURL('image/jpeg',0.8)); }; img.src=r.result; }; r.readAsDataURL(file); }catch(e){ cb(''); } }
  function val(id){ var e=document.getElementById(id); return e?e.value.trim():''; }
  function val2(id){ var e=document.getElementById(id); return e?e.value:''; }
  function wire(host){
    var p=document.getElementById('fcalPost'); if(p) p.onclick=openCreate;
    var v=document.getElementById('fcalView'); if(v) v.onclick=function(){ VIEW=(VIEW==='grid'?'list':'grid'); render(); };
    host.querySelectorAll('.fcal-sc').forEach(function(b){ b.onclick=function(){ SCOPE=b.dataset.s; SEL=null; render(); }; });
    host.querySelectorAll('.fcal-chip').forEach(function(b){ b.onclick=function(){ FILTER=b.dataset.f; SEL=null; render(); }; });
    host.querySelectorAll('.fcal-nav').forEach(function(b){ b.onclick=function(){ MONTH=new Date(MONTH.getFullYear(),MONTH.getMonth()+(+b.dataset.n),1); SEL=null; render(); }; });
    host.querySelectorAll('.fcal-cell.has').forEach(function(c){ c.onclick=function(){ SEL=(SEL==+c.dataset.day?null:+c.dataset.day); render(); }; });
    host.querySelectorAll('.fcal-go').forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); var k=b.dataset.k; WANT[k]=!WANT[k]; saveWant(); render(); if(window.toast) toast(WANT[k]?'🔔 Added to your list':'Removed'); }; });
  }
  function sync(){ try{ var sb=window.fffSB; if(!sb||!sb.from) return;
    sb.from('events').select('*').order('event_date',{ascending:true}).then(function(r){ if(r&&r.data&&r.data.length){
      var live=r.data.map(function(x){ var d=new Date((x.event_date||'')+'T09:00'); return {d:d,iso:iso(d),type:x.kind||'meet',title:x.title,where:x.venue||'',city:x.city||'',chapter:x.chapter||'',note:x.note||'',demo:false}; });
      EVENTS=live.concat(MINE); render(); }
    }).catch(function(){}); }catch(e){} }
  window.FFFCalendar={ render:render, sync:sync, post:openCreate };
  if(document.readyState!=='loading'){ render(); sync(); } else document.addEventListener('DOMContentLoaded', function(){ render(); sync(); });
})();
