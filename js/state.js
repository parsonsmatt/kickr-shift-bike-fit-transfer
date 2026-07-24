// The single application state object, its defaults, and loading older saved data.
//
// Shape:
//   readings        what the fit bike's four scales and the standover selector say
//   carriages       the fit bike constants: where each carriage's zero mark sits and
//                   which way its two slides run (see model/fit-bike.js)
//   fitBike         fixed facts about the fit bike itself, plus how to match bar position
//   options         parts catalogue and the warning thresholds
//   frames          candidate frames (see model/frame.js)
//   references      calibration references: a frame id plus the scale readings that
//                   reproduced it on the fit bike
//   activeFrameId   which frame the side view draws

import { createFrame } from './model/frame.js';
import { normaliseStandover } from './model/standover.js';

/**
 * Bumped whenever stored field names or conventions change, so old saves can be
 * migrated instead of silently misread.
 *   1  original
 *   2  mast angles switched to the tube-angle convention (73 leans back, 90 vertical)
 *   3  every field renamed to a spelled-out name
 */
export const SCHEMA_VERSION = 3;

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,

    readings: {
      standover: 'A',
      saddleHeight: 15.2,
      saddleForeAft: 7.0,
      barHeight: 9.5,
      barReach: 4.2,
    },

    // Measured off the bike, in constants.txt. Floor measurements are converted to the
    // BB origin using floor-to-BB = 260mm:
    //   saddle zeroY = 735 - 260,  bar zeroY = 770 - 260
    // The scales read in centimetres exactly, so every gain is 10 mm per unit.
    carriages: {
      saddle: {
        zeroX: -128, // BB to the rail clamp at zero height and zero setback
        zeroY: 475,
        mastAngle: 86, // read like a seat tube angle
        mastMmPerUnit: 10, // a bigger reading raises the saddle
        slideTilt: 4, // the fore/aft mast is inclined: forward rises, back drops
        slideMmPerUnit: -10, // a bigger reading is more setback, so back and slightly down
      },
      bar: {
        zeroX: 336, // BB to the steerer centre at zero reach
        zeroY: 510,
        mastAngle: 76,
        mastMmPerUnit: 10, // a bigger reading raises the bar
        slideTilt: 4, // the reach mast is inclined: forward rises
        slideMmPerUnit: 10, // a bigger reading is more reach, so forward and slightly up
      },
    },

    fitBike: {
      // The standover rise travels along an axis leaning back from vertical, so raising it
      // moves both carriages back a little as well as up.
      standoverStepMm: 20,
      standoverRiseBackDegrees: 4,

      // Set on the bike rather than measured off it: the cranks adjust 165-175 in 2.5mm
      // steps, and the saddle figures depend on which saddle is fitted.
      crankLength: 170,
      railsBelowSaddleTop: 50,
      noseToRailCentre: 125,
      barReach: 100, // the stock Kickr bar
      matchMode: 'clamp', // 'clamp' = same bar on both bikes, 'hoods' = correct for bar reach
    },

    options: {
      stemLengths: '60,70,80,90,100,110,120,130',
      stemAngles: '0,6,7,8,10,12,17',
      spacerStep: 2.5,
      minStemLength: 60,
      maxStemLength: 120,
      maxStemAngle: 25,
      solutionsPerFrame: 6,
      toleranceMm: 4,
    },

    frames: [createFrame('Frame A')],
    references: [],
    activeFrameId: null,
  };
}

export let state = defaultState();

/* ---------- migrating saved data ---------- */

const READING_NAMES = {
  sh: 'saddleHeight',
  sf: 'saddleForeAft',
  bh: 'barHeight',
  br: 'barReach',
};

const CARRIAGE_NAMES = {
  x0: 'zeroX',
  y0: 'zeroY',
  aAngle: 'mastAngle',
  aGain: 'mastMmPerUnit',
  bAngle: 'slideTilt',
  bGain: 'slideMmPerUnit',
};

