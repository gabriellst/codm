import { BaseInterfaceErrors, type BaseInfrastructureErrors } from '../errors/codes'
import { tryCatchAsync } from '../utils/TryCatch'
import { BaseError } from './BaseError'
import { UnitOfWorkFactory, type Transaction } from '../services/UnitOfWork/UnitOfWork'
import { z, type ZodType, type ZodIssue } from 'zod'
import type { DependencyContainer } from 'tsyringe-neo'

// Type-only imports to avoid circular dependencies
import { DomainEventRepository } from '../repositories/DomainEventRepository'
import { InternalMediator, type Mediator } from '../services/Mediator/Mediator'

export abstract class Handler<
	InputSchema extends ZodType = ZodType,
	OutputSchema extends ZodType = ZodType,
	// Default to the persistence-agnostic Transaction, NOT DrizzleClient: withTransaction
	// yields this to handlers/use cases, which pass it straight to repos. Only the Drizzle
	// repo impls narrow it to DrizzleClient. Keeps infra out of the write-side flow.
	Tx extends Transaction = Transaction,
> {
	private _container?: DependencyContainer

	abstract readonly name: string
	abstract readonly inputSchema: InputSchema
	abstract readonly outputSchema: OutputSchema
	readonly concurrency?: number

	readonly input!: z.output<(typeof this)['inputSchema']>
	readonly output!: z.output<(typeof this)['outputSchema']>

	bindContainer(container: DependencyContainer): this {
		this._container = container
		this.bindChildHandlers(this, container, new WeakSet())
		return this
	}

	private bindChildHandlers(target: object, container: DependencyContainer, visited: WeakSet<object>): void {
		if (visited.has(target)) return
		visited.add(target)

		for (const value of Object.values(target)) {
			this.visitForBinding(value, container, visited)
		}
	}

	private visitForBinding(value: unknown, container: DependencyContainer, visited: WeakSet<object>): void {
		if (!value || typeof value !== 'object') return
		if (value instanceof Handler) {
			if (!value._container) value.bindContainer(container)
			return
		}
		if (Array.isArray(value)) {
			for (const item of value) this.visitForBinding(item, container, visited)
			return
		}
		if (Object.getPrototypeOf(value) !== Object.prototype) {
			this.bindChildHandlers(value, container, visited)
		}
	}

	protected get di(): DependencyContainer {
		if (!this._container) {
			throw new BaseError<BaseInfrastructureErrors>(
				'HANDLER_NOT_BOUND',
				`${this.constructor.name} was resolved without a bound DI container. Resolve the handler via Handler.bindContainer(container) or through the DI-registered handler pipeline instead of constructing it directly.`,
			)
		}

		return this._container
	}

	// Core infrastructure — lazily resolved from the handler DI container
	protected get unitOfWorkFactory(): UnitOfWorkFactory {
		return this.di.resolve(UnitOfWorkFactory as any)
	}

	protected get domainEventRepository(): DomainEventRepository {
		return this.di.resolve(DomainEventRepository as any) as DomainEventRepository
	}

	protected get internalMediator(): Mediator {
		return this.di.resolve(InternalMediator as any) as Mediator
	}

	// `| void` lets handlers whose outputSchema resolves to z.void()
	// (e.g. RegisterFcmToken, UpdateProfile, every EventHandler
	// subclass …) return bare without a cast. TypeScript can't see
	// through the generic indirection to narrow `this['output']` to
	// `void` when outputSchema is z.void(); the union covers that
	// gap without affecting handlers that return a real shape (their
	// compiler-validated `return { … }` still satisfies
	// `this['output']`).
	protected abstract handle(input: this['input'], tx?: Tx): Promise<this['output'] | undefined>

	async execute(input: this['input'], tx?: Tx): Promise<this['output']> {
		const result = await tryCatchAsync(async () => {
			const decodedInput = this.validatedRequest(input)
			return await this.handle(decodedInput, tx)
		})
		if (!result.success) {
			throw result.error
		}
		// handle() returns `this['output'] | void`; cast back to the
		// narrower signature execute() promises. For void-outputting
		// handlers, result.data is undefined which is a valid
		// `void` instance of `this['output']`.
		return result.data as this['output']
	}

	protected async withTransaction<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
		if (tx) return fn(tx)
		const uow = this.unitOfWorkFactory.create()
		return uow.transaction(async newTx => fn(newTx as Tx))
	}

	protected validatedRequest(input: unknown): this['input'] {
		const result = this.inputSchema.safeParse(input)
		if (!result.success) {
			const validationErrorString = this.getValidationErrorString(result.error.issues)
			throw new BaseError<BaseInterfaceErrors>('VALIDATION_ERROR', validationErrorString)
		}
		return result.data
	}

	protected getValidationErrorString(issues: ZodIssue[]): string {
		return issues.map(issue => this.getZodIssueMessage(issue)).join('; ')
	}

	protected getZodIssueMessage(issue: ZodIssue): string {
		const path = issue.path.join('.')
		return `${issue.message} at ${path || 'root'}`
	}
}
