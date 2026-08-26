import { createStart } from '@tanstack/react-start'
import type { getRouter } from './router'

export const startInstance = createStart(() => ({
	defaultSsr: false,
}))

// Hand-owned module augmentation. This lived in routeTree.gen.ts, but `tsr generate` strips it —
// leaving the generated file non-reproducible. Keeping it here makes codegen idempotent against the
// committed tree while preserving the Start SSR/router/config registration.
declare module '@tanstack/react-start' {
	interface Register {
		ssr: true
		router: Awaited<ReturnType<typeof getRouter>>
		config: Awaited<ReturnType<typeof startInstance.getOptions>>
	}
}
