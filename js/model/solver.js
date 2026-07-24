// Given the target position off the fit bike, work out what to bolt on each candidate
// frame: which stem length and angle, how many spacers, and where the saddle has to sit.

import { DEGREES, dot, distanceBetween } from '../lib/vector.js';
import { oneDecimal, whole, parseNumberList } from '../lib/format.js';
import { state } from '../state.js';
import { targetPositions } from './fit-bike.js';
import { barClampPosition, steererUp } from './frame.js';

/**
 * Where this frame's bar clamp needs to end up.
 * In hood-match mode the target shifts by the difference in bar reach, so a bar with a
 * longer reach than the fit bike's sits that much further back.
 */
export function targetBarClamp(frame) {
  const target = targetPositions().bar;
  if (state.fitBike.matchMode !== 'hoods') return target;
  return [target[0] + (state.fitBike.barReach - frame.barReach), target[1]];
}

/**
 * Where this frame's saddle rail clamp needs to end up. A longer crank than the fit
 * bike's brings the saddle down by the difference, and vice versa.
 */
export function targetRailClamp(frame) {
  const target = targetPositions().saddle;
  const crankDifference = (frame.crankLength || 0) - (state.fitBike.crankLength || 0);
  return [target[0], target[1] - crankDifference];
}

/**
 * For one stem length and angle, the spacer stack that gets closest to the target.
 * The exact answer is the target's offset projected onto the steerer axis; the usable
 * answer is that rounded to whole spacers, which is why there is a miss distance at all.
 *
 * Returns:
 *   exactSpacerHeight  what the steerer axis wants, can be negative (front end too tall)
 *   spacerHeight       rounded to the spacer increment, never below zero
 *   dx, dy             how far the bar clamp lands from the target
 *   missMm             the straight line distance of that miss
 */
export function fitSpacerHeight(frame, stemLength, stemAngle, target) {
  const up = steererUp(frame.headTubeAngle);
  const withoutSpacers = barClampPosition(frame, 0, stemLength, stemAngle);

  const exactSpacerHeight = -dot(
    [withoutSpacers[0] - target[0], withoutSpacers[1] - target[1]],
    up,
  );

  const increment = state.options.spacerStep > 0 ? state.options.spacerStep : 1;
  const spacerHeight = Math.max(0, Math.round(exactSpacerHeight / increment) * increment);

  const landed = barClampPosition(frame, spacerHeight, stemLength, stemAngle);
  return {
    exactSpacerHeight,
    spacerHeight,
    dx: landed[0] - target[0],
    dy: landed[1] - target[1],
    missMm: distanceBetween(landed, target),
  };
}

/**
 * Every stem in the catalogue tried at every angle, both ways up, best first.
 * Ranked by: reachable at all, then smallest miss, then least angle, then fewest spacers.
 */
export function stemSolutions(frame) {
  const target = targetBarClamp(frame);
  const { options } = state;

  const lengths = parseNumberList(options.stemLengths);
  const angles = [...new Set(parseNumberList(options.stemAngles).flatMap(angle => [angle, -angle]))]
    .sort((a, b) => a - b);

  const solutions = [];
  for (const stemLength of lengths) {
    for (const stemAngle of angles) {
      const fit = fitSpacerHeight(frame, stemLength, stemAngle, target);
      const warnings = [];

      if (fit.exactSpacerHeight < -0.5)
        warnings.push(`front end too tall - needs ${oneDecimal(-fit.exactSpacerHeight)}mm below zero`);
      if (fit.spacerHeight > frame.spacersAvailable + 1e-9)
        warnings.push(`over spacer limit (${whole(frame.spacersAvailable)}mm)`);
      if (stemLength < options.minStemLength)
        warnings.push(`stem under ${whole(options.minStemLength)}mm`);
      if (stemLength > options.maxStemLength)
        warnings.push(`stem over ${whole(options.maxStemLength)}mm`);
      if (Math.abs(stemAngle) > options.maxStemAngle)
        warnings.push(`angle beyond ${whole(options.maxStemAngle)} degrees`);

      solutions.push({
        ...fit,
        stemLength,
        stemAngle,
        warnings,
        reachable: fit.exactSpacerHeight >= -0.5 && fit.spacerHeight <= frame.spacersAvailable + 1e-9,
      });
    }
  }

  solutions.sort(
    (a, b) =>
      b.reachable - a.reachable ||
      a.missMm - b.missMm ||
      Math.abs(a.stemAngle) - Math.abs(b.stemAngle) ||
      a.spacerHeight - b.spacerHeight,
  );
  return solutions;
}

export const bestStemSolution = frame => stemSolutions(frame)[0];

/** Does a solution count as a match, or only as the closest thing available? */
export const isMatch = solution => solution.reachable && solution.missMm <= state.options.toleranceMm;

/**
 * What the saddle has to do on this frame to land on the target rail clamp.
 *
 *   heightAlongSeatAxis  the saddle height you would measure on this frame — different
 *                        from the fit bike's number whenever the seat angle differs
 *   clampBehindAxis      how far behind the seat axis the rail clamp sits
 *   railOffset           what is left for the rails once the fitted post's setback is
 *                        used up; positive means slid back from rail centre
 */
export function saddleSetup(frame) {
  const clamp = targetRailClamp(frame);
  const seatAngle = frame.seatTubeAngle * DEGREES;

  const seatAxisX = -clamp[1] / Math.tan(seatAngle);
  const clampBehindAxis = seatAxisX - clamp[0];
  const railOffset = clampBehindAxis - (frame.seatpostSetback || 0);
  const heightAlongSeatAxis = (clamp[1] + state.fitBike.railsBelowSaddleTop) / Math.sin(seatAngle);
  const railTravel = frame.railTravel || 25;

  return {
    clamp,
    heightAlongSeatAxis,
    clampBehindAxis,
    railOffset,
    railTravel,
    railOffsetReachable: Math.abs(railOffset) <= railTravel,
    seatpostExposed: frame.seatTubeLength ? heightAlongSeatAxis - frame.seatTubeLength : null,
  };
}
