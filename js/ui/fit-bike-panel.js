// Section 1: the four scale readings, the fit bike constants behind them, and the
// resulting target position.

import { select, selectAll, clearChildren, element } from '../lib/dom.js';
import { oneDecimal, whole, toNumber } from '../lib/format.js';
import { magnitude } from '../lib/vector.js';
import { state } from '../state.js';
import { normaliseStandover, STANDOVER_POSITIONS } from '../model/standover.js';
import {
  SCALE_INPUTS,
  targetPositions,
  activeStandover,
  standoverOffsetFor,
  standoverTravelFor,
  describeStandover,
  describeScaleUnit,
  describeMast,
  describeSlide,
  scaleLimit,
  travelPerUnit,
} from '../model/fit-bike.js';
import { numberField, readoutCell } from './fields.js';

/** What a scale's measured travel adds to its hint, and a warning if the reading is past it. */
function describeScaleRange(readingKey) {
  const scale = SCALE_INPUTS[readingKey];
  const carriage = state.carriages[scale.carriage];
  const limit = scaleLimit(carriage, scale.axis);
  if (limit === null) return '';

  const travel = Math.abs(limit * magnitude(travelPerUnit(carriage, scale.axis)));
  const range = ` Runs 0 to ${oneDecimal(limit)}, so ${whole(travel)}mm of travel.`;
  return state.readings[readingKey] > limit ? `${range} That reading is past the end of it.` : range;
}

/** Labels and hints under the four scale inputs, restated from the current constants. */
export function renderScaleHints() {
  select('[data-hint-for="standover"]').textContent = describeStandover(activeStandover());

  for (const [readingKey, scale] of Object.entries(SCALE_INPUTS)) {
    select(`[data-label-for="${readingKey}"]`).textContent = scale.label;
    select(`[data-hint-for="${readingKey}"]`).textContent =
      `${scale.hint} ${describeScaleUnit(readingKey)}${describeScaleRange(readingKey)}`;
  }

  // What the standover axis angle costs per letter, so a wrong angle is visible here.
  const perLetter = standoverOffsetFor(STANDOVER_POSITIONS[1]);
  select('[data-hint-for="standoverRise"]').textContent =
    `0 is straight up. Each letter then moves ${oneDecimal(perLetter[1])}mm up and ` +
    `${oneDecimal(-perLetter[0])}mm back.`;
}

const CARRIAGE_PANELS = [
  {
    key: 'saddle',
    host: '#saddle-carriage-fields',
    mastLabel: 'Seat mast angle (deg)',
    mastName: 'Seatpost height',
    slideName: 'Fore/aft',
  },
  {
    key: 'bar',
    host: '#bar-carriage-fields',
    mastLabel: 'Front column angle (deg)',
    mastName: 'Handlebar rise',
    slideName: 'Reach',
  },
];

const MAX_READING_HINT =
  'The biggest number on the scale, in scale units. Leave it at 0 until you have measured it - ' +
  'then no upper limit is checked and only a reading below zero counts as off the scale.';

/** The constants panel: zero point and both slides, for each carriage. */
export function renderCarriageConstants(onChange) {
  for (const panel of CARRIAGE_PANELS) {
    const host = clearChildren(select(panel.host));
    const carriage = state.carriages[panel.key];

    const field = (field, label, hint) =>
      host.append(
        numberField({
          target: carriage,
          field,
          path: `carriages.${panel.key}.${field}`,
          label,
          hint,
          onChange,
        }),
      );

    field('zeroX', 'Zero point X (mm)', 'From the BB, positive forward.');
    field('zeroY', 'Zero point Y (mm)', 'From the BB, positive up.');
    field(
      'mastAngle',
      panel.mastLabel,
      'Read like a seat tube or head tube angle: 73 leans back, 90 is vertical. ' + describeMast(carriage),
    );
    field('mastMmPerUnit', 'mm per unit', 'Negative if a bigger reading lowers it.');
    field('mastMaxReading', `Max ${panel.mastName.toLowerCase()} reading`, MAX_READING_HINT);
    field(
      'slideTilt',
      `${panel.slideName} slide tilt (deg)`,
      'Tilt off level: 0 level, +3 rising, -3 falling. ' + describeSlide(carriage),
    );
    field('slideMmPerUnit', 'mm per unit', 'Negative if a bigger reading moves it rearward.');
    field('slideMaxReading', `Max ${panel.slideName.toLowerCase()} reading`, MAX_READING_HINT);
  }
}

