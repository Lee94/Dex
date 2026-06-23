/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Mastra dev server (apps/agent). Defaults to :4111. */
  readonly VITE_MASTRA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
