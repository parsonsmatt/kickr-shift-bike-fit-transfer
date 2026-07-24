// A <details> that survives a redraw.
//
// The whole page is rebuilt on every keystroke, so any <details> built by JavaScript is a
// brand new element each time and goes back to its default state — type one character into
// a field inside one and it snaps shut under you. This is the same problem focus.js solves
// for the caret, and the same shape of solution: remember the state against a stable key
// rather than against the element, since the element is never the same one twice.
//
// Kept in memory rather than in the saved state: which panels you had open is a property of
// this sitting, not of the data. <details> written directly into index.html do not need any
// of this, because they are never rebuilt.

import { element } from '../lib/dom.js';

const openStates = new Map();

/**
 * `key` must be stable across redraws and unique on the page — scope it by frame id where
 * there is one per card. `open` is only the starting state, used until the user says
 * otherwise.
 */
export function disclosure({ key, summary, open = false }, ...children) {
  const isOpen = openStates.has(key) ? openStates.get(key) : open;

  const node = element(
    'details',
    isOpen ? { open: '' } : {},
    element('summary', {}, summary),
    ...children,
  );

  node.addEventListener('toggle', () => openStates.set(key, node.open));
  return node;
}

/** Only for tests, which need to start from a clean slate. */
export const forgetDisclosures = () => openStates.clear();
