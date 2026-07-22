// packages/app/react/src/storybook/types.ts — typed contract for connected stories.
import type { RequestHandler } from 'msw'

/** How a connected story declares the TanStack route its component reads via getRouteApi(id). */
export interface RouteParam {
	/** The file-route id, e.g. '/(app)/dashboard/'. `(group)` segments become pathless layout routes. */
	id: string
	/** Static search defaults merged into the leaf's validateSearch (used when `validateSearch` is omitted). */
	search?: Record<string, unknown>
	/** Full search parser (e.g. the route's own zod schema). Takes precedence over `search`. */
	validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>
}

/** App-global Zustand state to set up for the story (applied before render via `givenStores`).
 *  Empty since the Store-tenancy scope was removed with the owner-model collapse — a product with
 *  app-global client state re-adds its typed keys here (e.g. `theme?: Theme`). */
export interface StoresParam {
	[key: string]: never
}

/** The `parameters` block a connected story declares. The index signature keeps Storybook's own
 *  params (layout, msw, …) assignable while `route`/`stores` stay strongly typed. */
export interface ConnectedParameters {
	route: RouteParam
	stores?: StoresParam
	msw?: { handlers: RequestHandler[] }
	[key: string]: unknown
}

/** Typed builder for a connected story's `parameters` — gives autocomplete + tsc checking on route/stores.
 *  (Storybook's `Parameters` is an open `[k: string]: any`, so interface augmentation can't type these;
 *  this builder is how the type-safety is delivered.) */
export const connected = (params: ConnectedParameters): ConnectedParameters => params
