/* The Photon Scheduler: the stage. One cell as a revolving sphere with its tagged architecture, the detector ring laid
   out by wavelength, photons flying from structure to ring, and the field of cells for the hours scale. Canvas 2D,
   additive blending, no libraries. Nothing drawn here is data: it is a picture of the model state. */
(function (global) {
  "use strict";
  var PH = global.PS_PHYS;
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function wl2rgb(l) { // wavelength (nm) to an rgb triple, standard approximation, brightened
    var r = 0, g = 0, b = 0;
    if (l < 440) { r = -(l - 440) / 60; b = 1; } else if (l < 490) { g = (l - 440) / 50; b = 1; } else if (l < 510) { g = 1; b = -(l - 510) / 20; } else if (l < 575) { r = (l - 510) / 65; g = 1; } else if (l < 645) { r = 1; g = Math.pow((645 - l) / 70, 1.9); } else { r = 1; }
    if (l > 700) { r = 1; g = 0.15; b = 0.25; }
    var f = l < 420 ? 0.5 + 0.5 * (l - 380) / 40 : 1;
    return [Math.round(255 * Math.min(1, r * f + 0.12)), Math.round(255 * Math.min(1, g * f + 0.12)), Math.round(255 * Math.min(1, b * f + 0.12))];
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function seeded(seed) { return PH.seeded(seed); }

  /* ---------------------------------------------------------------- the cell */
  function buildCell(seed) {
    var r = seeded(seed), mt = [], actin = [], mito = [], chrom = [], cen = [0.15, -0.05, 0.2];
    function sph() { var u = r() * 2 - 1, t = r() * 6.283, q = Math.sqrt(1 - u * u); return [q * Math.cos(t), u, q * Math.sin(t)]; }
    for (var i = 0; i < 44; i++) { var e = sph(); mt.push({ a: cen, m: [(cen[0] + e[0]) / 2 + (r() - .5) * .4, (cen[1] + e[1]) / 2 + (r() - .5) * .4, (cen[2] + e[2]) / 2 + (r() - .5) * .4], b: [e[0] * .97, e[1] * .97, e[2] * .97] }); }
    for (var j = 0; j < 240; j++) { var p = sph(); actin.push({ p: [p[0] * .93, p[1] * .93, p[2] * .93], ang: r() * 6.28, len: 0.04 + r() * 0.06 }); }
    for (var k = 0; k < 42; k++) { var q = sph(), s = 0.35 + r() * 0.5; mito.push({ p: [q[0] * s, q[1] * s, q[2] * s], ang: r() * 6.28, ph: r() * 6.28 }); }
    var nc = [-0.15, 0.05, -0.1]; for (var c = 0; c < 320; c++) { var t = r() * 6.28, d = Math.sqrt(r()) * 0.34, u2 = (r() - .5) * 0.5; chrom.push([nc[0] + Math.cos(t) * d, nc[1] + Math.sin(t) * d, nc[2] + u2]); }
    return { mt: mt, actin: actin, mito: mito, chrom: chrom, nucleus: nc, cen: cen };
  }
  var STRUCT = ["nucleus", "actin", "microtubules", "mitochondria"];

  function startCell(box, getState, opts) {
    var cv = box.querySelector("canvas"), ctx = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), W, H, cell = buildCell(11), raf = null, t0 = performance.now(), last = 0, sparks = [], stars = null;
    function size() { W = cv.clientWidth || box.clientWidth; H = cv.clientHeight || box.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); stars = null; if (REDUCED) draw(1e9); }
    function geometry() { var small = W < 720, cx = small ? W / 2 : W * 0.47, cy = small ? H * 0.46 : H * 0.5, R = Math.min(W, H) * (small ? 0.24 : 0.26), RD = R + (small ? 40 : 86); return { cx: cx, cy: cy, R: R, RD: RD, small: small }; }
    function proj(p, rot, G) { var x = p[0] * Math.cos(rot) - p[2] * Math.sin(rot), z = p[0] * Math.sin(rot) + p[2] * Math.cos(rot), s = 1 + z * 0.22; return { x: G.cx + x * G.R * s, y: G.cy + p[1] * G.R * s, z: z }; }
    function bg(G) {
      stars = document.createElement("canvas"); stars.width = W * dpr; stars.height = H * dpr; var g = stars.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      var lg = g.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, "#07060F"); lg.addColorStop(1, "#04030A"); g.fillStyle = lg; g.fillRect(0, 0, W, H);
      var r = seeded(3); for (var i = 0; i < W * H / 3000; i++) { g.fillStyle = "rgba(255,255,255," + (0.1 + r() * 0.5) + ")"; g.beginPath(); g.arc(r() * W, r() * H, r() < 0.9 ? 0.6 : 1.2, 0, 7); g.fill(); }
      var ng = g.createRadialGradient(G.cx, G.cy, 0, G.cx, G.cy, G.R * 2.2); ng.addColorStop(0, "rgba(120,80,255,.20)"); ng.addColorStop(0.5, "rgba(60,30,140,.09)"); ng.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = ng; g.fillRect(0, 0, W, H);
    }
    function angOf(nm, G) { return ((nm - 400) / 320) * 6.283 - 1.5708; }
    function draw(ts) {
      if (!REDUCED && ts - last < 16) { raf = requestAnimationFrame(draw); return; } last = ts;
      var st = getState(), G = geometry(), time = (ts - t0) / 1000, rot = REDUCED ? 0.6 : time * 0.12;
      if (!stars) bg(G);
      ctx.globalCompositeOperation = "source-over"; ctx.drawImage(stars, 0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      var panel = st.panel, step = st.step, a0 = st.a0 || [1, 1, 1, 1], cols = panel.map(function (f) { return wl2rgb(f.emMax); });
      var flash = st.flash || 0, laser = step ? step.act.laser : null, exc = panel.map(function (f) { return laser ? PH.exAt(f, laser) : 0.15; });
      var level = panel.map(function (f, i) { var cur = step ? step.a[i] : a0[i]; return a0[i] > 0 ? cur / a0[i] : 0; });
      var present = panel.map(function (f, i) { return a0[i] > 5; });
      function bright(i) { return present[i] ? 0.25 + 0.75 * level[i] * (0.35 + 0.65 * exc[i]) + flash * exc[i] * level[i] * 0.8 : 0.04; }
      // membrane
      ctx.strokeStyle = "rgba(180,160,255,.35)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(G.cx, G.cy, G.R, 0, 7); ctx.stroke();
      var mg = ctx.createRadialGradient(G.cx, G.cy, G.R * 0.8, G.cx, G.cy, G.R * 1.02); mg.addColorStop(0, "rgba(120,90,255,0)"); mg.addColorStop(1, "rgba(150,120,255,.3)"); ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(G.cx, G.cy, G.R, 0, 7); ctx.fill();
      // microtubules (index 2)
      var b2 = bright(2), c2 = cols[2];
      cell.mt.forEach(function (m) { var a = proj(m.a, rot, G), mm = proj(m.m, rot, G), b = proj(m.b, rot, G), al = (0.2 + (b.z + 1) / 2 * 0.6) * b2; ctx.strokeStyle = rgba(c2, al * 0.7); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mm.x, mm.y, b.x, b.y); ctx.stroke(); ctx.fillStyle = rgba(c2, al); ctx.beginPath(); ctx.arc(b.x, b.y, 2.2, 0, 7); ctx.fill(); });
      // actin (index 1)
      var b1 = bright(1), c1 = cols[1];
      cell.actin.forEach(function (s) { var p = proj(s.p, rot, G), al = (0.12 + (p.z + 1) / 2 * 0.6) * b1, L = s.len * G.R; ctx.strokeStyle = rgba(c1, al); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x - Math.cos(s.ang) * L, p.y - Math.sin(s.ang) * L); ctx.lineTo(p.x + Math.cos(s.ang) * L, p.y + Math.sin(s.ang) * L); ctx.stroke(); });
      // mitochondria (index 3)
      var b3 = bright(3), c3 = cols[3];
      cell.mito.forEach(function (m) { var p = proj(m.p, rot, G), al = (0.4 + (p.z + 1) / 2 * 0.6) * b3, w = G.R * 0.045; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(m.ang + Math.sin(time + m.ph) * 0.2); var gr = ctx.createRadialGradient(0, 0, 0, 0, 0, w); gr.addColorStop(0, rgba(c3, al)); gr.addColorStop(1, rgba(c3, 0)); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, w, w * 0.42, 0, 0, 7); ctx.fill(); ctx.restore(); });
      // nucleus (index 0)
      var b0 = bright(0), c0 = cols[0], n = proj(cell.nucleus, rot, G), nr = G.R * 0.38;
      var ng = ctx.createRadialGradient(n.x - nr * 0.1, n.y - nr * 0.1, nr * 0.05, n.x, n.y, nr); ng.addColorStop(0, rgba(c0, 0.55 * b0)); ng.addColorStop(0.7, rgba(c0, 0.3 * b0)); ng.addColorStop(1, rgba(c0, 0)); ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(n.x, n.y, nr, 0, 7); ctx.fill();
      cell.chrom.forEach(function (p, i) { var q = proj(p, rot, G); ctx.fillStyle = rgba(c0, (0.25 + (i % 7) / 10) * b0); ctx.beginPath(); ctx.arc(q.x, q.y, 0.8 + (i % 3) * 0.5, 0, 7); ctx.fill(); });
      // laser sheet
      if (laser) { var lc = wl2rgb(laser), sx = G.cx + Math.sin(time * 0.9) * G.R * 0.7; ctx.save(); ctx.beginPath(); ctx.arc(G.cx, G.cy, G.R, 0, 7); ctx.clip(); var lg = ctx.createLinearGradient(sx - 30, 0, sx + 30, 0); lg.addColorStop(0, rgba(lc, 0)); lg.addColorStop(0.5, rgba(lc, 0.16 + flash * 0.3)); lg.addColorStop(1, rgba(lc, 0)); ctx.fillStyle = lg; ctx.fillRect(sx - 30, G.cy - G.R, 60, 2 * G.R); ctx.restore(); }
      // sparks: photons from excited structures to the ring at their emission wavelength
      if (!REDUCED && step) { var nNew = Math.min(14, Math.round(2 + step.photons / 120)); for (var s = 0; s < nNew; s++) { var i = Math.floor(Math.random() * panel.length); if (!present[i] || exc[i] < 0.02) continue; var t = Math.random() * 6.28, em = panel[i].emMax + (Math.random() - 0.5) * 40, ang = angOf(em, G); sparks.push({ x: G.cx + Math.cos(t) * G.R * (0.3 + Math.random() * 0.6), y: G.cy + Math.sin(t) * G.R * (0.3 + Math.random() * 0.6), tx: G.cx + Math.cos(ang) * G.RD, ty: G.cy + Math.sin(ang) * G.RD, f: 0, col: cols[i], v: 0.012 + Math.random() * 0.02 }); } }
      if (sparks.length > 500) sparks.splice(0, sparks.length - 500);
      for (var k = sparks.length - 1; k >= 0; k--) { var sp = sparks[k]; sp.f += sp.v; if (sp.f >= 1) { sparks.splice(k, 1); continue; } var ex2 = sp.x + (sp.tx - sp.x) * sp.f, ey = sp.y + (sp.ty - sp.y) * sp.f; ctx.fillStyle = rgba(sp.col, 0.35 + sp.f * 0.6); ctx.beginPath(); ctx.arc(ex2, ey, 1.3, 0, 7); ctx.fill(); }
      // detector ring
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.beginPath(); ctx.arc(G.cx, G.cy, G.RD, 0, 7); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.beginPath(); ctx.arc(G.cx, G.cy, G.RD + 16, 0, 7); ctx.stroke();
      // spectrum tint on the ring
      for (var nm = 400; nm < 720; nm += 4) { var c = wl2rgb(nm + 2); ctx.strokeStyle = rgba(c, 0.25); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(G.cx, G.cy, G.RD, angOf(nm, G), angOf(nm + 4.2, G)); ctx.stroke(); }
      // bands of the current action, with counts as radial bars
      if (step) {
        ctx.globalCompositeOperation = "lighter";
        step.act.bands.forEach(function (b, bi) { var o = step.obs[bi], c = wl2rgb((b[0] + b[1]) / 2); ctx.strokeStyle = rgba(c, 0.95); ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(G.cx, G.cy, G.RD, angOf(b[0], G), angOf(b[1], G)); ctx.stroke(); var h = Math.min(60, 4 + Math.sqrt(o.N) * 1.6), am = angOf((b[0] + b[1]) / 2, G); ctx.strokeStyle = rgba(c, 0.8); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(G.cx + Math.cos(am) * (G.RD + 8), G.cy + Math.sin(am) * (G.RD + 8)); ctx.lineTo(G.cx + Math.cos(am) * (G.RD + 8 + h), G.cy + Math.sin(am) * (G.RD + 8 + h)); ctx.stroke(); if (!G.small) { ctx.fillStyle = "rgba(241,238,255,.85)"; ctx.font = "600 10px Manrope, sans-serif"; ctx.textAlign = "center"; ctx.fillText(o.N + " ph" + (o.tbar !== null ? " · " + o.tbar.toFixed(2) + " ns" : ""), G.cx + Math.cos(am) * (G.RD + 26 + h), G.cy + Math.sin(am) * (G.RD + 26 + h) + 3); } });
        // laser marker on the ring
        var la = angOf(laser, G), lcol = wl2rgb(laser); ctx.fillStyle = rgba(lcol, 1); ctx.beginPath(); ctx.arc(G.cx + Math.cos(la) * G.RD, G.cy + Math.sin(la) * G.RD, 5, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = "source-over"; if (!G.small) { ctx.fillStyle = "rgba(241,238,255,.9)"; ctx.font = "600 10.5px Manrope, sans-serif"; ctx.textAlign = "center"; ctx.fillText(laser + " nm · " + step.act.power + " mW · " + step.act.dwell + " ms" + (step.act.tcspc ? " · time-resolved" : ""), G.cx, G.cy - G.R - 16); }
      }
      // wavelength ticks
      ctx.fillStyle = "rgba(241,238,255,.55)"; ctx.font = "500 10px Manrope, sans-serif"; ctx.textAlign = "center";
      [400, 450, 500, 550, 600, 650, 700].forEach(function (nm) { var a = angOf(nm, G); if (G.small && nm % 100) return; ctx.fillText(nm, G.cx + Math.cos(a) * (G.RD + 30), G.cy + Math.sin(a) * (G.RD + 30) + 3); });
      // structure labels
      if (!G.small) { ctx.textAlign = "left"; ctx.font = "500 10.5px Manrope, sans-serif"; panel.forEach(function (f, i) { var y = G.cy + G.R + 34 + i * 0; }); }
      if (!REDUCED) raf = requestAnimationFrame(draw);
    }
    size(); addEventListener("resize", size);
    function vis() { if (document.hidden) { cancelAnimationFrame(raf); raf = null; } else if (!raf && !REDUCED) raf = requestAnimationFrame(draw); }
    document.addEventListener("visibilitychange", vis);
    if (!REDUCED) raf = requestAnimationFrame(draw);
    return { stop: function () { cancelAnimationFrame(raf); removeEventListener("resize", size); document.removeEventListener("visibilitychange", vis); }, redraw: function () { if (REDUCED) draw(1e9); } };
  }

  /* ---------------------------------------------------------------- the field */
  function startField(box, getState) {
    var cv = box.querySelector("canvas"), ctx = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), W, H, raf = null, last = 0, t0 = performance.now();
    function size() { W = cv.clientWidth || box.clientWidth; H = cv.clientHeight || box.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (REDUCED) draw(1e9); }
    function pos(c) { return { x: 40 + c.x * (W - 80), y: 40 + c.y * (H - 80) }; }
    function draw(ts) {
      if (!REDUCED && ts - last < 33) { raf = requestAnimationFrame(draw); return; } last = ts; var time = (ts - t0) / 1000;
      var st = getState(), run = st.run, t = st.t, col = wl2rgb(st.reporter ? st.reporter.emMax : 514);
      ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#05040C"; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      var recent = run.looks.filter(function (l) { return l.t <= t && l.t > t - 60; }), lastLook = run.looks.filter(function (l) { return l.t <= t; }).pop();
      run.cells.forEach(function (c) {
        var p = pos(c), live = c.events.some(function (e) { return t >= e.t0 && t <= e.t1; }), seen = c.events.some(function (e) { return e.seen && t >= e.t0 && t <= e.t1; }), r = 10 + (c.hot ? 4 : 0);
        var base = live ? 0.9 : 0.16, g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.6); g.addColorStop(0, rgba(col, base)); g.addColorStop(0.4, rgba(col, base * 0.5)); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.6, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(180,160,255,.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke();
        if (live && seen) { ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r + 6 + Math.sin(time * 6) * 2, 0, 7); ctx.stroke(); }
        if (live && !seen && st.showMissed) { ctx.strokeStyle = "rgba(255,80,110,.8)"; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      });
      recent.forEach(function (l) { var c = run.cells[l.cell], p = pos(c), age = (t - l.t) / 60; ctx.strokeStyle = "rgba(160,240,255," + (0.5 * (1 - age)) + ")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W / 2, -10); ctx.lineTo(p.x, p.y); ctx.stroke(); });
      if (lastLook) { var c2 = run.cells[lastLook.cell], p2 = pos(c2); ctx.strokeStyle = "rgba(200,240,255,.95)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2, -10); ctx.lineTo(p2.x, p2.y); ctx.stroke(); var lg = ctx.createRadialGradient(p2.x, p2.y, 0, p2.x, p2.y, 30); lg.addColorStop(0, "rgba(200,240,255,.5)"); lg.addColorStop(1, "rgba(200,240,255,0)"); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(p2.x, p2.y, 30, 0, 7); ctx.fill(); }
      ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "rgba(241,238,255,.8)"; ctx.font = "600 11px Manrope, sans-serif"; ctx.textAlign = "left";
      var hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60); ctx.fillText("t = " + hh + " h " + (mm < 10 ? "0" : "") + mm + " min", 14, H - 14);
      ctx.textAlign = "right"; ctx.fillText((lastLook ? "looking at cell " + (lastLook.cell + 1) + (lastLook.signal ? " · event live" : "") : ""), W - 14, H - 14);
      if (!REDUCED) raf = requestAnimationFrame(draw);
    }
    size(); addEventListener("resize", size);
    function vis() { if (document.hidden) { cancelAnimationFrame(raf); raf = null; } else if (!raf && !REDUCED) raf = requestAnimationFrame(draw); }
    document.addEventListener("visibilitychange", vis);
    if (!REDUCED) raf = requestAnimationFrame(draw);
    return { stop: function () { cancelAnimationFrame(raf); removeEventListener("resize", size); document.removeEventListener("visibilitychange", vis); }, redraw: function () { if (REDUCED) draw(1e9); } };
  }

  global.PS_STAGE = { startCell: startCell, startField: startField, wl2rgb: wl2rgb, rgba: rgba, STRUCT: STRUCT };
})(window);
