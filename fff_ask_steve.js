/* fff_ask_steve.js — "Ask Steve": the Falcon Registry's knowledgeable friend.
   Steve's brain = today's data dump: the 1960–65 primary-source specs, PPG/Ditzler paint codes,
   VIN/axle keys, and the 3,755-record registry harvest (survivor counts by model/year).
   House rules: HONEST-STATE — every answer carries a confidence tag (VERIFIED / ESTIMATE / GAP)
   and points to its source. Uses an LLM backend if one is wired (window.cowork.askClaude or a
   Supabase 'ask-steve' edge fn); otherwise answers locally from the embedded knowledge base. */
(function(){
  'use strict';

  /* ---------- Steve's knowledge base (today's dump, distilled) ---------- */
  var KB = {
    survivors: { total:3755, source:'Falcon Registry owners harvest, 2026-07-07',
      byModel:{'2dr Sedan':1060,'Hardtop':781,'Convertible':655,'4dr Sedan':482,'Ranchero':408,'Wagon':283,'Sedan Delivery':86},
      byYear:{'1960':170,'1961':239,'1962':337,'1963':954,'1964':848,'1965':696,'1966':165,'1967':112,'1968':96,'1969':88,'1970':50},
      note:'Registry survivors on file — not total production.' },
    hp: { source:'1960–65 Ford brochures + 1965 Salesman’s booklet (VERIFIED); year-split rows pending curator ratification',
      lines:[
        '144 six: 90 hp in 1960 (debut), re-rated 85 hp from 1961 on.',
        '170 Special six: 101 hp in 1963 & 1964; 105 hp in 1965 (CR raise).',
        '200 Special six: 116 hp in 1964 (its debut year); 120 hp in 1965.',
        '260 V-8 (Challenger/Sprint): 164 hp, 1963–64.',
        '289 2-V: 200 hp (1965); 289 4-V: 225 hp (1965); 289 HP: 271 hp.'
      ] },
    paint:{ source:'PPG/Ditzler Index No.10 charts — Form 6009 (’60), 6109 (’61), 6209 (’62), 6509 (’65)',
      lines:[
        'Code convention: letter → color → refinish number. Two-tone: first letter = LOWER color, second = UPPER.',
        '1963 Falcon letters: A Raven Black · M Corinthian White · J Rangoon Red · I Champagne · Y Glacier Blue · E Viking Blue · B Peacock Blue · D Ming Green · R Tucson Yellow · T Sandshell Beige · W Rose Beige · X Heritage Burgundy.',
        'Corinthian White (M, 8230) and Raven Black (A, 9000) are stable 1960–62. GAP: a 1963/64 Ditzler chart with refinish numbers is not yet on file.'
      ] },
    dims:{ source:'1960/1963 brochures (VERIFIED)',
      lines:['Wheelbase 109.5″ across 1960–65. Sedan length 181.1–181.2″, wagon 189″, width 70.6″.',
        '1960 curb: 2,366 lb Tudor / 2,395 lb Fordor. Brake lining: 114.3 sq in (1960) → 131 sq in sixes (1961+).'] },
    vin:{ source:'Registry VIN key', lines:['VIN = [year][plant][body×2][engine][sequence]. Use the VIN decoder inside your Profile to run one.'] },
    gary:{ source:'Gary’s Garage upload, today',
      lines:['Gary’s Garage dropped a big free reference pack today: 1960–65 shop-manual scans, Ditzler paint-chip charts (’60–’62, ’65), full-line brochure pages (’60/’63/’64), and rear-axle & VIN code sheets. Grab them free under the Miracle Ticket 🎫.'] }
  };

  // Enrich Steve with the aggregate registry KB (counts only, no PII) when it's available.
  try{ fetch('fff_steve_kb.json').then(function(r){ return r.ok?r.json():null; }).then(function(j){
    if(j && j.survivors){ KB.survivors = Object.assign({}, KB.survivors, j.survivors); if(j._meta&&j._meta.source) KB.survivors.source=j._meta.source; }
  }).catch(function(){}); }catch(e){}

  var MODELS=['2dr Sedan','4dr Sedan','Hardtop','Convertible','Wagon','Ranchero','Sedan Delivery'];
  function pickModel(s){ if(/ranchero/.test(s))return 'Ranchero'; if(/sedan delivery|delivery/.test(s))return 'Sedan Delivery';
    if(/convertible|rag|drop.?top/.test(s))return 'Convertible'; if(/hardtop|sprint/.test(s))return 'Hardtop';
    if(/wagon|squire|ranch wagon/.test(s))return 'Wagon'; if(/4.?dr|fordor|four.?door/.test(s))return '4dr Sedan';
    if(/2.?dr|tudor|two.?door|sedan/.test(s))return '2dr Sedan'; return null; }

  function answer(q){
    var s=(q||'').toLowerCase();
    // VIN presence — curator-gated (we never ship names/VINs to the client)
    if(/(is|check).*(my )?vin.*(registr|on file|listed)|in the registry/.test(s) || /vin.*regist/.test(s)){
      return card('VIN in the registry?', [
        'Steve keeps the survivor COUNTS here, not the name/VIN list — that stays curator-side to protect owners’ privacy.',
        'Submit your VIN under Verify (Help the Registry) and the curator confirms a match and links you up.'
      ], 'GAP', 'Privacy rule — per-record lookups are curator-gated');
    }
    // Gary's drop / what's new
    if(/gary|drop|upload|new today|free stuff|miracle/.test(s)) return card('Gary’s Garage — today’s drop', KB.gary.lines, 'VERIFIED', KB.gary.source);
    // VIN
    if(/\bvin\b|decode|data plate/.test(s)){
      var m=(q.toUpperCase().match(/[0-9][A-Z][0-9A-Z]{3,}/)||[])[0];
      if(m && window.FFFProfile){ var d=FFFProfile.decodeVIN(m);
        if(d.ok) return card('VIN '+d.vin, [d.year+' · '+d.plant+' plant · body '+d.body+' · '+d.engine+' · seq '+d.seq, d.note].filter(Boolean), 'ESTIMATE', 'Registry VIN key (year/plant high-confidence; engine verify-by-year)'); }
      return card('VIN decoding', KB.vin.lines, 'VERIFIED', KB.vin.source);
    }
    // horsepower / engine
    if(/\bhp\b|horsepower|engine|144|170|200|260|289|six|v-?8/.test(s)) return card('Falcon engine ratings', KB.hp.lines, 'VERIFIED*', KB.hp.source);
    // paint / color
    if(/paint|color|colour|ditzler|two-?tone|code/.test(s)) return card('Paint codes', KB.paint.lines, 'VERIFIED', KB.paint.source);
    // dimensions / weight / brakes
    if(/dimension|length|width|wheelbase|weight|curb|brake|tire/.test(s)) return card('Dimensions & chassis', KB.dims.lines, 'VERIFIED', KB.dims.source);
    // survivors / rarity / how many
    if(/how many|survivor|registry|rare|rarity|produc|left|exist|count|on file/.test(s)){
      var mo=pickModel(s);
      var ym=(s.match(/\b(19)?([6-7]\d)\b/)||[]); var yr = ym[2]?('19'+ym[2]):null;
      var lines=['On file in the registry: '+KB.survivors.total+' Falcons total.'];
      if(mo && yr && KB.survivors.byModelYear && KB.survivors.byModelYear[mo]){
        var n=KB.survivors.byModelYear[mo][yr];
        lines=[ (n!=null?n:'0')+' '+yr+' '+mo+(n===1?'':'s')+' are registered.',
          mo+' total (all years): '+KB.survivors.byModel[mo]+'. '+yr+' total (all bodies): '+(KB.survivors.byYear[yr]||'—')+'.' ];
      } else if(mo){ lines.push(mo+': '+KB.survivors.byModel[mo]+' registered across all years.');
      } else if(yr && KB.survivors.byYear[yr]){ lines.push(yr+': '+KB.survivors.byYear[yr]+' registered (all body styles).'); }
      if(/engine|144|170|200|260|289|six|v-?8/.test(s) && KB.survivors.byEngine){
        var es=Object.keys(KB.survivors.byEngine).map(function(k){return k+' '+KB.survivors.byEngine[k];}).join(' · '); lines.push('By engine on file: '+es+'.'); }
      lines.push(KB.survivors.note||'Counts are registered survivors, not total production.');
      return card('Registry survivors', lines, 'VERIFIED', KB.survivors.source);
    }
    return card('Ask me about your Falcon', [
      'I know today’s data dump cold — try: “how many ’63 convertibles are in the registry?”, “what’s the 170 six HP by year?”, “decode VIN 3R01F100001”, “1963 paint codes”, or “what did Gary’s Garage upload?”'
    ], 'GAP', 'Steve’s knowledge base (today’s dump)');
  }
  function card(title, lines, conf, src){
    var tag = {'VERIFIED':'ok','VERIFIED*':'ok','ESTIMATE':'est','GAP':'gap'}[conf]||'gap';
    return '<div class="as-card"><div class="as-conf '+tag+'">'+conf+'</div>'+
      '<div class="as-title">'+esc(title)+'</div>'+
      '<ul class="as-lines">'+lines.map(function(l){return '<li>'+esc(l)+'</li>';}).join('')+'</ul>'+
      '<div class="as-src">source: '+esc(src)+(conf==='VERIFIED*'?' · year-split rows await curator ratification':'')+'</div></div>';
  }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  var THREAD=[];
  function open(seed){
    var ov=document.getElementById('asov');
    if(!ov){ ov=document.createElement('div'); ov.id='asov'; ov.className='asov'; document.body.appendChild(ov); }
    ov.innerHTML='<div class="as-sheet">'+
      '<div class="as-top"><div class="as-steve"><span class="as-face">🧑‍🔧</span><div><b>Ask Steve</b><span>Falcon registry brain · updated today</span></div></div>'+
        '<button class="fp-x" id="asX">✕</button></div>'+
      '<div class="as-thread" id="asThread"></div>'+
      '<div class="as-sug">'+['How many ’63 convertibles survive?','170 six HP by year','Decode VIN 3R01F100001','1963 paint codes','What did Gary upload?']
        .map(function(q){return '<button class="as-chip" data-q="'+esc(q)+'">'+esc(q)+'</button>';}).join('')+'</div>'+
      '<div class="as-ask"><input id="asIn" placeholder="Ask Steve about your Falcon…" autocomplete="off"><button class="fp-btn sm" id="asGo">Ask</button></div>'+
      '<div class="fp-note">Steve answers from primary sources + the registry harvest, and tags each answer’s confidence. He doesn’t make up numbers — “GAP” means we don’t have it yet.</div>'+
    '</div>';
    ov.classList.add('on');
    document.getElementById('asX').onclick=close;
    ov.onclick=function(e){ if(e.target===ov) close(); };
    ov.querySelectorAll('.as-chip').forEach(function(b){ b.onclick=function(){ ask(b.dataset.q); }; });
    document.getElementById('asGo').onclick=function(){ var i=document.getElementById('asIn'); if(i.value.trim()){ ask(i.value.trim()); i.value=''; } };
    document.getElementById('asIn').onkeydown=function(e){ if(e.key==='Enter'){ document.getElementById('asGo').click(); } };
    renderThread();
    if(seed) ask(seed);
  }
  function close(){ var ov=document.getElementById('asov'); if(ov) ov.classList.remove('on'); }
  function ask(q){
    THREAD.push({me:true, html:esc(q)});
    // LLM backend hook (progressive): use it if present, else local KB.
    if(window.cowork && typeof window.cowork.askClaude==='function'){
      renderThread(); THREAD.push({me:false, html:'<div class="as-card">…thinking…</div>'}); renderThread();
      try{ window.cowork.askClaude('You are Steve, a Ford Falcon registry expert. Answer briefly with confidence tags. Q: '+q, [KB]).then(function(r){
        THREAD[THREAD.length-1]={me:false, html:card('Steve', [String(r)], 'ESTIMATE','LLM over Steve’s KB')}; renderThread(); }).catch(function(){ THREAD[THREAD.length-1]={me:false, html:answer(q)}; renderThread(); });
      }catch(e){ THREAD[THREAD.length-1]={me:false, html:answer(q)}; renderThread(); }
      return;
    }
    THREAD.push({me:false, html:answer(q)}); renderThread();
  }
  function renderThread(){
    var t=document.getElementById('asThread'); if(!t) return;
    t.innerHTML=THREAD.map(function(m){ return '<div class="as-msg '+(m.me?'me':'steve')+'">'+m.html+'</div>'; }).join('');
    t.scrollTop=t.scrollHeight;
  }

  function mountFab(){ if(document.getElementById('asFab')) return;
    var b=document.createElement('button'); b.id='asFab'; b.className='as-fab'; b.title='Ask Steve'; b.innerHTML='🧑‍🔧'; b.onclick=function(){ open(); }; document.body.appendChild(b); }
  window.FFFAskSteve = { open:open, close:close, answer:answer };
  if(document.readyState!=='loading') mountFab(); else document.addEventListener('DOMContentLoaded', mountFab);
})();
