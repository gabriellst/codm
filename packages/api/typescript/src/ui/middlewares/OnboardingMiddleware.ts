import { singleton } from 'tsyringe-neo'
import { BaseError, z } from '@codm/core-typescript'
import type { HttpControllerRequest, HttpMiddlewareResponse, Middleware } from '@codm/core-typescript'
import { OnboardingRepository } from '../repositories/OnboardingRepository'
import type { ApplicationErrors } from '../errors'

const CtxSchema = z.object({ ownerId: z.string().min(1) })

/**
 * O PORTÃO DE ENTRADA — o único efeito que `completedAt` tem sobre a API (spec Decision 10).
 *
 * É declarado POR CONTROLLER, nunca global, e essa é a metade da decisão que impede um beco sem
 * saída: os controllers de `/ui/onboarding*` e os que os passos de setup chamam (conectar canal,
 * criar workspace, vincular thread) NÃO o declaram, porque são justamente o que o operador precisa
 * executar ANTES de existir um `completedAt`. Barrá-los seria exigir a conclusão para poder concluir.
 *
 * Barrar a entrada uma vez é o modelo do Setup Assistant do macOS; o que NÃO se barra é a capacidade
 * depois, que fica a cargo de cada tela.
 */
@singleton()
export class OnboardingMiddleware implements Middleware {
	constructor(private readonly onboardingRepo: OnboardingRepository) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const ctx = CtxSchema.safeParse(request.ctx)
		if (!ctx.success) throw new BaseError<ApplicationErrors>('ONBOARDING_NOT_COMPLETED')

		const onboarding = await this.onboardingRepo.findByOwnerId(ctx.data.ownerId)
		if (!onboarding?.isCompleted()) throw new BaseError<ApplicationErrors>('ONBOARDING_NOT_COMPLETED')

		return {}
	}
}
