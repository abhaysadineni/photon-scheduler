// Reproduces the field comparison quoted on the method page: 20 seeds, 24 cells, 6 hours.
// The scheduler (gamma-Poisson Thompson sampling), the fixed round-robin cadence, and an oracle that is told every cell's true rate.
// All three spend one dose unit per look, so the comparison is at equal light dose.  Run: node bench_field.js
global.window = undefined; require('./physics.js'); require('./scheduler.js');
var S = globalThis.PS_SCHED, a = 0, f = 0, o = 0, t = 0;
for (var s = 1; s <= 20; s++) {
  var r1 = S.runField(s, { mode: 'adaptive' }), r2 = S.runField(s, { mode: 'fixed' }), r3 = S.runField(s, { mode: 'adaptive', oracle: true });
  a += r1.caught; f += r2.caught; o += r3.caught; t += r1.totalEvents;
}
console.log('events', t, '| scheduler', a, '| fixed cadence', f, '| known-rates oracle', o);
console.log('scheduler vs fixed: +' + Math.round((a / f - 1) * 100) + ' percent; scheduler as share of oracle: ' + Math.round(a / o * 100) + ' percent');
