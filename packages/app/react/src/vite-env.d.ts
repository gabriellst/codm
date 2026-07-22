/// <reference types="vite/client" />

interface ImportMetaEnv {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

// Extend better-auth User with our additional fields
declare module 'better-auth' {
	interface User {
		language?: string
	}
}
