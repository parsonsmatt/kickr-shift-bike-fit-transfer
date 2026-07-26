// Every keystroke re-renders the whole page, which would normally throw away the caret.
// Each input carries a data-path identifying which value it edits; we remember the path,
// the raw text and the selection, then put them back after the render.
//
// Remembering the raw text matters: while you are typing "1.", the state holds 1 and a
// naive re-render would rewrite the field as "1" and eat the dot.

let focusedField = null;

export function rememberFocus(path, event) {
  focusedField = {
    path,
    rawText: event.target.value,
    selectionStart: event.target.selectionStart,
    selectionEnd: event.target.selectionEnd,
  };
}

/**
 * Drop the remembered text. Anything that replaces the state wholesale - import, reset all,
 * reset the constants - has to call this, or the last thing typed gets written back over the
 * value the reset just put there.
 */
export function forgetFocus() {
  focusedField = null;
}

export function restoreFocus() {
  if (!focusedField) return;

  // If the user has since clicked into a different field, leave them alone.
  const active = document.activeElement;
  const activePath = active && active.getAttribute ? active.getAttribute('data-path') : null;
  if (active && active !== document.body && activePath !== focusedField.path) return;

  const input = document.querySelector(`[data-path="${focusedField.path}"]`);
  if (!input) return;

  input.value = focusedField.rawText;
  input.focus();
  try {
    input.setSelectionRange(focusedField.selectionStart, focusedField.selectionEnd);
  } catch {
    // Not every input type supports a selection range; the value and focus are enough.
  }
}
