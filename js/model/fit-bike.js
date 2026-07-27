// The fit bike's carriage model: turning what the scales say into a position relative to
// the bottom bracket. This is the whole point of the app — you type what the bike says,
// not where you think the saddle is.
//
// Each carriage (one for the saddle, one for the handlebar) is a zero mark plus two
// slides, so the point it locates is
//
//   position = zero + mastMmPerUnit * mastReading  * mastDirection
//                   + slideMmPerUnit * slideReading * slideDirection
//
// Readings in cm with 10 mm per unit give millimetres; a scale marked any other way just
// needs a different mm-per-unit.
//
// The two slides:
//   mast   the near-vertical one (seatpost mast, front column). Its angle is given the
//          way a cyclist reads a tube angle — 73 leans back, 90 is vertical — so its
//          direction is 180 minus that.
//   slide  the near-level one (saddle fore/aft, bar reach). Its angle is a tilt off
//          horizontal — 0 level, +3 rising, -3 falling.
//
// Which way along a slide a *bigger* reading travels is carried by the sign of the
// mm-per-unit, never by the angle. A scale that counts the other way gets a negative gain.

import { unitVectorAt, magnitude, describeDirection, DEGREES } from '../lib/vector.js';
import { steererUp } from './frame.js';
import { oneDecimal } from '../lib/format.js';
import { state } from '../state.js';
import { standoverOffset, standoverTravel, normaliseStandover } from './standover.js';

/** Which carriage and which slide each of the four scale readings drives. */
export const SCALE_INPUTS = {
  saddleHeight: {
    carriage: 'saddle',
    axis: 'mast',
    label: 'Saddle height',
    hint: 'Reading off the seat post scale.',
  },
  saddleForeAft: {
    carriage: 'saddle',
    axis: 'slide',
    label: 'Saddle fore / aft',
    hint: 'Reading off the saddle rail scale.',
  },
  barHeight: {
    carriage: 'bar',
    axis: 'mast',
    label: 'Handlebar height',
    hint: 'Reading off the front column scale.',
  },
  barReach: {
    carriage: 'bar',
    axis: 'slide',
    label: 'Handlebar reach',
    hint: 'Reading off the reach extension scale.',
  },
};

export const mastDirection = carriage => unitVectorAt(180 - carriage.mastAngle);

export const slideDirection = carriage => unitVectorAt(carriage.slideTilt);

/**
 * How far a scale goes, in scale units, or null when it has not been measured. 0 means
 * unmeasured rather than "a scale with no travel", since a zero-length scale is not a thing
 * and treating it as a limit would rule out every position.
 */
export function scaleLimit(carriage, axis) {
  const limit = axis === 'mast' ? carriage.mastMaxReading : carriage.slideMaxReading;
  return limit > 0 ? limit : null;
}

/**
 * Whether a reading is a number this scale can actually show: never below its own zero
 * mark, and never past the end of its travel. The lower bound always applies; the upper one
 * only once it has been measured.
 */
export function readingOnScale(carriage, axis, reading) {
  if (!(reading >= 0)) return false;
  const limit = scaleLimit(carriage, axis);
  return limit === null || reading <= limit;
}

/** Which of the four scales a reading is off the end of, as a list of reading keys. */
export const offScaleReadings = readings =>
  Object.keys(SCALE_INPUTS).filter(key => {
    const scale = SCALE_INPUTS[key];
    return !readingOnScale(state.carriages[scale.carriage], scale.axis, readings[key]);
  });

/** How far and which way one scale unit moves the carriage, as a vector in mm. */
export function travelPerUnit(carriage, axis) {
  const direction = axis === 'mast' ? mastDirection(carriage) : slideDirection(carriage);
  const mmPerUnit = axis === 'mast' ? carriage.mastMmPerUnit : carriage.slideMmPerUnit;
  return [mmPerUnit * direction[0], mmPerUnit * direction[1]];
}

