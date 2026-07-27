// Section 1's profile list: saved fit setups, and the buttons that move between them.
//
// Names come from prompt() rather than a text field on the page. The page rebuilds itself on
// every keystroke, so a live text input would need somewhere in the state to keep a half-typed
// name, and a draft name is not something worth saving to disk.

import { select, element, clearChildren } from '../lib/dom.js';
import { state } from '../state.js';
import { SCALE_INPUTS } from '../model/fit-bike.js';
import {
  captureProfile,
  updateProfile,
  applyProfile,
  profileInUse,
  describeProfileReadings,
  describeProfileDifferences,
} from '../model/profile.js';
import { tableHead, tableBody, chip } from './fields.js';
import { forgetFocus } from './focus.js';

const SCALE_KEYS = Object.keys(SCALE_INPUTS);

const button = (label, handler, extra = '') =>
  element('button', { class: `ghost tiny ${extra}`.trim(), onclick: handler }, label);

/** A name nobody has used yet, so the prompt has something sensible in it already. */
function suggestedName() {
  for (let n = state.profiles.length + 1; ; n++) {
    const candidate = `Profile ${n}`;
    if (!state.profiles.some(profile => profile.name === candidate)) return candidate;
  }
}

function askForName(suggestion) {
  const answer = prompt('Name for this fit profile', suggestion);
  if (answer === null) return null;
  return answer.trim() || suggestion;
}

/**
 * Loading a profile writes the readings and the setup, so the static inputs have to be pushed
 * back out - that is what `onApply` does - and any remembered keystroke has to be dropped, or
 * the redraw would put it back over a value the profile just set.
 */
function useProfile(profile, onApply) {
  const differences = describeProfileDifferences(profile);
  if (differences.length) {
    const confirmed = confirm(
      `Set the bike up as "${profile.name}"?\n\n` + differences.map(line => `- ${line}`).join('\n'),
    );
    if (!confirmed) return;
  }
  applyProfile(profile);
  forgetFocus();
  onApply();
}

function profileRow(profile, onApply) {
  const inUse = profileInUse(profile);

  const rename = () => {
    const name = askForName(profile.name);
    if (name === null) return;
    profile.name = name;
    onApply();
  };

  const overwrite = () => {
    const confirmed = confirm(`Save the bike as it is now over "${profile.name}"?`);
    if (!confirmed) return;
    state.profiles = state.profiles.map(other => (other === profile ? updateProfile(profile) : other));
    onApply();
  };

  const remove = () => {
    const confirmed = confirm(`Delete the profile "${profile.name}"? The bike is not changed.`);
    if (!confirmed) return;
    state.profiles = state.profiles.filter(other => other !== profile);
    onApply();
  };

  return element(
    'tr',
    { class: inUse ? 'best' : '' },
    element('td', {}, element('b', {}, profile.name)),
    element('td', {}, profile.readings.standover),
    ...SCALE_KEYS.map(key =>
      element('td', {}, profile.readings[key] === undefined ? '-' : String(profile.readings[key])),
    ),
    element('td', {}, inUse ? chip('on the bike', true) : ''),
    element(
      'td',
      {},
      element(
        'div',
        { class: 'btnrow' },
        inUse ? null : button('Use', () => useProfile(profile, onApply), 'use-profile'),
        button('Save over', overwrite),
        button('Rename', rename),
        button('×', remove, 'kill'),
      ),
    ),
  );
}

export function renderProfiles(onApply) {
  const host = clearChildren(select('#profiles-panel'));

  if (!state.profiles.length) {
    host.append(
      element(
        'div',
        { class: 'note' },
        'No profiles saved. Save the settings above as one and you can switch between riders, ' +
          'or between a road position and a TT position, without writing the numbers down.',
      ),
    );
    return;
  }

  host.append(
    element(
      'div',
      { class: 'scroll' },
      element(
        'table',
        {},
        tableHead(['Profile', 'Standover', ...SCALE_KEYS.map(key => SCALE_INPUTS[key].label), '', '']),
        tableBody(state.profiles.map(profile => profileRow(profile, onApply))),
      ),
    ),
  );
}

/** The one static button: capture the bike as it stands. */
export function bindProfileButtons(onApply) {
  select('#save-profile').onclick = () => {
    const name = askForName(suggestedName());
    if (name === null) return;

    const existing = state.profiles.find(profile => profile.name === name);
    if (existing) {
      const confirmed = confirm(`"${name}" already exists. Save over it?`);
      if (!confirmed) return;
      state.profiles = state.profiles.map(other => (other === existing ? updateProfile(existing) : other));
    } else {
      state.profiles = [...state.profiles, captureProfile(name)];
    }
    onApply();
  };
}

/** The line under the list, naming what a profile does and does not carry. */
export function renderProfileNote() {
  const saved = state.profiles.length;
  select('#profiles-note').textContent =
    `${saved === 0 ? 'No' : saved} profile${saved === 1 ? '' : 's'} saved. A profile holds the five ` +
    'readings and the current setup above - cranks, saddle figures, stem, bar reach and match mode. ' +
    'It does not hold the measured constants, which describe the machine rather than anyone on it, ' +
    'and it does not hold your frames.';
}
