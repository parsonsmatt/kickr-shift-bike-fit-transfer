// Back-solving the fit bike constants from bikes whose build you already know.
//
// Set the fit bike up to match a known bike, note the standover position and the four
// scale readings, and we know both where the two reference points are (from that frame's
// geometry and its actual stem, spacers and seatpost) and what the scales said. The
// carriage model is linear in its four unknowns — zeroX, zeroY, mastMmPerUnit,
// slideMmPerUnit — so a least-squares fit recovers them.
//
// Each reference supplies two equations per carriage (one for x, one for y), so:
//   one reference   pins the zero point, with the mm-per-unit held as entered
//   two or more     fits the mm-per-unit as well and reports how well they agree

import { subtract, magnitude } from '../lib/vector.js';
import { toNumber } from '../lib/format.js';
import { state, replaceCarriages } from '../state.js';
import { asBuiltPositions } from './frame.js';
import { carriagePosition, mastDirection, slideDirection, standoverOffsetFor } from './fit-bike.js';

const CARRIAGE_KEYS = ['saddle', 'bar'];

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

/**
 * Solve `rows` as normal equations. Each row is [c0, c1, ..., rhs] for `unknownCount`
 * unknowns. Gauss-Jordan with partial pivoting; null when the system is singular, which
 * in practice means the references are too alike to separate the two slides.
 */
function solveNormalEquations(rows, unknownCount) {
  const n = unknownCount;
  const matrix = Array.from({ length: n }, () => new Array(n + 1).fill(0));

  for (const row of rows) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) matrix[i][j] += row[i] * row[j];
      matrix[i][n] += row[i] * row[n];
    }
  }

  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(matrix[k][i]) > Math.abs(matrix[pivot][i])) pivot = k;
    }
    if (Math.abs(matrix[pivot][i]) < 1e-9) return null;

    [matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]];

    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = matrix[k][i] / matrix[i][i];
      for (let j = i; j <= n; j++) matrix[k][j] -= factor * matrix[i][j];
    }
  }

  // Every off-diagonal entry is now zero, so each unknown is its row's right hand side
  // divided by its own pivot.
  const unknowns = [];
  for (let i = 0; i < n; i++) unknowns.push(matrix[i][n] / matrix[i][i]);
  return unknowns;
}

/**
 * Fit one carriage's constants to its observations.
 * With fitTravel false the mm-per-unit values are held as entered and only the zero
 * point moves — the right thing to do from a single reference.
 */
export function fitCarriage(observations, carriage, { fitTravel }) {
  const mast = mastDirection(carriage);
  const slide = slideDirection(carriage);
  const rows = [];

  for (const observation of observations) {
    // The standover displacement is known, so take it off both axes before fitting; what
    // is left is the carriage's own zero point plus its slide travel.
    const offset = observation.standoverOffset || [0, 0];
    const x = observation.position[0] - offset[0];
    const y = observation.position[1] - offset[1];

    if (fitTravel) {
      // unknowns: zeroX, zeroY, mastMmPerUnit, slideMmPerUnit
      rows.push([1, 0, observation.mastReading * mast[0], observation.slideReading * slide[0], x]);
      rows.push([0, 1, observation.mastReading * mast[1], observation.slideReading * slide[1], y]);
    } else {
      // unknowns: zeroX, zeroY — the slide travel is subtracted off both sides first
      const travelledX =
        carriage.mastMmPerUnit * observation.mastReading * mast[0] +
        carriage.slideMmPerUnit * observation.slideReading * slide[0];
      const travelledY =
        carriage.mastMmPerUnit * observation.mastReading * mast[1] +
        carriage.slideMmPerUnit * observation.slideReading * slide[1];
      rows.push([1, 0, x - travelledX]);
      rows.push([0, 1, y - travelledY]);
    }
  }

  const solved = solveNormalEquations(rows, fitTravel ? 4 : 2);
  if (!solved) return null;

  return {
    zeroX: solved[0],
    zeroY: solved[1],
    mastMmPerUnit: fitTravel ? solved[2] : carriage.mastMmPerUnit,
    slideMmPerUnit: fitTravel ? solved[3] : carriage.slideMmPerUnit,
  };
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

// Snapshot of the constants as they were before the last solve, so a solve can be undone.
let constantsBeforeSolve = null;

/**
 * Fit both carriages and write the result into the state.
 * Returns the residuals afterwards plus a list of every constant that actually moved.
 */
export function solveConstants() {
  const observations = referenceObservations();
  if (!observations.length) {
    return { ok: false, message: 'Add at least one reference frame with its scale readings.' };
  }

  const fitTravel = observations.length >= 2;
  const fitted = {};

  for (const key of CARRIAGE_KEYS) {
    const solved = fitCarriage(
      observations.map(observation => observation[key]),
      state.carriages[key],
      { fitTravel },
    );
    if (!solved) {
      return {
        ok: false,
        message:
          `Those readings do not pin the ${key} carriage down - the settings are too alike to ` +
          `separate the two slides. Add a reference with a clearly different ${key} position.`,
      };
    }
    fitted[key] = solved;
  }

  const changed = [];
  for (const key of CARRIAGE_KEYS) {
    for (const field in fitted[key]) {
      const before = state.carriages[key][field];
      const after = fitted[key][field];
      if (Math.abs(after - before) > 0.05) changed.push({ carriage: key, field, before, after });
    }
  }

  constantsBeforeSolve = structuredClone(state.carriages);
  for (const key of CARRIAGE_KEYS) Object.assign(state.carriages[key], fitted[key]);

  return {
    ok: true,
    zeroPointsOnly: !fitTravel,
    residuals: residuals(observations),
    referenceCount: observations.length,
    changed,
  };
}

export function undoSolve() {
  if (!constantsBeforeSolve) return false;
  replaceCarriages(constantsBeforeSolve);
  constantsBeforeSolve = null;
  return true;
}
