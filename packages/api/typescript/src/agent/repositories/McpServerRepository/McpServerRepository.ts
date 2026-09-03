// packages/api/typescript/src/agent/repositories/McpServerRepository/McpServerRepository.ts — arquivo final COMPLETO
import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import type { McpServer } from '../../entities/McpServer'

/**
 * `save()` e `delete()` vêm da base. O que este contrato acrescenta são as três leituras que o produto
 * realmente faz: por id, por (dono, key) — a checagem de colisão do `RegisterMcpServer` e o lookup do
 * proxy — e DUAS listagens por dono — a tela de settings
 * quer todos, o proxy quer só os habilitados. Dois métodos e não um parâmetro de opções: a forma irmã
 * neste repo é `listByOwner(ownerId, tx?)` (`WorkspaceRepository`, `ThreadRepository`), e um objeto de
 * opções no meio quebraria a posição do `tx` que todas as outras portas mantêm.
 */
export abstract class McpServerRepository extends Repository<McpServer> {
	abstract findById(id: string, tx?: Transaction): Promise<McpServer | undefined>
	abstract findByKey(ownerId: string, key: string, tx?: Transaction): Promise<McpServer | undefined>
	abstract listByOwner(ownerId: string, tx?: Transaction): Promise<McpServer[]>
	abstract listEnabledByOwner(ownerId: string, tx?: Transaction): Promise<McpServer[]>
}
