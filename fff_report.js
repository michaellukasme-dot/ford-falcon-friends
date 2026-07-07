/* fff_report.js — the single ingress. Every "send" (bug, feature, UX idea, question) AND every
   auto-detected error funnels to one address: HELPTEST@shakedownstreet.com, subject-tagged so it
   can be sorted on inbound. Front-end monitoring auto-cues the user to send when something breaks.
   House rules: honest-state (Step-1 = mailto; when a Supabase client exists we also queue to an `inbox`
   table for triage); nothing is sent without the user tapping Send. */
(function(){
  'use strict';
  var TO='HELPTEST@shakedownstreet.com';
  var APP=(function(){ try{ return (navigator.serviceWorker&&'fff')||'fff'; }catch(e){ return 'fff'; } })();
  var lastErr=null;
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function ctx(extra){ var p=null; try{ p=JSON.parse(localStorage.getItem('fff.profile')||'null'); }catch(e){}
    return '\n\n--- context (auto) ---\napp: Ford Falcon Friends\nurl: '+location.href+'\nwhen: '+new Date().toISOString()+
      '\nwho: '+((p&&p.handle)?('@'+p.handle):'(not signed in)')+'\nagent: '+navigator.userAgent.slice(0,140)+(extra?('\n'+extra):''); }

  function send(kind, subject, body, extra){
    var subj='['+kind+'] '+(subject||'');
    var full=(body||'')+ctx(extra);
    // Step-2: also queue to backend for triage
    try{ var sb=window.fffSB; if(sb&&sb.from){ sb.from('inbox').insert({kind:kind, subject:subj, body:full, url:location.href, ua:navigator.userAgent.slice(0,180)}).then(function(){},function(){}); } }catch(e){}
    var href='mailto:'+TO+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(full);
    location.href=href;
  }

  function compose(kind){
    var ov=document.getElementById('frepov');
    if(!ov){ ov=document.createElement('div'); ov.id='frepov'; ov.className='fpov'; document.body.appendChild(ov); }
    var kinds=[['BUG','🐞 Something’s broken'],['FEATURE','💡 I want a feature'],['UX','🎨 A UX idea'],['QUESTION','❓ A question'],['TEST','🧪 Test feedback']];
    var opts=kinds.map(function(k){return '<option value="'+k[0]+'"'+(k[0]===kind?' selected':'')+'>'+k[1]+'</option>';}).join('');
    ov.innerHTML='<div class="fp-card"><button class="fp-x" id="frX">✕</button>'+
      '<div class="fp-formtitle">Tell the team</div>'+
      '<label class="fp-l">What is it<select id="frKind">'+opts+'</select></label>'+
      '<label class="fp-l">One-line summary<input id="frSubj" placeholder="e.g. VIN decoder shows wrong year"></label>'+
      '<label class="fp-l">Details<textarea id="frBody" rows="4" placeholder="What happened, or what you’d love to see…"></textarea></label>'+
      '<div class="fp-actions"><button class="fp-btn" id="frSend">✉️ Send to the team</button></div>'+
      '<div class="fp-note">Goes to '+TO+' — one inbox, sorted on arrival. Bugs get fixed, features get spec’d into the build list, and you get the credit. Builders who feel heard stick around. We read every one.</div></div>';
    ov.classList.add('on');
    document.getElementById('frX').onclick=function(){ ov.classList.remove('on'); };
    ov.onclick=function(e){ if(e.target===ov) ov.classList.remove('on'); };
    if(lastErr && (!kind||kind==='BUG')){ var b=document.getElementById('frBody'); if(b) b.value='(auto) '+lastErr; }
    document.getElementById('frSend').onclick=function(){
      var k=document.getElementById('frKind').value, s=document.getElementById('frSubj').value.trim(), bd=document.getElementById('frBody').value.trim();
      if(!s && !bd){ if(window.toast) toast('Add a line so we know what to do.'); return; }
      send(k, s, bd); ov.classList.remove('on'); if(window.toast) toast('✉️ Thanks — sorting it now.');
    };
  }

  /* ---- front-end monitoring: auto-cue the user to send ---- */
  function banner(msg){
    if(document.getElementById('frBanner')) return;
    var b=document.createElement('div'); b.id='frBanner'; b.className='fr-banner';
    b.innerHTML='<span>⚠️ Something glitched on our end. Send it so we can fix it?</span>'+
      '<span class="fr-b-act"><button id="frbSend">Send</button><button id="frbNo" class="ghost">Dismiss</button></span>';
    document.body.appendChild(b);
    document.getElementById('frbSend').onclick=function(){ b.remove(); compose('BUG'); };
    document.getElementById('frbNo').onclick=function(){ b.remove(); };
    setTimeout(function(){ if(b.parentNode) b.remove(); }, 12000);
  }
  window.addEventListener('error', function(e){ try{ lastErr='JS error: '+(e.message||'')+' @ '+(e.filename||'').split('/').pop()+':'+(e.lineno||'')+(e.error&&e.error.stack?('\n'+String(e.error.stack).slice(0,400)):''); banner(); }catch(x){} });
  window.addEventListener('unhandledrejection', function(e){ try{ lastErr='Promise rejection: '+String(e.reason&&(e.reason.message||e.reason)).slice(0,400); banner(); }catch(x){} });
  // App code (or Supabase calls) can flag a caught error: window.fffReport('DB write failed', detailString)
  window.fffReport=function(msg, detail){ lastErr=(msg||'error')+(detail?('\n'+detail):''); banner(); };

  function injectLink(){
    var strip=document.querySelector('.fb-strip');
    if(strip && !document.getElementById('frLink')){
      var a=document.createElement('div'); a.id='frLink'; a.className='fr-link';
      a.innerHTML='Something off, or an idea? <button id="frOpen">Tell the team ✉️</button>';
      strip.appendChild(a); document.getElementById('frOpen').onclick=function(){ compose(); };
    }
  }
  window.FFFReport={ compose:compose, send:send, flag:window.fffReport };
  if(document.readyState!=='loading') injectLink(); else document.addEventListener('DOMContentLoaded', injectLink);
})();
