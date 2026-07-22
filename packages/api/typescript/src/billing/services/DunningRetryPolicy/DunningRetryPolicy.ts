import { injectable } from 'tsyringe-neo'
import { ProductConfig } from '@shared/config'
import { DeclineClass } from '@billing/services/DeclineClassifier'

export interface RetryContext {
	attemptNo: number // nº de charges FAILED até agora (0 = só a 1ª falha)
	classification: DeclineClass
	firstFailedAt: Date
	now: Date
}

// Fuso para ancorar o vira-dia — saldo/limite reseta no vira-dia local do dono. BR-only hoje.
const OWNER_TZ = 'America/Sao_Paulo'

/**
 * Governa SÓ o retry (não o cancelamento — isso é a janela, no DunningRetryJob). Troque esta
 * implementação (payday-aware, ML) sem tocar job/estado/handlers: a interface `nextRetryAt` é o
 * seam OCP. v1: offsets fixos a partir da 1ª falha, cada retorno ancorado no próximo vira-dia local.
 */
@injectable()
export class DunningRetryPolicy {
	nextRetryAt(ctx: RetryContext): Date | null {
		// Hard decline não retenta.
		if (ctx.classification === DeclineClass.HARD) return null
		const offsets = ProductConfig.env.BILLING_DUNNING_RETRY_OFFSETS_DAYS
		const maxAttempts = ProductConfig.env.BILLING_DUNNING_MAX_ATTEMPTS
		// attemptNo failures já ocorreram → a próxima tentativa é a de índice `attemptNo` nos offsets.
		// Cap: nunca passar de maxAttempts tentativas totais (1ª + retries).
		if (ctx.attemptNo >= maxAttempts - 1 || ctx.attemptNo >= offsets.length) return null
		const offsetDays = offsets[ctx.attemptNo]!
		return DunningRetryPolicy.midnightAfter(ctx.firstFailedAt, offsetDays)
	}

	// firstFailedAt + offsetDays, truncado para o próximo vira-dia (00:00) no fuso do dono.
	private static midnightAfter(from: Date, days: number): Date {
		const target = new Date(from.getTime() + days * 24 * 60 * 60 * 1000)
		// Formata no fuso do dono, zera a hora, reinterpreta.
		const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: OWNER_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(target)
		// 00:00 no fuso -03:00 (BR não tem DST desde 2019).
		return new Date(`${ymd}T00:00:00-03:00`)
	}
}
