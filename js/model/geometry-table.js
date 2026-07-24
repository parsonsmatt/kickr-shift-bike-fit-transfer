// Reading a manufacturer's geometry table out of pasted text.
//
// Layouts vary wildly, so this is deliberately loose: find lines whose label looks like a
// geometry row, take every number on the line as that row's values across sizes, and try
// to spot a header row of size names. The UI shows what was parsed before anything is
// imported, because guessing wrong here is easy.

/** Geometry rows we know how to use, matched against the start of each pasted line. */
export const GEOMETRY_ROWS = [
  { field: 'stack', label: 'Stack', pattern: /^\s*stack\b/i },
  { field: 'reach', label: 'Reach', pattern: /^\s*reach\b/i },
  { field: 'headTubeAngle', label: 'Head tube angle', pattern: /head\s*(tube)?\s*angle|head\s*angle/i },
  { field: 'seatTubeAngle', label: 'Seat tube angle', pattern: /seat\s*(tube)?\s*angle|seat\s*angle/i },
  { field: 'seatTubeLength', label: 'Seat tube length', pattern: /seat\s*tube\s*(length|c-t|ct)/i },
];

const splitCells = line => line.split(/\t|\s{2,}|,/).map(cell => cell.trim()).filter(Boolean);

/**
 * Returns { rows, columnCount, sizeNames }, where each row is
 * { field, label, values } and values are indexed by size column.
 */
export function parseGeometryTable(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const rows = [];
  let sizeNames = null;

  for (const line of lines) {
    const numbers = (line.match(/-?\d+(?:\.\d+)?/g) || []).map(parseFloat);
    const knownRow = GEOMETRY_ROWS.find(row => row.pattern.test(line));

    if (knownRow && numbers.length) {
      rows.push({ field: knownRow.field, label: knownRow.label, values: numbers });
      continue;
    }
    if (sizeNames) continue;

    // A row of numeric frame sizes: all plausible cm sizes, no three digit measurements.
    const looksLikeNumericSizes =
      numbers.length >= 2 && numbers.every(n => n >= 38 && n <= 64) && !/\d{3}/.test(line);
    // Or a row of XS/S/M/L/XL labels.
    const looksLikeLetterSizes = /\b(XS|S|M|L|XL)\b/i.test(line);

    if (looksLikeNumericSizes || looksLikeLetterSizes) sizeNames = splitCells(line);
  }

  const columnCount = rows.reduce((widest, row) => Math.max(widest, row.values.length), 0);

  // A header row usually carries its own label first ("Size  48  51  54"), which would
  // otherwise shift every size name one column left. One cell too many means that label.
  if (sizeNames && sizeNames.length === columnCount + 1) sizeNames = sizeNames.slice(1);

  return { rows, columnCount, sizeNames };
}

/** Column heading for the parse preview: the size name if we found one, else "col 3". */
export const columnLabel = (parsed, index) =>
  (parsed.sizeNames && parsed.sizeNames[index]) || 'col ' + (index + 1);
