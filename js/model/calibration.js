// Checking the fit bike constants against bikes whose build you already know.
//
// The constants are measured off the machine and live in js/state.js. Nothing here writes to
// them — this module only answers "do the numbers you have predict a bike you already know?".
//
// Set the fit bike up to match a known bike, note the standover position and the four scale
// readings, and we know both where the two reference points are (from that frame's geometry
// and its actual stem, spacers and seatpost) and what the scales said. Running the carriage
// model forward on those readings and comparing gives the miss, per carriage and per axis.
//
// There used to be a least-squares fit here that solved the constants from these references
// and overwrote them. It was removed: needing it would mean the measured constants are wrong,
// which is a thing to go and fix at the source, and one reference with a reading left at zero
// was enough to quietly move a carriage's zero point onto that bike and make its readings
// come out as zero from then on.

import { subtract, magnitude } from '../lib/vector.js';
import { toNumber } from '../lib/format.js';
import { state } from '../state.js';
import { asBuiltPositions } from './frame.js';
import { carriagePosition, standoverOffsetFor } from './fit-bike.js';

/**
 * Each calibration reference turned into a pair of observations: what the scales read,
 * and where that carriage demonstrably was.
 */
export function referenceObservations() {
  return state.references
    .map(reference => {
      const frame = state.frames.find(candidate => candidate.id === reference.frameId);
      if (!frame) return null;

      const positions = asBuiltPositions(frame, state.fitBike.railsBelowSaddleTop);
      const offset = standoverOffsetFor(reference.standover);

      return {
        name: frame.name + (frame.size ? ' ' + frame.size : ''),
        saddle: {
          mastReading: toNumber(reference.saddleHeight),
          slideReading: toNumber(reference.saddleForeAft),
          position: positions.saddle,
          standoverOffset: offset,
        },
        bar: {
          mastReading: toNumber(reference.barHeight),
          slideReading: toNumber(reference.barReach),
          position: positions.bar,
          standoverOffset: offset,
        },
      };
    })
    .filter(Boolean);
}

/** How far the constants currently in the form miss each reference. Reads only. */
export function residuals(observations) {
  return observations.map(observation => ({
    name: observation.name,
    saddle: subtract(
      carriagePosition(
        state.carriages.saddle,
        observation.saddle.mastReading,
        observation.saddle.slideReading,
        observation.saddle.standoverOffset,
      ),
      observation.saddle.position,
    ),
    bar: subtract(
      carriagePosition(
        state.carriages.bar,
        observation.bar.mastReading,
        observation.bar.slideReading,
        observation.bar.standoverOffset,
      ),
      observation.bar.position,
    ),
  }));
}

/** The largest single miss across every reference and both carriages, in mm. */
export const worstResidual = residualList =>
  Math.max(...residualList.flatMap(entry => [magnitude(entry.saddle), magnitude(entry.bar)]));

export function checkConstants() {
  const observations = referenceObservations();
  if (!observations.length) {
    return { ok: false, message: 'Add at least one reference frame with its scale readings first.' };
  }
  return { ok: true, residuals: residuals(observations), referenceCount: observations.length };
}
