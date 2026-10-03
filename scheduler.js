/* The Photon Scheduler: the control plane.
   Cell scale: choose (laser, power, dwell, bands, time-resolved or not) to maximise expected information per unit of
   light dose, D-optimal (log-determinant of the Fisher information), stop when every structure's abundance is known
   to the target precision or when the dose budget is spent. Field scale: choose which cell to look at next from a
   gamma-Poisson estimate of each cell's event rate and how long it has gone unobserved; burst while an event is live.
   Both are compared with the fixed protocols a lab would run without the agent, at the same dose. */
(function (global) {
  "use strict";
  var PH = global.PS_PHYS;

  /* ---------------------------------------------------------------- cell scale */
  function newCell(rnd, panel, opts) {
    // abundance per fluorophore: log-normal around a structure-specific typical level, some structures absent in some cells
    return panel.map(function (f, i) { var present = rnd() > (opts && opts.absentP !== undefined ? opts.absentP : 0.18); var level = present ? Math.exp(Math.log(400) + 0.5 * PH.gauss(rnd)) : 0; return Math.round(level); });
  }
  function runCell(seed, panel, intent) {
    intent = Object.assign({ cvTarget: 0.1, budget: 600, maxSteps: 60, mode: "adaptive" }, intent || {});
    var rnd = PH.seeded(seed), a0 = intent.truth || newCell(rnd, panel), a = a0.slice(), belief = new PH.Belief(panel), steps = [], doseTotal = 0, timeMs = 0;
    var acts = PH.actions(panel), fixed = PH.fixedProtocol(panel), fi = 0, prevChi = 0;
    for (var k = 0; k < intent.maxSteps; k++) {
      var act, reason, gain = null, scores = null;
      if (intent.mode === "adaptive") {
        if (k === 0) { act = fixed[0] ? Object.assign({}, fixed[Math.min(2, fixed.length - 1)], { power: 0.5, dwell: 10 }) : acts[0]; reason = "first look: a cheap survey exposure to seed the estimate"; }
        else {
          var F0 = belief.prior(), ld0 = PH.logdet(F0), best = null; scores = [];
          acts.forEach(function (c) {
            var F = belief.fisher(c), n = F.length, S = []; for (var i = 0; i < n; i++) { S.push([]); for (var j = 0; j < n; j++) S[i].push(F0[i][j] + F[i][j]); }
            // weight the information by what is still uncertain: scale rows/cols by the current CV excess
            var g = PH.logdet(S) - ld0, d = PH.dose(c.laser, c.power, c.dwell), score = g / (d + 4);
            scores.push({ act: c, gain: g, dose: d, score: score });
            if (!best || score > best.score) best = { act: c, gain: g, dose: d, score: score };
          });
          act = best.act; gain = best.gain;
          var unsure = panel.map(function (f, i) { return belief.cv[i] > intent.cvTarget && belief.a[i] > 5 ? f.name : null; }).filter(Boolean);
          reason = (act.tcspc ? "time-resolved: the lifetimes separate what the spectra cannot" : "spectral: the bands separate the remaining pairs") + "; " + (unsure.length ? "still uncertain: " + unsure.join(", ") : "confirming the estimate") + "; " + best.gain.toFixed(2) + " nats for " + best.dose.toFixed(1) + " dose units";
        }
      } else { act = fixed[fi % fixed.length]; fi++; reason = "fixed protocol: cycle the lasers, 20 ms each, no lifetime information"; }
      var r = PH.expose(rnd, panel, a, act); a = r.a; doseTotal += r.dose; timeMs += act.dwell + 8;
      belief.add(act, r.obs, doseTotal);
      var drift = belief.chi2 > 3 && belief.chi2 > prevChi * 1.5; prevChi = belief.chi2;
      var done = panel.every(function (f, i) { return (belief.a[i] < 8 && belief.sd[i] < 20) || belief.cv[i] <= intent.cvTarget; });
      steps.push({ k: k, act: act, obs: r.obs, a: a.slice(), est: belief.a.slice(), cv: belief.cv.slice(), sd: belief.sd.slice(), dose: doseTotal, time: timeMs, gain: gain, reason: reason, chi2: belief.chi2, drift: drift, done: done, photons: r.obs.reduce(function (s, o) { return s + o.N; }, 0) });
      if (intent.mode === "adaptive" && done) break;
      if (doseTotal >= intent.budget) break;
    }
    return { a0: a0, steps: steps, panel: panel, intent: intent, final: steps[steps.length - 1] };
  }
  /* accuracy: fraction of structures whose estimate is within 15% of the truth at that moment (or correctly absent) */
  function accuracy(step, panel) { var ok = 0; panel.forEach(function (f, i) { var t = step.a[i], e = step.est[i]; if (t < 8 ? e < 20 : Math.abs(e - t) / t < 0.15) ok++; }); return ok / panel.length; }

  /* Thompson sampling helpers: gamma (Marsaglia and Tsang) and beta */
  function gammaSample(rnd, k) { if (k < 1) return gammaSample(rnd, k + 1) * Math.pow(rnd(), 1 / k); var d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { var x = PH.gauss(rnd), v = 1 + c * x; if (v <= 0) continue; v = v * v * v; var u = rnd(); if (u < 1 - 0.0331 * x * x * x * x) return d * v; if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } }
  function betaSample(rnd, a, b) { var x = gammaSample(rnd, a), y = gammaSample(rnd, b); return x / (x + y); }

  /* ---------------------------------------------------------------- field scale (minutes to hours) */
  function runField(seed, opts) {
    opts = Object.assign({ cells: 24, hours: 6, stepS: 10, lookDose: 1, eventMin: 1.5, mode: "adaptive", cadenceS: 300, budgetPerCellLooks: 80 }, opts || {});
    var rnd = PH.seeded(seed), T = opts.hours * 3600, cells = [];
    for (var i = 0; i < opts.cells; i++) { var hot = rnd() < 0.17; cells.push({ id: i, x: rnd(), y: rnd(), rate: (hot ? 2.2 : 0.35) / 3600, hot: hot, events: [], looks: 0, caught: 0, lastLook: -1e9, prevLook: 0, alpha: 0.5, expo: 3600, lastState: 0, dose: 0 }); }
    if (opts.oracle) cells.forEach(function (c) { c.alpha = c.rate * 1e6; c.expo = 1e6; });
    // draw events: Poisson per cell; a stimulus at hour 2 triples every rate for 40 minutes
    cells.forEach(function (c) { var t = 0; while (t < T) { var rt = c.rate * (t > 7200 && t < 9600 ? 3 : 1); t += -Math.log(1 - rnd()) / rt; if (t < T) c.events.push({ t0: t, t1: t + opts.eventMin * 60 * (0.6 + rnd() * 0.8), seen: false }); } });
    var looks = [], t = 0, totalDose = 0, timeline = [];
    function active(c, t) { return c.events.filter(function (e) { return t >= e.t0 && t <= e.t1; })[0] || null; }
    while (t <= T) {
      var pick = null;
      if (opts.mode === "adaptive") {
        var best = null, dur = opts.eventMin * 60;
        cells.forEach(function (c) {
          // gamma posterior on the event rate: shape = events caught + 0.5, rate = seconds of time this cell has been effectively watched
          var since = t - c.lastLook, cover = Math.min(since, dur), rateS = gammaSample(rnd, c.alpha) / c.expo, rateM = c.alpha / c.expo;
          var score = 1 - Math.exp(-rateS * cover);   // chance an unseen event is live now, under the sampled rate
          if (c.lastState === 1 && since < dur * 0.6) score *= 0.05;   // its event is live and already caught; a new one cannot start yet
          if (!best || score > best.s) best = { c: c, s: score, why: (rateM * 3600 > 1 ? "likely hot" : c.looks < 8 ? "exploring" : "quiet cell, a posterior draw came out high") + ": " + (rateM * 3600).toFixed(2) + " events an hour over " + c.looks + " looks, " + (since > 1e8 ? "never observed" : "unobserved " + Math.round(since / 60) + " min") };
        });
        pick = best;
      } else {
        // fixed cadence: every cell in turn, one per stepS, each cell seen every cadenceS
        var idx = Math.floor(t / opts.stepS) % cells.length; pick = { c: cells[idx], s: 0, why: "fixed cadence: every cell in turn, each seen every " + Math.round(cells.length * opts.stepS / 60) + " min" };
      }
      if (pick) {
        var c = pick.c, ev = active(c, t), sig = ev ? 1 : 0; c.looks++; c.lastLook = t; c.dose += opts.lookDose; totalDose += opts.lookDose;
        if (ev && !ev.seen) { ev.seen = true; c.caught++; ev.first = undefined; }
        if (opts.mode === "adaptive") { c.expo += Math.min(t - c.prevLook, opts.eventMin * 60); if (ev && ev.seen && ev.first === undefined) { ev.first = t; c.alpha += 1; } c.lastState = sig; c.prevLook = t; }
        looks.push({ t: t, cell: c.id, signal: sig, why: pick.why, dose: totalDose });
      }
      if (t % 60 === 0) { var tot = 0, seen = 0; cells.forEach(function (c) { c.events.forEach(function (e) { if (e.t0 <= t) { tot++; if (e.seen) seen++; } }); }); timeline.push({ t: t, events: tot, caught: seen, dose: totalDose }); }
      t += opts.stepS;
    }
    var totalEv = 0, caught = 0; cells.forEach(function (c) { c.events.forEach(function (e) { totalEv++; if (e.seen) caught++; }); });
    return { cells: cells, looks: looks, timeline: timeline, totalEvents: totalEv, caught: caught, dose: totalDose, opts: opts, T: T };
  }

  global.PS_SCHED = { runCell: runCell, runField: runField, newCell: newCell, accuracy: accuracy };
})(typeof window !== "undefined" ? window : globalThis);
