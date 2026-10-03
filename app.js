/* The Photon Scheduler: interface. Runs entirely in the browser. Spectra from FPbase; the cell, its expression levels
   and the event time courses are synthetic and labelled so on every page. */
(function () {
  "use strict";
  var PH = window.PS_PHYS, SC = window.PS_SCHED, ST = window.PS_STAGE, $app = document.getElementById("app"), BASE = "";
  var LIB = null, BY = {};
  function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function n(x, d) { return x === null || x === undefined || isNaN(x) ? "n/a" : (+x).toLocaleString("en-US", { maximumFractionDigits: d === undefined ? 0 : d }); }
  function pct(x, d) { return x === null || x === undefined || !isFinite(x) ? "n/a" : (x * 100).toFixed(d === undefined ? 0 : d) + "%"; }
  function cssv(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function CW() { return innerWidth < 600 ? 400 : innerWidth < 1000 ? 600 : 760; }
  function col(f) { var c = ST.wl2rgb(f.emMax); return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
  function fmt(x) { return n(x, 0); }
  /* ------------------------------------------------------------ svg helpers */
  function T(x, y, txt, cls, anchor) { return '<text x="' + x + '" y="' + y + '"' + (cls ? ' class="' + cls + '"' : "") + (anchor ? ' text-anchor="' + anchor + '"' : "") + ">" + esc(txt) + "</text>"; }
  function scale(dom, range) { var d0 = dom[0], d1 = dom[1]; if (d1 === d0) d1 = d0 + 1; return function (x) { return range[0] + (x - d0) / (d1 - d0) * (range[1] - range[0]); }; }
  function ticks(lo, hi, k) { var span = hi - lo || 1, step = Math.pow(10, Math.floor(Math.log10(span / (k || 5)))), err = span / (k || 5) / step; step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1; var out = []; for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10)); return out; }
  function svg(W, H, body, cap, fit) { return '<div class="chart"' + (fit === false ? "" : " data-fit") + '><svg viewBox="0 0 ' + W + " " + H + '" role="img">' + body + "</svg>" + (cap ? '<p class="cap">' + cap + "</p>" : "") + "</div>"; }
  function legend(items) { return '<div class="legend">' + items.map(function (i) { return "<span><i style=\"background:" + i[1] + '"></i>' + esc(i[0]) + "</span>"; }).join("") + "</div>"; }

  /* bars: rows [{label, v, color}] */
  function bars(rows, o) {
    o = o || {}; var W = o.w || CW(), H = o.height || Math.round(W * 0.42), m = { t: 22, r: 12, b: 34, l: W < 500 ? 46 : 62 };
    var vals = rows.map(function (r) { return r.v || 0; }), lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max.apply(null, vals) * 1.1 || 1, y = scale([lo, hi], [H - m.b, m.t]), bw = (W - m.l - m.r) / rows.length, b = "";
    ticks(lo, hi, H < 200 ? 3 : 5).forEach(function (t) { b += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' + T(m.l - 8, y(t) + 4, o.fmt ? o.fmt(t) : n(t), "", "end"); });
    rows.forEach(function (r, i) { var x0 = m.l + i * bw + bw * 0.12, h = Math.abs(y(r.v) - y(0)); b += '<rect x="' + x0 + '" y="' + Math.min(y(r.v), y(0)) + '" width="' + (bw * 0.76) + '" height="' + h + '" rx="3" fill="' + (r.color || "var(--accent)") + '"' + (r.dim ? ' opacity=".45"' : "") + "><title>" + esc(r.label + ": " + (o.fmt ? o.fmt(r.v) : n(r.v))) + "</title></rect>"; if (o.values) b += T(x0 + bw * 0.38, y(r.v) - 5, o.fmt ? o.fmt(r.v) : n(r.v), "", "middle"); });
    var step = Math.max(1, Math.ceil(rows.length / (W < 500 ? 6 : 14))); rows.forEach(function (r, i) { if (i % step === 0 || i === rows.length - 1) b += T(m.l + i * bw + bw / 2, H - 10, r.label, "", "middle"); });
    return svg(W, H, b, o.cap);
  }
  /* horizontal bars: rows [{label, v, color, sub}] */
  function hbars(rows, o) {
    o = o || {}; var W = o.w || CW(), rh = 26, m = { t: 8, r: 70, b: 8, l: Math.min(240, Math.round(W * 0.36)) }, H = m.t + rows.length * rh + m.b, hi = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.v); })) || 1, x = scale([0, hi], [m.l, W - m.r]), b = "";
    rows.forEach(function (r, i) { var y0 = m.t + i * rh; b += T(m.l - 8, y0 + 17, r.label, "lbl", "end") + '<rect x="' + m.l + '" y="' + (y0 + 5) + '" width="' + Math.max(1, x(Math.abs(r.v)) - m.l) + '" height="' + (rh - 10) + '" rx="4" fill="' + (r.color || "var(--accent)") + '"/>' + T(x(Math.abs(r.v)) + 6, y0 + 17, o.fmt ? o.fmt(r.v) : n(r.v)); });
    return svg(W, H, b, o.cap);
  }
  /* stacked areas: series [{label,color,points:[[x,v]]}] on a shared x */
  function streams(series, o) {
    o = o || {}; var W = o.w || CW(), H = o.height || Math.round(W * 0.42), m = { t: 22, r: 12, b: 32, l: W < 500 ? 46 : 66 }, xs = {}; series.forEach(function (s) { s.points.forEach(function (p) { xs[p[0]] = 1; }); });
    var ks = Object.keys(xs).map(Number).sort(function (a, b) { return a - b; }), stack = ks.map(function (k) { var tot = 0, layers = series.map(function (s) { var p = s.points.filter(function (q) { return q[0] === k; })[0], v = p ? p[1] : 0, y0 = tot; tot += v; return [y0, tot]; }); return { k: k, layers: layers, total: tot }; });
    var hi = Math.max.apply(null, stack.map(function (s) { return s.total; })) * 1.08 || 1, x = scale([ks[0], ks[ks.length - 1]], [m.l, W - m.r]), y = scale([0, hi], [H - m.b, m.t]), b = "";
    ticks(0, hi, 5).forEach(function (t) { b += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' + T(m.l - 8, y(t) + 4, o.fmt ? o.fmt(t) : n(t), "", "end"); });
    series.forEach(function (s, si) { var d = ""; stack.forEach(function (st, i) { d += (i ? "L" : "M") + x(st.k) + "," + y(st.layers[si][1]); }); for (var i = stack.length - 1; i >= 0; i--) d += "L" + x(stack[i].k) + "," + y(stack[i].layers[si][0]); b += '<path d="' + d + 'Z" fill="' + s.color + '" opacity=".85"><title>' + esc(s.label) + "</title></path>"; });
    var step = Math.max(1, Math.ceil(ks.length / (W < 500 ? 5 : 10))); ks.forEach(function (k, i) { if (i % step === 0 || i === ks.length - 1) b += T(x(k), H - 10, o.xfmt ? o.xfmt(k) : k, "", "middle"); });
    return svg(W, H, b, o.cap) + legend(series.map(function (s) { return [s.label, s.color]; }));
  }
  /* lines: series [{label,color,points:[[x,v]]}] */
  function lines(series, o) {
    o = o || {}; var W = o.w || CW(), H = o.height || Math.round(W * 0.4), m = { t: 22, r: 12, b: 32, l: W < 500 ? 46 : 66 }, xsAll = [], ysAll = [];
    series.forEach(function (s) { s.points.forEach(function (p) { xsAll.push(p[0]); ysAll.push(p[1]); }); });
    if (!xsAll.length) return "";
    var xlo = Math.min.apply(null, xsAll), xhi = Math.max.apply(null, xsAll), ylo = o.zero === false ? Math.min.apply(null, ysAll) : Math.min(0, Math.min.apply(null, ysAll)), yhi = Math.max.apply(null, ysAll) * 1.06 || 1; if (o.zero === false) { var pad = (yhi - ylo) * 0.08; ylo -= pad; }
    var x = scale([xlo, xhi], [m.l, W - m.r]), y = scale([ylo, yhi], [H - m.b, m.t]), b = "";
    ticks(ylo, yhi, H < 200 ? 3 : 5).forEach(function (t) { b += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' + T(m.l - 8, y(t) + 4, o.fmt ? o.fmt(t) : n(t), "", "end"); });
    if (o.mark) { b += '<line x1="' + x(o.mark) + '" x2="' + x(o.mark) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="var(--amb)" stroke-dasharray="3 5"/>' + (o.markLabel ? T(x(o.mark) + 5, m.t - 6, o.markLabel) : ""); }
    series.forEach(function (s) { b += '<path d="' + s.points.map(function (p, i) { return (i ? "L" : "M") + x(p[0]) + "," + y(p[1]); }).join("") + '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.width || 2.2) + '"' + (s.dash ? ' stroke-dasharray="5 6"' : "") + ' class="draw"/>'; if (s.dots) s.points.forEach(function (p) { b += '<circle cx="' + x(p[0]) + '" cy="' + y(p[1]) + '" r="3" fill="' + s.color + '"><title>' + esc((o.xfmt ? o.xfmt(p[0]) : p[0]) + ": " + (o.fmt ? o.fmt(p[1]) : n(p[1]))) + "</title></circle>"; }); });
    var tk = o.xticks || ticks(xlo, xhi, W < 500 ? 4 : 8); tk.forEach(function (t) { if (t >= xlo && t <= xhi) b += T(x(t), H - 10, o.xfmt ? o.xfmt(t) : t, "", "middle"); });
    return svg(W, H, b, o.cap) + (series.length > 1 ? legend(series.map(function (s) { return [s.label, s.color]; })) : "");
  }
  function spark(vals, color, w, h) { w = w || 86; h = h || 30; var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals) || 1; if (hi === lo) hi = lo + 1; var pts = vals.map(function (v, i) { return (i / (vals.length - 1) * (w - 4) + 2) + "," + (h - 3 - (v - lo) / (hi - lo) * (h - 6)); }); return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '"><path d="M' + pts.join("L") + '" fill="none" stroke="' + color + '" stroke-width="1.8"/><circle cx="' + pts[pts.length - 1].split(",")[0] + '" cy="' + pts[pts.length - 1].split(",")[1] + '" r="2.2" fill="' + color + '"/></svg>'; }


  /* ------------------------------------------------------------ blocks */
  function ro(l, v, s, cls) { return '<div class="ro' + (cls ? " " + cls : "") + '"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + (s || "") + "</div></div>"; }
  function pane(inner, cls) { return '<div class="pane' + (cls ? " " + cls : "") + '">' + inner + "</div>"; }
  function vhead(h, p) { return '<div class="vhead"><h2>' + h + "</h2><p>" + (p || "") + "</p></div>"; }
  function table(head, rows, cls) { return '<div class="tbl"><table class="' + (cls || "") + '"><thead><tr>' + head.map(function (h) { return "<th" + (h[0] === "#" ? ' class="num"' : "") + ">" + esc(h.replace(/^#/, "")) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return "<td" + (head[i] && head[i][0] === "#" ? ' class="num"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>"; }
  function chip(label, on, attrs) { return '<button class="chip' + (on ? " on" : "") + '" ' + (attrs || "") + ">" + esc(label) + "</button>"; }
  var STRUCT = [["nucleus", "Nucleus (H2B)"], ["actin", "Actin cortex (LifeAct)"], ["microtubules", "Microtubule tips (EB3)"], ["mitochondria", "Mitochondria (mito-tag)"]];
  var INTENTS = [
    { id: "distinguish", label: "Tell the four structures apart, 10% precision, least light", cvTarget: 0.10, budget: 600 },
    { id: "fast", label: "A quick look: 20% precision", cvTarget: 0.20, budget: 300 },
    { id: "strict", label: "Quantify: 5% precision", cvTarget: 0.05, budget: 1500 }
  ];
  var S = { panel: ["mTurquoise2", "mNeonGreen", "mCherry", "mScarlet"], seed: 21, intent: INTENTS[0], runs: null, k: 0, arm: "adaptive", playing: false, timer: null, stage: null, field: null, ft: 0, fplaying: false, ftimer: null, fstage: null, farm: "adaptive" };
  function panelObjs() { return S.panel.map(function (nm) { return BY[nm]; }); }
  function compute() {
    var panel = panelObjs(), truth = SC.newCell(PH.seeded(S.seed * 7 + 3), panel);
    var A = SC.runCell(S.seed, panel, { truth: truth, mode: "adaptive", cvTarget: S.intent.cvTarget, budget: S.intent.budget, maxSteps: 80 });
    var F = SC.runCell(S.seed, panel, { truth: truth, mode: "fixed", cvTarget: S.intent.cvTarget, budget: Math.max(A.final.dose, 40), maxSteps: 400 });
    S.runs = { adaptive: A, fixed: F, truth: truth, panel: panel }; S.k = 0;
    return S.runs;
  }
  function computeField() { if (!S.field) S.field = { adaptive: SC.runField(S.seed, { mode: "adaptive" }), fixed: SC.runField(S.seed, { mode: "fixed" }), oracle: SC.runField(S.seed, { mode: "adaptive", oracle: true }) }; S.ft = 0; return S.field; }
  function meanCV(step, panel, truth) { var s = 0, m = 0; panel.forEach(function (f, i) { if (truth[i] > 5) { s += Math.min(1, step.cv[i]); m++; } }); return m ? s / m : 0; }
  function infoPerPhoton(run, upto) { var g = 0, p = 0; run.steps.slice(0, upto + 1).forEach(function (s) { if (s.gain) g += s.gain; p += s.photons; }); return p ? g / p : 0; }

  /* ------------------------------------------------------------ shell */
  var NAV = [["", "The instrument"], ["field", "The field"], ["spectra", "Spectra"], ["method", "Method"]];
  function shell(inner, active) {
    return '<div class="wrap"><header class="top"><a class="brand" href="#/"><i></i>The Photon Scheduler</a><nav>' + NAV.map(function (x) { return '<a href="#/' + x[0] + '"' + (active === x[0] ? ' class="on"' : "") + ">" + x[1] + "</a>"; }).join("") +
      '</nav><div class="right"><button class="pill ghost sm" data-theme-btn>' + (isDark() ? "Light" : "Dark") + '</button><a class="pill sm" href="/">abhaychakra.com <i>←</i></a></div></header>' + inner +
      '<footer class="foot"><span>The Photon Scheduler, a project by Abhay Chakra Sadineni</span><span>Spectra and lifetimes from FPbase (CC BY-SA 4.0); the cell and its time course are synthetic</span><span><a href="#/method">Method, assumptions and sources</a></span><span><a href="https://www.abhaychakra.com/p/ai-counterfactual/">The AI Counterfactual</a> · <a href="https://www.abhaychakra.com/p/healthcare/">The Healthcare Counterfactual</a></span></footer></div>';
  }

  /* ------------------------------------------------------------ the instrument (home) */
  function stepOf() { var run = S.runs[S.arm]; return run.steps[Math.min(S.k, run.steps.length - 1)]; }
  function consoleHtml() {
    var run = S.runs[S.arm], st = stepOf(), panel = S.runs.panel, truth = S.runs.truth, k = Math.min(S.k, run.steps.length - 1);
    var done = st.done, dose = st.dose, budget = S.intent.budget, ipp = infoPerPhoton(run, k), drift = run.steps.slice(0, k + 1).filter(function (s) { return s.drift; }).length;
    var next = run.steps[k + 1];
    var rows = [["intent", esc(S.intent.label)], ["arm", S.arm === "adaptive" ? "the scheduler" : "fixed protocol (no agent)"], ["plan", esc(st.act.laser + " nm · " + st.act.power + " mW · " + st.act.dwell + " ms · " + st.act.bands.map(function (b) { return b[0] + "–" + b[1]; }).join(", ") + (st.act.tcspc ? " · time-resolved" : ""))],
      ["why", esc(st.reason)], ["dose spent", n(dose, 0) + " of " + n(budget) + " units (" + pct(dose / budget) + ")"], ["photons", n(run.steps.slice(0, k + 1).reduce(function (s, x) { return s + x.photons; }, 0)) + " detected"],
      ["information", S.arm === "adaptive" ? n(ipp * 1000, 2) + " millinats per photon" : "not computed for the fixed arm"], ["drift", drift ? drift + " re-fit" + (drift > 1 ? "s" : "") + " after residual spikes" : "none flagged"],
      ["status", done ? '<span class="pos">target reached at step ' + (k + 1) + "</span>" : k >= run.steps.length - 1 ? '<span class="amb">budget exhausted before target</span>' : "step " + (k + 1) + " of " + run.steps.length], ["next", next ? esc(next.act.laser + " nm, " + next.act.dwell + " ms" + (next.act.tcspc ? ", time-resolved" : "")) : "stop"]];
    return '<p class="label">Control plane</p>' + rows.map(function (r) { return '<div class="crow"><span>' + r[0] + "</span><b>" + r[1] + "</b></div>"; }).join("");
  }
  function estimateRows() {
    var st = stepOf(), panel = S.runs.panel, truth = S.runs.truth;
    return table(["Structure", "Fluorophore", "#Truth now", "#Estimate", "#Precision", "State"], panel.map(function (f, i) { var t = st.a[i], e = st.est[i], cv = st.cv[i], ok = t < 8 ? e < 20 : Math.abs(e - t) / t < 0.15; var unresolved = !isFinite(st.sd[i]) || st.sd[i] > 500; return [STRUCT[i][1], '<span class="dot" style="background:' + col(f) + '"></span>' + esc(f.name), n(t, 0), unresolved ? '<span class="small">not yet resolved</span>' : n(e, 0) + ' <span class="small">± ' + n(st.sd[i], 0) + "</span>", t < 8 ? (st.sd[i] < 20 ? "absent, settled" : "absent, open") : unresolved ? "" : pct(cv) + (cv <= S.intent.cvTarget ? " ✓" : ""), unresolved ? '<span class="small">pending</span>' : ok ? '<span class="pos">within 15%</span>' : '<span class="neg">off</span>']; }));
  }
  function spectraSvg() {
    var panel = S.runs.panel, st = stepOf(), W = CW(), H = Math.round(W * 0.36), m = { t: 16, r: 10, b: 28, l: 34 }, x = function (nm) { return m.l + (nm - 380) / (720 - 380) * (W - m.l - m.r); }, y = function (v) { return H - m.b - v * (H - m.t - m.b); }, b = "";
    for (var nm = 400; nm <= 700; nm += 50) b += T(x(nm), H - 8, nm, "", "middle");
    st.act.bands.forEach(function(bd) { b += '<rect x="' + x(bd[0]) + '" y="' + m.t + '" width="' + (x(bd[1]) - x(bd[0])) + '" height="' + (H - m.t - m.b) + '" fill="var(--accent)" opacity=".18"/>'; });
    panel.forEach(function (f) { var c = col(f), dEx = "", dEm = ""; for (var l = 380; l <= 720; l += 2) { var i = l - PH.GRID0, ex = f.ex[i] || 0, em = f.em[i] || 0; dEx += (l === 380 ? "M" : "L") + x(l) + "," + y(ex); dEm += (l === 380 ? "M" : "L") + x(l) + "," + y(em); } b += '<path d="' + dEx + '" fill="none" stroke="' + c + '" stroke-width="1.4" stroke-dasharray="3 4" opacity=".8"/>' + '<path d="' + dEm + '" fill="' + c + '" fill-opacity=".14" stroke="' + c + '" stroke-width="2"/>'; });
    var lc = col({ emMax: st.act.laser }); b += '<line x1="' + x(st.act.laser) + '" x2="' + x(st.act.laser) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" stroke="' + lc + '" stroke-width="2"/>' + T(x(st.act.laser) + 5, m.t + 10, st.act.laser + " nm");
    return svg(W, H, b, "Dashed: excitation. Filled: emission. Vertical line: the laser in use. Shaded: the detector bands chosen for this exposure. Spectra from FPbase.") + legend(panel.map(function (f, i) { return [STRUCT[i][1].split(" (")[0] + ": " + f.name + (f.lifetime ? ", τ " + f.lifetime + " ns" : ""), col(f)]; }));
  }
  function precisionChart() {
    var A = S.runs.adaptive, F = S.runs.fixed, panel = S.runs.panel, truth = S.runs.truth;
    var sa = A.steps.map(function (s) { return [s.dose, meanCV(s, panel, truth)]; }), sf = F.steps.map(function (s) { return [s.dose, meanCV(s, panel, truth)]; });
    return lines([{ label: "the scheduler", color: "var(--accent)", points: sa, dots: true }, { label: "fixed protocol", color: "var(--c5)", points: sf, dash: true }], { fmt: function (v) { return pct(v); }, xfmt: function (v) { return Math.round(v); }, cap: "Mean coefficient of variation of the abundance estimates for the structures present, against weighted light dose (mW ms, weighted by wavelength). Lower is better; the dashed target is " + pct(S.intent.cvTarget) + ".", height: 240 });
  }
  function lifetimeSvg() {
    var panel = S.runs.panel, W = CW(), H = 120, b = "", m = { l: 30, r: 10, t: 10, b: 24 }, x = function (t) { return m.l + t / 12 * (W - m.l - m.r); }, y = function (v) { return H - m.b - v * (H - m.t - m.b); };
    panel.forEach(function (f) { if (!f.lifetime) return; var d = ""; for (var i = 0; i <= 48; i++) { var t = i / 4; d += (i ? "L" : "M") + x(t) + "," + y(Math.exp(-t / f.lifetime)); } b += '<path d="' + d + '" fill="none" stroke="' + col(f) + '" stroke-width="2"/>'; });
    [0, 4, 8, 12].forEach(function (t) { b += T(x(t), H - 6, t + " ns", "", "middle"); });
    return svg(W, H, b, "Single-exponential decays at each fluorophore's published lifetime. In time-resolved mode the mean photon arrival time in a band adds one more equation per band, which is what separates mCherry (1.4 ns) from mScarlet (3.9 ns) when their spectra will not.") + legend(panel.filter(function (f) { return f.lifetime; }).map(function (f) { return [f.name + " " + f.lifetime + " ns", col(f)]; }));
  }
  function home() {
    if (!S.runs) compute();
    var run = S.runs[S.arm], panel = S.runs.panel;
    var html = '<div class="curwrap"><div class="curhead"><p class="label">The Photon Scheduler</p><h1>Decide what to <em>measure</em> next</h1><p>An agent runs a fluorescence instrument on one cell: it turns an intent into a plan of lasers, filter bands, exposures and lifetime gates, watches the photons come back, re-plans as the dyes bleach, and stops when it knows enough. Beside it, the fixed protocol a lab would run without the agent, at the same light dose.</p></div>' +
      '<div class="cur" id="stage"><canvas></canvas><div class="hud"><p class="label" style="color:rgba(241,238,255,.6)">The Photon Scheduler</p><h1>Decide what to <em>measure</em> next</h1><p>One cell, revolving: nucleus, actin cortex, microtubule tips and mitochondria, each tagged with a real fluorescent protein. The laser sweeps, photons fly to the detector ring laid out by wavelength, and the bright arcs are the bands the scheduler chose for this exposure.</p></div>' +
      '<div class="console" id="console">' + consoleHtml() + '</div></div>' +
      '<div class="scrub"><button class="btn sm" id="play">' + (S.playing ? "Pause" : "Play") + '</button><input type="range" id="step" min="0" max="' + (run.steps.length - 1) + '" value="' + Math.min(S.k, run.steps.length - 1) + '"><span class="small mono" id="stepLbl">step ' + (Math.min(S.k, run.steps.length - 1) + 1) + " of " + run.steps.length + "</span>" +
      '<span class="arm">' + chip("the scheduler", S.arm === "adaptive", 'data-arm="adaptive"') + chip("fixed protocol", S.arm === "fixed", 'data-arm="fixed"') + "</span></div></div>" +
      '<div class="controls"><label>Intent<select id="intent">' + INTENTS.map(function (it) { return '<option value="' + it.id + '"' + (it === S.intent ? " selected" : "") + ">" + esc(it.label) + "</option>"; }).join("") + "</select></label>" +
      STRUCT.map(function (s, i) { return "<label>" + esc(s[1]) + '<select data-slot="' + i + '">' + LIB.proteins.filter(function (p) { return !p.reporter; }).map(function (p) { return '<option value="' + esc(p.name) + '"' + (p.name === S.panel[i] ? " selected" : "") + ">" + esc(p.name) + " · " + p.exMax + "/" + p.emMax + (p.lifetime ? " · " + p.lifetime + " ns" : "") + "</option>"; }).join("") + "</select></label>"; }).join("") +
      '<button class="btn" id="newcell">New cell</button></div>' +
      '<div class="grid2">' + pane('<p class="label">What the agent believes, at this step</p>' + estimateRows() + '<p class="small">Truth is the current abundance after bleaching, in arbitrary units; the estimate is the agent\'s non-negative least-squares fit on everything it has seen, with recent exposures weighted more. Precision is the standard error over the estimate.</p>', "hi") +
      pane('<p class="label">Precision against light dose, both arms</p>' + precisionChart()) + "</div>" +
      '<div class="grid2">' + pane('<p class="label">The spectra, the laser and the bands of this exposure</p>' + spectraSvg()) + pane('<p class="label">The lifetimes</p>' + lifetimeSvg() + '<p class="label" style="margin-top:1rem">Photons per band, this exposure</p>' + hbars(stepOf().act.bands.map(function (b, i) { var o = stepOf().obs[i]; return { label: b[0] + "–" + b[1] + " nm", v: o.N, color: col({ emMax: (b[0] + b[1]) / 2 }) }; }), { height: 90 })) + "</div>" +
      '<div class="section">' + vhead("The decision log", "Every exposure the scheduler chose, with the reason it logged, the photons it got back and the dose it spent. The first row is a deliberately cheap survey.") +
      pane(table(["#", "Laser", "Power", "Dwell", "Bands", "Mode", "#Photons", "#Dose", "Reason", "Drift"], S.runs.adaptive.steps.map(function (s, i) { return [String(i + 1), s.act.laser + " nm", s.act.power + " mW", s.act.dwell + " ms", s.act.bands.map(function (b) { return b[0] + "–" + b[1]; }).join(", "), s.act.tcspc ? "time-resolved" : "spectral", n(s.photons), n(s.dose, 0), '<span class="small">' + esc(s.reason) + "</span>", s.drift ? '<span class="amb">re-fit</span>' : ""]; }))) + "</div>" +
      '<div class="section"><div class="simcard"><div><p class="label">The other scale</p><h2>Hours: which cell to <em>look at</em>, and when</h2><p>Twenty-four cells, six hours, a calcium reporter that flares for a minute or two at a time. The instrument cannot watch them all without cooking them. The scheduler learns which cells are active and where to spend its looks; the fixed cadence visits every cell in turn.</p><a class="pill" href="#/field">Open the field <i>→</i></a></div><div class="nums"><div><b>' + n(computeField().adaptive.caught) + " of " + n(S.field.adaptive.totalEvents) + '</b>events caught, the scheduler</div><div><b>' + n(S.field.fixed.caught) + " of " + n(S.field.fixed.totalEvents) + '</b>events caught, fixed cadence</div><div><b>' + n(S.field.oracle.caught) + '</b>if every cell\'s rate were known</div><div><b>' + n(S.field.adaptive.dose) + '</b>looks, every arm, equal dose</div></div></div></div>' +
      '<div class="banner"><b>What is real and what is not.</b> The excitation and emission spectra, extinction coefficients, quantum yields and fluorescence lifetimes are FPbase records for the named proteins. The cell, its expression levels, the bleaching rates, the autofluorescence and the event time course are a stated model with assumed constants, all listed on the method page. The loop has been demonstrated on this simulated instrument and on nothing else.</div>';
    setTimeout(mountHome, 0);
    return html;
  }
  function mountHome() {
    var box = document.getElementById("stage"); if (!box) return;
    if (S.stage) S.stage.stop();
    var flash = 0;
    S.stage = ST.startCell(box, function () { flash *= 0.9; return { panel: S.runs.panel, a0: S.runs.truth, step: stepOf(), flash: flash }; });
    var range = document.getElementById("step"), lbl = document.getElementById("stepLbl"), run = S.runs[S.arm];
    function setK(k, rerender) { S.k = k; flash = 1; range.value = k; lbl.textContent = "step " + (k + 1) + " of " + run.steps.length; document.getElementById("console").innerHTML = consoleHtml(); if (rerender) { render(); } }
    range.addEventListener("input", function () { setK(+range.value, false); });
    range.addEventListener("change", function () { setK(+range.value, true); });
    document.getElementById("play").addEventListener("click", function () { S.playing = !S.playing; document.getElementById("play").textContent = S.playing ? "Pause" : "Play"; clearInterval(S.timer); if (S.playing) { if (S.k >= run.steps.length - 1) S.k = -1; S.timer = setInterval(function () { if (S.k >= run.steps.length - 1) { S.playing = false; clearInterval(S.timer); render(); return; } setK(S.k + 1, false); }, 700); } });
    document.querySelectorAll("[data-arm]").forEach(function (b) { b.addEventListener("click", function () { S.arm = b.dataset.arm; S.k = Math.min(S.k, S.runs[S.arm].steps.length - 1); clearInterval(S.timer); S.playing = false; render(); }); });
    document.getElementById("intent").addEventListener("change", function (e) { S.intent = INTENTS.filter(function (i) { return i.id === e.target.value; })[0]; S.runs = null; clearInterval(S.timer); S.playing = false; render(); });
    document.querySelectorAll("[data-slot]").forEach(function (sel) { sel.addEventListener("change", function () { S.panel[+sel.dataset.slot] = sel.value; S.runs = null; clearInterval(S.timer); S.playing = false; render(); }); });
    document.getElementById("newcell").addEventListener("click", function () { S.seed += 1; S.runs = null; S.field = null; clearInterval(S.timer); S.playing = false; render(); });
  }

  /* ------------------------------------------------------------ the field */
  function fieldConsole() {
    var run = S.field[S.farm], t = S.ft, look = run.looks.filter(function (l) { return l.t <= t; }).pop(), seen = 0, tot = 0, dose = 0;
    run.cells.forEach(function (c) { c.events.forEach(function (e) { if (e.t0 <= t) { tot++; } }); });
    var tl = run.timeline.filter(function (x) { return x.t <= t; }).pop() || { caught: 0, events: 0, dose: 0 };
    var rows = [["intent", "catch every event with the fewest looks"], ["policy", S.farm === "adaptive" ? "bandit over cells: a gamma-Poisson event rate per cell, a posterior draw each step (Thompson sampling), the chance an unseen event is live, and a rest after a caught event" : "fixed cadence: every cell in turn, each seen every 4 minutes"], ["now", look ? "cell " + (look.cell + 1) + (look.signal ? ", event live" : ", quiet") : "waiting"], ["why", look ? esc(look.why) : ""], ["events so far", n(tl.events) + " started, " + n(tl.caught) + " caught (" + pct(tl.events ? tl.caught / tl.events : 0) + ")"], ["looks spent", n(tl.dose) + " of " + n(run.dose)], ["stimulus", t > 7200 && t < 9600 ? '<span class="amb">active: rates tripled from 2 h 00 to 2 h 40</span>' : "none"]];
    return '<p class="label">Control plane</p>' + rows.map(function (r) { return '<div class="crow"><span>' + r[0] + "</span><b>" + r[1] + "</b></div>"; }).join("");
  }
  function field() {
    computeField(); var A = S.field.adaptive, F = S.field.fixed, run = S.field[S.farm];
    var html = '<div class="curwrap"><div class="curhead"><p class="label">The field</p><h1>Which cell to <em>look at</em>, and when</h1><p>Twenty-four cells over six hours with a calcium reporter (GCaMP6f) that flares for a minute or two. Every look costs light. The scheduler spends its looks where events are likely; the fixed cadence visits every cell in turn.</p></div>' +
      '<div class="cur field" id="fstage"><canvas></canvas><div class="hud"><p class="label" style="color:rgba(241,238,255,.6)">The field</p><h1>Which cell to <em>look at</em>, and when</h1><p>Bright cells have a live calcium event; a white ring means the scheduler caught it; a dashed red ring means it is being missed. The beam is the current look.</p></div><div class="console" id="fconsole">' + fieldConsole() + '</div></div>' +
      '<div class="scrub"><button class="btn sm" id="fplay">' + (S.fplaying ? "Pause" : "Play") + '</button><input type="range" id="ft" min="0" max="' + run.T + '" step="10" value="' + S.ft + '"><span class="small mono" id="ftLbl">' + tlabel(S.ft) + "</span><span class=\"arm\">" + chip("the scheduler", S.farm === "adaptive", 'data-farm="adaptive"') + chip("fixed cadence", S.farm === "fixed", 'data-farm="fixed"') + "</span></div></div>" +
      '<div class="curstats">' + ro("Events caught, the scheduler", n(A.caught) + " of " + n(A.totalEvents), pct(A.caught / A.totalEvents) + " with " + n(A.dose) + " looks") + ro("Events caught, fixed cadence", n(F.caught) + " of " + n(F.totalEvents), pct(F.caught / F.totalEvents) + " with " + n(F.dose) + " looks") + ro("If every rate were known", n(S.field.oracle.caught) + " of " + n(S.field.oracle.totalEvents), "the same policy with the true rates given; the scheduler reaches " + pct(A.caught / S.field.oracle.caught) + " of it by learning") + ro("Hot cells", n(A.cells.filter(function (c) { return c.hot; }).length) + " of " + n(A.cells.length), "six times the event rate; unknown to the scheduler at the start") + ro("Stimulus", "2 h 00 to 2 h 40", "every rate tripled, a scripted perturbation") + "</div>" +
      '<div class="grid2">' + pane('<p class="label">Events caught over time, both arms</p>' + lines([{ label: "the scheduler", color: "var(--accent)", points: A.timeline.map(function (x) { return [x.t / 3600, x.caught]; }) }, { label: "fixed cadence", color: "var(--c5)", points: F.timeline.map(function (x) { return [x.t / 3600, x.caught]; }), dash: true }, { label: "rates known in advance", color: "var(--amb)", points: S.field.oracle.timeline.map(function (x) { return [x.t / 3600, x.caught]; }), width: 1.2, dash: true }, { label: "events started", color: "var(--ink3)", points: A.timeline.map(function (x) { return [x.t / 3600, x.events]; }), width: 1 }], { xfmt: function (v) { return v + " h"; }, xticks: [0, 1, 2, 3, 4, 5, 6], height: 240, cap: "Same cells, same events, same number of looks. The gap between the scheduler and the fixed cadence is the value of learning where events happen; the gap to the known-rates line is the cost of having to learn it." })) +
      pane('<p class="label">Looks per cell, the scheduler</p>' + hbars(A.cells.slice().sort(function (a, b) { return b.looks - a.looks; }).slice(0, 12).map(function (c) { return { label: "cell " + (c.id + 1) + (c.hot ? " · hot" : ""), v: c.looks, color: c.hot ? "var(--accent)" : "var(--c5)" }; }), { cap: "Hot cells attract looks once their hit rate shows; cold cells still get exploratory visits." })) + "</div>" +
      '<div class="section">' + vhead("How the field policy works", "A gamma-Poisson bandit, written out.") + pane('<ul class="clean"><li>Each cell carries a gamma posterior on its event rate: shape = events caught plus one half, rate = the seconds of time the cell has effectively been watched (each look covers the interval since the previous look, capped at one event duration), starting from a weak prior of one event an hour.</li><li>Each step, one rate is drawn from every cell\'s posterior (Thompson sampling) and the cell with the highest chance of an unseen event being live now, 1 − exp(−rate × covered interval), gets the look.</li><li>After a caught event the cell is rested for most of an event duration, because a new event cannot start until the current one ends.</li><li>The fixed cadence looks at the next cell every ten seconds, so each cell is seen every four minutes; both arms spend exactly the same number of looks.</li><li>Events are drawn from a Poisson process per cell (hot cells 2.2 an hour, others 0.35), lasting 54 to 126 seconds, with all rates tripled during a scripted stimulus in the third hour. The time course is synthetic and the numbers are choices, not measurements.</li></ul>') + "</div>";
    setTimeout(mountField, 0);
    return html;
  }
  function tlabel(t) { var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60); return h + " h " + (m < 10 ? "0" : "") + m + " min"; }
  function mountField() {
    var box = document.getElementById("fstage"); if (!box) return;
    if (S.fstage) S.fstage.stop();
    S.fstage = ST.startField(box, function () { return { run: S.field[S.farm], t: S.ft, reporter: BY.GCaMP6f, showMissed: true }; });
    var range = document.getElementById("ft"), lbl = document.getElementById("ftLbl");
    function setT(t) { S.ft = t; range.value = t; lbl.textContent = tlabel(t); document.getElementById("fconsole").innerHTML = fieldConsole(); }
    range.addEventListener("input", function () { setT(+range.value); });
    document.getElementById("fplay").addEventListener("click", function () { S.fplaying = !S.fplaying; document.getElementById("fplay").textContent = S.fplaying ? "Pause" : "Play"; clearInterval(S.ftimer); if (S.fplaying) { if (S.ft >= S.field[S.farm].T) S.ft = 0; S.ftimer = setInterval(function () { if (S.ft >= S.field[S.farm].T) { S.fplaying = false; clearInterval(S.ftimer); document.getElementById("fplay").textContent = "Play"; return; } setT(S.ft + 30); }, 50); } });
    document.querySelectorAll("[data-farm]").forEach(function (b) { b.addEventListener("click", function () { S.farm = b.dataset.farm; clearInterval(S.ftimer); S.fplaying = false; render(); }); });
  }

  /* ------------------------------------------------------------ spectra library */
  function spectra() {
    var W = CW(), H = Math.round(W * 0.34);
    return '<div class="chead"><div><div class="id"><b>Spectra</b><span>' + LIB.proteins.length + " fluorescent proteins from FPbase</span></div><h1>The <em>library</em> the panel is built from</h1><p class=\"lede\">" + esc(LIB.source) + ' Each entry links to its FPbase page and the paper that described it.</p></div></div>' +
      '<div class="mcards">' + LIB.proteins.map(function (f) { var b = "", x = function (nm) { return (nm - 380) / 340 * 200; }, y = function (v) { return 44 - v * 40; }, dEx = "", dEm = ""; for (var l = 380; l <= 720; l += 4) { var i = l - PH.GRID0; dEx += (l === 380 ? "M" : "L") + x(l) + "," + y(f.ex[i] || 0); dEm += (l === 380 ? "M" : "L") + x(l) + "," + y(f.em[i] || 0); } return '<a class="mcard" href="' + esc(f.url) + '" target="_blank" rel="noopener"><div class="n"><span>' + esc(f.name) + "</span><span>" + f.exMax + " / " + f.emMax + ' nm</span></div><svg viewBox="0 0 200 48" style="width:100%;height:48px;margin:.5rem 0"><path d="' + dEx + '" fill="none" stroke="' + col(f) + '" stroke-dasharray="3 3" stroke-width="1.2"/><path d="' + dEm + '" fill="' + col(f) + '" fill-opacity=".2" stroke="' + col(f) + '" stroke-width="1.6"/></svg><p>EC ' + n(f.ec) + " · QY " + f.qy + (f.lifetime ? " · τ " + f.lifetime + " ns" + (f.lifetimeAssumed ? " (assumed)" : "") : " · no lifetime on file") + (f.reporter ? " · calcium reporter, " + esc(f.stateUsed) : "") + '</p><div class="sub">' + (f.doi ? "doi " + esc(f.doi) : "") + "</div></a>"; }).join("") + "</div>";
  }

  /* ------------------------------------------------------------ method */
  function method() {
    var A = PH.ASSUME;
    return '<div class="chead"><div><div class="id"><b>Method</b><span>the model, the assumptions, the sources</span></div><h1>What is <em>modelled</em>, and what is only assumed</h1><p class="lede">Everything a reviewer would ask for, in one place. The physics is the standard photon-counting model; the constants that are not on FPbase are listed as assumptions with their values.</p></div></div>' +
      '<div class="bento">' + pane('<p class="label">The photon model</p><ul class="clean"><li><b>Excitation.</b> Rate for fluorophore f under laser λ at power P: proportional to its extinction coefficient × its normalised excitation spectrum at λ × P.</li><li><b>Emission.</b> Multiplied by the quantum yield × the fraction of the emission spectrum inside the detector band × detector efficiency (' + A.qe + ').</li><li><b>Counting.</b> Counts per band are Poisson with mean rate × dwell × abundance, plus an autofluorescence background (Gaussian emission centred at ' + A.autofluor.peak + ' nm, ' + A.autofluor.rate + ' counts per mW ms under violet, halved at 488, small beyond).</li><li><b>Bleaching.</b> After each exposure, abundance × exp(−k · P · ex(λ) · dwell), with k = ' + A.bleach.base + ' × a relative factor per protein (mCherry 1.0, mScarlet 0.55, mStayGold 0.25 and so on). The relative factors are assumptions, not FPbase data.</li><li><b>Lifetime.</b> In time-resolved mode each photon carries an arrival time drawn from its fluorophore\'s exponential decay, blurred by a Gaussian instrument response of ' + A.irfSigma + ' ns; the mean arrival time per band is recorded. Time-resolved mode keeps ' + (A.tcspcLoss * 100) + '% of the counts, a dead-time budget.</li><li><b>Dose.</b> mW × ms weighted by wavelength (405 nm × 2, 445 × 1.5, 488 × 1, 561 × 0.7, 640 × 0.5), an assumed phototoxicity weighting.</li></ul>', "s6") +
      pane('<p class="label">The estimator and the planner</p><ul class="clean"><li><b>Linear model.</b> For each band, expected counts are linear in the abundances; in time-resolved mode a second equation per band, counts × mean arrival time, is linear in abundances × lifetimes. Background terms are known.</li><li><b>Fit.</b> Weighted non-negative least squares (Lawson and Hanson active set), weights 1/counts, with older rows down-weighted as light dose accumulates, so bleaching is followed rather than fitted. Standard errors from the weighted normal matrix; a residual spike over the last 24 rows is logged as a re-fit.</li><li><b>Planner.</b> Candidate actions: five laser lines × four powers × four dwells × spectral or time-resolved, each with the detector bands that best isolate the fluorophores that line excites. Choose the action maximising the gain in log-determinant of the Fisher information (D-optimality) per unit of dose plus a fixed per-exposure overhead. Stop when every present structure meets the precision target and every absent one is settled, or when the budget is spent.</li><li><b>Baseline.</b> Cycle the lasers at 1 mW for 20 ms each with the same band design and no lifetime information, until the same dose has been spent.</li><li><b>Field policy.</b> A gamma-Poisson bandit over cells, written out on the field page.</li></ul>', "s6") +
      pane('<p class="label">What is real</p><ul class="clean"><li>Excitation and emission spectra, extinction coefficients, quantum yields, lifetimes and references for the ' + LIB.proteins.length + ' proteins: FPbase, CC BY-SA 4.0, pulled 16 September 2026. mOrange, mRuby3, mEmerald and tdTomato carry no lifetime on FPbase; GCaMP6f\'s lifetime is assumed at 2.6 ns.</li><li>The tagging pairs (H2B for the nucleus, LifeAct for actin, EB3 for microtubule tips, a mitochondrial targeting sequence) are standard reagents; the pairing with a particular protein is the visitor\'s choice.</li></ul><p class="label" style="margin-top:1rem">What is synthetic</p><ul class="clean"><li>The cell geometry, the expression levels (log-normal around 400 units, 18% chance a structure is absent), the bleaching factors, the autofluorescence, the dose weights, the count scale (' + A.gain + ' photons per unit per mW ms at EC 10<sup>5</sup> and QY 1) and the event time course.</li><li>No real microscope has been driven by this code. The page demonstrates a control loop on a simulated instrument.</li></ul>', "s6") +
      pane('<p class="label">What it would take to run on a real instrument</p><ul class="clean"><li>A control API for laser power, filter wheel or spectral detector bands, exposure and stage position, and a TCSPC card for arrival times.</li><li>A calibration routine that measures the actual band responses and the instrument response function, replacing the model matrix with a measured one.</li><li>A hard limit on cumulative dose per cell, enforced below the planner, and a log that a person can audit.</li><li>Validation on a fixed sample of known composition before any live-cell use.</li></ul><p class="small">Nothing here is medical, investment or legal advice. Source bundle, including the model and the planner, available on request.</p>', "s6") + "</div>";
  }

  /* ------------------------------------------------------------ router */
  function parse() { var h = location.hash.replace(/^#\/?/, ""); return h.split("/").filter(Boolean); }
  function render() {
    if (S.stage) { S.stage.stop(); S.stage = null; } if (S.fstage) { S.fstage.stop(); S.fstage = null; }
    var p = parse(), active = p[0] || "", html;
    if (!p.length) html = home(); else if (p[0] === "field") html = field(); else if (p[0] === "spectra") html = spectra(); else if (p[0] === "method") html = method(); else html = '<div class="chead"><h1>Not found</h1><p><a href="#/">Home</a></p></div>';
    var y = window.scrollY, same = $app.dataset.route === active; $app.dataset.route = active;
    $app.innerHTML = shell(html, active);
    $app.querySelector("[data-theme-btn]").addEventListener("click", function () { var t = isDark() ? "light" : "dark"; document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("ps-theme", t); } catch (e) {} render(); });
    if (same) window.scrollTo(0, y); else window.scrollTo(0, 0);
  }
  addEventListener("hashchange", render);
  var bp = innerWidth < 720; addEventListener("resize", function () { var b = innerWidth < 720; if (b !== bp) { bp = b; render(); } });
  fetch(BASE + "data/fluorophores.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("library " + r.status); return r.json(); }).then(function (lib) { LIB = lib; lib.proteins.forEach(function (p) { BY[p.name] = p; }); render(); }).catch(function (e) { $app.innerHTML = '<div class="wrap"><div class="chead"><h1>The library could not be loaded</h1><p>' + esc(e.message) + "</p></div></div>"; });
})();
