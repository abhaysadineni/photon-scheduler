# The Photon Scheduler

Decide what to measure next. An agent runs a fluorescence instrument on a simulated cell, and is compared with the fixed protocol a lab would run without it, at the same light dose.

Live: https://www.abhaychakra.com/p/photon-scheduler/

Built in September 2026 by Abhay Chakra Sadineni.

## What is in it

- **The instrument (home).** A rotating cell inside a detector ring marked 400 to 720 nm. Microtubules, actin, mitochondria and the nucleus are each coloured by their fluorophore's emission.
  - The control plane turns an intent (a precision target and a dose budget) into a sequence of exposures: laser, power, dwell, filter bands, time-resolved or not.
  - It picks each exposure by D-optimal information gain per unit of light, and re-plans as the dyes bleach.
  - It stops when every structure is known to the target precision.
  - The fixed protocol runs beside it. Play, scrub, decision log, estimate table, charts.
- **The field.** 24 cells over 6 hours with a calcium reporter (GCaMP6f) that flares for a minute or two.
  - The scheduler keeps a gamma-Poisson belief about each cell's event rate and uses Thompson sampling to decide which cell to look at.
  - It is compared with a fixed round-robin cadence and with an oracle that knows every cell's true rate.
- **Spectra.** The fluorophore library with excitation and emission curves.
- **Method.** The physics, every assumption and its value, the sources and the limits.

## Result, reproducible

```
node bench_field.js
```

Over 20 seeds (2,094 events), at equal light dose:

| Policy | Events caught |
|---|---|
| Scheduler | 974 |
| Fixed cadence | 758 |
| Known-rates oracle | 1,167 |

The scheduler beats the fixed cadence by 28 percent and reaches 83 percent of the oracle. Single seeds vary, and some tie. `node test.js` prints the cell-scale plan and estimates for one seed.

## What is real and what is synthetic

**Real.** Excitation and emission spectra, extinction coefficients, quantum yields and lifetimes for 18 fluorescent proteins from FPbase, pulled 16 September 2026 (`data/fluorophores.json`, licence CC BY-SA 4.0). For GCaMP6f the calcium-bound state is used, and its lifetime (2.6 ns) is an assumption.

**Synthetic.** The cell, its abundances, autofluorescence, detector gain and quantum efficiency, the bleaching model, the dose weight per laser line, the instrument response, and the event rates in the field. Every constant is in the `ASSUME` block of `physics.js`. This is a simulated instrument; it has not driven real hardware.

## Run it

```
python3 -m http.server 8000
```

Open http://localhost:8000. GitHub Pages works from the root of the `main` branch.

## Files

| Path | Role |
|---|---|
| `index.html`, `app.css`, `app.js` | Shell, styles, pages and interface |
| `physics.js` | Photon model: Poisson counts, lifetimes, bleaching, the non-negative least-squares belief, Fisher information |
| `scheduler.js` | Cell-scale planner and stop rule; field-scale Thompson sampler, fixed cadence and oracle |
| `stage.js` | The cell and field canvases |
| `test.js`, `bench_field.js` | Single-seed run and the 20-seed field comparison (Node, no dependencies) |
| `data/fluorophores.json` | FPbase library (CC BY-SA 4.0) |
| `pipeline/fetch_lambda.py` | The AWS Lambda used to fetch FPbase when the build machine could not reach it |
| `deploy.sh` | Deploy to S3 and CloudFront with hashed asset URLs |
| `fonts/` | Manrope, Fraunces, JetBrains Mono (SIL OFL 1.1) |

## Licences

- **Code:** no licence file is included, so default copyright applies (all rights reserved).
- **`data/fluorophores.json`:** derived from FPbase and licensed CC BY-SA 4.0. Keep the attribution, and share any changes to that file under the same licence.
- **Fonts:** SIL Open Font License 1.1.
