import type { CloudSessionService } from './CloudSessionService'

/**
 * Uma aba de browser comum abre outra aba — e isso é tudo que esta porta pede desde que o
 * `onAuthCallback` saiu. A degradação honesta que este arquivo documentava (não havia registro de
 * deep link para assinar) deixou de ser necessária: a volta do login é HTTP contra o daemon local,
 * igual nos dois hosts.
 */
export class BrowserCloudSessionService implements CloudSessionService {
	async openBrowser(url: string): Promise<void> {
		window.open(url, '_blank', 'noopener,noreferrer')
	}
}
