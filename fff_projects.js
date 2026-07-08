/* Ford Falcon Friends — per-car PROJECT LOG.
   Each car in My Garage gets a "Projects completed" log (parts, cost, vendor, links).
   Data: localStorage['fff.projects'] = { <carNick>: [ {title, items:[{text,cost,link}], ts} ] }.
   Seeds once from fff_projects_seed.json (the owner's real Falcon projects). Step-1 local;
   syncs to the account when sign-in lands. Rendered inside each car's Badge (the QR-is-the-car modal). */
(function(){
  var LS='fff.projects', SEEDED='fff.projects.seeded';
  function store(){ try{ return JSON.parse(localStorage.getItem(LS)||'{}'); }catch(e){ return {}; } }
  function save(o){ try{ localStorage.setItem(LS, JSON.stringify(o)); }catch(e){} }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function money(items){ var t=0; (items||[]).forEach(function(it){ var m=(it.cost||'').replace(/[^0-9.]/g,''); if(m){ var v=parseFloat(m); if(!isNaN(v)) t+=v; } }); return Math.round(t); }
  function get(key){ return (store()[key]||[]); }
  function sid(key){ return (key||'').replace(/[^a-z0-9]/gi,''); }

  function css(){ if(document.getElementById('fpj-css')) return; var s=document.createElement('style'); s.id='fpj-css';
    s.textContent=
    '.fpj-wrap{margin-top:2px}'+
    '.fpj{border:1px solid var(--line);border-radius:12px;margin-bottom:8px;overflow:hidden;background:#fff}'+
    '.fpj-h{width:100%;border:0;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;cursor:pointer;font-family:inherit;text-align:left}'+
    '.fpj-h b{font-size:.86rem;color:var(--maroon)}'+
    '.fpj-h span{font-size:.68rem;color:var(--subtle);white-space:nowrap;font-weight:700}'+
    '.fpj-b{border-top:1px solid var(--line);padding:8px 12px;background:#fffdf9}'+
    '.fpj-it{font-size:.76rem;color:var(--ink);padding:5px 0;border-bottom:1px dashed var(--line);line-height:1.35}'+
    '.fpj-it:last-child{border-bottom:0}'+
    '.fpj-it b{color:var(--gold-deep)}'+
    '.fpj-it a{color:var(--maroon);text-decoration:none;font-weight:800}'+
    '.fpj-tot{font-size:.72rem;color:var(--subtle);margin:2px 2px 8px;font-weight:700}';
    document.head.appendChild(s); }

  function projCard(pr, key, pi){
    var items=pr.items||[]; var total=money(items); var id=sid(key)+'-'+pi;
    return '<div class="fpj">'+
      '<button class="fpj-h" data-b="fpjb-'+id+'"><b>'+esc(pr.title||'Project')+'</b>'+
        '<span>'+items.length+' item'+(items.length===1?'':'s')+(total?(' · $'+total.toLocaleString()):'')+' ▾</span></button>'+
      '<div class="fpj-b" id="fpjb-'+id+'" style="display:none">'+
        (items.length?items.map(function(it){
          var l=it.link?(' <a href="'+esc(it.link)+'" target="_blank" rel="noopener nofollow">↗</a>'):'';
          return '<div class="fpj-it">'+esc(it.text||'')+(it.cost?(' <b>'+esc(it.cost)+'</b>'):'')+l+'</div>';
        }).join(''):'<div class="fpj-it" style="color:var(--subtle)">No parts logged yet — add them as you go.</div>')+
      '</div></div>';
  }

  function sectionHTML(key){
    css();
    var list=get(key);
    var grand=0; list.forEach(function(pr){ grand+=money(pr.items||[]); });
    var body=list.length ? list.map(function(pr,pi){ return projCard(pr,key,pi); }).join('') :
      '<div class="fp-empty">No projects logged for this car yet — start the log below.</div>';
    return '<div class="fpj-wrap" data-carkey="'+esc(key)+'">'+
      (grand?'<div class="fpj-tot">🔧 '+list.length+' projects · ~$'+grand.toLocaleString()+' logged</div>':'')+
      body+
      '<button class="fp-btn ghost fpj-add" style="width:100%;margin-top:8px">＋ Log a project</button></div>';
  }

  function wire(root, key){
    if(!root) return;
    root.querySelectorAll('.fpj-h').forEach(function(h){ h.onclick=function(){ var b=document.getElementById(h.getAttribute('data-b')); if(b) b.style.display=(b.style.display==='none'?'block':'none'); }; });
    var add=root.querySelector('.fpj-add');
    if(add) add.onclick=function(){
      var title=window.prompt('Project name (e.g. "Front disc brake conversion")'); if(!title) return;
      var s=store(); (s[key]=s[key]||[]).unshift({title:title.trim(), items:[], ts:Date.now()}); save(s);
      var wrap=root.querySelector('.fpj-wrap');
      if(wrap){ var holder=document.createElement('div'); holder.innerHTML=sectionHTML(key); wrap.parentNode.replaceChild(holder.firstChild, wrap); wire(root, key); }
      if(window.toast) toast('✓ Project logged — open it to add parts');
    };
  }

  function seedOnce(){
    if(localStorage.getItem(SEEDED)) return;
    fetch('fff_projects_seed.json').then(function(r){ return r.json(); }).then(function(seed){
      var s=store();
      Object.keys(seed).forEach(function(k){ if(k==='_shared') return; if(!s[k]) s[k]=(seed[k].projects||[]); });
      // attach the all-years spend log under the Convertible (or first car)
      if(seed._shared && seed._shared.projects){
        var host = s['Convertible'] ? 'Convertible' : Object.keys(seed).filter(function(k){return k!=='_shared';})[0];
        if(host) s[host]=(s[host]||[]).concat(seed._shared.projects);
      }
      save(s);
      // only auto-add the owner's cars when the garage is empty (a real user's own cars are never overwritten)
      try{
        var g=JSON.parse(localStorage.getItem('fff_garage')||'[]');
        if(!g.length){ Object.keys(seed).forEach(function(k){ if(k!=='_shared' && seed[k].car) g.push(seed[k].car); }); localStorage.setItem('fff_garage', JSON.stringify(g)); }
      }catch(e){}
      localStorage.setItem(SEEDED,'1');
      if(typeof window.renderGarage==='function') window.renderGarage();
    }).catch(function(){});
  }

  window.FFFProjects = { sectionHTML:sectionHTML, wire:wire, get:get };
  if(document.readyState!=='loading') seedOnce(); else document.addEventListener('DOMContentLoaded', seedOnce);
})();
