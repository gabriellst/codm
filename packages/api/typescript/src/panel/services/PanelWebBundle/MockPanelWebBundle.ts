import { injectable } from 'tsyringe-neo'
import { PanelWebBundle, type PanelWebAsset } from './PanelWebBundle'

/** The asset name the mock shell loads — a test asks for it and for anything else. */
export const MOCK_PANEL_ASSET = 'panel-mock.js'

/** MOCK / INTEGRATION — a fixed shell and one fixed asset; no disk. */
@injectable()
export class MockPanelWebBundle extends PanelWebBundle {
	shell(): string {
		return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><script type="module" src="/panel/assets/${MOCK_PANEL_ASSET}"></script></head><body><div id="root"></div></body></html>`
	}

	asset(file: string): PanelWebAsset | undefined {
		return file === MOCK_PANEL_ASSET
			? { body: new TextEncoder().encode('export {}'), contentType: 'text/javascript; charset=utf-8' }
			: undefined
	}
}
