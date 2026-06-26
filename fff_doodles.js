/* Ford-Falcon Friends — rotating headline "doodle" hero (house-standard, mirrors dead_dance).
   Scenes live in ./doodles/. Tag one to a date (when:"MM-DD") to honor a moment; else rotate.
   >>> HEADLINE: set your own line per doodle below. Use only text you have rights to. <<< */
var FFF_DOODLES = [
  { id:"cruise", file:"doodles/fff_cruise.svg",
    headline:"",                       /* <-- set your headline here */
    caption:"the cruise",
    when:null }
];
function fffHeroEsc(t){ return String(t==null?"":t).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];}); }
function fffHeroCss(){
  if(document.getElementById("fff-hero-css"))return;
  var s=document.createElement("style"); s.id="fff-hero-css";
  s.textContent=
    "#fffHero{position:relative;width:100%;border-radius:14px;overflow:hidden;margin:0 0 14px;background:#171228;min-height:96px;box-shadow:0 6px 18px rgba(0,0,0,.22)}"+
    "#fffHero svg{display:block;width:100%;height:auto}"+
    "#fffHero .fff-head{position:absolute;top:0;left:0;right:0;text-align:center;padding:9px 14px 22px;"+
      "font-family:'Snell Roundhand','Brush Script MT','Segoe Script',cursive;font-size:23px;line-height:1.15;"+
      "color:#ffe9c7;text-shadow:0 2px 10px rgba(0,0,0,.65);background:linear-gradient(rgba(20,16,32,.7),transparent);pointer-events:none}"+
    "#fffHero .fff-cap{position:absolute;bottom:7px;right:12px;font-family:Georgia,serif;font-size:11px;color:#ecdfc6;opacity:.85;text-shadow:0 1px 4px rgba(0,0,0,.7);pointer-events:none}";
  document.head.appendChild(s);
}
function fffHeroPick(){
  var t=new Date();
  var mmdd=("0"+(t.getMonth()+1)).slice(-2)+"-"+("0"+t.getDate()).slice(-2);
  for(var i=0;i<FFF_DOODLES.length;i++){ if(FFF_DOODLES[i].when===mmdd) return FFF_DOODLES[i]; }
  var ever=FFF_DOODLES.filter(function(d){ return !d.when; }); if(!ever.length) ever=FFF_DOODLES;
  var doy=Math.floor((t-new Date(t.getFullYear(),0,0))/864e5);
  return ever[doy%ever.length];
}
function fffHeroMount(){
  var host=document.getElementById("fffHero"); if(!host)return;
  fffHeroCss();
  var d=fffHeroPick();
  if(typeof fetch!=="function"){ host.style.display="none"; return; }
  var paint=function(svg){ host.style.display=""; host.innerHTML=svg+
    (d.headline?'<div class="fff-head">'+fffHeroEsc(d.headline)+'</div>':"")+
    (d.caption?'<div class="fff-cap">'+fffHeroEsc(d.caption)+'</div>':""); };
  try{
    fetch(d.file).then(function(r){ return r.text(); })
      .then(function(svg){ if(svg&&svg.indexOf("<svg")>=0) paint(svg); else host.style.display="none"; })
      .catch(function(){ host.style.display="none"; });
  }catch(e){ host.style.display="none"; }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){setTimeout(fffHeroMount,300);});
else setTimeout(fffHeroMount,300);
