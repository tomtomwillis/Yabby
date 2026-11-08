/**
 * readArea and writeArea for the app: the rules in areaClient.ts, wired to the
 * flag, the data API and the browser. Area modules in src/api/areas/ use these;
 * components use the area modules.
 */

import { createAreaClient } from './areaClient';
import { refreshSources, sourceFor } from './dataSource';
import { apiRequest } from './http';

export { ApiError } from './areaClient';
export type { Area } from './areaClient';
export { apiRequest } from './http';

function holdTab(event: BeforeUnloadEvent): void {
  event.preventDefault();
  // Older browsers need a returnValue to show the prompt.
  event.returnValue = '';
}

const client = createAreaClient({
  sourceFor,
  refreshSources,
  storage: () => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  },
  postFallbacks: (counts) => apiRequest('POST', '/fallback', { body: { counts } }).then(() => undefined),
  guardUnload: (active) => {
    if (active) window.addEventListener('beforeunload', holdTab);
    else window.removeEventListener('beforeunload', holdTab);
  },
  warn: (message) => console.warn(message),
});

export const { readArea, writeArea } = client;
