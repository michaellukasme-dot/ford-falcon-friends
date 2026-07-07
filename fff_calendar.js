/* fff_calendar.js — Ford Falcon Friends "Calendar of Events" left sidebar.
   House pattern: namespaced window object, Supabase-ready with localStorage Step-1 fallback,
   honest-state (demo events are clearly labeled until real event data is fed).
   Mounts into #fffCalMount. Ported from the Shakedown calendar (.cal) pattern. */
(function(){
  'use strict';
  var TYPES = { all:'All', show:'🏁 Shows', meet:'🤝 Meets', cruise:'🚗 Cruises', swap:'🔧 Swaps' };
  var FILTER = 'all';
  // Demo events — offsets in days from today. Replaced by live data when a Supabase `events` table exists.
  function mk(days,t,title,where,city){ var d=new Date(); d.setDate(d.getDate()+days); d.setHours(9,0,0,0);
    return { d:d, iso:d.toISOString().slice(0,10), type:t, title:title, where:where, city:city, demo:true }; }
  var EVENTS = [
    mk(3,'meet','Cars & Coffee — Falcon corner','Downtown lot','Santa Cruz, CA'),
    mk(9,'swap','Fall Swap Meet','County fairgrounds','Pomona, CA'),
    mk(16,'cruise','Coast Highway Cruise','PCH pull-out','Half Moon Bay, CA'),
    mk(24,'show','Ranchero & Wagon Roundup','Veterans park','Sacramento, CA'),
    mk(38,'show','FCA Regional Meet','Host hotel','Denver, CO'),
    mk(52,'meet','Sprint Owners Breakfast','Diner on Main','Austin, TX'),
    mk(70,'swap','Winter Parts Swap','Expo hall','Columbus, OH')
  ];
  var WANT = load();
  function load(){ try{ return JSON.parse(localStorage.getItem('fff.cal.want')||'{}'); }catch(e){ return {}; } }
  function save(){ try{ localStorage.setItem('fff.cal.want', JSON.stringify(WANT)); }catch(e){} }

  function match(e){ return FILTER==='all' || e.type===FILTER; }
  function fmtDate(d){ return d.toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
  function fmtDow(d){ return d.toLocaleDateString(undefined,{weekday:'short'}); }

  function render(){
    var host = document.getElementById('fffCalMount'); if(!host) return;
    var chips = Object.keys(TYPES).map(function(k){
      return '<button class="fcal-chip'+(FILTER===k?' on':'')+'" data-f="'+k+'">'+TYPES[k]+'</button>'; }).join('');
    var rows = EVENTS.filter(match).sort(function(a,b){return a.d-b.d;}).map(function(e){
      var on = !!WANT[e.iso+e.title];
      return '<div class="fcal-card">'+
        '<div class="fcal-date"><b>'+fmtDate(e.d)+'</b><span>'+fmtDow(e.d)+'</span></div>'+
        '<div class="fcal-meta"><div class="fcal-title">'+esc(e.title)+'</div>'+
          '<div class="fcal-where">'+esc(e.where)+' · '+esc(e.city)+'</div></div>'+
        '<button class="fcal-go'+(on?' on':'')+'" data-k="'+esc(e.iso+e.title)+'">'+(on?'✓ Going':'🔔 RSVP')+'</button>'+
      '</div>'; }).join('') || '<div class="fcal-empty">No events for this filter yet.</div>';
    host.innerHTML =
      '<div class="fcal">'+
        '<div class="fcal-head"><span class="eyebrow">On the calendar</span>'+
          '<button class="fcal-add" id="fcalAdd" title="Suggest an event">＋ Add</button></div>'+
        '<div class="fcal-chips">'+chips+'</div>'+
        '<div class="fcal-list">'+rows+'</div>'+
        '<div class="fcal-note">Demo line-up — real meets, shows &amp; cruises load here once the community feeds them. Nothing here is ticketed or official yet.</div>'+
      '</div>';
    host.querySelectorAll('.fcal-chip').forEach(function(b){ b.onclick=function(){ FILTER=b.dataset.f; render(); }; });
    host.querySelectorAll('.fcal-go').forEach(function(b){ b.onclick=function(){ var k=b.dataset.k; WANT[k]=!WANT[k]; save(); render();
      if(window.toast) toast(WANT[k]?'🔔 Added to your list':'Removed from your list'); }; });
    var add=document.getElementById('fcalAdd'); if(add) add.onclick=function(){ if(window.toast) toast('Suggest-an-event opens for organizers at Step 2.'); };
  }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  // Live sync hook — no-op unless a Supabase client + events table are present.
  function sync(){
    try{ var sb = window.fffSB || null; if(!sb || !sb.from) return;
      sb.from('events').select('*').order('event_date',{ascending:true}).then(function(r){
        if(r && r.data && r.data.length){
          EVENTS = r.data.map(function(x){ var d=new Date((x.event_date||'')+'T09:00');
            return { d:d, iso:d.toISOString().slice(0,10), type:x.kind||'meet', title:x.title, where:x.venue||'', city:x.city||'', demo:false }; });
          render();
        }
      }).catch(function(){});
    }catch(e){}
  }

  window.FFFCalendar = { render:render, sync:sync };
  if(document.readyState!=='loading') { render(); sync(); }
  else document.addEventListener('DOMContentLoaded', function(){ render(); sync(); });
})();