/**
 * Where a carriage sits for a pair of readings.
 * `offset` is the standover displacement from position A, as [dx, dy] — it has a rearward
 * component as well as a vertical one, because the rise axis leans back.
 */
export function carriagePosition(carriage, mastReading, slideReading, offset = [0, 0]) {
  const mast = mastDirection(carriage);
  const slide = slideDirection(carriage);
  return [
    carriage.zeroX + offset[0] + carriage.mastMmPerUnit * mastReading * mast[0] + carriage.slideMmPerUnit * slideReading * slide[0],
    carriage.zeroY + offset[1] + carriage.mastMmPerUnit * mastReading * mast[1] + carriage.slideMmPerUnit * slideReading * slide[1],
  ];
}

/**
 * The inverse of `carriagePosition`: which pair of readings puts this carriage on
 * `position`. Two slides and two unknowns, so this is an exact 2x2 solve rather than a
 * fit. Null when the two slides are parallel — a carriage that can only move along one
 * line cannot reach an arbitrary point — which in practice means a mm-per-unit of zero.
 */
export function carriageReadings(carriage, position, offset = [0, 0]) {
  const mast = travelPerUnit(carriage, 'mast');
  const slide = travelPerUnit(carriage, 'slide');
  const determinant = mast[0] * slide[1] - mast[1] * slide[0];
  if (!determinant) return null;

  const wanted = [
    position[0] - carriage.zeroX - offset[0],
    position[1] - carriage.zeroY - offset[1],
  ];

  return {
    mastReading: (wanted[0] * slide[1] - wanted[1] * slide[0]) / determinant,
    slideReading: (mast[0] * wanted[1] - mast[1] * wanted[0]) / determinant,
  };
}

/**
 * The two points to reproduce on a real frame, from the readings currently entered: the
 * centre of the saddle's rails and the bar clamp centre.
 *
 * Neither carriage locates its point directly — see `saddleOffsetFor` and `barOffsetFor`.
 */
export function targetPositions() {
  const { readings, carriages } = state;
  return {
    saddle: carriagePosition(carriages.saddle, readings.saddleHeight, readings.saddleForeAft, saddleOffsetFor(readings.standover)),
    bar: carriagePosition(carriages.bar, readings.barHeight, readings.barReach, barOffsetFor(readings.standover)),
  };
}

/* ---------- standover, using the constants the user has entered ---------- */

export const standoverOffsetFor = value =>
  standoverOffset(value, state.fitBike.standoverStepMm, state.fitBike.standoverRiseBackDegrees);

export const standoverTravelFor = value => standoverTravel(value, state.fitBike.standoverStepMm);

/**
 * The saddle carriage's offset: the standover rise, plus however far back on its own rails the
 * saddle is clamped on the fit bike.
 *
 * The carriage locates the *clamp*; what has to be reproduced on a real frame is where the
 * saddle itself ends up, which is its rail centre. Those are the same point only when the
 * saddle is clamped at rail centre, and the app used to assume they always were — so a saddle
 * slid 20mm back on the fit bike put every frame's saddle 20mm too far forward. Applied
 * horizontally only, like a frame's own `railOffset`: rails are near enough level over the
 * 20-30mm of travel involved.
 *
 * Folding it into the offset both `carriagePosition` and `carriageReadings` take means the
 * forward and reverse directions cannot disagree about it.
 */
export const saddleOffsetFor = letter => {
  const rise = standoverOffsetFor(letter);
  return [rise[0] - state.fitBike.saddleRailOffset, rise[1]];
};

/**
 * From the bar carriage's zero point to the bar clamp centre.
 *
 * The fit bike's front end is built like any other bike's: the column has a clamp on it, the
 * stem sits on that clamp, and the bar is a stem length in front. The zero point is measured
 * to the top of that clamp, so getting to the bar clamp centre is two moves - half the stem's
 * height up the column, then along the stem - which is exactly what `barClampPosition` does to
 * a frame. Both use the same angle convention, so a stem that reads level on one reads level on
 * the other, and the column plays the part of the head tube.
 *
 * None of this was here at first, and it is not a detail: the carriage zero is a good 90mm
 * behind and 30mm below where the hands actually are, so every frame's answer came back about a
 * stem length short.
 */
