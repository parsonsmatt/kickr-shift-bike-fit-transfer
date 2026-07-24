// Saving and loading. Uses window.storage when the page is embedded somewhere that
// provides it, otherwise this browser's localStorage. Nothing leaves the machine either way.

import { state } from './state.js';

const STORAGE_KEY = 'fit-transfer-v2';
const SAVE_DEBOUNCE_MS = 250;

export async function loadSaved() {
  try {
    if (window.storage) {
      const record = await window.storage.get(STORAGE_KEY, false);
      return record ? JSON.parse(record.value) : null;
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

/** Returns a short word describing what happened, for the status line. */
async function write() {
  try {
    const serialised = JSON.stringify(state);
    if (window.storage) {
      await window.storage.set(STORAGE_KEY, serialised, false);
      return 'synced';
    }
    localStorage.setItem(STORAGE_KEY, serialised);
    return 'saved';
  } catch {
    return 'not saved';
  }
}

let statusListener = () => {};

/** Called with e.g. "saved" every time a write completes. */
export const onSaveStatus = listener => {
  statusListener = listener;
};

let pendingSave = null;

/** Typing fires this on every keystroke, so writes are debounced. */
export function save() {
  clearTimeout(pendingSave);
  pendingSave = setTimeout(async () => {
    statusListener(await write());
  }, SAVE_DEBOUNCE_MS);
}
