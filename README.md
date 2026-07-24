# Fit Transfer

Type in the four numbers off a Wahoo Kickr Bike's own scales, get back the stem length,
stem angle and spacer stack that put you in the same position on a real frame.

Everything runs in the browser. No build step, no dependencies, no network calls — the
state lives in `localStorage`.

## Hosting

Static files, so GitHub Pages serves it as-is: push to a repo, then Settings → Pages →
deploy from branch, root. `index.html` is the entry point.

The JavaScript is ES modules, which browsers only load over HTTP(S) — opening
`index.html` straight off the filesystem will fail on CORS. Locally:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## The model in one page

Every position is `[x, y]` in millimetres from the bottom bracket: **+x forward, +y up**.

The fit bike has two **carriages**, one for the saddle and one for the handlebar. Each is
a zero mark plus two slides:

```
position = zero + mastMmPerUnit  * mastReading  * mastDirection
                + slideMmPerUnit * slideReading * slideDirection
```

- **mast** — the near-vertical slide (seatpost mast, front column). Its angle is written
  the way a cyclist reads a tube angle: 73 leans back, 90 is vertical.
- **slide** — the near-level slide (saddle fore/aft, bar reach). Its angle is a tilt off
  horizontal: 0 level, +3 rising, −3 falling.
- Which way a *bigger* reading travels is carried by the **sign of the mm-per-unit**,
  never by the angle. A scale that counts backwards gets a negative gain.

This bike's scales read in centimetres exactly, so every mm-per-unit is 10.

**Standover** (A–H) translates both horizontal masts along a single axis that leans back
from vertical — 20 mm per letter *measured along that axis*, at a 4° lean. So each letter
is 19.95 mm up and 1.40 mm back, and A→H is 139.7 up and 9.8 back. The rearward part is
easy to overlook but reaches ~10 mm at H, more than the default 4 mm match tolerance. Both
the step and the lean are editable in the constants panel; set the lean to 0 for a purely
vertical rise.

The measured constants for this bike are the defaults in `js/state.js`, derived from
`constants.txt` (floor measurements less the 260 mm floor-to-BB height).

Those constants are the hard part to measure, so section 2 back-solves them instead: set
the fit bike up to match a bike you already know, note the readings, and a least-squares
fit recovers them. One reference pins the zero points; two or more also fit the
mm-per-unit.

## Three directions

The same model runs three ways, which is worth keeping straight:

| | From | To | Where |
| --- | --- | --- | --- |
| forward | readings | stem, angle, spacers on a frame | sections 1, 3, 5 |
| constants | a known bike + its readings | the fit bike's own constants | section 2 |
| reverse | a bike you already ride | the readings to dial into the fit bike | section 6 |

The reverse direction is the exact inverse of the carriage model rather than a fit: two
slides, two unknowns, one 2×2 solve per carriage (`carriageReadings`). It reuses
`asBuiltPositions` to get the two points off a real build, so it works from the same *as
built* stem/spacers/saddle figures that a calibration reference uses.

Standover makes that answer a family rather than a single set of numbers: it translates
both carriages together, so **every one of the eight positions has an exact set of
readings**, and geometrically none is more correct than another. Section 6 lists all eight
and marks the usable ones. Since the scales' travel is not recorded anywhere, the only test
it can apply is that a scale cannot read below its own zero mark — so a negative reading
rules a row *out*, but nothing rules a row *in*; a row can still ask for more travel than
the machine has at the top. On the default frame that leaves A–F usable and rules out G–H.

## Files

```
index.html                  markup only
styles.css
js/main.js                  entry point: wire up, load, draw

js/state.js                 the single state object, defaults, migration of old saves
js/persistence.js           localStorage / window.storage, debounced

js/lib/vector.js            2D points, unit vectors, direction-in-words
js/lib/format.js            text to number, number to display string
js/lib/dom.js               element() and friends

js/model/standover.js       standover positions A-H and the rise axis
js/model/fit-bike.js        the carriage model: readings to target positions
js/model/frame.js           a candidate frame, and its bar/saddle geometry (pure)
js/model/solver.js          stem length, angle and spacers that hit the target
js/model/calibration.js     back-solving the fit bike constants
js/model/reverse.js         the other way round: a real bike back to fit bike readings
js/model/geometry-table.js  parsing a pasted manufacturer geometry table

js/ui/render.js             redraws everything; refresh() = save then render
js/ui/focus.js              keeps the caret alive across a redraw
js/ui/fields.js             labelled inputs, readout cells, chips, tables
js/ui/fit-bike-panel.js     section 1
js/ui/calibration-panel.js  section 2
js/ui/frames-panel.js       section 3
js/ui/paste-panel.js        section 3's geometry paste
js/ui/side-view.js          section 4, the scale drawing
js/ui/compare-table.js      section 5
js/ui/reverse-panel.js      section 6, readings per standover position
```

`js/lib/*` and `js/model/frame.js` are pure functions of their arguments. Everything else
in `js/model/` reads the current `state`. Only `js/ui/*` touches the DOM.

## Rendering

