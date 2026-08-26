/// <reference types="vite/client" />

interface ImportMetaEnv {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

/** Injetado pelo `define` do vite (ver vite.config.ts): overlays de dev só nos alvos de dev. */
declare const __DEV_OVERLAYS__: boolean
