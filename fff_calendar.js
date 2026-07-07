/* fff_calendar.js — "Calendar of Events" (Shakedown-style: month GRID that toggles to LIST).
   Scope toggle: Your chapter (default) ⇄ National. House rules: honest-state demo events,
   localStorage Step-1, Supabase-ready. Mounts into #fffCalMount. */
(function(){
  'use strict';
  var TYPES = { all:'All', show:'🏁 Shows', meet:'🤝 Meets', cruise:'🚗 Cruises', swap:'🔧 Swaps' };
  var FILTER='all', VIEW='grid', SCOPE='chapter', MONTH=firstOfMonth(new Date()), SEL=null;

  function mk(days,t,title,where,city,chapter){ var d=new Date(); d.setDate(d.getDate()+days); d.setHours(9,0,0,0);
    return { d:d, iso:iso(d), type:t, title:title, where:where, city:city, chapter:chapter, demo:true }; }
  var EVENTS=[
    mk(3,'meet','Cars & Coffee — Falcon corner','Downtown lot','Santa Cruz, CA','Northern CA'),
    mk(6,'cruise','Sunset Cruise','Marina','San Jose, CA','Northern CA'),
    mk(9,'swap','Fall Swap Meet','County fairgrounds','Pomona, CA','SoCal'),
    mk(16,'cruise','Coast Highway Cruise','PCH pull-out','Half Moon Bay, CA','Northern CA'),
    mk(24,'show','Ranchero & Wagon Roundup','Veterans park','Sacramento, CA','Northern CA'),
    mk(31,'meet','Sprint Owners Breakfast','Diner on Main','Austin, TX','Texas'),
    mk(38,'show','FCA Regional Meet','Host hotel','Denver, CO','Rockies'),
    mk(52,'swap','Winter Parts Swap','Expo hall','Columbus, OH','Midwest')
  ];
  var WANT=load('fff.cal.want',{});
  function load(k,d){ try{ return JSON.parse(localStorage.getItem(k)||JSON.stringify(d)); }catch(e){ return d; } }
  function saveWant(){ try{ localStorage.setItem('fff.cal.want', JSON.stringify(WANT)); }catch(e){} }
  function myChapter(){ try{ var p=JSON.parse(localStorage.getItem('fff.profile')||'null'); return p&&p.chapter?p.chapter:''; }catch(e){ return ''; } }
  function iso(d){ return d.toISOString().slice(0,10); }
  function firstOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function inScope(e){ if(SCOPE==='national') return true; var ch=myChapter(); return ch? (e.chapter===ch) : true; }
  function match(e){ return (FILTER==='all'||e.type===FILTER) && inScope(e); }

  function render(){
    var host=document.getElementById('fffCalMount'); if(!host) return;
    var ch=myChapter();
    var scopeLabel = ch ? esc(ch) : 'Your chapter';
    var head='<div class="fcal-head"><span class="eyebrow">On the calendar</span>'+
      '<button class="fcal-view" id="fcalView" title="Toggle grid / list">'+(VIEW==='grid'?'☰ List':'▦ Grid')+'</button></div>'+
      '<div class="fcal-scope"><button class="fcal-sc'+(SCOPE==='chapter'?' on':'')+'" data-s="chapter">📍 '+scopeLabel+'</button>'+
        '<button class="fcal-sc'+(SCOPE==='national'?' on':'')+'" data-s="national">🌎 National</button></div>'+
      '<div class="fcal-chips">'+Object.keys(TYPES).map(function(k){return '<button class="fcal-chip'+(FILTER===k?' on':'')+'" data-f="'+k+'">'+TYPES[k]+'</button>';}).join('')+'</div>';
    host.innerHTML='<div class="fcal">'+head+(VIEW==='grid'?gridHTML():listHTML(EVENTS.filter(match)))+
      '<div class="fcal-note">Demo line-up — real meets, shows &amp; cruises load here once the community feeds them.'+(ch?'':' Set your chapter in your profile to default this to local events.')+'</div></div>';
    wire(host);
  }

  function gridHTML(){
    var y=MONTH.getFullYear(), m=MONTH.getMonth();
    var first=new Date(y,m,1).getDay(), days=new Date(y,m+1,0).getDate();
    var evByDay={}; EVENTS.filter(match).forEach(function(e){ if(e.d.getFullYear()===y&&e.d.getMonth()===m){ (evByDay[e.d.getDate()]=evByDay[e.d.getDate()]||[]).push(e); } });
    var cells='';
    ['S','M','T','W','T','F','S'].forEach(function(w){ cells+='<div class="fcal-dow">'+w+'</div>'; });
    for(var i=0;i<first;i++) cells+='<div class="fcal-cell empty"></div>';
    var today=new Date();
    for(var day=1;day<=days;day++){
      var has=evByDay[day], isToday=(today.getFullYear()===y&&today.getMonth()===m&&today.getDate()===day);
      var selc=(SEL===day?' sel':'');
      cells+='<div class="fcal-cell'+(has?' has':'')+(isToday?' today':'')+selc+'" data-day="'+day+'">'+day+(has?'<span class="fcal-dot"></span>':'')+'</div>';
    }
    var monthName=MONTH.toLocaleDateString(undefined,{month:'long',year:'numeric'});
    var sel = SEL && evByDay[SEL] ? listHTML(evByDay[SEL], true) : '';
    return '<div class="fcal-monthbar"><button class="fcal-nav" data-n="-1">‹</button><b>'+monthName+'</b><button class="fcal-nav" data-n="1">›</button></div>'+
      '<div class="fcal-grid">'+cells+'</div>'+ (sel?('<div class="fcal-selday">'+sel+'</div>'):'<div class="fcal-hint">Tap a highlighted day to see its events.</div>');
  }
  function listHTML(list, compact){
    if(!list.length) return '<div class="fcal-empty">No events'+(compact?' this day':' for this filter')+' yet.</div>';
    return list.sort(function(a,b){return a.d-b.d;}).map(function(e){ var on=!!WANT[e.iso+e.title];
      return '<div class="fcal-card">'+
        '<div class="fcal-date"><b>'+e.d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+'</b><span>'+e.d.toLocaleDateString(undefined,{weekday:'short'})+'</span></div>'+
        '<div class="fcal-meta"><div class="fcal-title">'+esc(e.title)+'</div><div class="fcal-where">'+esc(e.where)+' · '+esc(e.city)+'</div></div>'+
        '<button class="fcal-go'+(on?' on':'')+'" data-k="'+esc(e.iso+e.title)+'">'+(on?'✓':'🔔')+'</button>'+
      '</div>'; }).join('');
  }
  function wire(host){
    var v=document.getElementById('fcalView'); if(v) v.onclick=function(){ VIEW=(VIEW==='grid'?'list':'grid'); render(); };
    host.querySelectorAll('.fcal-sc').forEach(function(b){ b.onclick=function(){ SCOPE=b.dataset.s; SEL=null; render(); }; });
    host.querySelectorAll('.fcal-chip').forEach(function(b){ b.onclick=function(){ FILTER=b.dataset.f; SEL=null; render(); }; });
    host.querySelectorAll('.fcal-nav').forEach(function(b){ b.onclick=function(){ MONTH=new Date(MONTH.getFullYear(),MONTH.getMonth()+(+b.dataset.n),1); SEL=null; render(); }; });
    host.querySelectorAll('.fcal-cell.has').forEach(function(c){ c.onclick=function(){ SEL=(SEL==+c.dataset.day?null:+c.dataset.day); render(); }; });
    host.querySelectorAll('.fcal-go').forEach(function(b){ b.onclick=function(e){ e.stopPropagation(); var k=b.dataset.k; WANT[k]=!WANT[k]; saveWant(); render(); if(window.toast) toast(WANT[k]?'🔔 Added to your list':'Removed'); }; });
  }
  function sync(){ try{ var sb=window.fffSB; if(!sb||!sb.from) return;
    sb.from('events').select('*').order('event_date',{ascending:true}).then(function(r){ if(r&&r.data&&r.data.length){
      EVENTS=r.data.map(function(x){ var d=new Date((x.event_date||'')+'T09:00'); return {d:d,iso:iso(d),type:x.kind||'meet',title:x.title,where:x.venue||'',city:x.city||'',chapter:x.chapter||'',demo:false}; }); render(); }
    }).catch(function(){}); }catch(e){} }

  window.FFFCalendar={ render:render, sync:sync };
  if(document.readyState!=='loading'){ render(); sync(); } else document.addEventListener('DOMContentLoaded', function(){ render(); sync(); });
})();
