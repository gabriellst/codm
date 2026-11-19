import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { ChannelStatus } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenChannel } from '@test/support'
import { ChannelConnectivity } from './ChannelConnectivity'

/**
 * `connectedSince` against the real gateway row (fase 3, item 1b) — the grace of the 15-minute default
 * counts from the LATER of the channel's last connection and this process's boot, and a channel that is not
 * connected has no such instant.
 */
describe('LibSqlChannelConnectivity.connectedSince', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const bootedAt = () => Math.floor(performance.timeOrigin)

	it('a channel connected before this process started reads as connected since the boot', async () => {
		const { channelId } = await givenChannel(testBed, { status: ChannelStatus.CONNECTED, updatedAt: new Date(bootedAt() - 3_600_000) })

		expect((await testBed.resolve(ChannelConnectivity).connectedSince(channelId))?.getTime()).toBe(bootedAt())
	})

	it('a channel (re)connected after the boot reads as connected since that connection', async () => {
		const reconnected = new Date(Date.now() - 30_000)
		const { channelId } = await givenChannel(testBed, { status: ChannelStatus.CONNECTED, updatedAt: reconnected })

		const since = (await testBed.resolve(ChannelConnectivity).connectedSince(channelId))?.getTime() ?? 0
		expect(since).toBe(Math.max(reconnected.getTime(), bootedAt()))
	})

	it('a channel not connected has no instant — nor does an unknown one', async () => {
		const { channelId } = await givenChannel(testBed, { status: ChannelStatus.DISCONNECTED })

		expect(await testBed.resolve(ChannelConnectivity).connectedSince(channelId)).toBeUndefined()
		expect(await testBed.resolve(ChannelConnectivity).connectedSince('00000000-0000-4000-8000-00000000dead')).toBeUndefined()
	})
})
