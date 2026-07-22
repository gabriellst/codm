import { ProductConfig } from '@shared/config'
import { render } from '@react-email/render'
import type { MailMessage } from '@template/core-typescript'
import { Layout } from '@shared/services/MailSender'

interface ResetPasswordEmailProps {
	name: string
	url: string
}

function ResetPasswordEmailHtml({ name, url }: ResetPasswordEmailProps) {
	return (
		<Layout>
			<div>
				<p>
					<strong>Olá, {name}!</strong>
				</p>
				<p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
				<p>Clique no botão abaixo para criar uma nova senha:</p>
				<div style={{ textAlign: 'center', margin: '30px 0' }}>
					<a
						href={url}
						target="_blank"
						style={{
							backgroundColor: '#3b82f6',
							color: '#ffffff',
							padding: '12px 24px',
							borderRadius: '6px',
							textDecoration: 'none',
							fontWeight: 'bold',
							display: 'inline-block',
						}}
						rel="noopener"
					>
						Redefinir Senha
					</a>
				</div>
				<p>Se você não solicitou a redefinição, ignore este e-mail. Sua senha permanecerá inalterada.</p>
			</div>
		</Layout>
	)
}

export async function renderResetPasswordEmail(props: ResetPasswordEmailProps): Promise<Omit<MailMessage, 'to'>> {
	return {
		subject: `${ProductConfig.env.PRODUCT_NAME} — Redefina sua senha`,
		body: await render(<ResetPasswordEmailHtml {...props} />),
	}
}
