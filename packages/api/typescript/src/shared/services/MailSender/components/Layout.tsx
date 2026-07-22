import { ProductConfig } from '@shared/config'
import type { ReactNode } from 'react'
import { Body, Container, Hr, Html, Section, Tailwind, Text, pixelBasedPreset } from '@react-email/components'

interface LayoutProps {
	children: ReactNode
}

/**
 * Shared chrome for transactional emails across all bounded contexts. Wraps
 * content in React Email's <Tailwind>, which inlines utility classes to style
 * attributes at render time (email clients don't honour <style>). The pixel
 * preset keeps spacing/typography in px rather than rem for client
 * compatibility. Individual emails live under their owning context's
 * services/MailSender/ and compose this Layout.
 */
export function Layout({ children }: LayoutProps) {
	return (
		<Tailwind config={{ presets: [pixelBasedPreset] }}>
			<Html lang="pt-BR">
				<Body className="bg-white font-sans text-[14px] font-normal leading-[17px] text-neutral-950">
					<Container className="mx-auto w-[600px]">
						<Section className="py-[40px] text-center text-[20px] font-semibold">{ProductConfig.env.PRODUCT_NAME}</Section>
						<Section className="px-[60px] pb-[40px] text-justify">{children}</Section>
						<Hr className="border-neutral-200" />
						<Section className="px-[60px] py-[20px] text-center">
							<Text className="m-0 text-[12px] text-neutral-500">© {ProductConfig.env.PRODUCT_NAME}. Todos os direitos reservados.</Text>
						</Section>
					</Container>
				</Body>
			</Html>
		</Tailwind>
	)
}
