/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Agent preview PNG scale: `1` (faster) or `2` (sharper). Default when unset: `2`. */
  readonly VITE_AGENT_PREVIEW_MULTIPLIER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
