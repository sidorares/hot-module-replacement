/** @typedef {import('./types.js').HmrOptions} HmrOptions */

/** @type {HmrOptions} */
export let opts = {};

/** child canonical file URL -> parent canonical file URL -> true */
export const parents = Object.create(null);

/** canonical file URL -> hot context */
export const hotContexts = Object.create(null);

/** canonical file URL -> reload generation (0 = first load) */
export const versions = Object.create(null);

/** absolute filesystem path -> watcher handle */
export const watching = Object.create(null);

export function setOpts(next) {
  opts = next || {};
}