The whole page is redrawn on every keystroke. It is a small page, and one code path from
state to screen is much easier to trust than a set of targeted updates. The only thing
that has to survive a redraw is the text caret, which `js/ui/focus.js` handles by keying
each input on a unique `data-path` and remembering the *raw* text — so typing "1." does
not get rewritten to "1" mid-number.

## Glossary

Names used throughout, in case a term is unfamiliar:

| Name | Meaning |
| --- | --- |
| `stack` / `reach` | BB to top of head tube: vertical and horizontal. Off the geometry chart. |
| `headTubeAngle` / `seatTubeAngle` | The usual chart angles. Lower is slacker. |
| `headsetStack` | Height of the upper headset cover. Spacers start on top of it, so it shifts the answer by exactly its own height. |
| `stemClampHeight` | Full height of the stem's steerer clamp. Half sits above the spacers to reach the bar clamp centreline. |
| `spacerHeight` | The spacer stack under the stem, in mm rather than a count. |
| `exactSpacerHeight` | What the steerer axis wants before rounding to whole spacers. Negative means the front end is already too tall. |
| `missMm` | Straight-line distance from where the bar clamp lands to where it should be. |
| `reachable` | The solution needs no negative spacers and no more than the frame has. |
| `railClamp` | Centre of the saddle rail clamp — what the fit bike's saddle carriage actually locates. |
| `railsBelowSaddleTop` | Saddle shell stack: rail centre to the top of the saddle. |
| `railOffset` | How far back from rail centre the saddle must slide, after the fitted post's setback is used up. |
| `heightAlongSeatAxis` | Saddle height as you would measure it *on that frame* — differs from the fit bike's number whenever the seat angle does. |
| `standoverOffset` | How far position A→H moves both horizontal masts, as `[dx, dy]`. 20 mm per letter along an axis leaning 4° back, so mostly up and slightly rearward. |
| `standoverTravel` | The same movement as a distance along that axis (20 mm per letter) rather than as components. |
| `slideTilt` | Incline of a near-level slide. 4° here: the mast rises going forward and drops going back. |
| `matchMode` | `clamp` = same bar on both bikes. `hoods` = correct the target for a different bar reach. |

## Tests

No framework and no install — the tests are pages. Serve the project and open the runner:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/tests/
```

It runs all three suites and prints a tally (214 checks at the time of writing). Each
suite is also a standalone page if you want to read one in isolation.

| Suite | Covers |
| --- | --- |
| `tests/model.html` | The maths, no DOM: standover as a vector, the stem solver hitting a reachable target exactly, saddle round trips, crank and bar-reach compensation, the calibration estimator recovering known constants, and the reverse solve inverting the forward one at all eight standover positions. |
| `tests/interaction.html` | The real UI, driven: typing, the caret surviving a redraw, add/remove/duplicate frames, pasting a geometry table, check/solve/undo calibration, reset, and applying a reverse setup. |
| `tests/migration.html` | Loads a save written by the previous single-file version and checks every field survives the rename, ids and references included. |

The suites run **one at a time**, and the runner tears each frame down before starting the
next. Two of them own `localStorage`, and a suite publishes its results before its app's
debounced save has landed — without the teardown that write escapes into the next suite.
The runner also keeps its frames rendered but offscreen rather than `display:none`, because
an element inside a non-rendered frame cannot take focus and two suites check the caret.

Most assertions are invariants and round trips rather than golden numbers, so they stay
meaningful when a constant is corrected. The estimator test deliberately places its
references at *different* standover letters — with the rise axis leaning back, a bug that
ignored the rearward component would otherwise hide inside the zero point.

## Assumptions worth checking

Listed at the bottom of the page itself. The two that move the answer most: the headset
cover height, and the standover rise axis — its 4° lean is worth about 10 mm of setback by
position H, so it is a real term rather than a rounding detail.

Section 1 separates two different kinds of number, which is worth preserving:

- **Current setup** — things you *set*, visible on the form: crank length (a dropdown of
  the bike's real 165–175 range in 2.5 mm steps), the two saddle figures, bar reach
  (stock bar is 100 mm) and the match mode. These change when you adjust the bike or swap
  a saddle.

  Crank length is the odd one out: the fit bike's cranks are meant to be set to whatever
  the target bike will run, which makes the difference zero and the whole term a no-op. It
  exists only to catch the case where they *don't* match, where it shifts the saddle target
  vertically by the difference to preserve leg extension. A new frame therefore inherits
  the fit bike's current setting, and a frame that disagrees says so under the field.
  Nothing about crank length touches the front end — bar target, stem length, stem angle
  and spacers are entirely independent of it.
- **Fit bike constants** — the collapsed panel: where each carriage's zero sits, which way
  its slides run, and the standover mechanism. Measured once off the machine.

`railsBelowSaddleTop` and `noseToRailCentre` still hold generic defaults (50 and 125) and
depend on the saddle actually fitted, so they are worth measuring.

The one measured value taken on inference rather than from `constants.txt`:
`carriages.saddle.slideMmPerUnit` is **−10**, i.e. a bigger fore/aft reading means more
*setback*. If that scale actually counts forward, flip it to +10. The hint under the field
prints which way it currently thinks the carriage moves.
