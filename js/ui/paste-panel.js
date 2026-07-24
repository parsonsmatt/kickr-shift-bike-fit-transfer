// Section 3's "paste a geometry table" panel: show what was parsed, let the user pick the
// size column, then add it as a frame.

import { select, element, clearChildren } from '../lib/dom.js';
import { state } from '../state.js';
import { createFrame } from '../model/frame.js';
import { parseGeometryTable, columnLabel } from '../model/geometry-table.js';
import { table } from './fields.js';

const NOT_IN_GEOMETRY_TABLES =
  'Headset stack, stem clamp height and bar dimensions are not in geometry tables - they keep ' +
  'their defaults and are worth correcting by hand.';

const NOTHING_RECOGNISED =
  'Nothing recognised. Rows need a label such as Stack, Reach, Head tube angle or Seat tube ' +
  'angle at the start of the line.';

/** Preview of every parsed row against every size column. */
function previewTable(parsed) {
  const headings = ['Field'];
  for (let column = 0; column < parsed.columnCount; column++) {
    headings.push(columnLabel(parsed, column));
  }

  const rows = parsed.rows.map(row => {
    const cells = [element('td', {}, row.label)];
    for (let column = 0; column < parsed.columnCount; column++) {
      const value = row.values[column];
      cells.push(element('td', {}, value != null ? String(value) : '-'));
    }
    return element('tr', {}, cells);
  });

  return element('div', { class: 'scroll' }, table(headings, rows));
}

function importControls(parsed, onChange) {
  const columnPicker = element('select', {});
  for (let column = 0; column < parsed.columnCount; column++) {
    columnPicker.append(element('option', { value: String(column) }, columnLabel(parsed, column)));
  }

  const nameInput = element('input', { type: 'text', placeholder: 'Frame name' });

  const addFrame = () => {
    const column = parseInt(columnPicker.value, 10);
    const sizeName = (parsed.sizeNames && parsed.sizeNames[column]) || '';
    const frame = createFrame(nameInput.value || 'Imported frame', sizeName, state.fitBike.crankLength);

    for (const row of parsed.rows) {
      if (row.values[column] != null) frame[row.field] = row.values[column];
    }

    state.frames.push(frame);
    state.activeFrameId = frame.id;
    onChange();
    select('#paste-panel').style.display = 'none';
  };

  return element(
    'div',
    { class: 'grid cols3', style: 'margin-top:10px;align-items:end' },
    element('div', { class: 'field' }, element('label', {}, 'Name'), nameInput),
    element('div', { class: 'field' }, element('label', {}, 'Size column'), columnPicker),
    element('div', { class: 'field' }, element('button', { onclick: addFrame }, 'Add this frame')),
  );
}

function showParseResult(onChange) {
  const parsed = parseGeometryTable(select('#paste-input').value);
  const host = clearChildren(select('#parse-output'));

  if (!parsed.rows.length) {
    host.append(element('div', { class: 'warnbox' }, NOTHING_RECOGNISED));
    return;
  }

  host.append(
    previewTable(parsed),
    importControls(parsed, onChange),
    element('div', { class: 'note', style: 'margin-top:6px' }, NOT_IN_GEOMETRY_TABLES),
  );
}

export function bindPastePanel(onChange) {
  const panel = () => select('#paste-panel');

  select('#toggle-paste').onclick = () => {
    panel().style.display = panel().style.display === 'none' ? 'block' : 'none';
  };
  select('#close-paste').onclick = () => {
    panel().style.display = 'none';
  };
  select('#parse-paste').onclick = () => showParseResult(onChange);
}
