// packages/app/react/src/services/PreconditionsService/TauriPreconditionsService.ts — COMPLETE final file
import { commands } from '@codm/app-tauri/commands'
import type { PreconditionId, PreconditionStatus, PreconditionsService } from './PreconditionsService'

/**
 * O host, tipado ponta a ponta por tauri-specta (packages/app/tauri/commands/bindings.ts — nome do
 * comando, argumentos e retorno vêm do Rust em src-tauri/src/preconditions/). Sem `invoke`
 * stringly: renomeie o id no Rust e ESTE arquivo para de compilar, porque o `PreconditionStatus[]`
 * gerado deixa de ser atribuível ao da porta. É esse o trilho contra deriva entre os dois lados.
 *
 * `commands.repairPrecondition` devolve `Result<null, string>` — um `error` é falha de spawn no
 * host (o binário do passo não existe), e isso precisa chegar ao operador em vez de sumir; mesmo
 * desembrulho que `TauriSecretsService` faz.
 */
export class TauriPreconditionsService implements PreconditionsService {
	async statuses(): Promise<PreconditionStatus[]> {
		return await commands.preconditionStatuses()
	}

	async repair(id: PreconditionId): Promise<void> {
		const res = await commands.repairPrecondition(id)
		if (res.status === 'error') throw new Error(res.error)
	}
}
