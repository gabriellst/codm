import { ProductConfig } from '@shared/config'
import { render } from '@react-email/render'
import type { MailMessage } from '@template/core-typescript'
import { Layout } from '@shared/services/MailSender'

interface AccountCreatedEmailProps {
	name: string
}

function AccountCreatedEmailHtml({ name }: AccountCreatedEmailProps) {
	return (
		<Layout>
			<div>
				<p>
					<strong>Olá, {name}!</strong>
				</p>
				<p>Sua conta foi criada com sucesso. Agora você pode acessar todos os recursos da plataforma.</p>
				<p>Se tiver alguma dúvida, é só responder este e-mail.</p>
			</div>
		</Layout>
	)
}

export async function renderAccountCreatedEmail(props: AccountCreatedEmailProps): Promise<Omit<MailMessage, 'to'>> {
	return {
		subject: `Bem-vindo(a) ao ${ProductConfig.env.PRODUCT_NAME}!`,
		body: await render(<AccountCreatedEmailHtml {...props} />),
	}
}
