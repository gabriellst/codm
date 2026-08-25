import { injectable } from 'tsyringe-neo'
import type { Session } from '@shared/schemas'
import { CloudSession } from './CloudSession'

/**
 * Test/dev double, bound in `mock` and `integration` (S2S rule — no test opens a socket or touches a
 * real data dir). Defaults to ENTITLED: the hundreds of agent/thread suites that predate this gate
 * (Task T7) construct and drive `LibSqlMailboxDispatcher` with no idea `CloudSession` exists, and
 * defaulting to "blocked" would fail every one of them. A test that exercises the BLOCKED path calls
 * `setEntitled(false)` explicitly — see `LibSqlMailboxDispatcher.test.ts`.
 */
/** Ids fixos do dobro de teste. Opacos e distintos entre si — um id que é o mesmo do usuário esconde
 *  troca de campo. */
export const MOCK_CLOUD_USER_ID = '11111111-1111-4111-8111-111111111111'
export const MOCK_CLOUD_SESSION_ID = '22222222-2222-4222-8222-222222222222'
export const MOCK_CLOUD_OWNER_ID = '33333333-3333-4333-8333-333333333333'

@injectable()
export class MockCloudSession extends CloudSession {
	private entitled = true

	setToken(_token: string): void {
		this.entitled = true
	}

	async isEntitled(): Promise<boolean> {
		return this.entitled
	}

	/** Test helper — flips the gate directly, no fake cache file or HTTP round-trip needed. */
	setEntitled(entitled: boolean): void {
		this.entitled = entitled
	}

	/**
	 * Identidade de teste. Defaults to LOGGED IN pela mesma razão que `entitled` defaults to true: as
	 * centenas de suítes que antecedem o ADR 0001 não sabem que `CloudSession` existe, e um default
	 * "não logado" faria todas reprovarem por um motivo que não é o delas.
	 *
	 * O id é fixo e OPACO de propósito — não é `OPERATOR_ID`. Reaproveitar a constante antiga faria a
	 * migração parecer completa enquanto o valor que a prova continuava vindo do mesmo lugar.
	 */
	private session: Session | null = {
		user: { id: MOCK_CLOUD_USER_ID, email: 'operator@example.test', name: 'Test Operator', emailVerified: true },
		session: {
			id: MOCK_CLOUD_SESSION_ID,
			userId: MOCK_CLOUD_USER_ID,
			expiresAt: new Date('2999-12-31T00:00:00.000Z'),
			ownerId: MOCK_CLOUD_OWNER_ID,
		},
	}

	/** Lançado por `identity()` — o dobro de "não consegui falar com a nuvem". */
	private failure: Error | undefined

	setFailure(error: Error | undefined): void {
		this.failure = error
	}

	async identity(): Promise<Session | null> {
		if (this.failure) throw this.failure
		return this.session
	}

	/** Test helper — o caminho NÃO LOGADO, que é o que a testemunha 2 do ADR 0001 exercita. */
	setIdentity(session: Session | null): void {
		this.session = session
	}
}
