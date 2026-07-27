// Section 2: one card per candidate frame — its geometry, the stem options that hit the
// target, and what the saddle has to do.

import { select, element, clearChildren } from '../lib/dom.js';
import { oneDecimal, whole, signedOneDecimal } from '../lib/format.js';
import { state } from '../state.js';
import { createFrame, newFrameId, spacerRoom, asBuiltOverflowsSteerer } from '../model/frame.js';
import { stemSolutions, saddleSetup, isMatch, needsNegativeSpacers } from '../model/solver.js';
import { numberField, textField, readoutCell, chip, table } from './fields.js';
import { disclosure } from './disclosure.js';

/** A numeric field on a frame; the field path is scoped by frame id. */
const frameField = (frame, field, label, hint, onChange) =>
  numberField({ target: frame, field, path: `${frame.id}.${field}`, label, hint, onChange });

/**
 * Normally these cranks match the fit bike's, which makes the correction nothing at all.
 * When they do differ, say so and in which direction, because a silent saddle shift is
 * indistinguishable from a mis-set constant.
 */
function crankHint(frame) {
  const fitBikeCrank = state.fitBike.crankLength || 0;
  const lift = fitBikeCrank - (frame.crankLength || 0);
  if (!lift) return 'Same as the fit bike, so no saddle correction.';

  return (
    `The fit bike is set to ${oneDecimal(fitBikeCrank)}, so the saddle target is ` +
    `${lift > 0 ? 'raised' : 'lowered'} ${oneDecimal(Math.abs(lift))}mm to keep the same leg ` +
    'extension. Setting the fit bike to these cranks removes the correction. Note the bar ' +
    'target does not move, so the saddle-to-bar drop changes by the same amount.'
  );
}

/**
 * Exposed steerer is what you can measure with a ruler; the spacer stack it allows is what
 * the solver needs. Spell out the subtraction rather than leaving the user to wonder whether
 * the stem counts, and say so plainly when the bike's own build does not fit inside it.
 */
function steererHint(frame) {
  const room = spacerRoom(frame);
  const measured =
    `Top of the headset cover to the top of the steerer. The stem sits in this too, so its ` +
    `${oneDecimal(frame.stemClampHeight)}mm clamp comes off: ${oneDecimal(room)}mm of spacers.`;

  if (asBuiltOverflowsSteerer(frame))
    return (
      measured +
      ` That is less than the ${oneDecimal(frame.builtSpacerHeight)}mm this bike is already ` +
      'built with, so one of the three numbers is wrong - and until it is fixed, options that ' +
      'would actually fit are being hidden.'
    );

  if (room < 0)
    return measured + ' A negative figure means the stem alone will not fit on the steerer.';

  return measured;
}

/** "100mm x -6.0 deg | 20.0mm spacers | match 1.2mm" — the one-line answer per frame. */
function verdictLine(best) {
  if (!best) return element('div', { class: 'verdict' }, 'no catalogue');

  const status = !best.reachable
    ? 'not reachable'
    : isMatch(best)
      ? `match ${oneDecimal(best.missMm)}mm`
      : `closest ${oneDecimal(best.missMm)}mm`;

  return element(
    'div',
    { class: 'verdict' },
    element('b', {}, `${whole(best.stemLength)}mm x ${signedOneDecimal(best.stemAngle)} deg`),
    ` | ${oneDecimal(best.spacerHeight)}mm spacers | `,
    chip(status, best.reachable && isMatch(best)),
  );
}

