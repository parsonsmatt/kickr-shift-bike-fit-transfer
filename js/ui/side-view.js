// Section 4: a scale side view of the highlighted frame, drawn from the bottom bracket.
// It exists as a sanity check — a sign error in the constants usually looks obviously
// wrong here long before the numbers give it away.

import { select, svgElement, clearChildren } from '../lib/dom.js';
import { oneDecimal, whole, signedOneDecimal } from '../lib/format.js';
import { state } from '../state.js';
import { steererUp, seatAxisUp, steererPointAtBarHeight, barClampPosition } from '../model/frame.js';
import { targetPositions } from '../model/fit-bike.js';
import { bestStemSolution, saddleSetup, targetBarClamp } from '../model/solver.js';

// Matches the CSS custom properties, since SVG attributes cannot read them.
const COLOUR = {
  ink: '#15181C',
  muted: '#5A5F66',
  rule: '#C6C3BB',
  grid: '#DAD8D2',
  steerer: '#1B3FA8',
  target: '#B0431D',
  dim: '#8C8880',
};

// The viewBox in index.html, and how much room to leave for labels.
const CANVAS = { width: 900, height: 760, padTop: 26, padBottom: 54, padSide: 64 };

// The slice of the bike, in mm from the bottom bracket, that has to fit on the canvas.
const WORLD = { xMin: -320, xMax: 620, yMin: -40, yMax: 800 };

const GRID_STEP_MM = 100;
const SEAT_AXIS_OVERSHOOT = 1.05; // draw the seat axis slightly past the saddle
const STEERER_AXIS_LENGTH_MM = 210;
const SADDLE_LENGTH_BEHIND_CLAMP_MM = 110;

/** A drawing surface: world millimetres in, SVG user units out. */
function createCanvas(svg) {
  const scale = Math.min(
    (CANVAS.width - 2 * CANVAS.padSide) / (WORLD.xMax - WORLD.xMin),
    (CANVAS.height - CANVAS.padBottom - CANVAS.padTop) / (WORLD.yMax - WORLD.yMin),
  );
  const offsetX = (CANVAS.width - (WORLD.xMax - WORLD.xMin) * scale) / 2 - WORLD.xMin * scale;

  const toScreenX = x => offsetX + x * scale;
  const toScreenY = y => CANVAS.height - CANVAS.padBottom + WORLD.yMin * scale - y * scale;

  return {
    line(from, to, style) {
      svg.append(
        svgElement('line', {
          x1: toScreenX(from[0]),
          y1: toScreenY(from[1]),
          x2: toScreenX(to[0]),
          y2: toScreenY(to[1]),
          ...style,
        }),
      );
    },
    dot(at, fill, radius = 5) {
      svg.append(svgElement('circle', { cx: toScreenX(at[0]), cy: toScreenY(at[1]), r: radius, fill }));
    },
    ring(at, stroke, radius = 9) {
      svg.append(
        svgElement('circle', {
          cx: toScreenX(at[0]),
          cy: toScreenY(at[1]),
          r: radius,
          fill: 'none',
          stroke,
          'stroke-width': 2,
        }),
      );
    },
    text(at, content, { dx = 0, dy = 0, fill = COLOUR.muted, size = 12, anchor = 'start' } = {}) {
      const node = svgElement('text', {
        x: toScreenX(at[0]) + dx,
        y: toScreenY(at[1]) + dy,
        fill,
        'font-size': size,
        'font-family': 'JetBrains Mono, monospace',
        'text-anchor': anchor,
      });
      node.textContent = content;
      svg.append(node);
    },
  };
}

/** Grid, ground line and the bottom bracket cross that everything is measured from. */
function drawReferenceFrame(canvas) {
  for (let x = -300; x <= 600; x += GRID_STEP_MM) {
    canvas.line([x, 0], [x, 800], { stroke: COLOUR.grid, 'stroke-width': 1 });
  }
  for (let y = 0; y <= 800; y += GRID_STEP_MM) {
    canvas.line([-300, y], [600, y], { stroke: COLOUR.grid, 'stroke-width': 1 });
    if (y % 200 === 0) canvas.text([-300, y], y, { dx: -8, dy: 4, anchor: 'end', size: 10 });
  }

  canvas.line([-300, 0], [600, 0], { stroke: COLOUR.rule, 'stroke-width': 2 });
  canvas.ring([0, 0], COLOUR.ink, 7);
  canvas.line([-20, 0], [20, 0], { stroke: COLOUR.ink, 'stroke-width': 1.5 });
  canvas.line([0, -20], [0, 20], { stroke: COLOUR.ink, 'stroke-width': 1.5 });
  canvas.text([0, 0], 'BB', { dy: 26, anchor: 'middle' });
}

