/* Truleigh Manor Farm — Safety Training App
   Self-contained client-side app. Progress is saved in this browser
   (localStorage). No server required. */
(function () {
  "use strict";

  var STORE_KEY = "tmf_training_v1";
  var MODULES = window.MODULES || [];
  var GROUPS = window.MODULE_GROUPS || [];
  var ASSESS = window.ASSESSMENT || { questions: [], passOverall: 0.8 };

  // Machines / tasks for the competency sign-off (matches the handbook).
  var MACHINES = [
    { k: "safe-stop", name: "Safe Stop & blockage clearing (all machines)" },
    { k: "puma", name: "Case IH Puma 240 CVX (tractor)" },
    { k: "jd6150", name: "John Deere 6150R (tractor)" },
    { k: "jcb541", name: "JCB 541-70 telehandler" },
    { k: "jcb516", name: "JCB 516-40 telehandler" },
    { k: "tedder", name: "Kuhn GF 8501 tedder" },
    { k: "rake", name: "Kuhn GA twin rotor rake" },
    { k: "baler", name: "New Holland BB940A baler" },
    { k: "mowers", name: "Kuhn front & rear 3m mowers" },
    { k: "grabs", name: "Bale grabs & squeeze" },
    { k: "trailers", name: "Bale trailers" },
  ];
  var LEVELS = ["Not started", "In training", "Competent (supervised)", "Competent (solo)", "Not applicable"];
  var DONE_LEVELS = ["Competent (supervised)", "Competent (solo)", "Not applicable"];

  // Golden rules the trainee acknowledges at induction (from Module 01).
  var INDUCTION_ACKS = [
    "I will perform Safe Stop before leaving the seat or when anyone approaches.",
    "I will never clear a blockage or touch a machine while it is running or parts are moving.",
    "I will not carry passengers and will never ride on a load, linkage or in a raised bucket.",
    "I will never go under a raised load, trailer body or loader unless it is propped/locked.",
    "I will keep clear of the PTO shaft and tie up loose clothing; no jewellery or loose cords.",
    "I will wear the right PPE: boots always, plus ear, dust, eye and hi-vis protection as needed.",
    "I will watch for overhead power lines when using the telehandler, rake or tipping trailers.",
    "I will only operate machines I have been trained and signed off on.",
    "I will not use a phone while driving, and never work under the influence of alcohol or drugs.",
    "If I am unsure, tired or think something is unsafe, I will STOP and ask my supervisor.",
  ];

  // ---------- State ----------
  function blank() {
    return {
      trainee: { name: "", dob: "", start: "", supervisor: "" },
      read: {},
      induction: { acks: {}, signed: false, date: "" },
      assessment: null,
      machines: {},
      declaration: { supervisor: "", date: "", confirmed: false },
    };
  }
  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(blank(), JSON.parse(raw));
    } catch (e) {}
    return blank();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
    renderTopbar(); renderSidebar();
  }

  // ---------- Helpers ----------
  function h(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function moduleById(id) { for (var i = 0; i < MODULES.length; i++) if (MODULES[i].id === id) return MODULES[i]; return null; }
  function fmtDate(iso) { if (!iso) return "—"; var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  function today() { return new Date().toISOString().slice(0, 10); }

  // ---------- Progress ----------
  function readCount() { return MODULES.filter(function (m) { return state.read[m.id]; }).length; }
  function modulesComplete() { return readCount() === MODULES.length && MODULES.length > 0; }
  function inductionComplete() {
    return state.induction.signed && INDUCTION_ACKS.every(function (_, i) { return state.induction.acks[i]; });
  }
  function assessmentPassed() { return !!(state.assessment && state.assessment.passed); }
  function machinesComplete() {
    return MACHINES.every(function (m) {
      var rec = state.machines[m.k];
      return rec && DONE_LEVELS.indexOf(rec.level) !== -1 && rec.supervisor && rec.date;
    });
  }
  function declarationComplete() { return state.declaration.confirmed && state.declaration.supervisor && state.declaration.date; }
  function certified() {
    return modulesComplete() && inductionComplete() && assessmentPassed() && machinesComplete() && declarationComplete();
  }
  function overallPct() {
    var steps = [modulesComplete(), inductionComplete(), assessmentPassed(), machinesComplete(), declarationComplete()];
    // weight reading by proportion so the bar moves while reading
    var readFrac = MODULES.length ? readCount() / MODULES.length : 0;
    var parts = [readFrac, inductionComplete() ? 1 : 0, assessmentPassed() ? 1 : 0,
      machinesComplete() ? 1 : (countSignedMachines() / MACHINES.length), declarationComplete() ? 1 : 0];
    return Math.round((parts.reduce(function (a, b) { return a + b; }, 0) / parts.length) * 100);
  }
  function countSignedMachines() {
    return MACHINES.filter(function (m) { var r = state.machines[m.k]; return r && DONE_LEVELS.indexOf(r.level) !== -1 && r.supervisor; }).length;
  }

  // ---------- Topbar ----------
  function renderTopbar() {
    var pct = overallPct();
    var name = state.trainee.name ? esc(state.trainee.name) : "Set up trainee";
    var bar = document.getElementById("topbar");
    bar.innerHTML = "";
    bar.appendChild(h(
      '<div class="topbar__progress">' +
        '<span class="progress-label">Overall progress</span>' +
        '<div class="progress-bar"><div class="progress-bar__fill" style="width:' + pct + '%"></div></div>' +
        '<span class="progress-label">' + pct + '%</span>' +
      '</div>'
    ));
    var right = h('<div style="display:flex;gap:10px;align-items:center"></div>');
    var chip = h('<button class="trainee-chip" title="Trainee details">👤 <strong>' + name + '</strong></button>');
    chip.addEventListener("click", openSetup);
    right.appendChild(chip);
    var rec = h('<button class="btn btn--ghost btn--sm">Record</button>');
    rec.addEventListener("click", function () { go("#/record"); });
    right.appendChild(rec);
    bar.appendChild(right);
  }

  // ---------- Sidebar ----------
  function renderSidebar() {
    var sb = document.getElementById("sidebar");
    var route = location.hash || "#/";
    sb.innerHTML = "";
    sb.appendChild(h('<div class="sidebar__hazard"></div>'));
    sb.appendChild(h(
      '<div class="sidebar__brand">' +
        '<div class="brand__farm">Truleigh Manor Farm</div>' +
        '<div class="brand__sub">Health &amp; Safety Training &middot; Hay &amp; Haylage</div>' +
      '</div>'
    ));

    var stages = [
      { t: "Dashboard", r: "#/", done: false },
      { t: "Induction", r: "#/induction", done: inductionComplete() },
      { t: "Learn modules", r: "#/read/" + (firstUnread() || MODULES[0].id), done: modulesComplete() },
      { t: "Assessment", r: "#/assessment", done: assessmentPassed() },
      { t: "Sign-off", r: "#/signoff", done: machinesComplete() && declarationComplete() },
      { t: "Certificate", r: "#/certificate", done: certified() },
    ];
    var ul = h('<ul class="pathway"></ul>');
    stages.forEach(function (s, i) {
      var active = (s.r === "#/" && route === "#/") || (s.r !== "#/" && route.indexOf(s.r.split("/").slice(0, 2).join("/")) === 0 && routeStageMatch(route, s));
      var li = h(
        '<li class="pathway__item' + (active ? " is-active" : "") + '">' +
          '<span class="pathway__num">' + (i + 1) + '</span>' +
          '<span>' + s.t + '</span>' +
          '<span class="pathway__tick">' + (s.done ? "✔" : "") + '</span>' +
        '</li>'
      );
      li.addEventListener("click", function () { go(s.r); });
      ul.appendChild(li);
    });
    sb.appendChild(ul);

    // module groups
    GROUPS.forEach(function (g) {
      var wrap = h('<div class="nav-group"></div>');
      wrap.appendChild(h('<div class="nav-group__label">' + esc(g) + '</div>'));
      MODULES.filter(function (m) { return m.group === g; }).forEach(function (m) {
        var isRead = !!state.read[m.id];
        var active = route === "#/read/" + m.id;
        var link = h(
          '<a class="nav-link' + (active ? " is-active" : "") + '" href="#/read/' + m.id + '">' +
            '<span class="nav-link__tick' + (isRead ? "" : " is-empty") + '">' + (isRead ? "✔" : "○") + '</span>' +
            '<span>' + esc(m.short) + '</span>' +
          '</a>'
        );
        wrap.appendChild(link);
      });
      sb.appendChild(wrap);
    });

    sb.appendChild(h('<div class="sidebar__foot">Progress saves to this browser. Use <strong>Record</strong> to print or export it.</div>'));
  }
  function routeStageMatch(route, s) {
    if (s.r.indexOf("#/read/") === 0) return route.indexOf("#/read/") === 0;
    return route === s.r;
  }
  function firstUnread() { for (var i = 0; i < MODULES.length; i++) if (!state.read[MODULES[i].id]) return MODULES[i].id; return null; }

  // ---------- Router ----------
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; window.scrollTo(0, 0); }
  window.addEventListener("hashchange", render);

  function render() {
    var route = location.hash || "#/";
    renderTopbar(); renderSidebar();
    var view = document.getElementById("view");
    view.innerHTML = "";
    if (!state.trainee.name && route !== "#/") { /* allow browsing, but nudge */ }

    if (route === "#/") return renderDashboard(view);
    if (route === "#/induction") return renderInduction(view);
    if (route.indexOf("#/read/") === 0) return renderReader(view, route.slice(7));
    if (route === "#/assessment") return renderAssessment(view);
    if (route === "#/signoff") return renderSignoff(view);
    if (route === "#/certificate") return renderCertificate(view);
    if (route === "#/record") return renderRecord(view);
    renderDashboard(view);
  }

  // ---------- Dashboard ----------
  function renderDashboard(view) {
    var stagesDone = [inductionComplete(), modulesComplete(), assessmentPassed(), machinesComplete() && declarationComplete()];
    var hero = h(
      '<div class="hero">' +
        '<div class="hero__hazard"></div>' +
        '<div class="hero__body">' +
          '<div class="hero__main">' +
            '<span class="eyebrow">Your safety induction</span>' +
            '<h2>' + (state.trainee.name ? "Welcome, " + esc(state.trainee.name.split(" ")[0]) : "Get started") + '</h2>' +
            '<p>Work through each stage in order. You cannot be cleared to operate machinery on your own until every stage is complete and your supervisor has signed you off.</p>' +
            '<button class="btn btn--amber" id="continueBtn">' + (firstUnread() ? "Continue learning" : "Review progress") + ' →</button>' +
          '</div>' +
          '<div class="hero__stage">' +
            stageLine("Induction acknowledged", inductionComplete()) +
            stageLine("All modules read (" + readCount() + "/" + MODULES.length + ")", modulesComplete()) +
            stageLine("Assessment passed", assessmentPassed()) +
            stageLine("Competency signed off", machinesComplete() && declarationComplete()) +
            stageLine("Certified", certified()) +
          '</div>' +
        '</div>' +
      '</div>'
    );
    view.appendChild(hero);
    hero.querySelector("#continueBtn").addEventListener("click", function () {
      var u = firstUnread(); go(u ? "#/read/" + u : "#/signoff");
    });

    if (!state.trainee.name) {
      var n = h('<div class="notice">⚠️ <strong>Start by setting up the trainee.</strong> Add the young worker\'s name so their record and certificate are correct. <button class="btn btn--sm" id="setupNow" style="margin-left:8px">Set up trainee</button></div>');
      view.appendChild(n);
      n.querySelector("#setupNow").addEventListener("click", openSetup);
    }

    var grid = h('<div class="grid grid--cards" style="margin-top:8px"></div>');
    grid.appendChild(actionCard("Induction", inductionComplete() ? "done" : "todo", "Read the golden rules and confirm you understand them.", "#/induction"));
    grid.appendChild(actionCard("Learn modules", modulesComplete() ? "done" : "todo", readCount() + " of " + MODULES.length + " modules read.", "#/read/" + (firstUnread() || MODULES[0].id)));
    grid.appendChild(assessmentCard());
    grid.appendChild(actionCard("Sign-off", (machinesComplete() && declarationComplete()) ? "done" : "todo", countSignedMachines() + " of " + MACHINES.length + " machines signed. Needs your supervisor.", "#/signoff"));
    var cc = actionCard("Certificate", certified() ? "done" : "todo", certified() ? "Ready — view and print." : "Unlocks when all stages are complete.", "#/certificate");
    if (!certified()) cc.classList.add("card--locked");
    grid.appendChild(cc);
    view.appendChild(grid);
  }
  function stageLine(label, done) {
    return '<div class="stage-line' + (done ? " is-done" : "") + '"><span class="dot"></span><span>' + esc(label) + '</span></div>';
  }
  function actionCard(title, status, desc, route) {
    var flag = status === "done" ? '<span class="statusflag statusflag--done">✔ Done</span>' : '<span class="statusflag statusflag--todo">To do</span>';
    var c = h('<div class="card card--action"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3>' + esc(title) + '</h3>' + flag + '</div><p class="muted">' + esc(desc) + '</p></div>');
    c.addEventListener("click", function () { go(route); });
    return c;
  }
  function assessmentCard() {
    var a = state.assessment;
    var flag, desc;
    if (a && a.passed) { flag = '<span class="statusflag statusflag--done">✔ Passed</span>'; desc = "Scored " + a.scorePct + "%. You can retake it any time."; }
    else if (a && !a.passed) { flag = '<span class="statusflag statusflag--fail">Not passed</span>'; desc = "Scored " + a.scorePct + "%. Review the modules and try again."; }
    else { flag = '<span class="statusflag statusflag--todo">To do</span>'; desc = ASSESS.questions.length + " questions. Pass mark 80%, and every safety-critical question must be right."; }
    var c = h('<div class="card card--action"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3>Assessment</h3>' + flag + '</div><p class="muted">' + desc + '</p></div>');
    c.addEventListener("click", function () { go("#/assessment"); });
    return c;
  }

  // ---------- Induction ----------
  function renderInduction(view) {
    view.appendChild(h('<span class="eyebrow">Stage 1</span><h1 class="page-title">Induction &amp; golden rules</h1>'));
    view.appendChild(h('<p class="lede">These are the non-negotiable rules at Truleigh Manor Farm. Tick each one to confirm you understand it, then sign at the bottom. If anything is unclear, ask your supervisor before you tick it.</p>'));
    var block = h('<div class="signoff-block" style="margin-top:16px"></div>');
    INDUCTION_ACKS.forEach(function (txt, i) {
      var line = h('<label class="checkline"><input type="checkbox"' + (state.induction.acks[i] ? " checked" : "") + ' /><span>' + esc(txt) + '</span></label>');
      line.querySelector("input").addEventListener("change", function (e) {
        state.induction.acks[i] = e.target.checked; save();
      });
      block.appendChild(line);
    });
    view.appendChild(block);

    var allTicked = INDUCTION_ACKS.every(function (_, i) { return state.induction.acks[i]; });
    var sign = h(
      '<div class="signoff-block">' +
        '<h3>Trainee confirmation</h3>' +
        '<p class="muted">I have read and understood the golden rules above.</p>' +
        '<div class="field-row">' +
          '<div class="field"><label>Trainee name</label><input id="indName" value="' + esc(state.trainee.name) + '" placeholder="Full name" /></div>' +
          '<div class="field"><label>Date</label><input id="indDate" type="date" value="' + esc(state.induction.date || today()) + '" /></div>' +
        '</div>' +
        '<button class="btn" id="indSign"' + (allTicked ? "" : " disabled") + '>' + (state.induction.signed ? "Update confirmation" : "Confirm &amp; sign") + '</button>' +
        (state.induction.signed ? ' <span class="sign-state signed">✔ Signed ' + fmtDate(state.induction.date) + '</span>' : (allTicked ? "" : ' <span class="sign-state unsigned">Tick all rules to enable</span>')) +
      '</div>'
    );
    view.appendChild(sign);
    sign.querySelector("#indSign").addEventListener("click", function () {
      var nm = sign.querySelector("#indName").value.trim();
      if (nm) { state.trainee.name = nm; }
      state.induction.date = sign.querySelector("#indDate").value || today();
      state.induction.signed = true; save(); toast("Induction confirmed"); render();
    });
    view.appendChild(navButtons(null, "#/read/" + MODULES[0].id, "Start the modules"));
  }

  // ---------- Reader ----------
  function renderReader(view, id) {
    var m = moduleById(id);
    if (!m) { view.appendChild(h('<p>Module not found.</p>')); return; }
    var idx = MODULES.indexOf(m);
    var reader = h('<article class="reader">' + m.html + '</article>');
    view.appendChild(reader);

    var isRead = !!state.read[id];
    var foot = h(
      '<div class="reader-foot">' +
        '<p>' + (isRead ? "✔ Marked as read on " + fmtDate(state.read[id]) : "When you have read and understood this module, mark it complete.") + '</p>' +
        '<button class="btn ' + (isRead ? "btn--ghost" : "btn--amber") + '" id="readBtn">' + (isRead ? "Mark as unread" : "Mark as read &amp; understood") + '</button>' +
      '</div>'
    );
    view.appendChild(foot);
    foot.querySelector("#readBtn").addEventListener("click", function () {
      if (state.read[id]) delete state.read[id]; else state.read[id] = new Date().toISOString();
      save(); render();
    });

    var prev = idx > 0 ? MODULES[idx - 1] : null;
    var next = idx < MODULES.length - 1 ? MODULES[idx + 1] : null;
    var nav = h('<div class="reader-nav"></div>');
    nav.appendChild(prev ? mkBtn("← " + prev.short, "#/read/" + prev.id, "btn--ghost") : h('<span></span>'));
    nav.appendChild(next ? mkBtn(next.short + " →", "#/read/" + next.id, "btn") : mkBtn("Go to assessment →", "#/assessment", "btn--amber"));
    view.appendChild(nav);
  }

  // ---------- Assessment ----------
  var draft = {}; // in-progress answers
  function renderAssessment(view) {
    var result = state.assessment;
    view.appendChild(h('<span class="eyebrow">Stage 3</span><h1 class="page-title">Health &amp; safety assessment</h1>'));

    if (result && !window.__retake) {
      return renderAssessmentResult(view, result);
    }
    window.__retake = false;
    view.appendChild(h('<p class="lede">' + ASSESS.questions.length + ' questions. You need <strong>80% overall</strong>, and you must get <strong>every safety-critical question</strong> (marked ⚠) correct. Choose the best answer for each.</p>'));
    if (!modulesComplete()) view.appendChild(h('<div class="notice">Tip: you can take the assessment now, but it works best after you have read all the modules (' + readCount() + '/' + MODULES.length + ' done).</div>'));

    var form = h('<div id="qform"></div>');
    ASSESS.questions.forEach(function (q, qi) {
      var card = h(
        '<div class="q-card" data-q="' + qi + '">' +
          '<div class="q-card__head"><span class="q-num">Question ' + (qi + 1) + ' of ' + ASSESS.questions.length + '</span>' +
          '<span class="q-topic">' + (q.critical ? '<span class="q-crit">⚠ </span>' : "") + esc(q.topic) + '</span></div>' +
          '<div class="q-text">' + esc(q.q) + '</div>' +
          '<div class="options"></div>' +
        '</div>'
      );
      var opts = card.querySelector(".options");
      q.options.forEach(function (optText, oi) {
        var opt = h('<div class="option" data-o="' + oi + '"><span class="option__key">' + "ABCD"[oi] + '</span><span>' + esc(optText) + '</span></div>');
        opt.addEventListener("click", function () {
          draft[qi] = oi;
          opts.querySelectorAll(".option").forEach(function (e) { e.classList.remove("is-selected"); });
          opt.classList.add("is-selected");
        });
        if (draft[qi] === oi) opt.classList.add("is-selected");
        opts.appendChild(opt);
      });
      form.appendChild(card);
    });
    view.appendChild(form);

    var submit = h('<button class="btn btn--amber" id="submitBtn" style="margin-top:8px">Submit assessment</button> <span class="sign-state unsigned" id="subHint"></span>');
    var wrap = h('<div></div>'); wrap.appendChild(submit); view.appendChild(wrap);
    wrap.querySelector("#submitBtn").addEventListener("click", function () {
      var unanswered = ASSESS.questions.filter(function (_, i) { return draft[i] === undefined; });
      if (unanswered.length) {
        wrap.querySelector("#subHint").textContent = "Please answer all questions (" + unanswered.length + " left).";
        var firstU = ASSESS.questions.findIndex(function (_, i) { return draft[i] === undefined; });
        var card = form.querySelector('[data-q="' + firstU + '"]');
        if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      gradeAssessment();
    });
  }

  function gradeAssessment() {
    var correct = 0, criticalAllOk = true, perQ = [];
    ASSESS.questions.forEach(function (q, i) {
      var ok = draft[i] === q.answer;
      if (ok) correct++; else if (q.critical) criticalAllOk = false;
      perQ.push({ chosen: draft[i], ok: ok });
    });
    var pct = Math.round((correct / ASSESS.questions.length) * 100);
    var passed = (correct / ASSESS.questions.length) >= ASSESS.passOverall && criticalAllOk;
    state.assessment = { passed: passed, scorePct: pct, correct: correct, total: ASSESS.questions.length, criticalAllOk: criticalAllOk, date: new Date().toISOString(), answers: perQ };
    draft = {};
    save(); render();
    window.scrollTo(0, 0);
  }

  function renderAssessmentResult(view, result) {
    var banner = h(
      '<div class="result-banner ' + (result.passed ? "pass" : "fail") + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">' +
          '<div><h2>' + (result.passed ? "Assessment passed" : "Not passed yet") + '</h2>' +
          '<p style="margin:0;opacity:.9">' + result.correct + " of " + result.total + " correct" +
          (result.criticalAllOk ? "" : " — and one or more safety-critical questions were wrong") + ". Taken " + fmtDate(result.date) + ".</p></div>" +
          '<div class="result-score">' + result.scorePct + '%</div>' +
        '</div>' +
      '</div>'
    );
    view.appendChild(banner);
    if (!result.passed) view.appendChild(h('<div class="notice">You need 80% overall and every ⚠ safety-critical question correct. Re-read the modules on the topics you missed, then retake.</div>'));

    // review
    ASSESS.questions.forEach(function (q, i) {
      var a = result.answers[i] || {};
      var card = h(
        '<div class="q-card">' +
          '<div class="q-card__head"><span class="q-num">Question ' + (i + 1) + '</span>' +
          '<span class="q-topic">' + (q.critical ? '<span class="q-crit">⚠ </span>' : "") + esc(q.topic) + '</span></div>' +
          '<div class="q-text">' + esc(q.q) + '</div>' +
          '<div class="options"></div>' +
        '</div>'
      );
      var opts = card.querySelector(".options");
      q.options.forEach(function (optText, oi) {
        var cls = "option";
        if (oi === q.answer) cls += " is-correct";
        else if (oi === a.chosen) cls += " is-wrong";
        opts.appendChild(h('<div class="' + cls + '"><span class="option__key">' + "ABCD"[oi] + '</span><span>' + esc(optText) + '</span></div>'));
      });
      card.appendChild(h('<div class="explain ' + (a.ok ? "is-correct" : "is-wrong") + '"><strong>' + (a.ok ? "Correct. " : "Review: ") + '</strong>' + esc(q.explain) + '</div>'));
      view.appendChild(card);
    });

    var btns = h('<div class="reader-nav"></div>');
    var retake = h('<button class="btn btn--ghost">Retake assessment</button>');
    retake.addEventListener("click", function () { window.__retake = true; draft = {}; render(); window.scrollTo(0, 0); });
    btns.appendChild(retake);
    btns.appendChild(mkBtn(result.passed ? "Continue to sign-off →" : "Back to modules", result.passed ? "#/signoff" : "#/read/" + MODULES[0].id, "btn"));
    view.appendChild(btns);
  }

  // ---------- Sign-off ----------
  function renderSignoff(view) {
    view.appendChild(h('<span class="eyebrow">Stage 4</span><h1 class="page-title">Competency sign-off</h1>'));
    view.appendChild(h('<p class="lede">This section is completed <strong>with your supervisor</strong> after they have watched you operate each machine safely. Nobody works a machine on their own until it shows <em>Competent</em>. Mark anything not used as <em>Not applicable</em>.</p>'));

    // Pre-reqs summary
    var pre = h('<div class="signoff-block"><h3>Before sign-off</h3></div>');
    pre.appendChild(h('<div class="checkline" style="border:none"><span>' + (inductionComplete() ? "✔" : "○") + '</span><span>Induction acknowledged &amp; signed</span></div>'));
    pre.appendChild(h('<div class="checkline" style="border:none"><span>' + (modulesComplete() ? "✔" : "○") + '</span><span>All ' + MODULES.length + ' modules read (' + readCount() + ' done)</span></div>'));
    pre.appendChild(h('<div class="checkline" style="border:none"><span>' + (assessmentPassed() ? "✔" : "○") + '</span><span>Assessment passed</span></div>'));
    view.appendChild(pre);

    var block = h('<div class="signoff-block"><h3>Machine &amp; task competency</h3><p class="muted">For each item: set the level, and the supervisor adds their name and the date.</p></div>');
    MACHINES.forEach(function (mc) {
      var rec = state.machines[mc.k] || { level: "Not started", supervisor: "", date: "" };
      var done = DONE_LEVELS.indexOf(rec.level) !== -1 && rec.supervisor && rec.date;
      var row = h(
        '<div class="signoff-row">' +
          '<div class="field"><label>Machine / task</label><div class="machine-name">' + esc(mc.name) + '</div></div>' +
          '<div class="field"><label>Level</label><select data-f="level">' + LEVELS.map(function (l) { return '<option' + (l === rec.level ? " selected" : "") + '>' + l + '</option>'; }).join("") + '</select></div>' +
          '<div class="field"><label>Supervisor</label><input data-f="supervisor" value="' + esc(rec.supervisor) + '" placeholder="Name" /></div>' +
          '<div class="field" style="min-width:150px"><label>Date</label><input data-f="date" type="date" value="' + esc(rec.date) + '" /></div>' +
        '</div>'
      );
      var status = h('<div style="grid-column:1/-1;margin-top:-6px"><span class="sign-state ' + (done ? "signed" : "unsigned") + '">' + (done ? "✔ Signed off — " + esc(rec.level) : "Not yet signed off") + '</span></div>');
      function update() {
        state.machines[mc.k] = {
          level: row.querySelector('[data-f="level"]').value,
          supervisor: row.querySelector('[data-f="supervisor"]').value.trim(),
          date: row.querySelector('[data-f="date"]').value,
        };
        save();
        var r = state.machines[mc.k]; var d = DONE_LEVELS.indexOf(r.level) !== -1 && r.supervisor && r.date;
        status.querySelector(".sign-state").className = "sign-state " + (d ? "signed" : "unsigned");
        status.querySelector(".sign-state").textContent = d ? "✔ Signed off — " + r.level : "Not yet signed off";
      }
      row.querySelectorAll("[data-f]").forEach(function (el) { el.addEventListener("change", update); });
      block.appendChild(row); block.appendChild(status);
    });
    view.appendChild(block);

    // Final declaration
    var dec = state.declaration;
    var decBlock = h(
      '<div class="signoff-block">' +
        '<h3>Supervisor declaration</h3>' +
        '<p class="muted">I confirm the young-person risk assessment is in place, the trainee has completed the training and assessment, and is competent to carry out the tasks signed off above, under the supervision level recorded.</p>' +
        '<div class="field-row">' +
          '<div class="field"><label>Supervisor name</label><input id="decName" value="' + esc(dec.supervisor) + '" placeholder="e.g. Ben Hogan" /></div>' +
          '<div class="field"><label>Date</label><input id="decDate" type="date" value="' + esc(dec.date || today()) + '" /></div>' +
        '</div>' +
        '<label class="checkline" style="border:none"><input type="checkbox" id="decConfirm"' + (dec.confirmed ? " checked" : "") + ' /><span>I confirm the above as the responsible person.</span></label>' +
        '<div id="decState"></div>' +
      '</div>'
    );
    view.appendChild(decBlock);
    function saveDec() {
      state.declaration = {
        supervisor: decBlock.querySelector("#decName").value.trim(),
        date: decBlock.querySelector("#decDate").value || today(),
        confirmed: decBlock.querySelector("#decConfirm").checked,
      };
      save();
      decBlock.querySelector("#decState").innerHTML = declarationComplete() ? '<span class="sign-state signed">✔ Declaration signed ' + fmtDate(state.declaration.date) + '</span>' : "";
    }
    decBlock.querySelectorAll("#decName,#decDate,#decConfirm").forEach(function (el) { el.addEventListener("change", saveDec); });
    if (declarationComplete()) decBlock.querySelector("#decState").innerHTML = '<span class="sign-state signed">✔ Declaration signed ' + fmtDate(dec.date) + '</span>';

    view.appendChild(navButtons("#/assessment", "#/certificate", certified() ? "View certificate →" : "Certificate (locked)"));
  }

  // ---------- Certificate ----------
  function renderCertificate(view) {
    if (!certified()) {
      var missing = [];
      if (!inductionComplete()) missing.push("induction acknowledged & signed");
      if (!modulesComplete()) missing.push("all modules read (" + readCount() + "/" + MODULES.length + ")");
      if (!assessmentPassed()) missing.push("assessment passed");
      if (!machinesComplete()) missing.push("every machine signed off (or marked N/A)");
      if (!declarationComplete()) missing.push("supervisor declaration");
      view.appendChild(h(
        '<div class="cert-locked card">' +
          '<div class="lock">🔒</div>' +
          '<h1 class="page-title" style="margin-top:8px">Certificate locked</h1>' +
          '<p class="lede" style="margin:0 auto">Complete every stage to unlock the certificate of completion.</p>' +
          '<ul style="display:inline-block;text-align:left;margin-top:14px">' + missing.map(function (m) { return "<li>Still needed: " + esc(m) + "</li>"; }).join("") + '</ul>' +
        '</div>'
      ));
      return;
    }
    var t = state.trainee;
    var machineRows = MACHINES.map(function (mc) { var r = state.machines[mc.k]; return "<tr><td>" + esc(mc.name) + "</td><td>" + esc(r.level) + "</td><td>" + esc(r.supervisor) + "</td><td>" + fmtDate(r.date) + "</td></tr>"; }).join("");
    var cert = h(
      '<div class="cert">' +
        '<div class="cert__hazard"></div>' +
        '<div class="cert__body">' +
          '<div class="cert__seal">Certificate of completion</div>' +
          '<h2>Farm Health &amp; Safety Training</h2>' +
          '<div class="cert__farm">Truleigh Manor Farm &middot; Hay &amp; Haylage</div>' +
          '<div class="cert__name">' + esc(t.name || "—") + '</div>' +
          '<p>has completed the farm health &amp; safety training pack — induction, all modules, and the assessment ' +
          '(' + state.assessment.scorePct + '%) — and has been assessed by their supervisor as competent for the tasks listed below, under the supervision levels recorded. The young-person risk assessment is in place.</p>' +
          '<div class="cert__sigs">' +
            '<div class="cert__sig">' + esc(t.name || "—") + '<br/><span class="muted">Trainee &middot; ' + fmtDate(state.induction.date) + '</span></div>' +
            '<div class="cert__sig">' + esc(state.declaration.supervisor) + '<br/><span class="muted">Supervisor &middot; ' + fmtDate(state.declaration.date) + '</span></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    view.appendChild(cert);
    var actions = h('<div class="reader-nav no-print" style="margin-top:18px"></div>');
    var printBtn = h('<button class="btn btn--amber">🖨 Print / save as PDF</button>');
    printBtn.addEventListener("click", function () { window.print(); });
    actions.appendChild(printBtn);
    actions.appendChild(mkBtn("View full record →", "#/record", "btn--ghost"));
    view.appendChild(actions);
  }

  // ---------- Record (printable summary + export) ----------
  function renderRecord(view) {
    var t = state.trainee;
    view.appendChild(h('<span class="eyebrow">For the file</span><h1 class="page-title">Training record</h1>'));
    var actions = h('<div class="reader-nav no-print"></div>');
    var pr = h('<button class="btn btn--amber">🖨 Print / save as PDF</button>'); pr.addEventListener("click", function () { window.print(); });
    var ex = h('<button class="btn btn--ghost">⬇ Export data (JSON)</button>'); ex.addEventListener("click", exportJSON);
    var rs = h('<button class="btn btn--ghost btn--sm">Reset all progress</button>'); rs.addEventListener("click", resetAll);
    actions.appendChild(pr); actions.appendChild(ex); actions.appendChild(rs);
    view.appendChild(actions);

    var block = h('<div class="reader" style="margin-top:14px"></div>');
    block.appendChild(h('<h1>Truleigh Manor Farm — Training Record</h1>'));
    block.appendChild(h(
      '<table><tr><th>Trainee</th><td>' + esc(t.name || "—") + '</td><th>Date of birth</th><td>' + esc(t.dob || "—") + '</td></tr>' +
      '<tr><th>Start date</th><td>' + esc(t.start || "—") + '</td><th>Supervisor</th><td>' + esc(t.supervisor || "—") + '</td></tr></table>'
    ));
    block.appendChild(h('<h2>Stages</h2>'));
    block.appendChild(h(
      '<table>' +
      '<tr><th>Stage</th><th>Status</th><th>Detail</th></tr>' +
      '<tr><td>Induction</td><td>' + (inductionComplete() ? "Signed" : "Outstanding") + '</td><td>' + fmtDate(state.induction.date) + '</td></tr>' +
      '<tr><td>Modules read</td><td>' + readCount() + " / " + MODULES.length + '</td><td>' + (modulesComplete() ? "All complete" : "In progress") + '</td></tr>' +
      '<tr><td>Assessment</td><td>' + (state.assessment ? (state.assessment.passed ? "Passed" : "Not passed") : "Not taken") + '</td><td>' + (state.assessment ? state.assessment.scorePct + "% on " + fmtDate(state.assessment.date) : "—") + '</td></tr>' +
      '<tr><td>Supervisor declaration</td><td>' + (declarationComplete() ? "Signed" : "Outstanding") + '</td><td>' + (declarationComplete() ? esc(state.declaration.supervisor) + " · " + fmtDate(state.declaration.date) : "—") + '</td></tr>' +
      '<tr><td>Certified</td><td>' + (certified() ? "YES" : "Not yet") + '</td><td></td></tr>' +
      '</table>'
    ));
    block.appendChild(h('<h2>Modules read</h2>'));
    block.appendChild(h('<table><tr><th>Module</th><th>Status</th><th>Date</th></tr>' + MODULES.map(function (m) {
      return "<tr><td>" + esc(m.short) + "</td><td>" + (state.read[m.id] ? "Read" : "—") + "</td><td>" + (state.read[m.id] ? fmtDate(state.read[m.id]) : "—") + "</td></tr>";
    }).join("") + '</table>'));
    block.appendChild(h('<h2>Competency sign-off</h2>'));
    block.appendChild(h('<table><tr><th>Machine / task</th><th>Level</th><th>Supervisor</th><th>Date</th></tr>' + MACHINES.map(function (mc) {
      var r = state.machines[mc.k] || {}; return "<tr><td>" + esc(mc.name) + "</td><td>" + esc(r.level || "—") + "</td><td>" + esc(r.supervisor || "—") + "</td><td>" + (r.date ? fmtDate(r.date) : "—") + "</td></tr>";
    }).join("") + '</table>'));
    block.appendChild(h('<p class="muted" style="margin-top:14px">Keep this record on file with the completed young-person risk assessment. Generated by the Truleigh Manor Farm safety training app.</p>'));
    view.appendChild(block);
  }

  function exportJSON() {
    var data = JSON.stringify(state, null, 2);
    var blob = new Blob([data], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tmf-training-record-" + (state.trainee.name || "trainee").replace(/\s+/g, "-").toLowerCase() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    toast("Record exported");
  }
  function resetAll() {
    if (confirm("Reset ALL training progress on this device? This cannot be undone.")) {
      state = blank(); save(); go("#/"); toast("Progress reset");
    }
  }

  // ---------- Setup modal ----------
  function openSetup() {
    var t = state.trainee;
    var overlay = document.getElementById("overlay");
    var back = h('<div class="modal-backdrop"></div>');
    var modal = h(
      '<div class="modal"><div class="modal__hazard"></div><div class="modal__body">' +
        '<h2>Trainee details</h2>' +
        '<p class="muted" style="margin-top:0">Used on the record and certificate.</p>' +
        '<div class="field" style="margin-bottom:10px"><label>Full name</label><input id="suName" value="' + esc(t.name) + '" placeholder="Trainee full name" /></div>' +
        '<div class="field-row">' +
          '<div class="field"><label>Date of birth</label><input id="suDob" type="date" value="' + esc(t.dob) + '" /></div>' +
          '<div class="field"><label>Start date</label><input id="suStart" type="date" value="' + esc(t.start) + '" /></div>' +
        '</div>' +
        '<div class="field" style="margin:10px 0"><label>Supervisor</label><input id="suSup" value="' + esc(t.supervisor || "Ben Hogan") + '" /></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">' +
          '<button class="btn btn--ghost" id="suCancel">Cancel</button>' +
          '<button class="btn" id="suSave">Save</button>' +
        '</div>' +
      '</div></div>'
    );
    back.appendChild(modal); overlay.appendChild(back);
    function close() { overlay.innerHTML = ""; }
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    modal.querySelector("#suCancel").addEventListener("click", close);
    modal.querySelector("#suSave").addEventListener("click", function () {
      state.trainee = {
        name: modal.querySelector("#suName").value.trim(),
        dob: modal.querySelector("#suDob").value,
        start: modal.querySelector("#suStart").value,
        supervisor: modal.querySelector("#suSup").value.trim(),
      };
      save(); close(); render(); toast("Trainee saved");
    });
    modal.querySelector("#suName").focus();
  }

  // ---------- Small UI helpers ----------
  function mkBtn(label, route, cls) { var b = h('<button class="btn ' + (cls || "") + '">' + label + '</button>'); b.addEventListener("click", function () { go(route); }); return b; }
  function navButtons(prev, next, nextLabel) {
    var nav = h('<div class="reader-nav"></div>');
    nav.appendChild(prev ? mkBtn("← Back", prev, "btn--ghost") : h('<span></span>'));
    nav.appendChild(next ? mkBtn(nextLabel || "Next →", next, "btn") : h('<span></span>'));
    return nav;
  }
  var toastTimer;
  function toast(msg) {
    var ex = document.querySelector(".toast"); if (ex) ex.remove();
    var t = h('<div class="toast">' + esc(msg) + '</div>'); document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 2200);
  }

  // ---------- Boot ----------
  if (!location.hash) location.hash = "#/";
  render();
  if (!state.trainee.name) setTimeout(openSetup, 350);
})();