/** The frame's own numbers, four columns of fields. */
function geometryFields(frame, onChange, onNameChange) {
  return element(
    'div',
    { class: 'grid cols4', style: 'margin-top:12px' },
    element(
      'div',
      {},
      textField({ target: frame, field: 'name', path: `${frame.id}.name`, label: 'Name', onChange: onNameChange }),
      textField({ target: frame, field: 'size', path: `${frame.id}.size`, label: 'Size', onChange: onNameChange }),
      frameField(frame, 'crankLength', 'Crank length (mm)', crankHint(frame), onChange),
    ),
    element(
      'div',
      {},
      frameField(frame, 'stack', 'Frame stack (mm)', null, onChange),
      frameField(frame, 'reach', 'Frame reach (mm)', null, onChange),
      frameField(frame, 'headTubeAngle', 'Head tube angle (deg)', null, onChange),
    ),
    element(
      'div',
      {},
      frameField(frame, 'headsetStack', 'Headset stack above head tube (mm)', 'Height of the upper cover. Check the manual.', onChange),
      frameField(frame, 'stemClampHeight', 'Stem clamp height (mm)', 'Half of this sits above the spacers.', onChange),
      frameField(frame, 'exposedSteerer', 'Exposed steerer above headset (mm)', steererHint(frame), onChange),
    ),
    element(
      'div',
      {},
      frameField(frame, 'barReach', 'Bar reach (mm)', 'Used in hood-match mode.', onChange),
      frameField(frame, 'seatTubeAngle', 'Seat tube angle (deg)', null, onChange),
      frameField(frame, 'seatpostSetback', 'Seatpost setback (mm)', null, onChange),
    ),
  );
}

/**
 * The ranked stem table. Combinations that would need a negative spacer stack are left out
 * entirely rather than listed with an impossible number in the spacer column — they are not
 * options. Rows that survive can still be over the frame's spacer limit, which is a real
 * thing to know about, and their spacer figure means something.
 */
function stemOptionsTable(solutions, best) {
  const possible = solutions.filter(solution => !needsNegativeSpacers(solution));
  const shown = possible.slice(0, Math.max(1, state.options.solutionsPerFrame));
  // `best` is the pick across everything, so it can be one of the rows just dropped. When
  // it is, highlight the best row that is actually buildable instead of nothing.
  const highlight = shown.includes(best) ? best : shown[0];

  const rows = shown.map(solution =>
    element(
      'tr',
      { class: solution === highlight ? 'best' : '' },
      element('td', {}, `${whole(solution.stemLength)}mm`),
      element('td', {}, signedOneDecimal(solution.stemAngle)),
      element('td', {}, `${oneDecimal(solution.spacerHeight)}mm`),
      element('td', {}, signedOneDecimal(solution.dx)),
      element('td', {}, signedOneDecimal(solution.dy)),
      element('td', {}, oneDecimal(solution.missMm)),
      element(
        'td',
        {},
        solution.warnings.length
          ? solution.warnings.map(warning => chip(warning, false))
          : chip('ok', true),
      ),
    ),
  );

  const headings = ['Stem', 'Angle', 'Spacers', 'd reach', 'd height', 'Miss', 'Notes'];

  // Nothing left means the bar has to sit below the frame's own slammed height. Say by how
  // much, since that is the number that tells you whether a different frame would fix it.
  const tallestShortfall = solutions.length
    ? Math.max(...solutions.map(solution => solution.exactSpacerHeight))
    : 0;

  return element(
    'div',
    { style: 'margin-top:14px' },
    element('h3', {}, 'Stem options'),
    possible.length
      ? element('div', { class: 'scroll' }, table(headings, rows))
      : element(
          'div',
          { class: 'warnbox' },
          `Nothing in the catalogue works: this frame's front end is already too tall. The closest ` +
            `combination still sits ${oneDecimal(-tallestShortfall)}mm above the target with the stem ` +
            `slammed, so it would need spacers below zero. A lower stack or a steeper negative stem angle ` +
            `is what fixes it.`,
        ),
  );
}

function saddleSection(frame) {
  const saddle = saddleSetup(frame);

  return element(
    'div',
    { style: 'margin-top:14px' },
    element('h3', {}, 'Saddle'),
    element(
      'div',
      { class: 'readout' },
      readoutCell(
        'Height on this frame',
        oneDecimal(saddle.heightAlongSeatAxis),
        `mm to saddle top, along its ${oneDecimal(frame.seatTubeAngle)} deg axis`,
      ),
      readoutCell('Clamp behind seat axis', oneDecimal(saddle.clampBehindAxis), 'mm'),
      readoutCell('Post setback fitted', oneDecimal(frame.seatpostSetback), 'mm', { small: true }),
      readoutCell('Rail offset needed', signedOneDecimal(saddle.railOffset), 'mm back from rail centre'),
    ),
    element(
      'div',
      { style: 'margin-top:6px' },
      saddle.railOffsetReachable
        ? chip('saddle reachable', true)
        : chip(`rail offset exceeds ${whole(saddle.railTravel)}mm - change seatpost setback`, false),
    ),
  );
}

