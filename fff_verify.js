/* ============================================================================
   fff_verify.js — "Help the Registry" — the ASK-THE-COMMUNITY surface.
   v1.0 · 2026-07-07 · Ford-Falcon Friends

   Community that helps the community builds strong ties to that community.

   Honest-state, enforced end to end:
     • Nothing here is published as fact. Every submission is stored PENDING and
       a human curator ratifies before it appears (accountable-human rule).
     • Consent + contributor terms are REQUIRED to submit.
     • We solicit no third-party PII. Photo file-upload is counsel-gated: v1 takes
       a "I can send a photo" offer + optional contact so a curator follows up.
     • Supabase-backed when online; falls back to a local queue offline (Step-1),
       never losing a contribution.

   House pattern (mirrors lukas_gateway.js): scoped CSS under .fv-root, no globals
   but window.FFFVerify, pure event delegation, defensive mount, namespaced storage.

   USAGE:
     FFFVerify.mount("#verifyMount");                 // the board + forms
     FFFVerify.openFor("B1");                          // open the form for one ask
     <button data-verify="B1">Help verify this</button> // inline trigger anywhere
   ============================================================================ */
(function () {
  "use strict";
  if (typeof window === "undefined") return;
  if (window.FFFVerify && window.FFFVerify.__v) return;

  var CFG = window.FFF || {};
  var LSKEY = "fff:verify:queue:v1";
  var SB = null, ROOT = null, ASKS = null, OPEN = {}; // OPEN[askId] = true when form shown

  /* mirror of DISCREPANCY_REGISTER.md — used offline / before Supabase answers */
  var FALLBACK_ASKS = [
    { id: "A1", title: "1970½ Falcon VIN + data plate photo", state: "gap", need: "A clear photo of a 1970½ Falcon VIN plate and driver's-door data plate — we can't decode that unique one-year body yet.", evidence: "Photo of the VIN tag + Warranty/Certification data plate" },
    { id: "B1", title: "1964½ Mustang early hardtop count", state: "disputed", need: "Sources split 92,705 vs 97,705 (→ subset total 121,538 vs 126,538). Which is right?", evidence: "FCA 'March 2020 Production Numbers' article, a Ford build record, or a Marti-type report" },
    { id: "B4", title: "Mercury Comet body-style splits (1960–65)", state: "gap", need: "We can't find per-body-style production counts for the Comet by year. Do you have them with a source?", evidence: "Gunnell Standard Catalog, a Comet club figure, or factory literature" },
    { id: "C1", title: "Mustang 200 six (T-code) horsepower", state: "disputed", need: "Sources say 116 vs 120 hp. Which is the Ford figure?", evidence: "Ford spec sheet / FCA 'Horsepower by the Numbers'" }
  ];

  function sb() {
    if (SB) return SB;
    try { if (window.supabase && CFG.SUPABASE_URL) SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); } catch (e) {}
    return SB;
  }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeUrl(u) { u = String(u || "").trim(); return /^https?:\/\//i.test(u) ? u : ""; }
  function q(name, scope) { return (scope || ROOT).querySelector('[data-fld="' + name + '"]'); }

  function injectStyle() {
    if (document.getElementById("fv-style")) return;
    var css =
      ".fv-root{--fv-maroon:#5e1c21;--fv-gold:#c9a24a;--fv-ink:#221a17;--fv-muted:#7a6f68;--fv-line:#e7ddd2;--fv-card:#fff;--fv-bg:#f7f1e8;" +
      "font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--fv-ink);box-sizing:border-box}" +
      ".fv-root *{box-sizing:border-box}" +
      ".fv-hdr{font-weight:800;font-size:22px;color:var(--fv-maroon);margin:0 0 4px}" +
      ".fv-sub{color:var(--fv-muted);font-size:14.5px;margin:0 0 12px}" +
      ".fv-honest{background:#fbf4e6;border:1px solid #ecd9ab;border-left:4px solid var(--fv-gold);border-radius:10px;padding:11px 13px;font-size:13px;color:#6b531a;margin:0 0 16px}" +
      ".fv-honest b{color:#4d3a09}" +
      ".fv-card{background:var(--fv-card);border:1px solid var(--fv-line);border-radius:14px;padding:14px 16px;margin:0 0 12px;box-shadow:0 2px 12px rgba(60,30,20,.04)}" +
      ".fv-top{display:flex;align-items:center;gap:9px;flex-wrap:wrap}" +
      ".fv-chip{font-size:11px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;padding:3px 9px;border-radius:20px}" +
      ".fv-chip.gap{background:#eee;color:#555}.fv-chip.disputed{background:#fbe3d0;color:#9a3b12}.fv-chip.estimate{background:#fdf3d6;color:#7a5a14}.fv-chip.verified{background:#dff1e5;color:#245c3c}" +
      ".fv-t{font-weight:800;font-size:16px;color:var(--fv-ink)}" +
      ".fv-need{font-size:14.5px;color:#3a322d;margin:8px 0 4px}" +
      ".fv-ev{font-size:12.5px;color:var(--fv-muted)}.fv-ev b{color:#4a4038}" +
      ".fv-btn{margin-top:11px;border:none;border-radius:22px;padding:9px 16px;font-weight:800;font-size:14px;color:#fff;background:var(--fv-maroon);cursor:pointer}" +
      ".fv-btn:active{opacity:.85}.fv-btn.sec{background:#ece4d8;color:#5a4f47}" +
      ".fv-form{margin-top:12px;border-top:1px dashed var(--fv-line);padding-top:12px;display:none}" +
      ".fv-form.on{display:block}" +
      ".fv-row{margin:0 0 9px}.fv-row label{display:block;font-size:12.5px;font-weight:700;color:#5a4f47;margin:0 0 3px}" +
      ".fv-root input[type=text],.fv-root input[type=url],.fv-root textarea{width:100%;border:1px solid var(--fv-line);border-radius:10px;padding:9px 11px;font-size:14px;font-family:inherit;outline:none;background:#fff}" +
      ".fv-root textarea{min-height:60px;resize:vertical}" +
      ".fv-root input:focus,.fv-root textarea:focus{border-color:var(--fv-gold)}" +
      ".fv-ck{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:#3a322d;cursor:pointer;background:#faf5ec;border:1px solid var(--fv-line);border-radius:10px;padding:10px 12px}" +
      ".fv-ck input{margin-top:2px}" +
      ".fv-ck a{color:var(--fv-maroon);font-weight:700}" +
      ".fv-terms{display:none;font-size:12px;color:var(--fv-muted);background:#fff;border:1px solid var(--fv-line);border-radius:10px;padding:10px 12px;margin-top:7px;line-height:1.5}" +
      ".fv-terms.on{display:block}" +
      ".fv-err{color:#9a3b12;font-size:12.5px;font-weight:700;margin-top:7px;display:none}.fv-err.on{display:block}" +
      ".fv-ok{background:#dff1e5;border:1px solid #b6dcc4;border-radius:10px;padding:11px 13px;color:#245c3c;font-size:13.5px;margin-top:10px;display:none}.fv-ok.on{display:block}" +
      ".fv-approved{margin-top:10px;border-top:1px solid var(--fv-line);padding-top:9px}" +
      ".fv-approved .a{font-size:13px;color:#245c3c;margin:4px 0}.fv-approved .a b{color:#1a3d29}" +
      ".fv-mini{font-size:11.5px;color:var(--fv-muted);margin-top:4px}" +
      ".fv-fab{position:fixed;right:16px;bottom:76px;z-index:900;background:var(--fv-maroon);color:#fff;border:none;border-radius:24px;padding:11px 16px;font-weight:800;box-shadow:0 8px 24px rgba(94,28,33,.4);cursor:pointer;display:none}";
    var st = document.createElement("style"); st.id = "fv-style"; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function chip(state) { var s = (state || "open").toLowerCase(); var lbl = { gap: "Data gap", disputed: "Sources conflict", estimate: "Estimate", verified: "Verified", open: "Open" }[s] || s; return '<span class="fv-chip ' + esc(s) + '">' + esc(lbl) + "</span>"; }

  function cardHtml(a) {
    return '<div class="fv-card" data-ask="' + esc(a.id) + '">' +
      '<div class="fv-top">' + chip(a.state) + '<span class="fv-t">' + esc(a.title) + "</span></div>" +
      '<div class="fv-need">' + esc(a.need) + "</div>" +
      '<div class="fv-ev"><b>What settles it:</b> ' + esc(a.evidence || "a citation or a photo") + "</div>" +
      '<button class="fv-btn" data-act="open" data-ask="' + esc(a.id) + '">Help verify this ▸</button>' +
      '<div class="fv-approved" data-fld="appr-' + esc(a.id) + '"></div>' +
      formHtml(a) +
      "</div>";
  }

  function formHtml(a) {
    var id = esc(a.id);
    return '<div class="fv-form" data-fld="form-' + id + '">' +
      '<div class="fv-row"><label>The answer / value you know</label><input type="text" data-fld="value" placeholder="e.g. 97,705 hardtops"></div>' +
      '<div class="fv-row"><label>Your source (who/what says so)</label><input type="text" data-fld="source" placeholder="e.g. FCA National Falcon News, Mar 2020"></div>' +
      '<div class="fv-row"><label>Link to evidence (optional)</label><input type="url" data-fld="url" placeholder="https://…"></div>' +
      '<div class="fv-row"><label class="fv-ck"><input type="checkbox" data-fld="hasphoto"> <span>I have a <b>photo</b> (VIN plate, door tag, brochure) I can send — a curator will follow up. <span class="fv-mini">(Direct photo upload is coming; kept off for now for privacy/legal review.)</span></span></label></div>' +
      '<div class="fv-row" data-fld="contactrow" style="display:none"><label>How can a curator reach you? (optional)</label><input type="text" data-fld="contact" placeholder="email or club/handle"></div>' +
      '<div class="fv-row"><label>Notes (optional)</label><textarea data-fld="note" placeholder="Anything else that helps — VIN, where you saw it, caveats…"></textarea></div>' +
      '<div class="fv-row"><label>Your name/handle for credit (optional)</label><input type="text" data-fld="by" placeholder="so we can thank you"></div>' +
      '<label class="fv-ck"><input type="checkbox" data-fld="consent"> <span>I confirm I have the right to share this, it\'s accurate to the best of my knowledge, and I agree to the <a data-act="terms" data-ask="' + id + '">contributor terms</a> (grant Ford-Falcon Friends a license to use it, with attribution).</span></label>' +
      '<div class="fv-terms" data-fld="terms-' + id + '">By submitting you confirm the information/photo is yours to share or is factual public data, contains no one else\'s private information, and you grant Ford-Falcon Friends a non-exclusive, royalty-free license to publish and adapt it (credited to your handle where given). Nothing is published as fact until a human curator verifies it. You can ask us to remove your contribution at any time. Full Contributor Terms: 00_Admin/legal/CONTRIBUTOR_TERMS_help_verify.md.</div>' +
      '<div class="fv-err" data-fld="err">Please add some evidence and check the consent box.</div>' +
      '<div style="margin-top:11px;display:flex;gap:8px">' +
      '<button class="fv-btn" data-act="submit" data-ask="' + id + '">Send to the curators ▸</button>' +
      '<button class="fv-btn sec" data-act="cancel" data-ask="' + id + '">Cancel</button></div>' +
      '<div class="fv-ok" data-fld="ok">Thank you 🌹 — stored for a curator to review. Nothing is published as fact until a human verifies it.</div>' +
      "</div>";
  }

  function renderBoard() {
    if (!ROOT) return;
    var list = ASKS && ASKS.length ? ASKS : FALLBACK_ASKS;
    ROOT.classList.add("fv-root");
    ROOT.innerHTML =
      '<div class="fv-hdr">Help the Registry</div>' +
      '<div class="fv-sub">Community that helps the community builds strong ties to that community. Here\'s what we\'re trying to nail down — if you can prove it, feed us.</div>' +
      '<div class="fv-honest"><b>Honest-state:</b> production figures here are <b>estimates</b> until confirmed. Nothing you send is published as fact until a real person on our side checks it. We never post as you and never ask for anyone else\'s private info.</div>' +
      list.map(cardHtml).join("");
    // re-open any forms that were open, and load approved answers
    list.forEach(function (a) { if (OPEN[a.id]) toggleForm(a.id, true); loadApproved(a.id); });
  }

  function toggleForm(askId, on) {
    var f = q("form-" + askId); if (!f) return;
    OPEN[askId] = on; f.classList.toggle("on", on);
    if (on) { var v = q("value", f); if (v) try { v.focus(); } catch (e) {} }
  }

  async function loadAsks() {
    var c = sb();
    if (c) { try { var r = await c.from("data_asks").select("*").eq("status", "open").order("sort", { ascending: true }); if (!r.error && r.data && r.data.length) return r.data; } catch (e) {} }
    return FALLBACK_ASKS.slice();
  }
  async function loadApproved(askId) {
    var c = sb(); if (!c) return;
    try {
      var r = await c.from("verifications").select("value,source,url,by_handle,note").eq("ask_id", askId).eq("status", "approved");
      if (r.error || !r.data || !r.data.length) return;
      var box = q("appr-" + askId); if (!box) return;
      box.innerHTML = '<div class="fv-mini" style="font-weight:700;color:#245c3c">Community-verified so far:</div>' +
        r.data.map(function (v) { return '<div class="a">✓ <b>' + esc(v.value || v.source || "confirmed") + "</b>" + (v.source ? " — " + esc(v.source) : "") + (v.by_handle ? ' <span class="fv-mini">(thanks, ' + esc(v.by_handle) + ")</span>" : "") + "</div>"; }).join("");
    } catch (e) {}
  }

  function queueLocal(rec) { try { var a = JSON.parse(localStorage.getItem(LSKEY) || "[]"); a.push(rec); localStorage.setItem(LSKEY, JSON.stringify(a)); } catch (e) {} }

  async function doSubmit(askId, form) {
    var err = q("err", form), okEl = q("ok", form);
    var rec = {
      ask_id: askId,
      value: (q("value", form) || {}).value || "",
      source: (q("source", form) || {}).value || "",
      url: safeUrl((q("url", form) || {}).value || ""),
      has_photo: !!((q("hasphoto", form) || {}).checked),
      contact: (q("contact", form) || {}).value || "",
      note: (q("note", form) || {}).value || "",
      by_handle: (q("by", form) || {}).value || "",
      consent: !!((q("consent", form) || {}).checked),
      license: "cc-by-attribution",
      status: "pending"
    };
    var hasEvidence = rec.value || rec.source || rec.url || rec.note || rec.has_photo;
    if (!rec.consent || !hasEvidence) { if (err) err.classList.add("on"); return; }
    if (err) err.classList.remove("on");
    // Supabase insert; offline → local queue. Never lose the contribution.
    var online = false, c = sb();
    if (c) { try { var r = await c.from("verifications").insert([rec]); online = !r.error; if (r.error) queueLocal(rec); } catch (e) { queueLocal(rec); } }
    else queueLocal(rec);
    if (okEl) { okEl.textContent = online ? "Thank you 🌹 — stored for a curator to review. Nothing is published as fact until a human verifies it." : "Thank you 🌹 — saved on this device and will sync when you're back online. A curator reviews before anything becomes fact."; okEl.classList.add("on"); }
    // clear inputs
    ["value", "source", "url", "note", "by", "contact"].forEach(function (n) { var el = q(n, form); if (el) el.value = ""; });
    var cs = q("consent", form); if (cs) cs.checked = false;
    var hp = q("hasphoto", form); if (hp) hp.checked = false;
    var cr = q("contactrow", form); if (cr) cr.style.display = "none";
  }

  function onClick(e) {
    var el = e.target.closest && e.target.closest("[data-act]"); if (!el || !ROOT.contains(el)) return;
    var a = el.getAttribute("data-act"), askId = el.getAttribute("data-ask");
    if (a === "open") { toggleForm(askId, true); }
    else if (a === "cancel") { toggleForm(askId, false); }
    else if (a === "terms") { var t = q("terms-" + askId); if (t) t.classList.toggle("on"); }
    else if (a === "submit") { var f = q("form-" + askId); if (f) doSubmit(askId, f); }
  }
  function onChange(e) {
    var el = e.target; if (!el.getAttribute) return;
    if (el.getAttribute("data-fld") === "hasphoto") { var f = el.closest(".fv-form"); var cr = f && q("contactrow", f); if (cr) cr.style.display = el.checked ? "" : "none"; }
  }

  function mount(elOrSel) {
    injectStyle();
    ROOT = (typeof elOrSel === "string") ? document.querySelector(elOrSel) : elOrSel;
    if (!ROOT || !ROOT.nodeType) { if (window.console) console.warn("[FFFVerify] mount target not found"); return; }
    ROOT.addEventListener("click", onClick);
    ROOT.addEventListener("change", onChange);
    renderBoard(); // paint immediately with fallback
    loadAsks().then(function (a) { ASKS = a; renderBoard(); }); // then refresh from Supabase
  }

  function openFor(askId) {
    // ensure the Verify tab/panel is showing if the app exposes a switcher
    try { if (typeof window.showPanel === "function") window.showPanel("verify"); } catch (e) {}
    if (!ROOT) { var m = document.getElementById("verifyMount"); if (m) mount(m); }
    if (!ROOT) return;
    toggleForm(askId, true);
    var card = ROOT.querySelector('.fv-card[data-ask="' + askId + '"]');
    if (card && card.scrollIntoView) try { card.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
  }

  // inline triggers anywhere on the page: <button data-verify="B1">…</button>
  function wireInline() {
    document.addEventListener("click", function (e) {
      var el = e.target.closest && e.target.closest("[data-verify]"); if (!el) return;
      e.preventDefault(); openFor(el.getAttribute("data-verify"));
    });
  }

  window.FFFVerify = { __v: "1.0", mount: mount, openFor: openFor };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireInline); else wireInline();
})();
