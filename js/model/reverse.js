// The reverse direction: you already ride a bike you like, so what do you dial into the
// fit bike to sit in the same place?
//
// The forward direction is sections 1 and 2: readings -> where the two points are -> what to
// bolt on a frame. This is the inverse, frame -> readings, and it reuses both halves:
// `asBuiltPositions` says where a real build puts the two points, and `carriageReadings`
// inverts the carriage model to say what the scales must read to get there.
//
// Standover makes the answer a family rather than a single set of numbers. It translates
// both carriages together, so *every* one of the eight positions has an exact set of
// readings to go with it — geometrically they are all equally right. The one to use is
// whichever keeps all four readings on the scales.

import { state } from '../state.js';
import { asBuiltPositions } from './frame.js';
import { STANDOVER_POSITIONS } from './standover.js';
import { carriageReadings, offScaleReadings, barOffsetFor, saddleOffsetFor } from './fit-bike.js';

/** The four readings that reproduce `positions` with the standover at `letter`. */
export function readingsFor(positions, letter) {
  const saddle = carriageReadings(state.carriages.saddle, positions.saddle, saddleOffsetFor(letter));
  const bar = carriageReadings(state.carriages.bar, positions.bar, barOffsetFor(letter));
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
 * `onScale` flags the rows worth trying, and `offScale` names the scales that spoil the
 * ones that are not. A reading below zero is off the bottom of the travel and always rules a
 * row out; a reading past the end of the scale only rules one out once that scale's length
 * has been measured (`mastMaxReading` / `slideMaxReading`, 0 meaning unmeasured).
 */
export function trainerSetups(frame) {
  const positions = asBuiltPositions(frame, state.fitBike.railsBelowSaddleTop);

  return STANDOVER_POSITIONS.map(letter => {
    const readings = readingsFor(positions, letter);
    if (!readings) return null;
    const offScale = offScaleReadings(readings);
    return { ...readings, offScale, onScale: offScale.length === 0 };
  }).filter(Boolean);
}

/**
 * The one to use, on the rule that we want the lowest standover height that works. Rows
 * come back in A..H order, so that is just the first one on the scales.
 *
 * Worth knowing which way this leans: raising the standover raises both carriages, so it
 * *reduces* the reading needed to reach a fixed point. So the bottom of the travel is what
 * rules out the *high* letters and the top of the travel is what rules out the *low* ones —
 * which is why measuring the maximum readings is what makes "the lowest that fits" mean
 * anything. Until they are measured only the bottom applies, and the answer is nearly always
 * A. Null when no position fits.
 */
export const lowestStandoverSetup = frame => trainerSetups(frame).find(row => row.onScale) || null;
