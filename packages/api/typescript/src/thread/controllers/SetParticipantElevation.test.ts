import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { asInjectionToken, HttpControllerError, type HttpControllerRequest } from '@codm/core-typescript'
import { CloudSession, MockCloudSession } from '@shared/services/CloudSession'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { SetParticipantElevationController } from './SetParticipantElevation'

/**
 * AC-3 (participant-permission-posture) at the DOOR: `PUT /threads/:threadId/participants/:participantId/elevation`
 * for a participant that is neither on the roster nor a live group member answers 404
 * `PARTICIPANT_NOT_FOUND`. The use-case suite proves the CODE; only the controller's `executeController`
 * proves the STATUS (the `GlobalErrorMapper` row), which is what the console reads.
 *
 * `CloudSessionMiddleware` resolves `CloudSession` from the ROOT container (`executeMiddlewares`), so the
 * root gets the same mock `DetectProviders.test.ts` registers — the controller itself is resolved from the
 * test bed, so the use case runs against the real repository.
 */
beforeAll(() => {
	container.registerInstance(asInjectionToken(CloudSession), new MockCloudSession())
})

describe('SetParticipantElevationController — the HTTP door', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeEach(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const request = (threadId: string, participantId: string): HttpControllerRequest<unknown> => {
		const raw = new Request(`http://localhost/threads/${threadId}/participants/${participantId}/elevation`, { method: 'PUT' })
		return { url: raw.url, ctx: {}, params: { threadId, participantId }, body: { canElevate: true }, raw }
	}

	it('AC-3 — an unknown participant answers 404 PARTICIPANT_NOT_FOUND and writes nothing', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		const failure = await testBed
			.resolve(SetParticipantElevationController)
			.executeController(request(thread.id.value, 'stranger@s.whatsapp.net'))
			.then(
				() => undefined,
				(error: unknown) => error,
			)

		expect(failure).toBeInstanceOf(HttpControllerError)
		if (!(failure instanceof HttpControllerError)) throw new Error('expected an HttpControllerError')
		expect(failure.name).toBe('PARTICIPANT_NOT_FOUND')
		expect(failure.status).toBe(404)
		const reloaded = await testBed.resolve(ThreadRepository).findById(thread.id.value)
		expect(reloaded?.participants.some(p => p.participantId === 'stranger@s.whatsapp.net')).toBe(false)
	})

	it('control — a participant ON the roster answers 204 through the same door', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		const response = await testBed.resolve(SetParticipantElevationController).executeController(request(thread.id.value, 'operator'))

		expect(response.status).toBe(204)
	})
})
