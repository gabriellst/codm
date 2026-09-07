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
	/**
	 * CAMPO, NUNCA PARÂMETRO DE CONSTRUTOR COM DEFAULT — e a diferença é de resolução, não de estilo.
	 *
	 * MEDIDO: com `constructor(private documents: McpConfigDocument[] = [])`, `container.resolve()`
	 * falha. O tsyringe lê `design:paramtypes`, vê `Array` e tenta resolvê-lo como TOKEN; o default do
	 * TypeScript nunca chega a ser consultado, porque quem constrói é o container e não o `new`. O
	 * mesmo formato silencioso que `tests/architecture/real-di-resolution.test.ts` existe para pegar.
	 */
	private readonly documents: McpConfigDocument[] = []

	/** Semeia os documentos que esta suíte quer ver descobertos. */
	seed(...documents: McpConfigDocument[]): void {
		this.documents.push(...documents)
	}

	async discover(_context: McpDiscoveryContext): Promise<McpConfigDocument[]> {
		return this.documents
	}
}
