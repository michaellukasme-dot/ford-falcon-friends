/* fff_share.js — one-click "Share result". NO editing at the button.
   The networks ("Coms") are set up ONCE in the user profile (localStorage 'fff.coms').
   Every Share button reads those, and Claude pre-composes DIFFERENTIATED copy per channel
   (long post vs short blurb vs email subject/body vs SMS), then one tap fans it out.
   Honest mechanism: on a phone the native share sheet reaches any app in one tap; enabled
   direct channels (Facebook / X / WhatsApp / Email / SMS) also fire. True silent background
   posting needs each network's OAuth connect (Step-2). Portable to Shakedown as-is. */
(function(){
  'use strict';
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function coms(){ try{ return JSON.parse(localStorage.getItem('fff.coms')||'null') || {native:true,facebook:true,email:true,sms:false,x:false,whatsapp:false}; }catch(e){ return {native:true,facebook:true}; } }

  // Claude-differentiated variants per channel — composed from the payload, no user input.
  function variants(p){
    var t=p.title||'Ford Falcon Friends', b=(p.text||'').trim(), url=p.url||location.href, tags=(p.tags||'#FordFalcon #FalconFriends');
    return {
      full:  t + (b?('\n\n'+b):'') + '\n\n' + url,               // Facebook / email body / native
      short: (t + (b?(' — '+b):'')).slice(0,170) + ' ' + tags,   // X / SMS
      subject: t, url: url
    };
  }
  function share(p){
    p=p||{}; var v=variants(p), c=coms(), any=false;
    if(c.native && navigator.share){ navigator.share({title:p.title||'',text:v.full,url:v.url}).catch(function(){}); any=true; }
    if(c.facebook){ open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(v.url)); any=true; }
    if(c.x){ open('https://twitter.com/intent/tweet?text='+encodeURIComponent(v.short)+'&url='+encodeURIComponent(v.url)); any=true; }
    if(c.whatsapp){ open('https://wa.me/?text='+encodeURIComponent(v.short+' '+v.url)); any=true; }
    if(c.email){ location.href='mailto:?subject='+encodeURIComponent(v.subject)+'&body='+encodeURIComponent(v.full); any=true; }
    if(c.sms){ location.href='sms:?&body='+encodeURIComponent(v.short+' '+v.url); any=true; }
    if(!any || (!navigator.share && !c.facebook)){ try{ if(navigator.clipboard) navigator.clipboard.writeText(v.full); }catch(e){} }
    if(window.toast) toast('↗ Shared to your Coms — one tap, differentiated per channel.');
  }
  function open(u){ try{ window.open(u,'_blank','noopener'); }catch(e){} }

  function button(p){ var enc=encodeURIComponent(JSON.stringify(p||{})); return '<button class="ffsh-btn" data-share="'+esc(enc)+'">↗ Share result</button>'; }
  function wire(scope){ (scope||document).querySelectorAll('.ffsh-btn[data-share]').forEach(function(b){ if(b.__w) return; b.__w=1; b.onclick=function(){ var p={}; try{ p=JSON.parse(decodeURIComponent(b.dataset.share)); }catch(e){} share(p); }; }); }
  function autoWire(){ wire(document); }
  window.FFShare={ share:share, button:button, wire:wire, coms:coms };
  if(document.readyState!=='loading') autoWire(); else document.addEventListener('DOMContentLoaded', autoWire);
  try{ new MutationObserver(autoWire).observe(document.body,{childList:true,subtree:true}); }catch(e){}
})();
