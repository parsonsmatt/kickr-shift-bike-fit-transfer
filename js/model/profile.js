// Fit profiles: a saved set of everything you *set* on the fit bike, so more than one rider —
// or more than one position for the same rider — can live on the same machine.
//
// A profile is section 1 apart from the constants panel: the five readings, plus the current
// setup. The measured constants are deliberately not in here. They describe the machine rather
// than anyone's fit, so a profile that carried them would let loading somebody else's position
// quietly move a carriage's zero point, and every answer on the page with it.
//
// Frames are not in here either. A frame is a bike, and it is the same bike whoever is sitting
// on it.

import { state } from '../state.js';
import { SCALE_INPUTS } from './fit-bike.js';
import { oneDecimal } from '../lib/format.js';

let profileSerial = 1;

export const newProfileId = () => 'p' + profileSerial++ + '_' + Math.random().toString(36).slice(2, 6);

/** The `fitBike` fields a profile carries: everything in the "current setup" grid. */
export const PROFILE_SETUP_FIELDS = [
  'crankLength',
  'railsBelowSaddleTop',
  'noseToRailCentre',
  'saddleRailOffset',
  'stemLength',
  'stemAngle',
  'stemHeight',
  'barReach',
  'matchMode',
];

const SCALE_KEYS = Object.keys(SCALE_INPUTS);

const currentSetup = () =>
  Object.fromEntries(PROFILE_SETUP_FIELDS.map(field => [field, state.fitBike[field]]));

/** Everything the fit bike is set to right now, under a name. */
export const captureProfile = name => ({
  id: newProfileId(),
  name,
  readings: { ...state.readings },
  setup: currentSetup(),
});

/** The same capture over an existing profile, keeping its id so the list does not reorder. */
export const updateProfile = profile => ({ ...captureProfile(profile.name), id: profile.id });

/**
 * Load a profile back onto the bike.
 *
 * Only the keys the profile actually holds are written, so a profile saved before a field
 * existed - one exported from an older version, say - leaves that field at whatever it is now
 * instead of setting it to undefined.
 */
export function applyProfile(profile) {
  state.readings = { ...state.readings, ...profile.readings };
  for (const field of PROFILE_SETUP_FIELDS) {
    if (profile.setup && field in profile.setup) state.fitBike[field] = profile.setup[field];
  }
}

/**
 * Whether the bike is set up as this profile says right now. Readings are compared at scale
 * precision, since a scale is only marked to the millimetre, and the setup exactly.
 */
export function profileInUse(profile) {
  const readingsMatch =
    state.readings.standover === profile.readings.standover &&
    SCALE_KEYS.every(key => Math.abs(state.readings[key] - profile.readings[key]) < 0.05);
  if (!readingsMatch) return false;

  return PROFILE_SETUP_FIELDS.every(field => {
    if (!profile.setup || !(field in profile.setup)) return true;
    const saved = profile.setup[field];
    const live = state.fitBike[field];
    return typeof saved === 'number' ? Math.abs(live - saved) < 1e-9 : live === saved;
  });
}

/** The five readings in one line, the way you would read them off the bike. */
export const describeProfileReadings = profile =>
  `${profile.readings.standover} | ` +
  SCALE_KEYS.map(key => oneDecimal(profile.readings[key])).join(' / ');

/**
 * What differs between a profile and the bike as it stands, in words. The readings are the
 * point of a profile, but the setup fields move with it too, and a saddle or stem swap is not
 * something to apply silently.
 */
export function describeProfileDifferences(profile) {
  const differences = [];

  if (state.readings.standover !== profile.readings.standover) {
    differences.push(`standover ${state.readings.standover} to ${profile.readings.standover}`);
  }
  for (const key of SCALE_KEYS) {
    if (Math.abs(state.readings[key] - profile.readings[key]) >= 0.05) {
      differences.push(
        `${SCALE_INPUTS[key].label.toLowerCase()} ${oneDecimal(state.readings[key])} to ` +
          `${oneDecimal(profile.readings[key])}`,
      );
    }
  }
  for (const field of PROFILE_SETUP_FIELDS) {
    if (!profile.setup || !(field in profile.setup)) continue;
    if (profile.setup[field] !== state.fitBike[field]) {
      differences.push(`${field} ${state.fitBike[field]} to ${profile.setup[field]}`);
    }
  }

  return differences;
}
