const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')
const path = require('node:path')

const config = getDefaultConfig(__dirname)

const monorepoRoot = path.resolve(__dirname, '../..')
config.watchFolders = [monorepoRoot]
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), path.resolve(monorepoRoot, 'node_modules')]
config.resolver.unstable_enablePackageExports = true

const wrappedConfig = withUniwindConfig(config, { cssEntryFile: './global.css' })

// Redirect Expo Router's `_ctx*` modules to our local `_ctx.js` so we can
// exclude underscore-prefixed colocated directories (`-components/`,
// `_stores/`, `_hooks/`) from the route scan. See `_ctx.js` for the
// justification.
const localCtxPath = path.resolve(__dirname, '_ctx.js')
const ctxPattern = /^expo-router\/_ctx(\.(ios|android|web|native))?$/

const upstreamResolveRequest = wrappedConfig.resolver.resolveRequest
wrappedConfig.resolver.resolveRequest = (context, moduleName, platform) => {
	if (ctxPattern.test(moduleName)) {
		return { type: 'sourceFile', filePath: localCtxPath }
	}
	if (upstreamResolveRequest) {
		return upstreamResolveRequest(context, moduleName, platform)
	}
	return context.resolveRequest(context, moduleName, platform)
}

module.exports = wrappedConfig
