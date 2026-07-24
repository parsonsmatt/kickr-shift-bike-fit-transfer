// Plane geometry helpers. Every point in this app is a two element array [x, y] in
// millimetres measured from the bottom bracket: +x is forward (towards the front wheel),
// +y is up. Angles are in degrees unless a name says otherwise.

export const DEGREES = Math.PI / 180;

/** Unit vector pointing `degrees` anticlockwise from straight forward. */
export const unitVectorAt = degrees => [Math.cos(degrees * DEGREES), Math.sin(degrees * DEGREES)];

export const subtract = (point, other) => [point[0] - other[0], point[1] - other[1]];

export const magnitude = vector => Math.hypot(vector[0], vector[1]);

export const distanceBetween = (point, other) => Math.hypot(point[0] - other[0], point[1] - other[1]);

/** Dot product, used to project a miss distance onto an axis such as the steerer. */
export const dot = (vector, other) => vector[0] * other[0] + vector[1] * other[1];

/**
 * A direction in words: "up and back", "forward", "down".
 * Used so every constant in the form can print back what it means, which makes a
 * flipped sign or a mis-read scale visible instead of silent.
 */
export function describeDirection(vector) {
  const length = magnitude(vector);
  if (length < 1e-9) return 'nowhere';

  const forwardness = vector[0] / length;
  const upness = vector[1] / length;
  const horizontal = forwardness > 0.03 ? 'forward' : forwardness < -0.03 ? 'back' : '';
  const vertical = upness > 0.03 ? 'up' : upness < -0.03 ? 'down' : '';

  if (vertical && horizontal) return `${vertical} and ${horizontal}`;
  return vertical || horizontal;
}
