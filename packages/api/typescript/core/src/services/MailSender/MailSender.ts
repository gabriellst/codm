export interface MailMessage {
	to: string
	subject: string
	body: string
}

export abstract class MailSender {
	abstract sendMail(message: MailMessage): Promise<void>
}
