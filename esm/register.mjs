import { enableModuleReplacement } from './hooks.mjs';
import { setOpts } from './state.mjs';

const options = globalThis.__HMR_OPTIONS__;
if (options) {
  setOpts(options);
  delete globalThis.__HMR_OPTIONS__;
}

enableModuleReplacement();

export { enableModuleReplacement };
export default enableModuleReplacement;