export function barClampOffset() {
  const { stemLength, stemAngle, stemHeight } = state.fitBike;
  const columnAngle = state.carriages.bar.mastAngle;
  const up = steererUp(columnAngle);
  const bearing = (90 - columnAngle + stemAngle) * DEGREES;
  return [
    (stemHeight / 2) * up[0] + stemLength * Math.cos(bearing),
    (stemHeight / 2) * up[1] + stemLength * Math.sin(bearing),
  ];
}

/**
 * The bar carriage's offset: the standover rise, plus the front end above and ahead of it.
 *
 * Folded into the offset that `carriagePosition` and `carriageReadings` both take, so the
 * forward and reverse directions cannot disagree about it - same reason as `saddleOffsetFor`.
 */
export const barOffsetFor = letter => {
  const rise = standoverOffsetFor(letter);
  const front = barClampOffset();
  return [rise[0] + front[0], rise[1] + front[1]];
};

/** The whole front end in one sentence, for the hint under the stem angle. */
export function describeFrontEnd() {
  const { stemLength, stemAngle, stemHeight } = state.fitBike;
  const offset = barClampOffset();
  return (
    `${oneDecimal(stemLength)}mm at ${oneDecimal(stemAngle)} deg, on a ${oneDecimal(stemHeight)}mm ` +
    `stem whose centre is ${oneDecimal(stemHeight / 2)}mm up the ` +
    `${oneDecimal(state.carriages.bar.mastAngle)} degree column: the bar clamp ends up ` +
    `${oneDecimal(offset[0])}mm ahead of the zero point and ${oneDecimal(offset[1])}mm above it.`
  );
}

export const activeStandover = () => normaliseStandover(state.readings.standover);

/**
 * The whole sentence shown under the standover selector, e.g.
 * "D moves both reach/setback masts 60.0mm along the rise axis: 59.9mm up, 4.2mm back."
 * The rearward part is the bit that is easy to forget, so it is always spelled out.
 */
export function describeStandover(value) {
  const letter = normaliseStandover(value);
  const travel = standoverTravelFor(value);
  if (!travel) return `${letter} is the reference position: no rise, no setback.`;

  const offset = standoverOffsetFor(value);
  return (
    `${letter} moves both reach/setback masts ${oneDecimal(travel)}mm along the rise axis: ` +
    `${oneDecimal(offset[1])}mm up, ${oneDecimal(-offset[0])}mm back.`
  );
}

/* ---------- plain English descriptions, so a sign error is visible ---------- */

export function describeMast(carriage) {
  const way = carriage.mastMmPerUnit >= 0 ? 'up' : 'down';
  return `A bigger reading runs the carriage ${way} a ${oneDecimal(carriage.mastAngle)} degree mast: ${describeDirection(travelPerUnit(carriage, 'mast'))}.`;
}

export function describeSlide(carriage) {
  const travel = travelPerUnit(carriage, 'slide');
  const way = carriage.slideMmPerUnit >= 0 ? 'forward' : 'back';
  if (Math.abs(carriage.slideTilt) < 0.05) return `A bigger reading moves it ${way}, level.`;
  const rise = travel[1] > 0 ? 'rising' : 'falling';
  return `A bigger reading moves it ${way}, ${rise} ${oneDecimal(Math.abs(carriage.slideTilt))} degrees.`;
}

/** "One unit moves 10.0mm up and back." — shown under each scale input. */
export function describeScaleUnit(readingKey) {
  const scale = SCALE_INPUTS[readingKey];
  const travel = travelPerUnit(state.carriages[scale.carriage], scale.axis);
  return `One unit moves ${oneDecimal(magnitude(travel))}mm ${describeDirection(travel)}.`;
}