/** The strip of numbers under section 1: where the readings put the two target points. */
export function renderTargetReadout() {
  const target = targetPositions();
  const host = clearChildren(select('#target-readout'));

  const standoverShift = standoverOffsetFor(state.readings.standover);

  host.append(
    readoutCell(
      'Standover rise',
      whole(standoverShift[1]),
      `mm up, ${oneDecimal(-standoverShift[0])} back | position ${activeStandover()}`,
    ),
    readoutCell('Saddle clamp X', oneDecimal(target.saddle[0]), 'mm from BB'),
    readoutCell('Saddle clamp Y', oneDecimal(target.saddle[1]), 'mm above BB'),
    readoutCell('Bar clamp X', oneDecimal(target.bar[0]), 'mm ahead of BB'),
    readoutCell('Bar clamp Y', oneDecimal(target.bar[1]), 'mm above BB'),
    readoutCell('Saddle to bar', oneDecimal(target.bar[0] - target.saddle[0]), 'mm horizontal'),
    readoutCell(
      'Bar drop',
      oneDecimal(target.saddle[1] + state.fitBike.railsBelowSaddleTop - target.bar[1]),
      'mm below saddle top',
    ),
  );
}

/** Standover options carry their rise, so the effect of each letter is visible. */
export const standoverOptionLabel = letter => `${letter} (+${whole(standoverTravelFor(letter))}mm)`;

/**
 * Write a value into a dropdown. A saved value outside the listed options — a crank length
 * typed into the old free-text field, say — would otherwise select nothing and be lost the
 * next time anything on the page changed, so keep it as an extra option.
 */
function setDropdownValue(dropdown, value) {
  const wanted = String(value);
  if (![...dropdown.options].some(option => option.value === wanted)) {
    dropdown.append(element('option', { value: wanted }, `${wanted} (as saved)`));
  }
  dropdown.value = wanted;
}

const setInputValue = (input, value) =>
  input.tagName === 'SELECT' ? setDropdownValue(input, value) : (input.value = value);

/** Static inputs are only written by the app on load, import and reset. */
export function syncStaticInputs() {
  selectAll('[data-reading]').forEach(input => {
    setInputValue(input, state.readings[input.dataset.reading]);
  });
  selectAll('[data-fit-bike]').forEach(input => {
    setInputValue(input, state.fitBike[input.dataset.fitBike]);
  });
  selectAll('[data-option]').forEach(input => {
    setInputValue(input, state.options[input.dataset.option]);
  });
}

/** Wires the static section 1 and section 6 inputs to the state. */
export function bindStaticInputs(onChange) {
  selectAll('[data-reading]').forEach(input =>
    input.addEventListener('input', event => {
      const key = input.dataset.reading;
      state.readings[key] =
        key === 'standover' ? normaliseStandover(event.target.value) : toNumber(event.target.value);
      onChange();
    }),
  );

  selectAll('[data-fit-bike]').forEach(input =>
    input.addEventListener('input', event => {
      const key = input.dataset.fitBike;
      state.fitBike[key] = key === 'matchMode' ? event.target.value : toNumber(event.target.value);
      onChange();
    }),
  );

  // Stem lengths and angles stay as typed text so a half-finished list is not mangled.
  selectAll('[data-option]').forEach(input =>
    input.addEventListener('input', event => {
      const key = input.dataset.option;
      const isTextList = key === 'stemLengths' || key === 'stemAngles';
      state.options[key] = isTextList ? event.target.value : toNumber(event.target.value);
      onChange();
    }),
  );
}
