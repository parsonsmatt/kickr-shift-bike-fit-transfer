// Turning user text into numbers, and numbers back into short display strings.

/** Text field to number. Anything unparseable reads as 0 so the maths never sees NaN. */
export const toNumber = value => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** One decimal place, or "-" when there is no number to show. */
export const oneDecimal = value =>
  Number.isFinite(value) ? (Math.round(value * 10) / 10).toFixed(1) : '-';

/** Nearest whole number, or "-". */
export const whole = value => (Number.isFinite(value) ? String(Math.round(value)) : '-');

/** One decimal place with an explicit + on positive values, for offsets and angles. */
export const signedOneDecimal = value => (value > 0 ? '+' : '') + oneDecimal(value);

/** "60,70,80" or "60 70 80" to [60, 70, 80]. */
export const parseNumberList = text =>
  String(text)
    .split(/[,\s]+/)
    .map(parseFloat)
    .filter(Number.isFinite);
