import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/console/PageHeader'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { ProvidersSection } from '../ProvidersSection'
import { GeneralSection } from '../GeneralSection'

/**
 * Provedores e preferências gerais (T08). Cada subseção é dona da própria leitura.
 *
 * OS CRITÉRIOS DE PARADA SAÍRAM DAQUI (founder, 08/08/2026): "em tese todos os critérios são
 * válidos". Uma tela de configuração cujas quatro chaves deveriam estar todas ligadas não é uma
 * configuração — é um lugar onde o operador pode desligar sem querer algo que o produto precisa que
 * fique ligado. O backend continua com o campo; ver o relatório da rodada.
 */
export function SettingsSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div className={cn('mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-16 pt-20', className)} {...props}>
			<PageHeader title={t('settings.title')} />
			<ProvidersSection />
			<Separator />
			<GeneralSection />
		</div>
	)
}
