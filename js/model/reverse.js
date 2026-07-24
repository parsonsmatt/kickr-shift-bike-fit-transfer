// The reverse direction: you already ride a bike you like, so what do you dial into the
// fit bike to sit in the same place?
//
// The other two directions in this app are sections 1/3 (fit bike -> frame) and section 2
// (frame -> the fit bike's constants). This one is frame -> readings, and it reuses both
// halves: `asBuiltPositions` says where a real build puts the two points, and
// `carriageReadings` inverts the carriage model to say what the scales must read.
//
// Standover makes the answer a family rather than a single set of numbers. It translates
// both carriages together, so *every* one of the eight positions has an exact set of
// readings to go with it — geometrically they are all equally right. The one to use is
// whichever keeps all four readings on the scales.

import { state } from '../state.js';
import { asBuiltPositions } from './frame.js';
import { STANDOVER_POSITIONS } from './standover.js';
import { SCALE_INPUTS, carriageReadings, standoverOffsetFor } from './fit-bike.js';

/** The four readings that reproduce `positions` with the standover at `letter`. */
export function readingsFor(positions, letter) {
  const offset = standoverOffsetFor(letter);
  const saddle = carriageReadings(state.carriages.saddle, positions.saddle, offset);
  const bar = carriageReadings(state.carriages.bar, positions.bar, offset);
  if (!saddle || !bar) return null;

  return {
    standover: letter,
    saddleHeight: saddle.mastReading,
    saddleForeAft: saddle.slideReading,
    barHeight: bar.mastReading,
    barReach: bar.slideReading,
  };
}

/**
 * One row per standover position, for a frame as it is currently built.
 *
 * `onScale` flags the rows worth trying. We do not know the length of each scale, but a
 * scale cannot read below its own zero mark, so a negative reading means that standover
 * position runs the carriage off the bottom of its travel. That rules rows out, never in —
 * a row can still ask for more travel than the machine has at the top end.
 */
export function trainerSetups(frame) {
  const positions = asBuiltPositions(frame, state.fitBike.railsBelowSaddleTop);
  const scaleKeys = Object.keys(SCALE_INPUTS);

  return STANDOVER_POSITIONS.map(letter => {
    const readings = readingsFor(positions, letter);
    if (!readings) return null;
    return { ...readings, onScale: scaleKeys.every(key => readings[key] >= 0) };
  }).filter(Boolean);
}

/**
 * The one to use, on the rule that we want the lowest standover height that works. Rows
 * come back in A..H order, so that is just the first one on the scales.
 *
 * Worth knowing which way this leans: raising the standover raises both carriages, so it
 * *reduces* the reading needed to reach a fixed point. Running off the bottom of a scale is
 * therefore a high-letter problem, and the lowest position that works is A unless the
 * position you are copying sits below the carriage's own zero mark. Null when nothing fits.
 */
export const lowestStandoverSetup = frame => trainerSetups(frame).find(row => row.onScale) || null;
