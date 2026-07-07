/* fff_profile.js — Ford Falcon Friends portable QR profile.
   Barcode = Profile. Inside the profile: your vehicles, the VIN decoder, and each car's provenance.
   Ported from the Shakedown QR-profile pattern. House rules: honest-state, localStorage Step-1,
   Supabase upgrade when a client is present. Real, scannable QR via qrcode-generator (cdnjs);
   graceful copy-link fallback offline. */
(function(){
  'use strict';

  /* ---------- Falcon VIN decode maps (from the registry VIN key; year+plant high-confidence) ---------- */
  var YEAR = {'0':'1960 / 1970','1':'1961','2':'1962','3':'1963','4':'1964','5':'1965','6':'1966','7':'1967','8':'1968','9':'1969'};
  var PLANT = {A:'Atlanta',B:'Oakville (ON)',D:'Dallas',E:'Mahwah',F:'Dearborn',G:'Chicago',H:'Lorain',
    J:'Los Angeles',K:'Kansas City',N:'Norfolk',P:'Twin Cities',R:'San Jose',S:'Allen Park (Pilot)',T:'Metuchen',U:'Louisville',W:'Wayne',Y:'Wixom',Z:'St. Louis'};
  // Engine letters shifted across years — flagged as verify-by-year (honest-state).
  var ENGINE = {S:'144 six (1-V)',U:'170 six (1-V)',T:'200 six (1-V)',F:'260 V-8 (2-V)',C:'289 V-8 (2-V)',A:'289 V-8 (4-V)',D:'289 V-8 (4-V HP)',X:'170 six',Y:'200 six'};

  function decodeVIN(raw){
    var v=(raw||'').toUpperCase().replace(/\s+/g,'');
    if(v.length<5) return { ok:false, msg:'A Falcon VIN is 11 characters — e.g. 3R01F100001.' };
    var y=v[0], p=v[1], body=v.slice(2,4), e=v[4], seq=v.slice(5);
    return { ok:true, vin:v,
      year: YEAR[y]||'?', yearRaw:y,
      plant: PLANT[p]||'unknown ('+p+')',
      body: body,
      engine: ENGINE[e]||('code '+e+' — verify by year'),
      seq: seq,
      note: (y==='0'?'1st char 0 = 1960 OR 1970 — resolve by body/plant.':'') };
  }

  /* ---------- profile store ---------- */
  function me(){ try{ return JSON.parse(localStorage.getItem('fff.profile')||'null'); }catch(e){ return null; } }
  function setMe(p){ try{ localStorage.setItem('fff.profile', JSON.stringify(p)); }catch(e){}
    try{ var sb=window.fffSB; if(sb&&sb.auth){ /* Step-2: upsert into profiles when signed in */ } }catch(e){} }
  function myCars(){ try{ return JSON.parse(localStorage.getItem('fff.garage')||'[]'); }catch(e){ return []; } }

  function shareURL(p){ var h=(p&&p.handle)||'me'; return location.origin+location.pathname+'#p/'+encodeURIComponent(h); }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  /* ---------- QR (progressive: real QR if lib loads, else copyable link) ---------- */
  var QR_LIB=false;
  function loadQR(cb){ if(QR_LIB||window.qrcode){ QR_LIB=true; return cb&&cb(); }
    var s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.onload=function(){ QR_LIB=true; cb&&cb(); }; s.onerror=function(){ cb&&cb(); }; document.head.appendChild(s); }
  function qrHTML(url){
    if(window.qrcode){ try{ var q=window.qrcode(0,'M'); q.addData(url); q.make(); return q.createSvgTag({cellSize:4,margin:2}); }catch(e){} }
    return '<div class="fp-qrfallback">🔳<br><small>Scan code loads offline — your link is ready to copy below.</small></div>';
  }

  /* ---------- render ---------- */
  function open(){
    var p = me() || { name:'', handle:'', chapter:'', story:'' };
    var ov = document.getElementById('fpov');
    if(!ov){ ov=document.createElement('div'); ov.id='fpov'; ov.className='fpov'; document.body.appendChild(ov); }
    var cars = myCars();
    var edit = !(p.name);
    ov.innerHTML =
      '<div class="fp-card">'+
        '<button class="fp-x" id="fpX">✕</button>'+
        (edit ? formHTML(p) : viewHTML(p, cars))+
      '</div>';
    ov.classList.add('on');
    document.getElementById('fpX').onclick=close;
    ov.onclick=function(e){ if(e.target===ov) close(); };
    if(!edit){ loadQR(function(){ var box=document.getElementById('fpQR'); if(box) box.innerHTML=qrHTML(shareURL(p)); });
      wireView(p); }
    else wireForm(p);
  }
  function close(){ var ov=document.getElementById('fpov'); if(ov) ov.classList.remove('on'); }

  function viewHTML(p, cars){
    var stats = [
      ['🚗', cars.length, 'in the garage'],
      ['🏅', bestRarity(cars), 'rarest tier'],
      ['🔔', wantCount(), 'events on list'],
      ['✅', verifyCount(), 'verifs sent']
    ].map(function(s){ return '<div class="fp-st"><div class="n">'+s[1]+'</div><div class="l">'+s[0]+' '+s[2]+'</div></div>'; }).join('');
    var prov = cars.length ? cars.map(provCard).join('') :
      '<div class="fp-empty">No vehicles yet. Add one in My Garage and its provenance shows here.</div>';
    return ''+
      '<div class="fp-qr" id="fpQR">…</div>'+
      '<div class="fp-name">'+esc(p.name||'Your name')+'</div>'+
      '<div class="fp-handle">@'+esc(p.handle||'handle')+(p.chapter?(' · 📍 '+esc(p.chapter)):'')+'</div>'+
      (p.story?'<div class="fp-story">'+esc(p.story)+'</div>':'')+
      '<div class="fp-stats">'+stats+'</div>'+
      '<div class="fp-actions"><button class="fp-btn" id="fpShare">↗ Share my code</button>'+
        '<button class="fp-btn ghost" id="fpEdit">✎ Edit</button></div>'+
      '<div class="fp-sect">Vehicle provenance</div>'+ prov +
      '<div class="fp-sect">VIN decoder</div>'+
      '<div class="fp-vin"><input id="fpVinIn" placeholder="Enter a Falcon VIN (e.g. 3R01F100001)" autocomplete="off">'+
        '<button class="fp-btn sm" id="fpVinGo">Decode</button></div>'+
      '<div id="fpVinOut" class="fp-vinout"></div>'+
      '<div class="fp-note">Year &amp; plant decode is high-confidence; engine letters shift by year — treat as an estimate until confirmed against your data plate. Nothing here is published without your say.</div>';
  }
  function provCard(c){
    var vin = c.vin||''; var dec = vin?decodeVIN(vin):null;
    return '<div class="fp-prov">'+
      '<div class="fp-prov-h"><b>'+esc(c.nickname||c.year+' Falcon')+'</b>'+(c.rarity?'<span class="fp-tier">'+esc(c.rarity)+'</span>':'')+'</div>'+
      '<div class="fp-prov-b">'+[c.year,c.body_style,c.trim_option,c.paint_color].filter(Boolean).map(esc).join(' · ')+'</div>'+
      (dec&&dec.ok?'<div class="fp-prov-vin">VIN '+esc(dec.vin)+' → '+esc(dec.year)+', '+esc(dec.plant)+' plant, '+esc(dec.engine)+'</div>'
        :'<div class="fp-prov-vin muted">Add this car’s VIN to build its provenance.</div>')+
    '</div>';
  }
  function formHTML(p){
    return ''+
      '<div class="fp-formtitle">'+(p.name?'Edit your profile':'Create your profile')+'</div>'+
      '<label class="fp-l">Name<input id="fpN" value="'+esc(p.name||'')+'" placeholder="Jane Falcon"></label>'+
      '<label class="fp-l">Handle<input id="fpH" value="'+esc(p.handle||'')+'" placeholder="janef"></label>'+
      '<label class="fp-l">Chapter / region<input id="fpC" value="'+esc(p.chapter||'')+'" placeholder="Northern CA"></label>'+
      '<label class="fp-l">Your story<textarea id="fpS" rows="3" placeholder="How you caught the Falcon bug…">'+esc(p.story||'')+'</textarea></label>'+
      '<div class="fp-actions"><button class="fp-btn" id="fpSave">Save profile</button></div>'+
      '<div class="fp-note">Stored on this device (Step-1). When magic-link sign-in arrives, it syncs to your account. We never publish your profile without you sharing your code.</div>';
  }
  function wireView(p){
    document.getElementById('fpEdit').onclick=function(){ var ov=document.getElementById('fpov'); ov.querySelector('.fp-card').innerHTML='<button class="fp-x" id="fpX">✕</button>'+formHTML(p); document.getElementById('fpX').onclick=close; wireForm(p); };
    document.getElementById('fpShare').onclick=function(){ var u=shareURL(p);
      if(navigator.share){ navigator.share({title:'My Ford Falcon Friends profile', url:u}).catch(function(){}); }
      else if(navigator.clipboard){ navigator.clipboard.writeText(u); if(window.toast) toast('↗ Profile link copied — your code in one link.'); }
      else if(window.toast) toast(u); };
    var go=document.getElementById('fpVinGo'), inp=document.getElementById('fpVinIn'), out=document.getElementById('fpVinOut');
    function run(){ var d=decodeVIN(inp.value); out.innerHTML = d.ok ?
      ('<div class="fp-vc"><b>'+esc(d.year)+'</b> · '+esc(d.plant)+' plant · body '+esc(d.body)+' · '+esc(d.engine)+
       ' · seq '+esc(d.seq)+(d.note?'<div class="muted">'+esc(d.note)+'</div>':'')+'</div>')
      : '<div class="fp-vc muted">'+esc(d.msg)+'</div>'; }
    if(go) go.onclick=run; if(inp) inp.onkeydown=function(e){ if(e.key==='Enter') run(); };
  }
  function wireForm(p){
    document.getElementById('fpSave').onclick=function(){
      var np={ name:val('fpN'), handle:slug(val('fpH')||val('fpN')), chapter:val('fpC'), story:val('fpS') };
      if(!np.name){ if(window.toast) toast('Add a name to save.'); return; }
      setMe(np); if(window.toast) toast('✓ Profile saved'); open();
    };
  }
  function val(id){ var e=document.getElementById(id); return e?e.value.trim():''; }
  function slug(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,20); }
  function bestRarity(cars){ if(!cars.length) return '—'; var order=['Common','Uncommon','Scarce','Rare','Very Rare','Grail']; var best=0;
    cars.forEach(function(c){ var i=order.indexOf(c.rarity); if(i>best) best=i; }); return order[best]||'—'; }
  function wantCount(){ try{ return Object.values(JSON.parse(localStorage.getItem('fff.cal.want')||'{}')).filter(Boolean).length; }catch(e){ return 0; } }
  function verifyCount(){ try{ return (JSON.parse(localStorage.getItem('fff.verify.sent')||'[]')).length; }catch(e){ return 0; } }

  window.FFFProfile = { open:open, close:close, decodeVIN:decodeVIN };
  // Deep-link: opening #p/handle shows a profile.
  if(location.hash.indexOf('#p/')===0){ document.addEventListener('DOMContentLoaded', open); }
})();