const FIT_BIKE_NAMES = {
  crank: 'crankLength',
  railDrop: 'railsBelowSaddleTop',
  noseToClamp: 'noseToRailCentre',
  barModelReach: 'barReach',
};

const OPTION_NAMES = {
  lengths: 'stemLengths',
  angles: 'stemAngles',
  minLen: 'minStemLength',
  maxLen: 'maxStemLength',
  maxAngle: 'maxStemAngle',
  topN: 'solutionsPerFrame',
  tol: 'toleranceMm',
};

const FRAME_NAMES = {
  hta: 'headTubeAngle',
  sta: 'seatTubeAngle',
  seatTube: 'seatTubeLength',
  headset: 'headsetStack',
  stemStack: 'stemClampHeight',
  maxSpacers: 'spacersAvailable',
  crank: 'crankLength',
  postSetback: 'seatpostSetback',
  railRange: 'railTravel',
  bStem: 'builtStemLength',
  bAngle: 'builtStemAngle',
  bSpacers: 'builtSpacerHeight',
  bSaddleH: 'builtSaddleHeight',
  bRail: 'builtRailOffset',
  open: 'expanded',
};

const REFERENCE_NAMES = { bikeId: 'frameId', ...READING_NAMES };

const renameKeys = (object = {}, names) =>
  Object.fromEntries(Object.entries(object || {}).map(([key, value]) => [names[key] || key, value]));

/** Rewrites a save from any earlier version into the current field names. */
function migrate(saved) {
  const version = Number(saved.schemaVersion ?? saved.conv ?? 1);
  if (version >= SCHEMA_VERSION) return saved;

  const carriages = {
    saddle: renameKeys(saved.kk?.saddle, CARRIAGE_NAMES),
    bar: renameKeys(saved.kk?.bar, CARRIAGE_NAMES),
  };

  // Before version 2 the mast angle was stored as the raw direction rather than as a
  // tube angle, so it reads back flipped about vertical.
  if (version < 2 && saved.kk) {
    for (const carriage of Object.values(carriages)) {
      if (Number.isFinite(carriage.mastAngle)) carriage.mastAngle = 180 - carriage.mastAngle;
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    readings: renameKeys(saved.read, READING_NAMES),
    carriages,
    fitBike: renameKeys(saved.fit, FIT_BIKE_NAMES),
    options: renameKeys(saved.opt, OPTION_NAMES),
    frames: (saved.bikes || []).map(frame => renameKeys(frame, FRAME_NAMES)),
    references: (saved.cal || []).map(reference => renameKeys(reference, REFERENCE_NAMES)),
    activeFrameId: saved.activeId ?? null,
  };
}

/**
 * Replace the state with saved or imported data, filling any gap from the defaults so a
 * partial or older file still loads.
 */
export function adoptState(saved) {
  if (!saved || typeof saved !== 'object') return;
  const incoming = migrate(saved);
  const base = defaultState();

  state = {
    ...base,
    ...incoming,
    schemaVersion: SCHEMA_VERSION,
    readings: { ...base.readings, ...incoming.readings },
    fitBike: { ...base.fitBike, ...incoming.fitBike },
    options: { ...base.options, ...incoming.options },
    carriages: {
      saddle: { ...base.carriages.saddle, ...incoming.carriages?.saddle },
      bar: { ...base.carriages.bar, ...incoming.carriages?.bar },
    },
    frames: (incoming.frames || []).map(frame => ({ ...createFrame(), ...frame })),
    references: (incoming.references || []).map(reference => ({
      ...reference,
      standover: normaliseStandover(reference.standover),
    })),
  };

  state.readings.standover = normaliseStandover(state.readings.standover);
}

export function resetState() {
  state = defaultState();
}

/** Used by the calibration panel to put the constants back after an unwanted solve. */
export function replaceCarriages(carriages) {
  state.carriages = carriages;
}
