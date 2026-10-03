global.window = global; require('./physics.js'); require('./scheduler.js');
const lib = require('./data/fluorophores.json'); const by = {}; lib.proteins.forEach(p => by[p.name] = p);
const panel = ['mTurquoise2','mNeonGreen','mCherry','mScarlet'].map(n => by[n]);
console.log('bands per laser:'); PS_PHYS.LASERS.forEach(l => console.log(l, JSON.stringify(PS_PHYS.bestBands(panel, l))));
console.log('rates at 561 band 590-620 (per ms per unit at 1mW):', panel.map(f => PS_PHYS.rate(f, 561, 590, 620, 1).toFixed(4)).join(' '));
for (const seed of [1, 2, 3]) {
  const truth = PS_SCHED.newCell(PS_PHYS.seeded(seed * 7), panel);
  const A = PS_SCHED.runCell(seed, panel, { truth, mode: 'adaptive', budget: 600 });
  const F = PS_SCHED.runCell(seed, panel, { truth, mode: 'fixed', budget: A.final.dose, maxSteps: 200 });
  const f = A.final, g = F.final;
  console.log('seed', seed, 'truth', truth.join(','), '\n adaptive steps', A.steps.length, 'dose', f.dose.toFixed(0), 'est', f.est.map(Math.round).join(','), 'cv', f.cv.map(v => v.toFixed(2)).join(','), 'acc', PS_SCHED.accuracy(f, panel), 'tcspc used', A.steps.filter(s => s.act.tcspc).length);
  console.log(' fixed    steps', F.steps.length, 'dose', g.dose.toFixed(0), 'est', g.est.map(Math.round).join(','), 'cv', g.cv.map(v => v.toFixed(2)).join(','), 'acc', PS_SCHED.accuracy(g, panel));
  console.log(' first 4 actions', A.steps.slice(0, 4).map(s => s.act.laser + '/' + s.act.power + '/' + s.act.dwell + (s.act.tcspc ? 'T' : '') + ' ph' + s.photons).join(' | '));
}
const fld = PS_SCHED.runField(5, { mode: 'adaptive' }), ffx = PS_SCHED.runField(5, { mode: 'fixed' });
console.log('field adaptive caught', fld.caught, '/', fld.totalEvents, 'dose', fld.dose, 'looks', fld.looks.length, '| fixed caught', ffx.caught, '/', ffx.totalEvents, 'dose', ffx.dose, 'looks', ffx.looks.length);
