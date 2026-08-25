// packages/app/react/src/services/SystemPreconditionsService/BrowserSystemPreconditionsService.ts — COMPLETE final file
import type { SystemPreconditionId, SystemPreconditionStatus, SystemPreconditionsService } from './SystemPreconditionsService'

/**
 * DEGRADAÇÃO HONESTA, e vale ser preciso sobre por que "nada pendente" é a VERDADE aqui e não um
 * default otimista: uma aba de browser não tem nenhuma das pré-condições. Elas são fatos de hosts
 * nativos, e cada uma declara em que plataformas existe — o conjunto aplicável a uma aba é vazio,
 * então a lista vazia é a mesma resposta que o lookup do host daria, não uma exceção codificada
 * aqui. Reportar uma pendência faria o console web exibir um slide pedindo uma permissão do macOS a
 * quem nunca vai ver essa tela de Ajustes.
 *
 * `repair` é inerte pela mesma razão: não há nada para reparar num host onde a pré-condição não
 * existe, e a UI que chamaria isto nunca é renderizada aqui.
 */
export class BrowserSystemPreconditionsService implements SystemPreconditionsService {
	async statuses(): Promise<SystemPreconditionStatus[]> {
		return []
	}

	async repair(_id: SystemPreconditionId): Promise<void> {
		return undefined
	}
}
