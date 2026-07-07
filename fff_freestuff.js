/* fff_freestuff.js — "Miracle Ticket = Free Stuff".
   Ported from the Shakedown Miracle-Ticket mechanic: float something free into the community bucket,
   first tap grabs it, karma rule keeps it honest. Featured drop: Gary's Garage.
   House rules: honest-state (demo bucket clearly labeled), localStorage Step-1, bouncing FAB + overlay. */
(function(){
  'use strict';
  var GRABBED = load('fff.free.grabbed', {});
  function load(k,d){ try{ return JSON.parse(localStorage.getItem(k)||JSON.stringify(d)); }catch(e){ return d; } }
  function save(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

  // Featured contributor drop — Gary's Garage's big upload today.
  var GARY = {
    who:'Gary’s Garage',
    when:'today',
    blurb:'A huge reference dump — free to the whole community.',
    items:[
      {t:'1960–65 shop-manual scans', n:'PDF pack'},
      {t:'Ditzler paint-chip charts (’60–’62, ’65)', n:'color codes'},
      {t:'Full-line brochure pages (’60, ’63, ’64)', n:'specs + options'},
      {t:'Rear-axle & VIN code sheets', n:'decode reference'}
    ]
  };
  // Free-stuff bucket (demo — real listings arrive when members post).
  var BUCKET = [
    {id:'g1', kind:'📚 Manual', title:'1963 Falcon shop manual (PDF)', from:'Gary’s Garage', note:'From today’s drop', demo:true},
    {id:'g2', kind:'🎨 Reference', title:'Paint-chip chart scans, 1960–65', from:'Gary’s Garage', note:'From today’s drop', demo:true},
    {id:'p1', kind:'🔧 Part', title:'170 six air cleaner lid (spare)', from:'a member', note:'Pick-up / ship at cost', demo:true},
    {id:'p2', kind:'🔧 Part', title:'Pair of ’64 tail-light bezels', from:'a member', note:'First come', demo:true}
  ];

  function openOv(){
    var ov=document.getElementById('ffreeov');
    if(!ov){ ov=document.createElement('div'); ov.id='ffreeov'; ov.className='ffreeov'; document.body.appendChild(ov); }
    var feat='<div class="ffree-feat"><div class="ffree-feat-h">🎫 Miracle Ticket · Featured drop</div>'+
      '<div class="ffree-feat-who"><b>'+GARY.who+'</b> — '+GARY.blurb+'</div>'+
      '<ul class="ffree-feat-list">'+GARY.items.map(function(i){return '<li>'+i.t+' <span>· '+i.n+'</span></li>';}).join('')+'</ul>'+
      '<button class="ffree-btn" id="ffreeGary">See Gary’s drop in Ask Steve →</button></div>';
    var rows=BUCKET.map(function(b){ var got=!!GRABBED[b.id];
      return '<div class="ffree-card">'+
        '<div class="ffree-kind">'+b.kind+'</div>'+
        '<div class="ffree-meta"><b>'+esc(b.title)+'</b><span>'+esc(b.from)+' · '+esc(b.note)+'</span></div>'+
        '<button class="ffree-grab'+(got?' got':'')+'" data-id="'+b.id+'">'+(got?'✓ Yours':'Grab')+'</button>'+
      '</div>'; }).join('');
    ov.innerHTML='<div class="ffree-sheet">'+
      '<div class="ffree-top"><div><div class="ffree-title">Miracle Ticket</div><div class="ffree-sub">Free stuff, floated by the community</div></div>'+
        '<button class="fp-x" id="ffreeX">✕</button></div>'+
      feat+
      '<div class="ffree-sect">In the bucket</div>'+rows+
      '<button class="ffree-btn ghost" id="ffreeGive">＋ Float something free</button>'+
      '<div class="ffree-karma">Karma rule: grab it and actually use it — or pass it back so someone else can. Grab &amp; ghost and you sit out Miracle until you make it right.</div>'+
      '<div class="fp-note">Demo bucket — real free listings appear here as members float them. No payments run through Miracle Ticket.</div>'+
    '</div>';
    ov.classList.add('on');
    document.getElementById('ffreeX').onclick=closeOv;
    ov.onclick=function(e){ if(e.target===ov) closeOv(); };
    ov.querySelectorAll('.ffree-grab').forEach(function(b){ b.onclick=function(){ GRABBED[b.dataset.id]=!GRABBED[b.dataset.id]; save('fff.free.grabbed',GRABBED); openOv();
      if(window.toast) toast(GRABBED[b.dataset.id]?'🎫 Grabbed — arrange pickup in the thread.':'Released back to the bucket.'); }; });
    var give=document.getElementById('ffreeGive'); if(give) give.onclick=function(){ if(window.toast) toast('Float-a-freebie posts open at Step 2.'); };
    var g=document.getElementById('ffreeGary'); if(g) g.onclick=function(){ closeOv(); if(window.FFFAskSteve) FFFAskSteve.open('What did Gary’s Garage just upload?'); };
  }
  function closeOv(){ var ov=document.getElementById('ffreeov'); if(ov) ov.classList.remove('on'); }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function mountFab(){
    if(document.getElementById('ffreeFab')) return;
    var b=document.createElement('button'); b.id='ffreeFab'; b.className='ffree-fab'; b.title='Miracle Ticket — free stuff';
    b.innerHTML='🎫'; b.onclick=openOv; document.body.appendChild(b);
  }
  window.FFFFreeStuff = { open:openOv, close:closeOv };
  if(document.readyState!=='loading') mountFab(); else document.addEventListener('DOMContentLoaded', mountFab);
})();
