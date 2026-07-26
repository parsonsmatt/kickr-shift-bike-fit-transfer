// Section 6: the reverse direction — what to dial into the fit bike so it matches a bike
// you already ride.
//
// Every standover position is an exact answer, so something has to choose. The rule is the
// lowest position that stays on the scales. The rest are kept, collapsed, because the
// choice is a preference rather than a fact.

import { select, element, clearChildren } from '../lib/dom.js';
import { oneDecimal, signedOneDecimal } from '../lib/format.js';
import { state } from '../state.js';
import { SCALE_INPUTS } from '../model/fit-bike.js';
import { trainerSetups, lowestStandoverSetup } from '../model/reverse.js';
import { readoutCell, tableHead, tableBody, chip } from './fields.js';
import { disclosure } from './disclosure.js';

const SCALE_KEYS = Object.keys(SCALE_INPUTS);

/** Physical scales are marked in whole millimetres, so there is no point offering more. */
const toScaleMark = value => Math.round(value * 10) / 10;

/** Whether the readings currently entered are this row, near enough to have come from it. */
const isInUse = setup =>
  state.readings.standover === setup.standover &&
  SCALE_KEYS.every(key => Math.abs(state.readings[key] - toScaleMark(setup[key])) < 0.05);

const applyButton = (setup, onApply, label) => {
  const button = element('button', { class: 'ghost tiny' }, isInUse(setup) ? 'in use' : label);
  button.onclick = () => {
    state.readings = {
      standover: setup.standover,
      ...Object.fromEntries(SCALE_KEYS.map(key => [key, toScaleMark(setup[key])])),
    };
    onApply();
  };
  return button;
};

/**
 * The figures this whole section is derived from, spelled out. They live in a collapsed
 * panel on the frame card, so without this it is not obvious that section 6 has any input
 * at all, let alone that it is reading placeholder numbers.
 */
function sourceLine(frame) {
  return element(
    'div',
    { class: 'note', style: 'margin-top:10px' },
    `Read off ${frame.name}${frame.size ? ' ' + frame.size : ''} as built: ` +
      `${oneDecimal(frame.builtStemLength)}mm stem at ${signedOneDecimal(frame.builtStemAngle)} deg, ` +
      `${oneDecimal(frame.builtSpacerHeight)}mm of spacers, saddle ${oneDecimal(frame.builtSaddleHeight)}mm ` +
      `along its seat axis, rails ${signedOneDecimal(frame.builtRailOffset)}mm from centre. ` +
      'Change those in that frame\'s "as currently built" panel in section 3 — this section is only ' +
      'as right as they are.',
  );
}

/** The chosen answer, as a readout strip rather than a row to pick out of a table. */
function chosenSetup(setup, onApply) {
  return element(
    'div',
    {},
    element(
      'div',
      { class: 'readout' },
      readoutCell('Standover', setup.standover, 'lowest that stays on the scales'),
      ...SCALE_KEYS.map(key => readoutCell(SCALE_INPUTS[key].label, oneDecimal(setup[key]), 'on the scale')),
    ),
    element('div', { class: 'btnrow', style: 'margin-top:10px' }, applyButton(setup, onApply, 'Use these readings')),
  );
}

/** The other positions, collapsed — all exact, just higher. */
function alternatives(setups, onApply) {
  const rows = setups.map(setup =>
    element(
      'tr',
      { class: isInUse(setup) ? 'best' : '' },
      element('td', {}, element('b', {}, setup.standover)),
      ...SCALE_KEYS.map(key => element('td', {}, oneDecimal(setup[key]))),
      element(
        'td',
        {},
        setup.onScale
          ? chip('on scale', true)
          : chip(`off the scale: ${setup.offScale.map(key => SCALE_INPUTS[key].label.toLowerCase()).join(', ')}`, false),
      ),
      element('td', {}, applyButton(setup, onApply, 'Use')),
    ),
  );

  return disclosure(
    { key: 'reverse.alternatives', summary: 'Every standover position — all exact, just higher' },
    element(
      'div',
      { class: 'scroll' },
      element(
        'table',
        {},
        tableHead(['Standover', ...SCALE_KEYS.map(key => SCALE_INPUTS[key].label), '', '']),
        tableBody(rows),
      ),
    ),
  );
}

export function renderReverseTable(onApply) {
  const host = clearChildren(select('#reverse-panel'));
  const label = select('#reverse-label');
  const frame = state.frames.find(candidate => candidate.id === state.activeFrameId);

  if (!frame) {
    label.textContent = '';
    return;
  }

  label.textContent = `${frame.name}${frame.size ? ' ' + frame.size : ''} — as built`;

  const setups = trainerSetups(frame);
  const chosen = lowestStandoverSetup(frame);

  host.append(
    chosen
      ? chosenSetup(chosen, onApply)
      : element(
          'div',
          { class: 'warnbox' },
          'No standover position puts all four readings on the scales — every one asks a carriage ' +
            'to go below its own zero mark or past the end of its measured travel. Either this ' +
            'position is outside what the fit bike can reach, or a constant is wrong. The rows ' +
            'below say which scale gives up first.',
        ),
    sourceLine(frame),
    alternatives(setups, onApply),
  );
}
