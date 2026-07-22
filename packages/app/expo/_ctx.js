// Custom Expo Router require.context.
//
// Expo Router's stock `_ctx.<platform>.js` (in node_modules/expo-router)
// scans every `.tsx`/`.ts`/`.jsx`/`.js` file under `app/` as a route, with
// only `+api`, `+html`, `+middleware`, `+native-intent` excluded. There is
// no built-in private-folder convention, so colocated `-components/`,
// `_stores/`, `_hooks/` directories get scanned, log "missing default
// export" warnings, and break route-name resolution for sibling
// `index.tsx` files (e.g. `(sheets)/add-exercise/index.tsx` would register
// as `(sheets)/add-exercise/index` instead of `(sheets)/add-exercise`).
//
// This file is selected via the `resolveRequest` override in
// `metro.config.js`, which redirects every `expo-router/_ctx*` lookup
// here. The added negative lookahead `(?!.*\/[_-][^/]+\/)` rejects any
// path containing a directory segment starting with `_` or `-` — covering
// the SKILL's `-components/` / `-stores/` / `-hooks/` colocation pattern
// (and the underscore-prefixed equivalents) while leaving `_layout.tsx`
// (a file, not a directory segment) intact.
export const ctx = require.context(
	process.env.EXPO_ROUTER_APP_ROOT,
	true,
	/^(?:\.\/)(?!(?:(?:.*\+api)|(?:\+html)|(?:\+middleware)|(?:\+native-intent))\.[tj]sx?$)(?!.*\/[_-][^/]+\/).*(?:\.android|\.ios|\.web|\.native)?\.[tj]sx?$/,
	process.env.EXPO_ROUTER_IMPORT_MODE,
)
