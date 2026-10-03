/* The Photon Scheduler: instrument physics.
   Spectra, extinction coefficients, quantum yields and lifetimes come from FPbase (CC BY-SA 4.0). The photon
   model is the standard one: excitation proportional to the excitation spectrum at the laser line times the
   extinction coefficient, emission collected in a band proportional to the fraction of the emission spectrum
   inside it times the quantum yield, Poisson counting, first-order photobleaching, and single-exponential
   fluorescence decay convolved with a Gaussian instrument response. Every assumed constant is named in ASSUME. */
(function (global) {
  "use strict";
  var GRID0 = 350, GRID1 = 750;
  var ASSUME = {
    gain: 1.5,              // photons per (abundance unit x mW x ms) at EC 1e5 and QY 1, before spectral factors; sets the count scale
    qe: 0.8,               // detector quantum efficiency, flat across the band
    autofluor: { peak: 500, width: 60, rate: 3 },  // autofluorescence: Gaussian emission, counts per mW per ms at 405/445 excitation, halved at 488, negligible beyond
    autoLifetime: 1.2,     // ns, autofluorescence mean lifetime
    irfSigma: 0.25,        // ns, instrument response, Gaussian
    bleach: { base: 0.00055, rel: { mCherry: 1.0, mScarlet: 0.55, "mScarlet-I": 0.6, EGFP: 0.8, mNeonGreen: 1.1, mTurquoise2: 0.7, mTagBFP2: 1.4, mCerulean3: 0.8, mClover3: 1.0, mStayGold: 0.25, mVenus: 1.3, Citrine: 1.2, mOrange: 0.9, TagRFP: 0.7, mApple: 1.1, mKate2: 0.9, miRFP670: 0.8, GCaMP6f: 0.9 } },
                           // bleaching: abundance x= exp(-base x rel x P x ex(lambda) x t). Relative ranks are assumptions (grade E), not FPbase data
    tcspcLoss: 0.5,        // fraction of counts kept in time-resolved mode (pile-up and dead-time budget)
    doseWeight: { 405: 2.0, 445: 1.5, 488: 1.0, 561: 0.7, 640: 0.5 } // phototoxicity weight per mW ms by laser line, assumed
  };
  var LASERS = [405, 445, 488, 561, 640];
  var POWERS = [0.25, 0.5, 1, 2];
  var DWELLS = [5, 10, 20, 50];

  function seeded(seed) { var s = (seed * 2654435761 + 12345) >>> 0 || 1; for (var w = 0; w < 12; w++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; } return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function gauss(rnd) { var u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }
  function poisson(rnd, mu) { if (mu <= 0) return 0; if (mu > 60) return Math.max(0, Math.round(mu + Math.sqrt(mu) * gauss(rnd))); var L = Math.exp(-mu), k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; }

  function idx(l) { return Math.max(0, Math.min(GRID1 - GRID0, Math.round(l) - GRID0)); }
  function exAt(f, lambda) { return f.ex[idx(lambda)] || 0; }
  function emFrac(f, lo, hi) { var s = 0, t = 0; for (var l = GRID0; l <= GRID1; l++) { var v = f.em[l - GRID0] || 0; t += v; if (l >= lo && l <= hi) s += v; } return t ? s / t : 0; }
  function autoFrac(lo, hi) { var A = ASSUME.autofluor, s = 0, t = 0; for (var l = GRID0; l <= GRID1; l++) { var v = Math.exp(-0.5 * Math.pow((l - A.peak) / A.width, 2)); t += v; if (l >= lo && l <= hi) s += v; } return s / t; }
  function autoEx(lambda) { return lambda <= 445 ? 1 : lambda <= 488 ? 0.5 : lambda <= 561 ? 0.08 : 0.02; }
  /* photons per ms per abundance unit at power P for fluorophore f, laser lambda, band [lo,hi] */
  function rate(f, lambda, lo, hi, P) { return ASSUME.gain * (f.ec / 1e5) * exAt(f, lambda) * f.qy * emFrac(f, lo, hi) * ASSUME.qe * P; }
  function bgRate(lambda, lo, hi, P) { return ASSUME.autofluor.rate * autoEx(lambda) * autoFrac(lo, hi) * P; }
  function bleachRate(f, lambda, P) { var rel = ASSUME.bleach.rel[f.name] || 1; return ASSUME.bleach.base * rel * P * exAt(f, lambda); }
  function dose(lambda, P, t) { return (ASSUME.doseWeight[lambda] || 1) * P * t; }

  /* one exposure of a sample with abundances a (array over panel) : returns counts and mean arrival time per band */
  function expose(rnd, panel, a, act) {
    var out = [], lambda = act.laser, P = act.power, t = act.dwell, keep = act.tcspc ? ASSUME.tcspcLoss : 1;
    act.bands.forEach(function (b) {
      var N = 0, sumT = 0, sumT2 = 0, perF = [];
      panel.forEach(function (f, i) { var mu = rate(f, lambda, b[0], b[1], P) * t * a[i] * keep, n = poisson(rnd, mu); perF.push(n); N += n; sumT += n * f.lifetime; sumT2 += n * f.lifetime * f.lifetime; });
      var nb = poisson(rnd, bgRate(lambda, b[0], b[1], P) * t * keep); N += nb; sumT += nb * ASSUME.autoLifetime; sumT2 += nb * ASSUME.autoLifetime * ASSUME.autoLifetime;
      var tbar = null;
      if (act.tcspc && N > 0) { var mean = sumT / N, varPhoton = sumT2 / N + ASSUME.irfSigma * ASSUME.irfSigma; tbar = mean + gauss(rnd) * Math.sqrt(varPhoton / N); }
      out.push({ band: b, N: N, tbar: tbar, perF: perF, bg: nb });
    });
    /* bleaching */
    var a2 = a.map(function (ai, i) { return ai * Math.exp(-bleachRate(panel[i], lambda, P) * t); });
    return { obs: out, a: a2, dose: dose(lambda, P, t) };
  }

  /* ---------------------------------------------------------------- estimation
     Linear model. Row per band: N = t*keep*(sum_f a_f S_bf + bg_b). With TCSPC a second row: N*tbar = t*keep*(sum_f a_f S_bf tau_f + bg_b tau_bg).
     Weighted non-negative least squares by projected gradient; covariance from the weighted normal matrix on the active set. */
  function designRows(panel, act) {
    var rows = [], keep = act.tcspc ? ASSUME.tcspcLoss : 1;
    act.bands.forEach(function (b) {
      var s = panel.map(function (f) { return rate(f, act.laser, b[0], b[1], act.power) * act.dwell * keep; }), bg = bgRate(act.laser, b[0], b[1], act.power) * act.dwell * keep;
      rows.push({ s: s, bg: bg, kind: "N", band: b });
      if (act.tcspc) rows.push({ s: s.map(function (v, i) { return v * panel[i].lifetime; }), bg: bg * ASSUME.autoLifetime, kind: "T", band: b, sN: s, bgN: bg });
    });
    return rows;
  }
  function wls(rows, ys, ws, n, active) {
    // weighted least squares on the active set: solve (S'WS) a = S'W(y - bg)
    var m = active.length, M = [], v = new Array(m).fill(0); for (var i = 0; i < m; i++) M.push(new Array(m).fill(0));
    rows.forEach(function (r, k) { var y = ys[k] - r.bg, w = ws[k]; for (var i = 0; i < m; i++) { var si = r.s[active[i]]; v[i] += w * si * y; for (var j = 0; j < m; j++) M[i][j] += w * si * r.s[active[j]]; } });
    for (var d = 0; d < m; d++) M[d][d] += 1e-9;
    var inv = invert(M); if (!inv) return null;
    var out = new Array(m).fill(0); for (var i2 = 0; i2 < m; i2++) for (var j2 = 0; j2 < m; j2++) out[i2] += inv[i2][j2] * v[j2];
    return out;
  }
  function nnls(rows, ys, ws, n) {
    // Lawson-Hanson active set
    var a = new Array(n).fill(0), P = [], Z = []; for (var i = 0; i < n; i++) Z.push(i);
    function grad() { var g = new Array(n).fill(0); rows.forEach(function (r, k) { var pred = r.bg; for (var j = 0; j < n; j++) pred += r.s[j] * a[j]; var e = (ys[k] - pred) * ws[k]; for (var j2 = 0; j2 < n; j2++) g[j2] += e * r.s[j2]; }); return g; }
    for (var outer = 0; outer < 3 * n + 3; outer++) {
      var g = grad(), best = -1, bv = 1e-9; Z.forEach(function (j) { if (g[j] > bv) { bv = g[j]; best = j; } });
      if (best < 0) break;
      P.push(best); Z = Z.filter(function (j) { return j !== best; });
      for (var inner = 0; inner < 3 * n + 3; inner++) {
        var z = wls(rows, ys, ws, n, P); if (!z) break;
        if (z.every(function (v) { return v > 0; })) { P.forEach(function (j, i) { a[j] = z[i]; }); break; }
        var alpha = 1, drop = null; P.forEach(function (j, i) { if (z[i] <= 0) { var t = a[j] / (a[j] - z[i]); if (t < alpha) { alpha = t; drop = j; } } });
        P.forEach(function (j, i) { a[j] = a[j] + alpha * (z[i] - a[j]); });
        P = P.filter(function (j) { return j !== drop && a[j] > 1e-12; }); Z = []; for (var q = 0; q < n; q++) if (P.indexOf(q) < 0) { Z.push(q); a[q] = 0; }
      }
    }
    return a;
  }
  function covariance(rows, ws, n, a) {
    var M = []; for (var i = 0; i < n; i++) { M.push(new Array(n).fill(0)); }
    rows.forEach(function (r, k) { for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) M[i][j] += ws[k] * r.s[i] * r.s[j]; });
    for (var d = 0; d < n; d++) M[d][d] += 1e-9;
    var inv = invert(M); return inv ? inv.map(function (row) { return row.map(function (v) { return v; }); }) : null;
  }
  function invert(M) { var n = M.length, A = M.map(function (r, i) { var e = new Array(n).fill(0); e[i] = 1; return r.concat(e); }); for (var c = 0; c < n; c++) { var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-14) return null; var tmp = A[c]; A[c] = A[p]; A[p] = tmp; var pv = A[c][c]; for (var j = 0; j < 2 * n; j++) A[c][j] /= pv; for (var r2 = 0; r2 < n; r2++) if (r2 !== c) { var f = A[r2][c]; if (f) for (var j2 = 0; j2 < 2 * n; j2++) A[r2][j2] -= f * A[c][j2]; } } return A.map(function (r) { return r.slice(n); }); }
  function logdet(M) { var n = M.length, A = M.map(function (r) { return r.slice(); }), ld = 0; for (var c = 0; c < n; c++) { var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-14) return -Infinity; var tmp = A[c]; A[c] = A[p]; A[p] = tmp; ld += Math.log(Math.abs(A[c][c])); for (var r2 = c + 1; r2 < n; r2++) { var f = A[r2][c] / A[c][c]; for (var j = c; j < n; j++) A[r2][j] -= f * A[c][j]; } } return ld; }

  /* The agent's belief: accumulated rows with weights that forget as bleaching dose accumulates */
  function Belief(panel) { this.panel = panel; this.rows = []; this.ys = []; this.ws = []; this.doseAt = []; this.a = panel.map(function () { return 0; }); this.cov = null; this.cv = panel.map(function () { return Infinity; }); this.refits = 0; this.dose = 0; }
  Belief.prototype.add = function (act, obs, doseNow) {
    var self = this, rows = designRows(this.panel, act), k = 0;
    act.bands.forEach(function (b, bi) {
      var o = obs[bi]; self.rows.push(rows[k]); self.ys.push(o.N); self.ws.push(1 / Math.max(o.N, 1)); self.doseAt.push(doseNow); k++;
      if (act.tcspc) { var r = rows[k]; k++; if (o.tbar !== null) { var varT = (o.N > 0 ? (self.meanTau2(o) / o.N) : 1) * o.N * o.N; self.rows.push(r); self.ys.push(o.N * o.tbar); self.ws.push(1 / Math.max(varT, 1e-6)); self.doseAt.push(doseNow); } }
    });
    this.dose = doseNow;
    this.refit();
  };
  Belief.prototype.meanTau2 = function (o) { return 9 + ASSUME.irfSigma * ASSUME.irfSigma; };
  Belief.prototype.refit = function () {
    var n = this.panel.length, self = this, ws = this.ws.map(function (w, k) { var age = self.dose - self.doseAt[k]; return w * Math.exp(-age / 60); });
    this.a = nnls(this.rows, this.ys, ws, n);
    var cov = covariance(this.rows, ws, n, this.a); this.cov = cov;
    this.cv = this.a.map(function (ai, i) { return cov && cov[i][i] > 0 ? Math.sqrt(cov[i][i]) / Math.max(ai, 1e-6) : Infinity; });
    this.sd = this.a.map(function (ai, i) { return cov && cov[i][i] > 0 ? Math.sqrt(cov[i][i]) : Infinity; });
    // residual check: chi-square over recent rows
    var chi = 0, m = 0; for (var k = Math.max(0, this.rows.length - 24); k < this.rows.length; k++) { var pred = this.rows[k].bg; for (var j = 0; j < n; j++) pred += this.rows[k].s[j] * this.a[j]; chi += (this.ys[k] - pred) * (this.ys[k] - pred) * ws[k]; m++; }
    this.chi2 = m ? chi / m : 0;
    return this.a;
  };
  /* Fisher information of a candidate action given the current estimate */
  Belief.prototype.fisher = function (act) {
    var n = this.panel.length, rows = designRows(this.panel, act), self = this, F = []; for (var i = 0; i < n; i++) F.push(new Array(n).fill(0));
    rows.forEach(function (r) {
      var mu = r.bg; for (var j = 0; j < n; j++) mu += r.s[j] * Math.max(self.a[j], 1);
      var w;
      if (r.kind === "N") w = 1 / Math.max(mu, 1); else { var muN = r.bgN; for (var j2 = 0; j2 < n; j2++) muN += r.sN[j2] * Math.max(self.a[j2], 1); w = 1 / Math.max(self.meanTau2(null) * muN, 1e-6); }
      for (var i2 = 0; i2 < n; i2++) for (var j3 = 0; j3 < n; j3++) F[i2][j3] += w * r.s[i2] * r.s[j3];
    });
    return F;
  };
  Belief.prototype.prior = function () { var n = this.panel.length, self = this, ws = this.ws.map(function (w, k) { return w * Math.exp(-(self.dose - self.doseAt[k]) / 60); }), F = []; for (var i = 0; i < n; i++) F.push(new Array(n).fill(0)); this.rows.forEach(function (r, k) { for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) F[i][j] += ws[k] * r.s[i] * r.s[j]; }); for (var d = 0; d < n; d++) F[d][d] += 1e-4; return F; };

  /* ---------------------------------------------------------------- band design
     For each laser, candidate detector bands: for every fluorophore excited at that line, the 30 nm window that maximises its emission
     against the sum of the others' emission in the same window; deduplicated. */
  function bestBands(panel, lambda) {
    var cands = [];
    panel.forEach(function (f, i) {
      if (exAt(f, lambda) < 0.05) return;
      var best = null;
      for (var lo = Math.max(lambda + 10, 400); lo <= 700; lo += 5) { var hi = lo + 30; var own = rate(f, lambda, lo, hi, 1), other = 0; panel.forEach(function (g, j) { if (j !== i) other += rate(g, lambda, lo, hi, 1); }); var score = own * own / (own + other + bgRate(lambda, lo, hi, 1) + 1e-9); if (!best || score > best.score) best = { lo: lo, hi: hi, score: score, f: i }; }
      if (best && best.score > 0) cands.push(best);
    });
    var out = []; cands.sort(function (a, b) { return b.score - a.score; }).forEach(function (c) { if (!out.some(function (o) { return Math.abs(o[0] - c.lo) < 20; })) out.push([c.lo, c.hi]); });
    return out.slice(0, 4);
  }
  function actions(panel) {
    var acts = [];
    LASERS.forEach(function (lambda) { var bands = bestBands(panel, lambda); if (!bands.length) return; POWERS.forEach(function (P) { DWELLS.forEach(function (t) { [false, true].forEach(function (tc) { acts.push({ laser: lambda, power: P, dwell: t, bands: bands, tcspc: tc }); }); }); }); });
    return acts;
  }
  function fixedProtocol(panel) {
    return LASERS.map(function (lambda) { var bands = bestBands(panel, lambda); return bands.length ? { laser: lambda, power: 1, dwell: 20, bands: bands, tcspc: false } : null; }).filter(Boolean);
  }

  global.PS_PHYS = { ASSUME: ASSUME, LASERS: LASERS, POWERS: POWERS, DWELLS: DWELLS, seeded: seeded, gauss: gauss, poisson: poisson, exAt: exAt, emFrac: emFrac, rate: rate, bgRate: bgRate, bleachRate: bleachRate, dose: dose, expose: expose, Belief: Belief, bestBands: bestBands, actions: actions, fixedProtocol: fixedProtocol, logdet: logdet, GRID0: GRID0, GRID1: GRID1 };
})(typeof window !== "undefined" ? window : globalThis);
