// Labelled form fields, wired to write straight into the state object they were given.

import { element } from '../lib/dom.js';
import { toNumber } from '../lib/format.js';
import { rememberFocus } from './focus.js';

/**
 * A numeric field bound to `target[field]`.
 * `path` must be unique on the page — it is what restoreFocus() uses to find the input
 * again after a re-render.
 */
export function numberField({ target, field, path, label, hint, onChange }) {
  return element(
    'div',
    { class: 'field' },
    element('label', {}, label),
    element('input', {
      type: 'text',
      inputmode: 'decimal',
      value: target[field],
      'data-path': path,
      oninput: event => {
        rememberFocus(path, event);
        target[field] = toNumber(event.target.value);
        onChange();
      },
    }),
    hint ? element('div', { class: 'hint' }, hint) : null,
  );
}

/** A free text field bound to `target[field]`, for names and sizes. */
export function textField({ target, field, path, label, onChange }) {
  return element(
    'div',
    { class: 'field' },
    element('label', {}, label),
    element('input', {
      type: 'text',
      value: target[field],
      'data-path': path,
      oninput: event => {
        rememberFocus(path, event);
        target[field] = event.target.value;
        onChange();
      },
    }),
  );
}

/** One cell of a `.readout` strip: small caption, big number, small unit. */
export function readoutCell(caption, value, unit, { small = false } = {}) {
  return element(
    'div',
    {},
    element('div', { class: 'k' }, caption),
    element('div', { class: small ? 'v s' : 'v' }, value),
    unit ? element('div', { class: 'k' }, unit) : null,
  );
}

export const chip = (text, ok) => element('span', { class: 'chip ' + (ok ? 'g' : 'w') }, text);

export const tableHead = headings =>
  element('thead', {}, element('tr', {}, headings.map(heading => element('th', {}, heading))));

export const tableBody = rows => element('tbody', {}, rows);

/** A whole table from a header row and an array of already-built rows. */
export const table = (headings, rows, attributes = {}) =>
  element('table', attributes, tableHead(headings), tableBody(rows));