/** Steerer axis, spacer stack, stem clamp and the solved stem arm. */
function drawFrontEnd(canvas, frame, solution) {
  const up = steererUp(frame.headTubeAngle);
  const headTubeTop = [frame.reach, frame.stack];

  canvas.line(
    headTubeTop,
    [
      headTubeTop[0] + up[0] * STEERER_AXIS_LENGTH_MM,
      headTubeTop[1] + up[1] * STEERER_AXIS_LENGTH_MM,
    ],
    { stroke: COLOUR.steerer, 'stroke-width': 1.5, 'stroke-dasharray': '4 4' },
  );
  canvas.dot(headTubeTop, COLOUR.steerer, 4);
  canvas.text(headTubeTop, 'head tube top', { dx: 8, dy: -6, fill: COLOUR.steerer });

  if (!solution) return;

  const alongSteerer = mm => [frame.reach + up[0] * mm, frame.stack + up[1] * mm];
  const spacersBottom = alongSteerer(frame.headsetStack);
  const spacersTop = alongSteerer(frame.headsetStack + solution.spacerHeight);
  const stemBase = steererPointAtBarHeight(frame, solution.spacerHeight);
  const barClamp = barClampPosition(frame, solution.spacerHeight, solution.stemLength, solution.stemAngle);

  canvas.line(spacersBottom, spacersTop, { stroke: COLOUR.steerer, 'stroke-width': 9, opacity: 0.35 });
  canvas.line(
    spacersTop,
    [spacersTop[0] + up[0] * frame.stemClampHeight, spacersTop[1] + up[1] * frame.stemClampHeight],
    { stroke: COLOUR.steerer, 'stroke-width': 11, opacity: 0.6 },
  );
  canvas.line(stemBase, barClamp, {
    stroke: COLOUR.steerer,
    'stroke-width': 5,
    'stroke-linecap': 'round',
  });
  canvas.dot(barClamp, COLOUR.steerer, 5);

  const stemMidpoint = [(stemBase[0] + barClamp[0]) / 2, (stemBase[1] + barClamp[1]) / 2];
  canvas.text(
    stemMidpoint,
    `${whole(solution.stemLength)} x ${signedOneDecimal(solution.stemAngle)}`,
    { dy: -12, fill: COLOUR.steerer, size: 13, anchor: 'middle' },
  );
  canvas.text(spacersTop, `${oneDecimal(solution.spacerHeight)}mm spacers`, {
    dx: -12,
    anchor: 'end',
    fill: COLOUR.steerer,
  });
}

/** Seat axis, saddle and the rail clamp under it. */
function drawSaddle(canvas, frame, saddle) {
  const seatAxis = seatAxisUp(frame.seatTubeAngle);
  const axisLength = saddle.heightAlongSeatAxis * SEAT_AXIS_OVERSHOOT;
  canvas.line([0, 0], [seatAxis[0] * axisLength, seatAxis[1] * axisLength], {
    stroke: COLOUR.dim,
    'stroke-width': 2,
    'stroke-dasharray': '6 5',
  });

  const clamp = saddle.clamp;
  const saddleTopY = clamp[1] + state.fitBike.railsBelowSaddleTop;
  const noseX = clamp[0] + state.fitBike.noseToRailCentre;
  const tailX = noseX - (state.fitBike.noseToRailCentre + SADDLE_LENGTH_BEHIND_CLAMP_MM);

  canvas.line([noseX, saddleTopY], [tailX, saddleTopY], {
    stroke: COLOUR.ink,
    'stroke-width': 4,
    'stroke-linecap': 'round',
  });
  canvas.line(clamp, [clamp[0], saddleTopY], { stroke: COLOUR.ink, 'stroke-width': 1.5 });
  canvas.dot(clamp, COLOUR.ink, 4);
  canvas.text([tailX, saddleTopY], 'saddle', { anchor: 'end', dx: -6, dy: -8, fill: COLOUR.ink });
  canvas.text(clamp, 'rail clamp', { anchor: 'middle', dy: 17, fill: COLOUR.dim, size: 10 });

  return { saddleTopY, noseX };
}

/** The bar clamp we are aiming at, with reach and drop measured off the saddle. */
function drawBarTarget(canvas, target, { saddleTopY, noseX }) {
  canvas.ring(target, COLOUR.target);
  canvas.text(target, 'target bar', { dx: 14, dy: 4, fill: COLOUR.target });

  const dashed = { stroke: COLOUR.target, 'stroke-width': 1, 'stroke-dasharray': '3 4' };
  canvas.line([noseX, saddleTopY], [target[0], saddleTopY], dashed);
  canvas.line([target[0], saddleTopY], target, dashed);

  canvas.text([(noseX + target[0]) / 2, saddleTopY], `reach ${whole(target[0] - noseX)}`, {
    dy: -8,
    anchor: 'middle',
    fill: COLOUR.target,
  });
  canvas.text([target[0], (saddleTopY + target[1]) / 2], `drop ${whole(saddleTopY - target[1])}`, {
    dx: 10,
    fill: COLOUR.target,
  });
}

export function renderSideView() {
  const svg = clearChildren(select('#side-view'));
  const canvas = createCanvas(svg);
  drawReferenceFrame(canvas);

  const frame = state.frames.find(candidate => candidate.id === state.activeFrameId);

  if (!frame) {
    // No frame highlighted: just show the two points the fit bike readings ask for.
    select('#side-view-label').textContent = '';
    const target = targetPositions();
    canvas.dot(target.saddle, COLOUR.ink, 5);
    canvas.dot(target.bar, COLOUR.target, 5);
    return;
  }

  select('#side-view-label').textContent = frame.name + (frame.size ? ' - ' + frame.size : '');

  const saddle = saddleSetup(frame);
  drawFrontEnd(canvas, frame, bestStemSolution(frame));
  const saddleOutline = drawSaddle(canvas, frame, saddle);
  drawBarTarget(canvas, targetBarClamp(frame), saddleOutline);
}
