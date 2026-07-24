// Small DOM helpers. Everything on the page below the static shell in index.html is
// built with `element()`.

export const select = selector => document.querySelector(selector);

export const selectAll = selector => Array.from(document.querySelectorAll(selector));

export const clearChildren = node => {
  node.innerHTML = '';
  return node;
};

/**
 * Build an element.
 *   element('div', {class: 'field'}, element('label', {}, 'Stack'), input)
 * Attribute keys starting with "on" are attached as listeners (onclick, oninput);
 * everything else is set as an attribute. Children may be nodes, strings, arrays or
 * null (skipped), which lets callers write `condition ? node : null` inline.
 */
export function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);

  for (const key in attributes) {
    const value = attributes[key];
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }

  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }

  return node;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Same idea as element(), but in the SVG namespace and attributes only. */
export function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  for (const key in attributes) node.setAttribute(key, attributes[key]);
  return node;
}
