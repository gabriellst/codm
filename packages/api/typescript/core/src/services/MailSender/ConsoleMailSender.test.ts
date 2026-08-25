import 'reflect-metadata'
import { describe, expect, it, spyOn } from 'bun:test'
import { ConsoleMailSender } from './ConsoleMailSender'

describe('ConsoleMailSender', () => {
	it('resolves and logs the message via console.info', async () => {
		const sender = new ConsoleMailSender()
		const infoSpy = spyOn(console, 'info').mockImplementation(() => {})

		await sender.sendMail({
			to: 'merchant@example.com',
			subject: 'Daily digest',
			body: 'Today: 42 orders.',
		})

		expect(infoSpy).toHaveBeenCalledWith('[MailSender]', {
			to: 'merchant@example.com',
			subject: 'Daily digest',
			body: 'Today: 42 orders.',
		})

		infoSpy.mockRestore()
	})

	it('is an instance of MailSender (DI substitutability)', async () => {
		const { MailSender } = await import('./MailSender')
		expect(new ConsoleMailSender()).toBeInstanceOf(MailSender)
	})
})
