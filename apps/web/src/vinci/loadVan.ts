// Loads the @van/analysis UMD chart engine, which VinciViewer/VinciDesigner render
// through via the `VanNext` *global*. It must be executed as a CLASSIC script (an ESM
// `import` would scope its top-level `var VanNext` to the module, never the global), so
// we inject a <script> tag pointing at the Vite-emitted asset URL and await its load.
// The stylesheet is a normal CSS import (only data: URIs inside — safe to bundle).
import vanScriptUrl from '@van/analysis/dist/van-analysis.min.js?url';
import '@van/analysis/dist/van-analysis.min.css';

declare global {
  // eslint-disable-next-line no-var
  var VanNext: unknown;
}

let loading: Promise<void> | null = null;

/** Ensure the `VanNext` global exists. Idempotent; safe to call before every render. */
export function loadVan(): Promise<void> {
  if (typeof globalThis.VanNext !== 'undefined') return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = vanScriptUrl;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('failed to load @van/analysis chart engine'));
    document.head.appendChild(script);
  });
  return loading;
}
