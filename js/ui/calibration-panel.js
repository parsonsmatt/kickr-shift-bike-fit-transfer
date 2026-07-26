// Section 2: the table of known bikes to check the constants against, and the check button.
//
// Read-only by design. There is deliberately no button that solves the constants from these
// references and writes them back - see the note at the top of model/calibration.js.

import { select, element, clearChildren } from '../lib/dom.js';
import { oneDecimal, signedOneDecimal, toNumber } from '../lib/format.js';
import { state, resetConstants } from '../state.js';
import { STANDOVER_POSITIONS, normaliseStandover } from '../model/standover.js';
import { checkConstants, worstResidual } from '../model/calibration.js';
import { rememberFocus, forgetFocus } from './focus.js';
import { table, tableHead, tableBody } from './fields.js';
import { standoverOptionLabel } from './fit-bike-panel.js';

/** A miss this small means the constants already describe the reference. */
const AGREEMENT_MM = 2;

const READING_COLUMNS = [
  { field: 'saddleHeight', heading: 'Saddle height' },
  { field: 'saddleForeAft', heading: 'Saddle fore/aft' },
  { field: 'barHeight', heading: 'Bar height' },
  { field: 'barReach', heading: 'Bar reach' },
];

export function renderReferenceTable(onChange) {
  const host = clearChildren(select('#reference-table'));

  const readingCell = (reference, field) => {
    const path = `references.${reference.frameId}.${field}`;
    return element(
      'td',
      {},
      element('input', {
        type: 'text',
        inputmode: 'decimal',
        value: reference[field],
        'data-path': path,
        oninput: event => {
          rememberFocus(path, event);
          reference[field] = toNumber(event.target.value);
          onChange();
        },
      }),
    );
  };

  const standoverCell = reference => {
    const dropdown = element('select', {
      'data-path': `references.${reference.frameId}.standover`,
      onchange: event => {
        reference.standover = normaliseStandover(event.target.value);
        onChange();
      },
    });
    for (const letter of STANDOVER_POSITIONS) {
      dropdown.append(element('option', { value: letter }, standoverOptionLabel(letter)));
    }
    dropdown.value = normaliseStandover(reference.standover);
    return element('td', {}, dropdown);
  };

  const rows = state.references.map(reference => {
    const frame = state.frames.find(candidate => candidate.id === reference.frameId);
    return element(
      'tr',
      {},
      element('td', {}, frame ? frame.name + (frame.size ? ' - ' + frame.size : '') : 'missing frame'),
      standoverCell(reference),
      READING_COLUMNS.map(column => readingCell(reference, column.field)),
      element(
        'td',
        {},
        element(
          'button',
          {
            class: 'ghost tiny',
            onclick: () => {
              state.references = state.references.filter(other => other !== reference);
              onChange();
            },
          },
          'Remove',
        ),
      ),
    );
  });

  if (!rows.length) {
    rows.push(
      element(
        'tr',
        {},
        element(
          'td',
          { colspan: '7' },
          'No references yet. Fill in a frame below, including its "as currently built" numbers, ' +
            'then press "Use as calibration reference".',
        ),
      ),
    );
  }

  const headings = ['Reference bike', 'Standover', ...READING_COLUMNS.map(column => column.heading), ''];
  host.append(tableHead(headings), tableBody(rows));

  select('#reference-note').textContent = state.references.length
    ? `checking against ${state.references.length === 1 ? 'one bike' : state.references.length + ' bikes'}`
    : '';
}

/** How far the current constants miss each reference, per carriage and axis. */
function residualTable(residualList) {
  const rows = residualList.map(entry =>
    element(
      'tr',
      {},
      element('td', {}, entry.name),
      element('td', {}, oneDecimal(entry.saddle[0])),
      element('td', {}, oneDecimal(entry.saddle[1])),
      element('td', {}, oneDecimal(entry.bar[0])),
      element('td', {}, oneDecimal(entry.bar[1])),
    ),
  );
  const headings = ['Reference', 'Saddle dX', 'Saddle dY', 'Bar dX', 'Bar dY'];
  return element('div', { class: 'scroll' }, table(headings, rows, { style: 'margin-top:8px' }));
}

const referenceCountPhrase = count => (count > 1 ? `all ${count} reference bikes` : 'the reference bike');

export function bindCalibrationButtons(onChange) {
  const output = () => clearChildren(select('#calibration-result'));

  select('#check-constants').onclick = () => {
    const result = checkConstants();
    const host = output();
    if (!result.ok) {
      host.append(element('div', { class: 'warnbox' }, result.message));
      return;
    }

    const worst = worstResidual(result.residuals);
    const agrees = worst <= AGREEMENT_MM;
    host.append(
      element(
        'div',
        { class: agrees ? 'okbox' : 'warnbox' },
        agrees
          ? `The constants predict ${referenceCountPhrase(result.referenceCount)} to within ${oneDecimal(worst)}mm. They are right.`
          : `The constants are out by up to ${oneDecimal(worst)}mm against ${referenceCountPhrase(result.referenceCount)}. ` +
            'One of three things is wrong, in rough order of likelihood: that bike\'s "as currently built" ' +
            'figures, the readings in the row above, or a constant below. The per-axis misses show which ' +
            'carriage is off - check its slide directions read true before touching a number.',
      ),
      residualTable(result.residuals),
    );
    select('#constants-details').open = true;
  };

  select('#reset-constants').onclick = () => {
    const confirmed = confirm(
      'Put both carriages and the standover mechanism back to the measured defaults? ' +
        'Your frames, readings and current setup are not affected.',
    );
    if (!confirmed) return;
    resetConstants();
    forgetFocus();
    onChange();
    // After onChange, which is the redraw that would otherwise wipe this.
    select('#reset-constants-note').textContent = 'back to the measured defaults';
  };
}
