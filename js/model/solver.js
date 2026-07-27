// Given the target position off the fit bike, work out what to bolt on each candidate
// frame: which stem length and angle, how many spacers, and where the saddle has to sit.

import { DEGREES, dot, add, subtract, distanceBetween } from '../lib/vector.js';
import { oneDecimal, whole, parseNumberList } from '../lib/format.js';
import { state } from '../state.js';
import { targetPositions } from './fit-bike.js';
import { barClampPosition, steererUp, spacerRoom } from './frame.js';

/*
 * Two corrections sit between the fit bike's target points and where a frame's own points have
 * to end up. They are exported as displacements, not folded into the target functions, because
 * the reverse direction has to take them off again: it starts from a real bike's contact points
 * and asks what the fit bike must read, so anything the forward direction adds on the way out
 * has to come off on the way back. Missing that made the reverse direction not an inverse of
 * the forward one whenever either correction was non-zero - a frame on different cranks came
 * back with the saddle 5mm out, and hood-match mode with a different bar came back 25mm out.
 */

/**
 * In hood-match mode the bar clamp target shifts by the difference in bar reach, so a bar with
 * a longer reach than the fit bike's sits that much further back. Zero in clamp-match mode,
 * where the same bar is assumed on both bikes.
 */
export const barClampCorrection = frame =>
  state.fitBike.matchMode !== 'hoods' ? [0, 0] : [state.fitBike.barReach - frame.barReach, 0];

/**
 * A longer crank than the fit bike's brings the saddle down by the difference, to keep leg
 * extension, and vice versa.
 */
export const railClampCorrection = frame => [
  0,
  -((frame.crankLength || 0) - (state.fitBike.crankLength || 0)),
];

/** Where this frame's bar clamp needs to end up. */
export const targetBarClamp = frame => add(targetPositions().bar, barClampCorrection(frame));

/** Where this frame's saddle rail clamp needs to end up. */
export const targetRailClamp = frame => add(targetPositions().saddle, railClampCorrection(frame));

const spacerIncrement = () => (state.options.spacerStep > 0 ? state.options.spacerStep : 1);

/**
 * For one stem length and angle, the spacer stack that gets closest to the target.
 * The exact answer is the target's offset projected onto the steerer axis; the usable answer is
 * a whole number of spacers within what the steerer will take, which is why there is a miss
 * distance at all.
 *
 * The stack is *clamped* into the buildable range rather than reported outside it. Rounding to
 * the nearest spacer used to be able to push a stack past the end of the steerer - 33.5mm wanted
 * on 33mm of room rounds to 35 with 5mm spacers - and the answer was then thrown out as
 * unreachable even though 30mm was buildable and only 3.5mm off. The same at the bottom: a
 * target a millimetre below slammed is a millimetre off with no spacers at all, not impossible.
 * Whether the clamp cost anything worth knowing about is `needsNegativeSpacers` and
 * `overSpacerRoom`, below.
 *
 * Returns:
 *   exactSpacerHeight  what the steerer axis wants, can be negative (front end too tall)
 *   spacerHeight       whole spacers, never below zero and never past the steerer
 *   dx, dy             how far the bar clamp lands from the target
 *   missMm             the straight line distance of that miss
 */
