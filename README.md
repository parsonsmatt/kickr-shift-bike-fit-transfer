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

Neither carriage locates the point the app actually matches, and both corrections are worth
more than the match tolerance:

- The **saddle** carriage locates the saddle *clamp*; what a frame has to reproduce is the
  saddle's rail centre. `saddleRailOffset` is the gap.
- The **bar** carriage's zero is on the front *column*, at the top of the clamp the stem sits
  on. The bar clamp is half a stem height up the column from there and then a stem length
  forward — the same two moves `barClampPosition` makes on a frame, with the column playing the
  head tube. Stock (90 mm at −7° on a 40 mm stem, 76° column) that is 84.5 mm ahead of the zero
  point and 30.4 mm above it. It was missing at first, and every frame's answer came back
  about a stem length short of what would actually reproduce the position.

Both are folded into the single `offset` argument that `carriagePosition` and
`carriageReadings` share, so the forward and reverse directions cannot disagree about them.

**Standover** (A–H) translates both horizontal masts along a single axis that leans back
from vertical — 20 mm per letter *measured along that axis*, at a 4° lean. So each letter
is 19.95 mm up and 1.40 mm back, and A→H is 139.7 up and 9.8 back. The rearward part is
easy to overlook but reaches ~10 mm at H, more than the default 4 mm match tolerance. Both
the step and the lean are editable in the constants panel; set the lean to 0 for a purely
vertical rise.

The measured constants for this bike are the defaults in `js/state.js`, derived from
`constants.txt` (floor measurements less the 260 mm floor-to-BB height).

Every constant is editable, but **an end user should never need to touch one**. They
describe the machine, not the rider, and if one is wrong that means it was mismeasured here —
so the constants panel offers "Reset to measured defaults" and nothing else.

There were two attempts at deriving them, and both are gone. First a least-squares fit that
solved the constants from bikes you already know: it trusted those references over the tape
measure, and one reference with a reading left at zero was enough to move a carriage's zero
point onto that bike — which is what happened, landing the bar zero on a reference frame's own
bar clamp, after which the reverse direction reported bar readings of 0.0 that were perfectly
self-consistent and completely wrong. What was left was a read-only version that only reported
how far the constants missed each reference, and that went too: the reverse direction already
prints the readings a known bike needs, so comparing those with what the machine actually says
is the same check without a stored table to keep in step.

## Two directions

The same model runs both ways, which is worth keeping straight:

| | From | To | Where |
| --- | --- | --- | --- |
| forward | readings | stem, angle, spacers on a frame | sections 1, 2, 4 |
| reverse | a bike you already ride | the readings to dial into the fit bike | section 5 |

The reverse direction is the exact inverse of the carriage model rather than a fit: two
slides, two unknowns, one 2×2 solve per carriage (`carriageReadings`). It reuses
`asBuiltPositions` to get the two points off a real build, so it reads the *as built*
stem/spacers/saddle figures on the frame card and nothing else.

Standover makes that answer a family rather than a single set of numbers: it translates
both carriages together, so **every one of the eight positions has an exact set of
readings**, and geometrically none is more correct than another. Something has to choose, so
section 5 takes the **lowest position that stays on the scales** and lists the rest below it.

What "fits" means depends on how much of the machine has been measured. A scale can never
read below its own zero mark, so that bound always applies. The top of each scale's travel is
the four `mastMaxReading` / `slideMaxReading` constants, and **0 means unmeasured** — read as
a real limit it would rule out everything, so it is treated as no limit at all. The two masts
are measured (seat height 0–18.0, handlebar stack 0–7.0); the two horizontal slides are not.

Which bound bites where is worth knowing. Raising the standover raises both carriages, so it
*reduces* the reading needed to reach a fixed point. The bottom of the travel therefore rules
out the **high** letters and the top of the travel rules out the **low** ones. Leave the
maximums at 0 and only the bottom applies, so nothing rules out A and "the lowest that fits"
is A every time — the rule does no work at all.

Measured, it does a lot, because the handlebar scale is short: **70 mm of stack for a machine
that has to stand in for frames whose bar clamps differ by far more than that.** At position A
the bar tops out around 580 mm above the BB, below where an ordinary frame's slammed bar clamp
already sits. So the standover rise is not a comfort setting — it is the coarse stack
adjustment, and the 70 mm scale is the fine one. That is also why the default readings in
`js/state.js` sit at position D: they are the setup that reproduces the default frame's own *as
built* figures, so a fresh page shows a working answer instead of a frame nothing can reach.

Section 5 also prints the *as built* figures it derived everything from. Those live in a
collapsed panel on the frame card, and the summary used to read "needed only to use this
frame as a calibration reference" — which sent anyone looking for this section's input straight
past it. It now names its reader and starts open.

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
js/model/reverse.js         the other way round: a real bike back to fit bike readings
js/model/profile.js         saved fit setups: capture, load, and what differs
js/model/geometry-table.js  parsing a pasted manufacturer geometry table

