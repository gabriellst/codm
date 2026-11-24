import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { injectable } from 'tsyringe-neo'
import { PanelWebBundle, type PanelWebAsset } from './PanelWebBundle'
import { panelWebDir, panelWebSourceDir } from './panelWebDir'

/** The extensions the panel build emits, and what each is served as. Anything else is not served. */
const CONTENT_TYPE: Readonly<Record<string, string>> = {
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
}

interface Loaded {
	shell: string | undefined
	assets: ReadonlyMap<string, PanelWebAsset>
}

/**
 * REAL — reads the staged bundle once (first use) with `node:fs`: `index.html` and every file of `assets/`
 * whose extension it knows. The image stages it at `dist/panel-web`; running from source, the app's own
 * `dist-panel` is used. Nothing is read per request, and a name is looked up, never joined into a path.
 */
@injectable()
export class FilePanelWebBundle extends PanelWebBundle {
	private loaded: Loaded | undefined

	shell(): string | undefined {
		return this.load().shell
	}

	asset(file: string): PanelWebAsset | undefined {
		return this.load().assets.get(file)
	}

	private load(): Loaded {
		if (this.loaded) return this.loaded
		const dir = [panelWebDir, panelWebSourceDir].find(candidate => existsSync(join(candidate, 'index.html')))
		const assets = new Map<string, PanelWebAsset>()
		if (dir) {
			const assetsDir = join(dir, 'assets')
			for (const name of existsSync(assetsDir) ? readdirSync(assetsDir) : []) {
				const contentType = CONTENT_TYPE[extname(name)]
				if (contentType) assets.set(name, { body: new Uint8Array(readFileSync(join(assetsDir, name))), contentType })
			}
		}
		this.loaded = { shell: dir ? readFileSync(join(dir, 'index.html'), 'utf8') : undefined, assets }
		return this.loaded
	}
}
