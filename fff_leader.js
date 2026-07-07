/* fff_leader.js — Group-Leader cockpit for Ford Falcon Friends.
   Same "cockpit" idea as Shakedown's curator/partner console, tuned to the FB-gathered Falcon niche:
   an FB group leader enrolls, opens a market for their members, and ladders it local → regional → national.
   House rules: honest-state (nothing auto-posts; leader runs it; within Facebook's terms; no bots/scraping),
   localStorage Step-1, Supabase-ready. Mounts into #leadMount. */
(function(){
  'use strict';
  function load(){ try{ return JSON.parse(localStorage.getItem('fff.leader')||'null'); }catch(e){ return null; } }
  function save(o){ try{ localStorage.setItem('fff.leader', JSON.stringify(o)); }catch(e){} }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  var LADDER=[
    {k:'local', ic:'📍', name:'Local market', blurb:'Members buy/sell cars, parts &amp; services inside your group. Local craft & vendor slots. You set the rules.', fee:'Free to open'},
    {k:'regional', ic:'🗺️', name:'Regional reach', blurb:'List spills over to neighboring chapters when your members opt in. Cross-post meets & swaps.', fee:'Rev-share on sales'},
    {k:'national', ic:'🌎', name:'National storefront', blurb:'Your best listings surface to the whole Falcon & Friends network. Sponsored posts & featured drops.', fee:'Rev-share + optional ads'}
  ];
  var TOOLS=[
    ['🖊️','Original posts','Members write here first — then one tap sends it to your Facebook group. Real human content, FB’s favorite.'],
    ['🏷️','Member market','Cars, parts, memorabilia, services. Local-first, ladders outward as you grow.'],
    ['🧰','Free Parts Bin','Gary’s-style free giveaways keep the group generous and active.'],
    ['🎟️','Meets & dues','Sell meet tickets, collect optional group dues, run 50/50s — you keep the relationship.'],
    ['📣','Sponsored slots','Local shops sponsor your feed. You approve every one. No programmatic junk.']
  ];

  function render(){
    var host=document.getElementById('leadMount'); if(!host) return;
    var L=load();
    if(!L){ host.innerHTML=enrollHTML(); wireEnroll(host); return; }
    var ladder=LADDER.map(function(t){ var on=(L.tier===t.k)||tierIndex(L.tier)>=tierIndex(t.k);
      return '<div class="ld-rung'+(on?' on':'')+'"><div class="ld-rung-h">'+t.ic+' <b>'+t.name+'</b><span class="ld-fee">'+t.fee+'</span></div>'+
        '<div class="ld-rung-b">'+t.blurb+'</div>'+
        (L.tier===t.k?'<span class="ld-cur">Current</span>':'<button class="ld-btn sm" data-tier="'+t.k+'">'+(tierIndex(t.k)>tierIndex(L.tier)?'Level up →':'Set active')+'</button>')+
      '</div>'; }).join('');
    var tools=TOOLS.map(function(t){ return '<div class="ld-tool"><span class="ld-tool-ic">'+t[0]+'</span><div><b>'+t[1]+'</b><span>'+t[2]+'</span></div></div>'; }).join('');
    host.innerHTML=
      '<div class="ld-card ld-me"><div class="ld-me-h"><b>👑 '+esc(L.group)+'</b><button class="ld-btn ghost sm" id="ldEdit">Edit</button></div>'+
        '<div class="ld-me-b">'+esc(L.region||'Region —')+' · ~'+esc(L.members||'?')+' members · leader: '+esc(L.leader||'you')+'</div></div>'+
      '<div class="ld-sect">Your monetization ladder</div>'+ladder+
      '<div class="ld-sect">Cockpit tools</div>'+tools+
      '<div class="ld-actions">'+
        '<button class="ld-btn" id="ldShare">↗ Post here → send to Facebook</button>'+
        '<button class="ld-btn ghost" id="ldMarket">Open my market</button></div>'+
      '<div class="fp-note">Within Facebook’s terms — you run the group, nothing auto-posts, and no bots or scraping. We just give your members a better place to make original content and give you the tools to earn from the audience you built. Payments &amp; rev-share go live at Step 2.</div>';
    wireCockpit(host, L);
  }
  function tierIndex(k){ return {local:0,regional:1,national:2}[k]!=null?{local:0,regional:1,national:2}[k]:-1; }

  function enrollHTML(){
    return '<div class="ld-card">'+
      '<div class="ld-sect" style="margin-top:0">Claim your group</div>'+
      '<label class="fp-l">Facebook group name<input id="ldG" placeholder="e.g. Ford Falcon Owners – Northern CA"></label>'+
      '<label class="fp-l">Your name<input id="ldN" placeholder="Group admin"></label>'+
      '<label class="fp-l">Region / chapter<input id="ldR" placeholder="Northern CA"></label>'+
      '<label class="fp-l">Approx members<input id="ldM" inputmode="numeric" placeholder="e.g. 4200"></label>'+
      '<div class="ld-actions"><button class="ld-btn" id="ldSave">Open my cockpit</button></div>'+
      '<div class="fp-note">Free to claim. You keep your Facebook group exactly as-is — this just adds a market + better posting tools in front of it. No bots, no scraping, human-run.</div></div>';
  }
  function wireEnroll(host){
    var b=host.querySelector('#ldSave'); if(!b) return;
    b.onclick=function(){ var g=v('ldG'); if(!g){ if(window.toast) toast('Add your group name.'); return; }
      save({group:g, leader:v('ldN'), region:v('ldR'), members:v('ldM'), tier:'local', opened:Date.now()});
      if(window.toast) toast('👑 Cockpit opened — welcome, group leader.'); render(); };
  }
  function wireCockpit(host, L){
    host.querySelectorAll('.ld-btn[data-tier]').forEach(function(b){ b.onclick=function(){ L.tier=b.dataset.tier; save(L); render();
      if(window.toast) toast('Market tier set: '+b.dataset.tier); }; });
    var e=host.querySelector('#ldEdit'); if(e) e.onclick=function(){ localStorage.removeItem('fff.leader'); render(); };
    var s=host.querySelector('#ldShare'); if(s) s.onclick=function(){
      if(window.LukasGateway&&LukasGateway.open){ LukasGateway.open(); }
      else if(window.toast) toast('Write your post in Feed, then tap Share → Facebook.'); };
    var m=host.querySelector('#ldMarket'); if(m) m.onclick=function(){ var t=document.querySelector('.tab[data-p="market"]'); if(t){ t.click(); } else if(window.toast) toast('Market opens from the bottom bar.'); };
  }
  function v(id){ var e=document.getElementById(id); return e?e.value.trim():''; }

  window.FFFLeader={ render:render };
  document.addEventListener('DOMContentLoaded', function(){
    render();
    try{ document.getElementById('tabs').addEventListener('click', function(ev){ var b=ev.target.closest('.tab'); if(b&&b.dataset.p==='lead') render(); }); }catch(e){}
  });
})();