export function fitSpacerHeight(frame, stemLength, stemAngle, target) {
  const up = steererUp(frame.headTubeAngle);
  const withoutSpacers = barClampPosition(frame, 0, stemLength, stemAngle);

  const exactSpacerHeight = -dot(subtract(withoutSpacers, target), up);

  const increment = spacerIncrement();
  const tallestStack = Math.max(0, Math.floor((spacerRoom(frame) + 1e-9) / increment) * increment);
  const wanted = Math.round(exactSpacerHeight / increment) * increment;
  const spacerHeight = Math.min(tallestStack, Math.max(0, wanted));

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
 * A solution wanting a negative spacer stack is not a build at all — the front end is
 * already taller than the target with the stem slammed, and nothing un-stacks a headset.
 * Half a spacer of slack, since rounding to whole spacers is what lands a solution just the
 * wrong side of zero, and a build half a spacer out is nearer than the next one down.
 */
export const needsNegativeSpacers = solution =>
  solution.exactSpacerHeight < -spacerIncrement() / 2;

/** The steerer cannot give what this solution wants, by more than rounding would explain. */
export const overSpacerRoom = (frame, solution) =>
  solution.exactSpacerHeight > spacerRoom(frame) + spacerIncrement() / 2;

/**
 * How two solutions compare, best first.
 *
 * Sorting by miss distance alone was wrong in a way that mattered: it would headline a 130mm
 * stem at -17 degrees on 37.5mm of spacers over a 120mm at -6 on 12.5mm for 0.15mm less miss,
 * which is far inside the uncertainty of the measurements it came from. Nothing about that
 * trade is real, and the more extreme build handles differently.
 *
 * So the order is:
 *   1. buildable at all - no negative spacers, inside the steerer
 *   2. inside the limits you configured - stem length range, maximum angle
 *   3. inside the match tolerance
 *   4. among solutions that are all inside it, the least extreme: flattest stem, then fewest
 *      spacers, and only then closest. Outside it, closest first, since then the miss is the
 *      thing that separates them.
 */
function compareSolutions(a, b) {
  const byClass =
    b.reachable - a.reachable ||
    b.withinLimits - a.withinLimits ||
    b.insideTolerance - a.insideTolerance;
  if (byClass) return byClass;

  const flattest = Math.abs(a.stemAngle) - Math.abs(b.stemAngle);
  const leastSpacers = a.spacerHeight - b.spacerHeight;
  const closest = a.missMm - b.missMm;

  return a.insideTolerance
    ? flattest || leastSpacers || closest || a.stemLength - b.stemLength
    : closest || flattest || leastSpacers || a.stemLength - b.stemLength;
}

/** Every stem in the catalogue tried at every angle, both ways up, best first. */
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

      // Two kinds of problem, kept apart because they rank differently: what the bike cannot do
      // is worse than what you said you did not want.
      const buildWarnings = [];
      const limitWarnings = [];

      if (needsNegativeSpacers(fit))
        buildWarnings.push(`front end too tall - needs ${oneDecimal(-fit.exactSpacerHeight)}mm below zero`);
      if (overSpacerRoom(frame, fit))
        buildWarnings.push(`over spacer limit (${whole(spacerRoom(frame))}mm)`);
      if (stemLength < options.minStemLength)
        limitWarnings.push(`stem under ${whole(options.minStemLength)}mm`);
      if (stemLength > options.maxStemLength)
        limitWarnings.push(`stem over ${whole(options.maxStemLength)}mm`);
      if (Math.abs(stemAngle) > options.maxStemAngle)
        limitWarnings.push(`angle beyond ${whole(options.maxStemAngle)} degrees`);

      solutions.push({
        ...fit,
        stemLength,
        stemAngle,
        warnings: [...buildWarnings, ...limitWarnings],
        reachable: buildWarnings.length === 0,
        withinLimits: limitWarnings.length === 0,
        insideTolerance: fit.missMm <= state.options.toleranceMm,
      });
    }
  }

  solutions.sort(compareSolutions);
  return solutions;
}

export const bestStemSolution = frame => stemSolutions(frame)[0];

/** Does a solution count as a match, or only as the closest thing available? */
export const isMatch = solution => solution.reachable && solution.insideTolerance;

/**
 * A match you would actually build: it hits the target and it is inside the limits you set. The
 * green verdict is this rather than `isMatch`, because a stem longer or steeper than you said
 * you would fit is not an answer to the question you asked, however close it lands.
 */
export const isRecommendable = solution => isMatch(solution) && solution.withinLimits;

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
