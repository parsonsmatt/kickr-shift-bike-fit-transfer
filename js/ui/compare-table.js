// Section 4: every candidate frame side by side with its best answer, so the trade-offs
// between frames are visible at a glance. Clicking a row highlights that frame.

import { select, element, clearChildren } from '../lib/dom.js';
import { oneDecimal, whole, signedOneDecimal } from '../lib/format.js';
import { state } from '../state.js';
import { bestStemSolution, saddleSetup } from '../model/solver.js';
import { chip, tableHead, tableBody } from './fields.js';

const HEADINGS = [
  'Frame',
  'Size',
  'Stack',
  'Reach',
  'HTA',
  'STA',
  'Stem',
  'Angle',
  'Spacers',
  'Miss',
  'Saddle ht',
  'Behind axis',
  'Flags',
];

/** Anything that should stop you buying this frame without thinking about it. */
function flagsFor(frame, best, saddle) {
  const flags = [];
  if (!best || !best.reachable) flags.push('unreachable');
  else if (best.missMm > state.options.toleranceMm) flags.push(`off by ${oneDecimal(best.missMm)}mm`);

  if (best && (best.stemLength < state.options.minStemLength || best.stemLength > state.options.maxStemLength)) {
    flags.push('stem length');
  }
  if (best && Math.abs(best.stemAngle) > state.options.maxStemAngle) flags.push('stem angle');
  if (!saddle.railOffsetReachable) flags.push('saddle rails');
  return flags;
}

export function renderCompareTable(onChange) {
  const host = clearChildren(select('#compare-table'));

  const rows = state.frames.map(frame => {
    const best = bestStemSolution(frame);
    const saddle = saddleSetup(frame);
    const flags = flagsFor(frame, best, saddle);

    return element(
      'tr',
      {
        class: frame.id === state.activeFrameId ? 'best' : '',
        style: 'cursor:pointer',
        onclick: () => {
          state.activeFrameId = frame.id;
          onChange();
        },
      },
      element('td', {}, frame.name),
      element('td', {}, frame.size || '-'),
      element('td', {}, whole(frame.stack)),
      element('td', {}, whole(frame.reach)),
      element('td', {}, oneDecimal(frame.headTubeAngle)),
      element('td', {}, oneDecimal(frame.seatTubeAngle)),
      element('td', {}, best ? `${whole(best.stemLength)}mm` : '-'),
      element('td', {}, best ? signedOneDecimal(best.stemAngle) : '-'),
      element('td', {}, best ? `${oneDecimal(best.spacerHeight)}mm` : '-'),
      element('td', {}, best ? oneDecimal(best.missMm) : '-'),
      element('td', {}, oneDecimal(saddle.heightAlongSeatAxis)),
      element('td', {}, oneDecimal(saddle.clampBehindAxis)),
      element('td', {}, flags.length ? chip(flags.join(' / '), false) : chip('clear', true)),
    );
  });

  host.append(tableHead(HEADINGS), tableBody(rows));
}
