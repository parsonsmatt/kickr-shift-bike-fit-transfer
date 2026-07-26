// A candidate frame, and the geometry that says where its bar clamp and saddle rail
// clamp end up for a given build. Everything here is a pure function of its arguments
// so the numbers can be checked by hand against a geometry chart.
//
// Coordinates are millimetres from the bottom bracket, +x forward, +y up.

import { DEGREES } from '../lib/vector.js';

let frameSerial = 1;

/** Unique enough id for a frame; used as the React-less key for form fields. */
export const newFrameId = () =>
  'f' + frameSerial++ + '_' + Math.random().toString(36).slice(2, 6);

// The intended workflow is to set the fit bike's cranks to whatever the target bike will
// run, so a new frame should start out matching. Passed in rather than read off the state
// to keep this module a pure function of its arguments.
export function createFrame(name = 'New frame', size = '', crankLength = 170) {
  return {
    id: newFrameId(),
    name,
    size,

    // Published geometry, straight off the manufacturer's chart.
    stack: 565, // BB to top of head tube, vertical
    reach: 381, // BB to top of head tube, horizontal
    headTubeAngle: 72.5,
    seatTubeAngle: 73.5,
    seatTubeLength: 0, // centre to top; 0 means unknown, only used to report post exposure

    // Build details that geometry charts do not list. Worth correcting per frame.
    headsetStack: 15, // upper headset cover height, spacers start on top of it
    stemClampHeight: 40, // full height of the stem's steerer clamp
    barReach: 75, // bar's own reach, only used in hood-match mode
    exposedSteerer: 80, // steerer standing above the headset cover: spacers AND the stem
    crankLength,
    seatpostSetback: 0,
    railTravel: 25, // how far the saddle can slide either way from rail centre

    // As currently built. Read by the reverse direction, which turns them into the fit bike
    // readings that would put you in this same position.
    builtStemLength: 100,
    builtStemAngle: -6,
    builtSpacerHeight: 20,
    builtSaddleHeight: 700, // BB to saddle top along this frame's seat axis
    builtRailOffset: 0, // saddle slid back from rail centre

    expanded: true,
  };
}

/**
 * How much spacer the steerer will actually take. The stem has to sit on the steerer too,
 * so it eats its own clamp height out of the exposed length.
 *
 * This used to be stored directly, as "spacers available", which read as though it were
 * something you could measure - so it got filled in with numbers smaller than the spacer
 * stack the bike was already wearing. Exposed steerer is a length you can put a ruler on.
 */
export const spacerRoom = frame => frame.exposedSteerer - frame.stemClampHeight;

/**
 * True when the bike's own build does not fit in its own exposed steerer, which means one of
 * the three numbers is wrong rather than that the bike is impossible.
 */
export const asBuiltOverflowsSteerer = frame =>
  frame.builtSpacerHeight + frame.stemClampHeight > frame.exposedSteerer + 1e-9;

/** Unit vector pointing up the steerer, given a head tube angle read the usual way. */
export const steererUp = headTubeAngle => [
  -Math.cos(headTubeAngle * DEGREES),
  Math.sin(headTubeAngle * DEGREES),
];

/** Unit vector pointing up the seat axis. */
export const seatAxisUp = seatTubeAngle => [
  -Math.cos(seatTubeAngle * DEGREES),
  Math.sin(seatTubeAngle * DEGREES),
];

/**
 * The point on the steerer axis level with the bar clamp centreline: head tube top,
 * plus the headset cover, plus the spacers, plus half the stem clamp. The stem itself
 * runs forward from here.
 */
export function steererPointAtBarHeight(frame, spacerHeight) {
  const up = steererUp(frame.headTubeAngle);
  const heightUpSteerer = frame.headsetStack + spacerHeight + frame.stemClampHeight / 2;
  return [frame.reach + heightUpSteerer * up[0], frame.stack + heightUpSteerer * up[1]];
}

/**
 * Where the bar clamp centre lands for a given spacer stack, stem length and stem angle.
 * Stem angle is measured off perpendicular to the steerer, the way stems are labelled,
 * so a 0 degree stem on a 72.5 degree head tube still rises.
 */
export function barClampPosition(frame, spacerHeight, stemLength, stemAngle) {
  const base = steererPointAtBarHeight(frame, spacerHeight);
  const stemBearing = (90 - frame.headTubeAngle + stemAngle) * DEGREES;
  return [base[0] + stemLength * Math.cos(stemBearing), base[1] + stemLength * Math.sin(stemBearing)];
}

/**
 * The saddle rail clamp implied by a saddle height measured along the seat axis, a
 * seatpost setback and a rail offset. Inverse of "measure the saddle height on this bike".
 */
export function railClampPosition({
  seatTubeAngle,
  saddleHeight,
  seatpostSetback = 0,
  railOffset = 0,
  railsBelowSaddleTop,
}) {
  const seatAngle = seatTubeAngle * DEGREES;
  const clampY = saddleHeight * Math.sin(seatAngle) - railsBelowSaddleTop;
  const seatAxisX = -clampY / Math.tan(seatAngle);
  return [seatAxisX - seatpostSetback - railOffset, clampY];
}

/** Where the two reference points actually sit on this frame as it is built today. */
export function asBuiltPositions(frame, railsBelowSaddleTop) {
  return {
    bar: barClampPosition(frame, frame.builtSpacerHeight, frame.builtStemLength, frame.builtStemAngle),
    saddle: railClampPosition({
      seatTubeAngle: frame.seatTubeAngle,
      saddleHeight: frame.builtSaddleHeight,
      seatpostSetback: frame.seatpostSetback,
      railOffset: frame.builtRailOffset,
      railsBelowSaddleTop,
    }),
  };
}
