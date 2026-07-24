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

import { unitVectorAt, magnitude, describeDirection } from '../lib/vector.js';
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
 * The two points to reproduce on a real frame, from the readings currently entered:
 * the saddle rail clamp centre and the bar clamp centre.
 */
export function targetPositions() {
  const { readings, carriages } = state;
  const offset = standoverOffsetFor(readings.standover);
  return {
    saddle: carriagePosition(carriages.saddle, readings.saddleHeight, readings.saddleForeAft, offset),
    bar: carriagePosition(carriages.bar, readings.barHeight, readings.barReach, offset),
  };
}

/* ---------- standover, using the constants the user has entered ---------- */

export const standoverOffsetFor = value =>
  standoverOffset(value, state.fitBike.standoverStepMm, state.fitBike.standoverRiseBackDegrees);

export const standoverTravelFor = value => standoverTravel(value, state.fitBike.standoverStepMm);

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