js/ui/render.js             redraws everything; refresh() = save then render
js/ui/focus.js              keeps the caret alive across a redraw
js/ui/disclosure.js         keeps a <details> open across a redraw
js/ui/fields.js             labelled inputs, readout cells, chips, tables
js/ui/fit-bike-panel.js     section 1, including the constants panel and its reset
js/ui/profiles-panel.js     section 1's saved profiles
js/ui/frames-panel.js       section 2
js/ui/paste-panel.js        section 2's geometry paste
js/ui/side-view.js          section 3, the scale drawing
js/ui/compare-table.js      section 4
js/ui/reverse-panel.js      section 5, readings per standover position
```

`js/lib/*` and `js/model/frame.js` are pure functions of their arguments. Everything else
in `js/model/` reads the current `state`. Only `js/ui/*` touches the DOM.

The side view draws **two** front ends: the best option out of the catalogue, and — as a
dashed ghost — what the bike is wearing today. Only the first was drawn originally, which
reads as a description of the bike rather than a proposal; the gap between the two bar clamps
is the change being asked for. The ghost's numbers are captioned at the top rather than
labelled beside it, because when the answer *is* the current build — which is what applying
the reverse direction's readings gives you — the two front ends coincide and two sets of
labels landed on the same point. Its reach figures are to the bar *clamp*, with the hoods drawn
a bar reach further forward, because that is the number you would compare against a bike you
have measured.

## Rendering

The whole page is redrawn on every keystroke. It is a small page, and one code path from
state to screen is much easier to trust than a set of targeted updates.

Two things have to survive that redraw, and both work the same way — remember the state
against a stable key, since the element itself is a new one every time:

- the **text caret**, which `js/ui/focus.js` handles by keying each input on a unique
  `data-path` and remembering the *raw* text, so typing "1." does not get rewritten to "1"
  mid-number;
- whether a **`<details>` is open**, which `js/ui/disclosure.js` handles. Without it, typing
  one character into a field inside a rebuilt `<details>` snaps it shut. Only applies to
  disclosures built in JavaScript — the ones written directly into `index.html` are never
  rebuilt, so they keep their own state for free.

Remembering the raw text has one sharp edge: anything that replaces the state wholesale —
import, reset all, reset the constants — has to call `forgetFocus()` first, or the redraw
writes the last thing typed straight back over the value the reset just restored.

## Glossary

Names used throughout, in case a term is unfamiliar:

| Name | Meaning |
| --- | --- |
| `stack` / `reach` | BB to top of head tube: vertical and horizontal. Off the geometry chart. |
| `headTubeAngle` / `seatTubeAngle` | The usual chart angles. Lower is slacker. |
| `headsetStack` | Height of the upper headset cover. Spacers start on top of it, so it shifts the answer by exactly its own height. |
| `stemClampHeight` | Full height of the stem's steerer clamp. Half sits above the spacers to reach the bar clamp centreline. |
| `stemLength` / `stemAngle` / `stemHeight` (on `fitBike`) | The fit bike's own front end, above and ahead of the bar carriage's zero point. Angle is measured off perpendicular to the column, the way stems are labelled, so a 0 on a 76° column still rises 14°. Height is the stem's own, and half of it is how far up the column the bar clamp centreline sits. |
| `barClampOffset` | Those three turned into a displacement from the carriage zero to the bar clamp centre. |
| `spacerHeight` | The spacer stack under the stem, in mm rather than a count. |
| `exposedSteerer` | Steerer standing proud of the headset cover — top of the cover to the top of the steerer, which is a length you can put a ruler on. |
| `spacerRoom` | `exposedSteerer` less `stemClampHeight`: how much spacer is actually left once the stem has taken its share. This is the solver's ceiling. It replaced a stored `spacersAvailable`, which read as though it were measurable and so got filled in with figures smaller than the stack the bike was already wearing — quietly hiding the options that fit. |
| `asBuiltOverflowsSteerer` | The bike's own build does not fit in its own exposed steerer, so one of the three numbers is wrong. Said out loud on both fields rather than left to show up as missing options. |
| `exactSpacerHeight` | What the steerer axis wants before rounding to whole spacers. Negative means the front end is already too tall. |
| `missMm` | Straight-line distance from where the bar clamp lands to where it should be. |
| `reachable` | The solution needs no negative spacers and no more than `spacerRoom` allows. |
| `mastMaxReading` / `slideMaxReading` | How far a scale actually goes, in scale units — the top of the seatpost mast's travel, the front column's rise, and the same for the two horizontal slides. **0 means not measured**, and is treated as no upper limit rather than as a zero-length scale. |
| `needsNegativeSpacers` | The bar would have to sit below the frame's own slammed height. Not a build, so the stem table leaves these out entirely rather than printing a negative spacer stack. If a frame has nothing left, the card says how far above the target its closest option still sits. The model keeps them — the ranking already sorts them last — so only the display filters. |
| `railClamp` | Where the saddle's rails sit — the point both sides match. On a frame it is the post's clamp axis shifted back by `railOffset`; on the fit bike it is the saddle carriage shifted back by `saddleRailOffset`. |
| `saddleRailOffset` | How far back on its own rails the saddle is clamped **on the fit bike**. The carriage locates the clamp, not the saddle, and those are the same point only at rail centre — so this comes off every frame's saddle answer at full size. Same sign as a frame's `railOffset`: positive is back. It is folded into the offset that `carriagePosition` and `carriageReadings` both take, so the forward and reverse directions cannot disagree about it. |
| `railsBelowSaddleTop` | Saddle shell stack: rail centre up to the top of the saddle. Every saddle height on the page is measured to the **top**, so this is the whole conversion between a height and where the rails are — in both directions. One value, shared by the fit bike and every frame, which is where the assumption that you move a single saddle between bikes physically lives. |
| `railOffset` | How far back from rail centre the saddle must slide, after the fitted post's setback is used up. |
| `heightAlongSeatAxis` | Saddle height as you would measure it *on that frame*: bottom bracket to the **top of the saddle**, along that frame's own seat axis. Differs from the fit bike's number whenever the seat angle does. The exact inverse of what `frame.js` does to a built height, via `railsBelowSaddleTop`. |
| `standoverOffset` | How far position A→H moves both horizontal masts, as `[dx, dy]`. 20 mm per letter along an axis leaning 4° back, so mostly up and slightly rearward. |
| `standoverTravel` | The same movement as a distance along that axis (20 mm per letter) rather than as components. |
| `slideTilt` | Incline of a near-level slide. 4° here: the mast rises going forward and drops going back. |
| `matchMode` | `clamp` = same bar on both bikes, so the frame's `barReach` goes unused. `hoods` = shift the clamp target by the difference in bar reach, since the hoods are what your hands are on. The side view captions which one is in force, because the target moves between them. |

## Tests

No framework and no install — the tests are pages. Serve the project and open the runner:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/tests/
```

It runs all three suites and prints a tally (344 checks at the time of writing). Each
suite is also a standalone page if you want to read one in isolation.

| Suite | Covers |
| --- | --- |
| `tests/model.html` | The maths, no DOM: standover as a vector, the fit bike's own front end above and ahead of the bar carriage, the stem solver hitting a reachable target exactly, saddle round trips, crank and bar-reach compensation, the steerer limit, and the reverse solve inverting the forward one at all eight standover positions. |
| `tests/interaction.html` | The real UI, driven: typing, the caret surviving a redraw, add/remove/duplicate frames, pasting a geometry table, resetting the constants to the measured defaults, reset all, and applying a reverse setup. |
| `tests/migration.html` | Loads a save written by the previous single-file version and checks every field survives the rename, ids included, and that the stored calibration references are dropped. Also that a version 3 save skips the rename step and only has its spacer field converted — the migration applies one version's change at a time, and running the rename over an already-renamed save finds none of the keys it looks for and hands back an empty one. Version 6 is the only migration that changes a *value* (the 50 mm saddle-stack placeholder, now measured at 40), so it is tested for narrowness: any other figure is left alone. |

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

`stemLength`, `stemAngle` and `stemHeight` (90 / −7 / 40) describe the stock front end and
only hold while it is fitted. `railsBelowSaddleTop` (40) and `noseToRailCentre` (125) are
measured off the saddle rather than off the bike, so they only hold while that saddle is the
one being ridden. Both are
single values covering the fit bike and every frame: the page matches *rail* positions, so a different
saddle on the target bike still gets its rails in the right place, but its top would sit
higher or lower by the difference in shell stack and nothing here knows that.

That split is also what a **fit profile** is: a saved copy of the readings and the current
setup, with the constants left out. One bike, more than one rider or more than one position,
and nothing written down on paper. Loading one spells out what it is about to change and asks
first, because a profile carries a stem and a saddle as well as four numbers — those are parts
you have to actually swap for the answers to mean anything. Frames are not in a profile: a
frame is a bike, and it is the same bike whoever is sitting on it.

The one measured value taken on inference rather than from `constants.txt`:
`carriages.saddle.slideMmPerUnit` is **−10**, i.e. a bigger fore/aft reading means more
*setback*. If that scale actually counts forward, flip it to +10. The hint under the field
prints which way it currently thinks the carriage moves.
