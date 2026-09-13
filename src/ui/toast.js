/** Small toast notifications anchored above the map status bar. */

import { el } from '../core/util.js';

let host = null;

export function initToasts(container) {
  host = container;
}

/**
 * @param {string} message
 * @param {{type?:''|'ok'|'err', timeout?:number, actions?:Array<{label:string,onClick:Function}>}} [opts]
 */
export function toast(message, { type = '', timeout = 3600, actions = [] } = {}) {
  if (!host) return () => {};

  const node = el('div', { class: `toast ${type}`.trim(), role: 'status' }, [
    el('span', { text: message }),
    ...actions.map((a) => el('button', {
      class: 'btn',
      type: 'button',
      onclick: () => { close(); a.onClick && a.onClick(); },
    }, [a.label])),
  ]);

  const close = () => {
    if (!node.isConnected) return;
    node.style.opacity = '0';
    node.style.transition = 'opacity .18s ease';
    setTimeout(() => node.remove(), 190);
    clearTimeout(timer);
  };

  const timer = timeout > 0 ? setTimeout(close, timeout) : 0;
  host.appendChild(node);

  // Keep at most four visible.
  while (host.children.length > 4) host.firstElementChild.remove();

  return close;
}

