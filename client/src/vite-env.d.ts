/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to skip the /api/proxy and hit upstream APIs directly (only works where CORS allows it). */
  readonly VITE_DIRECT?: string;
  /** Override the API proxy prefix (default: /api/proxy). */
  readonly VITE_PROXY_PREFIX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
