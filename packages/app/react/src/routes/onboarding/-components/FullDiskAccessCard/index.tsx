// packages/app/react/src/routes/onboarding/-components/FullDiskAccessCard/index.tsx — COMPLETE final file.
// MANTENHA a forma do scaffold: export nomeado, props estendendo ComponentProps, `{ className, ...props }`, `cn(...)`.
import { IconLock } from '@tabler/icons-react'
import { type ComponentProps, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePreconditions } from '@/services'

/**
 * A EXPLICAÇÃO e o BOTÃO de uma pré-condição — as duas responsabilidades que sobram para o console.
 *
 * O `actionHint` fica ACIMA do botão e não é decoração: a spec (AC-6) exige que o operador saiba as
 * duas coisas que vão acontecer antes de clicar. A ordem — limpar a negação, depois abrir os
 * Ajustes — é o que ninguém adivinha (conceder sem limpar não funciona quando a negação já foi
 * gravada), e por isso ela vive DENTRO da ação em vez de virar um passo a passo para o operador
 * executar. O texto diz o que o botão faz; o botão faz.
 *
 * O reparo é pedido à PORTA, nunca a `commands.*`: quais são os passos e em que ordem é decisão do
 * host, e um componente que soubesse disso teria que ser reescrito junto do host a cada mudança.
 */
// O parâmetro tem default (`= {}`) porque este componente também é usado como `PreconditionModule.Component`
// (`() => ReactNode`, zero args — `PreconditionList` despacha via `<Component key={id} />`, sem props). Sem o
// default, a assinatura exige 1 argumento e a atribuição em `preconditions.ts` não compila (tsc: "Expected 1
// or more, but got 0"). `ComponentProps<'div'>` já é só campos opcionais, então `{}` é um valor válido.
export function FullDiskAccessCard({ className, ...props }: ComponentProps<'div'> = {}) {
	const { t } = useTranslation()
	const preconditions = usePreconditions()
	const [repairing, setRepairing] = useState(false)

	const repair = async () => {
		setRepairing(true)
		try {
			await preconditions.repair('FULL_DISK_ACCESS')
		} catch {
			toast.error(t('preconditions.repairFailed'))
		} finally {
			setRepairing(false)
		}
	}

	return (
		<div className={cn('flex w-full flex-col gap-4 rounded-asymmetric border border-border bg-card p-6 text-left', className)} {...props}>
			<div className="flex items-center gap-3">
				<span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
					<IconLock className="size-5" />
				</span>
				<h2 className="text-lg font-bold text-foreground">{t('preconditions.fullDiskAccess.title')}</h2>
			</div>

			<p className="text-sm text-muted-foreground">{t('preconditions.fullDiskAccess.body')}</p>
			<p className="text-sm text-muted-foreground">{t('preconditions.fullDiskAccess.actionHint')}</p>

			<Button onClick={repair} disabled={repairing} className="self-start">
				{t('preconditions.fullDiskAccess.action')}
			</Button>

			<p className="text-xs text-muted-foreground">{t('preconditions.fullDiskAccess.afterHint')}</p>
		</div>
	)
}
