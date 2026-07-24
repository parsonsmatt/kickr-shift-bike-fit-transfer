// Section 6: the reverse direction — what to dial into the fit bike so it matches a bike
// you already ride. One row per standover position, because all eight are exact solutions
// and only the scales themselves decide which is usable.

import { select, element, clearChildren } from '../lib/dom.js';
import { oneDecimal } from '../lib/format.js';
import { state } from '../state.js';
import { SCALE_INPUTS } from '../model/fit-bike.js';
import { trainerSetups } from '../model/reverse.js';
import { tableHead, tableBody, chip } from './fields.js';

const SCALE_KEYS = Object.keys(SCALE_INPUTS);

/** Physical scales are marked in whole millimetres, so there is no point offering more. */
const toScaleMark = value => Math.round(value * 10) / 10;

/** Whether the readings currently entered are this row, near enough to have come from it. */
const isInUse = setup =>
  state.readings.standover === setup.standover &&
  SCALE_KEYS.every(key => Math.abs(state.readings[key] - toScaleMark(setup[key])) < 0.05);

function setupRow(setup, onApply) {
  const inUse = isInUse(setup);

  const button = element('button', { class: 'ghost tiny' }, inUse ? 'in use' : 'Use these');
  button.onclick = () => {
    state.readings = {
      standover: setup.standover,
      ...Object.fromEntries(SCALE_KEYS.map(key => [key, toScaleMark(setup[key])])),
    };
    onApply();
  };

  return element(
    'tr',
    { class: inUse ? 'best' : '' },
    element('td', {}, element('b', {}, setup.standover)),
    ...SCALE_KEYS.map(key => element('td', {}, oneDecimal(setup[key]))),
    element('td', {}, setup.onScale ? chip('on scale', true) : chip('off the bottom', false)),
    element('td', {}, button),
  );
}

export function renderReverseTable(onApply) {
  const host = clearChildren(select('#reverse-table'));
  const label = select('#reverse-label');
  const frame = state.frames.find(candidate => candidate.id === state.activeFrameId);

  if (!frame) {
    label.textContent = '';
    return;
  }

  label.textContent = `${frame.name}${frame.size ? ' ' + frame.size : ''} — as built`;

  host.append(
    tableHead(['Standover', ...SCALE_KEYS.map(key => SCALE_INPUTS[key].label), '', '']),
    tableBody(trainerSetups(frame).map(setup => setupRow(setup, onApply))),
  );
}
