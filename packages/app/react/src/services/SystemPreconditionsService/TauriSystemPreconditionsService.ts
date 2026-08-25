// packages/app/react/src/services/SystemPreconditionsService/TauriSystemPreconditionsService.ts — COMPLETE final file
import { commands } from '@codm/app-tauri/commands'
import type { SystemPreconditionId, SystemPreconditionStatus, SystemPreconditionsService } from './SystemPreconditionsService'

/**
 * O host, tipado ponta a ponta por tauri-specta (packages/app/tauri/commands/bindings.ts — nome do
 * comando, argumentos e retorno vêm do Rust em src-tauri/src/system_preconditions/). Sem `invoke`
 * stringly: renomeie o id no Rust e ESTE arquivo para de compilar, porque o `SystemPreconditionStatus[]`
 * gerado deixa de ser atribuível ao da porta. É esse o trilho contra deriva entre os dois lados.
 *
 * `commands.repairSystemPrecondition` devolve `Result<null, string>` — um `error` é falha de spawn no
 * host (o binário do passo não existe), e isso precisa chegar ao operador em vez de sumir; mesmo
 * desembrulho que `TauriSecretsService` faz.
 */
export class TauriSystemPreconditionsService implements SystemPreconditionsService {
	async statuses(): Promise<SystemPreconditionStatus[]> {
		return await commands.systemPreconditionStatuses()
	}

	async repair(id: SystemPreconditionId): Promise<void> {
		const res = await commands.repairSystemPrecondition(id)
		if (res.status === 'error') throw new Error(res.error)
	}
}
