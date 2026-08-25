import { injectable } from 'tsyringe-neo'
import { MailMessage, MailSender } from './MailSender'

@injectable()
export class ConsoleMailSender extends MailSender {
	async sendMail(message: MailMessage): Promise<void> {
		console.info('[MailSender]', {
			to: message.to,
			subject: message.subject,
			body: message.body,
		})
	}
}
