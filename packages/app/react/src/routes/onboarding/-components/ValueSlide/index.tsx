import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowRight } from '@tabler/icons-react'
import type { ProviderKind } from '@codedm/client-typescript/typescript'
import { CHANNEL_KINDS, channelGlyph, providerGlyph } from '@/components/console/glyphs'
import { cn } from '@/lib/utils'

const PROVIDER_KINDS: ProviderKind[] = ['CLAUDE_CODE', 'CODEX', 'OPENCODE']

/** Slide 1 — the value prop: the channels the product speaks to, feeding the coding agents. */
export function ValueSlide({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div className={cn('flex flex-col items-center gap-6', className)} {...props}>
			<div className="flex items-center gap-3">
				{CHANNEL_KINDS.map(kind => {
					const Glyph = channelGlyph[kind]
					return (
						<span key={kind} className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
							<Glyph className="size-5" />
						</span>
					)
				})}
				<IconArrowRight className="size-6 text-foreground" />
				{PROVIDER_KINDS.map(kind => {
					const Glyph = providerGlyph[kind]
					return (
						<span key={kind} className="flex size-12 items-center justify-center rounded-full border border-border text-foreground">
							<Glyph className="size-5" />
						</span>
					)
				})}
			</div>
			<h1 className="heading-display text-4xl text-foreground md:text-5xl">{t('onboarding.slide1Title')}</h1>
			<p className="text-muted-foreground">{t('onboarding.slide1Body')}</p>
		</div>
	)
}