/**
 * The "as currently built" fields — what is actually bolted to this bike today, as opposed to
 * what the solver is proposing. The reverse setup in section 5 is what reads them, and the
 * summary has to say so: it used to claim they were "needed only to use this frame as a
 * calibration reference", which sent anyone looking for section 5's input straight past it.
 */
function asBuiltSection(frame, onChange) {
  return disclosure(
    {
      key: `${frame.id}.asBuilt`,
      summary: 'As currently built - what this bike has on it now (this is what the reverse setup reads)',
      open: true,
    },
    element(
      'div',
      { class: 'grid cols3' },
      element(
        'div',
        {},
        frameField(frame, 'builtStemLength', 'Stem length fitted (mm)', null, onChange),
        frameField(frame, 'builtStemAngle', 'Stem angle fitted (deg)', null, onChange),
      ),
      element(
        'div',
        {},
        frameField(frame, 'builtSpacerHeight', 'Spacers below the stem (mm)',
          asBuiltOverflowsSteerer(frame)
            ? `This plus the ${oneDecimal(frame.stemClampHeight)}mm stem clamp is more steerer than ` +
              `the ${oneDecimal(frame.exposedSteerer)}mm entered above.`
            : null,
          onChange),
        frameField(frame, 'builtRailOffset', 'Saddle back from rail centre (mm)', null, onChange),
      ),
      element(
        'div',
        {},
        frameField(frame, 'builtSaddleHeight', 'Saddle height as measured (mm)', 'BB to saddle top along this frame’s seat axis.', onChange),
        frameField(frame, 'railTravel', 'Rail travel each way (mm)', null, onChange),
      ),
    ),
  );
}

function frameActions(frame, onChange) {
  const duplicate = () => {
    const copy = { ...frame, id: newFrameId(), size: (frame.size || '') + ' copy' };
    state.frames.splice(state.frames.indexOf(frame) + 1, 0, copy);
    onChange();
  };

  const remove = () => {
    state.frames = state.frames.filter(other => other !== frame);
    onChange();
  };

  const action = (label, handler) => element('button', { class: 'ghost tiny', onclick: handler }, label);

  return element(
    'div',
    { class: 'btnrow', style: 'margin-top:14px' },
    action('Show in diagram', () => {
      state.activeFrameId = frame.id;
      onChange();
    }),
    action('Duplicate as another size', duplicate),
    action('Remove', remove),
  );
}

export function renderFrames(onChange, onNameChange) {
  const host = clearChildren(select('#frame-list'));

  if (!state.frames.length) {
    host.append(
      element('div', { class: 'panel note' }, 'No frames yet. Add one, or paste a geometry table.'),
    );
    return;
  }

  // The active frame drives the side view; keep it pointing at something real.
  if (!state.frames.some(frame => frame.id === state.activeFrameId)) {
    state.activeFrameId = state.frames[0].id;
  }

  for (const frame of state.frames) {
    const solutions = stemSolutions(frame);
    const best = solutions[0];
    const card = element('div', { class: 'bike' + (frame.id === state.activeFrameId ? ' active' : '') });

    card.append(
      element(
        'div',
        {
          class: 'head',
          onclick: event => {
            if (event.target.tagName === 'BUTTON') return;
            frame.expanded = !frame.expanded;
            state.activeFrameId = frame.id;
            onChange();
          },
        },
        element('div', { class: 'name' }, frame.name, frame.size ? element('small', {}, frame.size) : null),
        verdictLine(best),
      ),
    );

    if (frame.expanded) {
      card.append(
        geometryFields(frame, onChange, onNameChange),
        stemOptionsTable(solutions, best),
        saddleSection(frame),
        asBuiltSection(frame, onChange),
        frameActions(frame, onChange),
      );
    }

    host.append(card);
  }
}

export function bindFrameButtons(onChange) {
  select('#add-frame').onclick = () => {
    const frame = createFrame(
      'Frame ' + String.fromCharCode(65 + state.frames.length),
      '',
      state.fitBike.crankLength,
    );
    state.frames.push(frame);
    state.activeFrameId = frame.id;
    onChange();
  };
}
