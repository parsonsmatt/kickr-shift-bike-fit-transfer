// The fit bike's standover setting.
//
// Each letter raises both horizontal masts (the saddle fore/aft mast and the bar reach
// mast) by a fixed step ALONG THE RISE AXIS, and that axis leans back from vertical. So
// the movement is mostly up but partly rearward: at 20 mm per letter on a 4 degree axis,
// each letter is 19.95 mm up and 1.40 mm back, and A to H is 139.7 up and 9.8 back.
//
// Everything here is pure: the step size and the axis angle are passed in, because they
// are fit bike constants the user can correct (state.fitBike).

import { unitVectorAt } from '../lib/vector.js';

export const STANDOVER_POSITIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Anything unrecognised falls back to A rather than throwing. */
export function normaliseStandover(value) {
  const letter = String(value || 'A').trim().toUpperCase();
  return STANDOVER_POSITIONS.includes(letter) ? letter : 'A';
}

/** How many letters above A this setting sits. */
export const standoverSteps = value => STANDOVER_POSITIONS.indexOf(normaliseStandover(value));

/** Distance travelled along the rise axis, in mm. Not the vertical gain. */
export const standoverTravel = (value, stepMm) => standoverSteps(value) * stepMm;

/**
 * Unit vector along the rise axis. Leaning `backDegrees` back from straight up is the
 * same direction as a tube angle of (90 - backDegrees) read the cyclist's way.
 */
export const riseDirection = backDegrees => unitVectorAt(90 + backDegrees);

/** How far this setting moves both carriages from position A, as [dx, dy] in mm. */
export function standoverOffset(value, stepMm, backDegrees) {
  const travel = standoverTravel(value, stepMm);
  const direction = riseDirection(backDegrees);
  return [travel * direction[0], travel * direction[1]];
}
