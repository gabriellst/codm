import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { ThreadStopRaisedEvent } from '@codm/contracts-typescript/wire/events'
import { MarkIssueNeedsInput } from '../usecases/MarkIssueNeedsInput'

/**
 * O stop de execução → o STATUS da issue que ele parou.
 *
 * Handler próprio, e não uma quarta branch em `MaterializeIssueFromExecution`: aquele handler
 * materializa a EXISTÊNCIA e a CONCLUSÃO de uma issue a partir dos três fatos `issue.*`; este reage a
 * um fato `thread.*` para mudar o ciclo de vida dela. Misturá-los faria um handler que escuta dois
 * agregados diferentes por duas razões diferentes.
 *
 * `issueId` é OPCIONAL no evento congelado — um stop pode ser da thread inteira, sem issue nenhuma
 * (foi por isso que ele virou opcional em B4). Sem id não há status a mover, e o retorno silencioso é
 * a leitura correta: não é falha, é um stop que não é sobre uma issue.
 *
 * O `detail` vira o `meta` da issue: é o texto que o console mostra ao responder "por que isto parou?",
 * e é a mesma string que o card de Needs-you exibe — uma origem só para as duas telas.
 */
@injectable()
export class MarkIssueNeedsInputFromStop extends EventHandler<typeof ThreadStopRaisedEvent> {
	readonly event = ThreadStopRaisedEvent

	constructor(private readonly markNeedsInput: MarkIssueNeedsInput) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const { issueId, detail } = event.payload
		if (!issueId) return
		await this.markNeedsInput.execute({ issueId, reason: detail })
	}
}
