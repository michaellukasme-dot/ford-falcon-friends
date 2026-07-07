/* fff_helptest.js — Ford Falcon Friends "Help Test" surface.
   Ported from the Shakedown helptest.js pattern: a non-blocking docked FAB, one task at a time,
   👍 Worked / 👎 Broke + optional note, offline localStorage cache, best-effort push to Supabase
   when a client + RPC exist. "📤 Send to Claude" copies the report (no email). Honest-state.
   Docked bottom-LEFT so it doesn't collide with the Miracle 🎫 / Ask Steve FABs (bottom-right). */
(function(){
  'use strict';
  var CONSOLES = {
    garage:   { ic:'🚗', name:'My Garage',      tasks:['Add a car with the rarity engine','Edit a car and re-save','Confirm the rarity badge/tier shows'] },
    profile:  { ic:'👤', name:'Profile / QR',    tasks:['Open your profile from the 👤 button','Create/edit + save your profile','Scan or copy your QR share link','Check a car’s provenance card'] },
    calendar: { ic:'📅', name:'Calendar',        tasks:['Open the calendar (📅 or left rail)','Filter by Shows/Meets/Cruises/Swaps','RSVP an event and see it toggle'] },
    vin:      { ic:'🔎', name:'VIN decoder',      tasks:['Open VIN (routes into Profile)','Decode a VIN e.g. 3R01F100001','Confirm year + plant read correctly'] },
    steve:    { ic:'🧑‍🔧', name:'Ask Steve',       tasks:['Open Ask Steve','Ask a suggested question','Confirm each answer shows a confidence tag + source'] },
    miracle:  { ic:'🎫', name:'Miracle Ticket',   tasks:['Open Miracle Ticket (🎫)','Grab an item, then release it','See Gary’s Garage featured drop'] },
    verify:   { ic:'✅', name:'Help the Registry',tasks:['Open Verify','Read an open ASK','Confirm submissions say “pending curator”'] }
  };
  var ORDER = ['garage','profile','calendar','vin','steve','miracle','verify'];
  var DONE = load('fff.qa.done', {});
  function load(k,d){ try{ return JSON.parse(localStorage.getItem(k)||JSON.stringify(d)); }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem('fff.qa.done', JSON.stringify(DONE)); }catch(e){} }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function openOv(){
    var ov=document.getElementById('fqaov');
    if(!ov){ ov=document.createElement('div'); ov.id='fqaov'; ov.className='asov'; document.body.appendChild(ov); }
    var body = ORDER.map(function(k){
      var c=CONSOLES[k];
      var rows=c.tasks.map(function(t,i){ var id=k+'.'+i; var v=DONE[id];
        return '<div class="fqa-task"><span>'+esc(t)+'</span>'+
          '<span class="fqa-btns"><button class="fqa-y'+(v==='y'?' on':'')+'" data-id="'+id+'" data-v="y">👍</button>'+
          '<button class="fqa-n'+(v==='n'?' on':'')+'" data-id="'+id+'" data-v="n">👎</button></span></div>'; }).join('');
      return '<div class="fqa-con"><div class="fqa-con-h">'+c.ic+' '+esc(c.name)+'</div>'+rows+'</div>';
    }).join('');
    var done=Object.keys(DONE).length, total=ORDER.reduce(function(a,k){return a+CONSOLES[k].tasks.length;},0);
    ov.innerHTML='<div class="as-sheet">'+
      '<div class="as-top"><div class="as-steve"><span class="as-face">🧪</span><div><b>Help Test</b><span>'+done+' / '+total+' checked · tap 👍/👎</span></div></div>'+
        '<button class="fp-x" id="fqaX">✕</button></div>'+
      '<label class="fp-l" style="margin-bottom:8px">Notes (optional)<textarea id="fqaNote" rows="2" placeholder="What broke? What felt off?">'+esc(load('fff.qa.note','')||'')+'</textarea></label>'+
      '<div class="fqa-list">'+body+'</div>'+
      '<div class="fp-actions" style="justify-content:space-between;margin-top:12px">'+
        '<button class="fp-btn ghost sm" id="fqaClear">Reset</button>'+
        '<button class="fp-btn sm" id="fqaSend">📤 Send to Claude</button></div>'+
      '<div class="fp-note">Runs offline — saved on this device and pushed to the registry backend when you’re online. Nothing you flag is published; it goes to the curator.</div>'+
    '</div>';
    ov.classList.add('on');
    document.getElementById('fqaX').onclick=closeOv;
    ov.onclick=function(e){ if(e.target===ov) closeOv(); };
    ov.querySelectorAll('.fqa-y,.fqa-n').forEach(function(b){ b.onclick=function(){ var id=b.dataset.id, v=b.dataset.v;
      DONE[id]=(DONE[id]===v?undefined:v); if(DONE[id]===undefined) delete DONE[id]; save(); push(id,v); openOv(); }; });
    document.getElementById('fqaNote').oninput=function(e){ try{ localStorage.setItem('fff.qa.note', JSON.stringify(e.target.value)); }catch(x){} };
    document.getElementById('fqaClear').onclick=function(){ DONE={}; save(); openOv(); };
    document.getElementById('fqaSend').onclick=sendReport;
  }
  function closeOv(){ var ov=document.getElementById('fqaov'); if(ov) ov.classList.remove('on'); }

  function push(id,v){ try{ var sb=window.fffSB; if(sb&&sb.from){ sb.from('qa_reports').insert({surface:id.split('.')[0], task:id, verdict:v, ua:navigator.userAgent.slice(0,120)}).then(function(){},function(){}); } }catch(e){} }
  function sendReport(){
    var note=(load('fff.qa.note','')||''); var lines=['Ford Falcon Friends — Help Test report', new Date().toISOString(),''];
    ORDER.forEach(function(k){ var c=CONSOLES[k]; c.tasks.forEach(function(t,i){ var v=DONE[k+'.'+i]; if(v) lines.push((v==='y'?'👍':'👎')+' ['+c.name+'] '+t); }); });
    if(note) lines.push('', 'Notes: '+note);
    var out=lines.join('\n');
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(out); if(window.toast) toast('📤 Report copied — paste it to Claude or the curator.'); }
    else if(window.toast) toast(out);
  }
  function mountFab(){ if(document.getElementById('fqaFab')) return;
    var b=document.createElement('button'); b.id='fqaFab'; b.className='fqa-fab'; b.title='Help Test'; b.innerHTML='🧪'; b.onclick=openOv; document.body.appendChild(b); }
  window.FFFHelpTest = { open:openOv, close:closeOv, set:function(k,v){ CONSOLES[k]=v; if(ORDER.indexOf(k)<0) ORDER.push(k); } };
  if(document.readyState!=='loading') mountFab(); else document.addEventListener('DOMContentLoaded', mountFab);
})();
