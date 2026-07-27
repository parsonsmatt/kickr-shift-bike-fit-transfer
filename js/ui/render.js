// The whole page is redrawn on every change. It is a small page, and one code path from
// state to screen is much easier to trust than a set of targeted updates. The only thing
// that has to survive a redraw is the caret, which ui/focus.js handles.

import { save } from '../persistence.js';
import { restoreFocus } from './focus.js';
import {
  renderScaleHints,
  renderCarriageConstants,
  renderTargetReadout,
  syncStaticInputs,
} from './fit-bike-panel.js';
import { renderProfiles, renderProfileNote } from './profiles-panel.js';
import { renderFrames } from './frames-panel.js';
import { renderCompareTable } from './compare-table.js';
import { renderReverseTable } from './reverse-panel.js';
import { renderSideView } from './side-view.js';

/**
 * Editing a frame's name or size only affects where its name is echoed. Redrawing the
 * card the user is typing into would fight the caret, so those two fields take this
 * narrower path instead.
 */
function refreshFrameNames() {
  save();
  renderCompareTable(refresh);
}

/**
 * Section 5 and the profile list write the readings and the setup fields, which live in static
 * inputs in the markup rather than being rebuilt each redraw, so they have to be pushed back
 * out by hand.
 */
export function refreshSetup() {
  syncStaticInputs();
  refresh();
}

export function render() {
  renderScaleHints();
  renderCarriageConstants(refresh);
  renderTargetReadout();
  renderProfiles(refreshSetup);
  renderProfileNote();
  renderFrames(refresh, refreshFrameNames);
  renderCompareTable(refresh);
  renderReverseTable(refreshSetup);
  renderSideView();
  restoreFocus();
}

/** What every input, button and dropdown calls: persist, then redraw. */
export function refresh() {
  save();
  render();
}
