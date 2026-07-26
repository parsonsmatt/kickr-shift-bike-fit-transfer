// Entry point: wire the static controls, load anything saved, draw.

import { select } from './lib/dom.js';
import { state, adoptState, resetState } from './state.js';
import { loadSaved, onSaveStatus } from './persistence.js';
import { bindStaticInputs, syncStaticInputs } from './ui/fit-bike-panel.js';
import { bindCalibrationButtons } from './ui/calibration-panel.js';
import { bindFrameButtons } from './ui/frames-panel.js';
import { bindPastePanel } from './ui/paste-panel.js';
import { forgetFocus } from './ui/focus.js';
import { render, refresh } from './ui/render.js';

const EXPORT_FILENAME = 'fit-transfer.json';

function bindFileButtons() {
  select('#export-json').onclick = () => {
    const file = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = EXPORT_FILENAME;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  select('#import-json').onclick = () => select('#import-file').click();

  select('#import-file').onchange = event => {
    const file = event.target.files[0];
    event.target.value = ''; // so picking the same file twice still fires
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        adoptState(JSON.parse(reader.result));
      } catch {
        alert('That file did not parse as fit-transfer JSON.');
        return;
      }
      forgetFocus();
      syncStaticInputs();
      refresh();
    };
    reader.readAsText(file);
  };

  select('#reset-all').onclick = () => {
    if (!confirm('Clear everything?')) return;
    resetState();
    forgetFocus();
    syncStaticInputs();
    refresh();
  };
}

async function start() {
  onSaveStatus(status => {
    select('#save-status').textContent = `${status} | ${new Date().toLocaleTimeString()}`;
  });

  const saved = await loadSaved();
  if (saved) {
    adoptState(saved);
    select('#save-status').textContent = 'restored from this browser';
  } else {
    select('#save-status').textContent = window.storage
      ? 'new session'
      : 'new session | saves to this browser';
  }

  bindStaticInputs(refresh);
  bindCalibrationButtons(refresh);
  bindFrameButtons(refresh);
  bindPastePanel(refresh);
  bindFileButtons();

  syncStaticInputs();
  render();
}

start();
