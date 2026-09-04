import { injectable } from 'tsyringe-neo'
import { McpConfigDiscovery, type McpConfigDocument, type McpDiscoveryContext } from './McpConfigDiscovery'

/**
 * O `McpConfigDiscovery` dos ambientes `mock` / `integration` / `e2e`: NUNCA toca disco.
 *
 * Vazio por padrão, e isso é a escolha certa: a máquina de um contribuidor não tem os arquivos (medido
 * — três das quatro fontes estavam ausentes aqui), e um default que fingisse tê-los faria a suíte
 * afirmar um estado que nenhuma máquina real reproduz. Uma suíte que precisa de documentos os declara,
 * e aí o teste diz na cara o que está assumindo.
 */
@injectable()
export class MockMcpConfigDiscovery extends McpConfigDiscovery {
	constructor(private readonly documents: McpConfigDocument[] = []) {
		super()
	}

	/** Semeia os documentos que esta suíte quer ver descobertos. */
	seed(...documents: McpConfigDocument[]): void {
		this.documents.push(...documents)
	}

	async discover(_context: McpDiscoveryContext): Promise<McpConfigDocument[]> {
		return this.documents
	}
}
