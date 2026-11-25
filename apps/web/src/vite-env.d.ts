/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * API base URL including the version prefix, e.g. `https://api.freshskin.com/api/v1`.
   * Unset in development: the client falls back to same-origin `/api/v1` via the Vite proxy.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
