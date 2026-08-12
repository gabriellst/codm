import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/console/PageHeader'
import { cn } from '@/lib/utils'
import { ProvidersSection } from '../ProvidersSection'
import { GeneralSection } from '../GeneralSection'
import { TelemetrySection } from '../TelemetrySection'

/**
 * Provedores, consentimento de telemetria e preferências gerais (T08, SP4). Cada subseção é dona da
 * própria leitura.
 *
 * OS CRITÉRIOS DE PARADA SAÍRAM DAQUI (founder, 08/08/2026): "em tese todos os critérios são
 * válidos". Uma tela de configuração cujas quatro chaves deveriam estar todas ligadas não é uma
 * configuração — é um lugar onde o operador pode desligar sem querer algo que o produto precisa que
 * fique ligado. O backend continua com o campo e o `RaiseStop` continua lendo a política; o que
 * saiu foi a superfície de EDIÇÃO.
 *
 * D3 (cixrK) — the `<Separator />` between subsections is gone: each subsection now carries its
 * own header hairline (`sectionLabel`/the header's own `border-b`), so a second line between them
 * doubled up what the design never shows. The `gap-8` flex spacing is the only separator left.
 */
export function SettingsSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div className={cn('mx-auto flex w-full flex-col gap-8 px-6 pb-16 pt-20', className)} {...props}>
			<PageHeader title={t('settings.title')} />
			<ProvidersSection />
			<TelemetrySection />
			<GeneralSection />
		</div>
	)
}
