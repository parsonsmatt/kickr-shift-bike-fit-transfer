// Section 2: the table of calibration references, and the check / solve buttons.

import { select, element, clearChildren } from '../lib/dom.js';
import { oneDecimal, signedOneDecimal, toNumber } from '../lib/format.js';
import { state } from '../state.js';
import { STANDOVER_POSITIONS, normaliseStandover } from '../model/standover.js';
import { checkConstants, solveConstants, undoSolve, worstResidual } from '../model/calibration.js';
import { rememberFocus } from './focus.js';
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

  select('#reference-note').textContent =
    state.references.length >= 2
      ? 'will fit zero points and travel per unit'
      : state.references.length === 1
        ? 'will fit zero points only - add a second bike to fit travel too'
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

/** Before / after for every constant the solve actually moved. */
function changeTable(changed) {
  const rows = changed.map(change =>
    element(
      'tr',
      {},
      element('td', {}, `${change.carriage} ${change.field}`),
      element('td', {}, oneDecimal(change.before)),
      element('td', {}, oneDecimal(change.after)),
      element('td', {}, signedOneDecimal(change.after - change.before)),
    ),
  );
  return element(
    'div',
    { class: 'scroll' },
    table(['Constant', 'Was', 'Now', 'Change'], rows, { style: 'margin-top:8px' }),
  );
}

const referenceCountPhrase = count => (count > 1 ? `${count} references` : 'the reference');

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
          ? `The constants you entered already predict ${result.referenceCount > 1 ? `all ${result.referenceCount} references` : 'the reference'} to within ${oneDecimal(worst)}mm. Nothing to solve.`
          : `The constants you entered are out by up to ${oneDecimal(worst)}mm against ${referenceCountPhrase(result.referenceCount)}. Check the slide directions, or solve.`,
      ),
      residualTable(result.residuals),
    );
    select('#constants-details').open = true;
  };

  select('#solve-constants').onclick = () => {
    const alsoTravel = state.references.length > 1 ? ' and travel per unit' : '';
    const confirmed = confirm(
      `This replaces the zero points${alsoTravel} in the constants panel with fitted values. ` +
        'You can undo it afterwards. Continue?',
    );
    if (!confirmed) return;

    const result = solveConstants();
    const host = output();
    if (!result.ok) {
      host.append(element('div', { class: 'warnbox' }, result.message));
      return;
    }

    const worst = worstResidual(result.residuals);
    host.append(
      element(
        'div',
        { class: worst <= AGREEMENT_MM ? 'okbox' : 'warnbox' },
        result.zeroPointsOnly
          ? 'Zero points solved from one reference. Travel per unit was left as entered - add a second reference to fit it too.'
          : `Zero points and travel per unit solved from ${result.referenceCount} references. Largest disagreement ${oneDecimal(worst)}mm.`,
      ),
    );

    host.append(
      result.changed.length
        ? changeTable(result.changed)
        : element(
            'div',
            { class: 'note', style: 'margin-top:8px' },
            'Nothing moved by more than 0.05mm - your constants were already right.',
          ),
    );

    if (!result.zeroPointsOnly) host.append(residualTable(result.residuals));

    host.append(
      element(
        'div',
        { class: 'btnrow', style: 'margin-top:10px' },
        element(
          'button',
          {
            class: 'ghost tiny',
            onclick: () => {
              // Same rule as the reference button: never fail silently, or the button looks dead.
              const host = clearChildren(select('#calibration-result'));
              if (!undoSolve()) {
                host.append(
                  element('div', { class: 'warnbox' }, 'Nothing to undo - no solve has been applied.'),
                );
                return;
              }
              host.append(element('div', { class: 'okbox' }, 'Constants put back the way you had them.'));
              onChange();
            },
          },
          'Undo solve',
        ),
      ),
    );

    select('#constants-details').open = true;
    onChange();
  };
}
