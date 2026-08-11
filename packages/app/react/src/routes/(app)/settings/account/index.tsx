import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/console/PageHeader'
import { CloudAccountSection } from './-components/CloudAccountSection'
import { PreferencesSection } from './-components/PreferencesSection'
import { ProfileSection } from './-components/ProfileSection'
import { SecuritySection } from './-components/SecuritySection'

export const Route = createFileRoute('/(app)/settings/account/')({
	staticData: { breadcrumb: 'Minha Conta' },
	component: RouteComponent,
})

/**
 * D3 (jxl4Y, JcWnl group) — same masthead + max-width shell as Tarefas/Configurações, its two
 * neighbors in this design group (`mx-auto max-w-4xl px-6 pb-16 pt-20`). Section order matches the
 * design: Perfil → Preferências → Segurança. `CloudAccountSection` (logout) trails last — the design
 * doesn't picture it, but it's a safety capability the code keeps regardless (see its own note).
 */
function RouteComponent() {
	const { t } = useTranslation()

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 pb-16 pt-20">
			<PageHeader title={t('account.header.title')} />
			<ProfileSection />
			<PreferencesSection />
			<SecuritySection />
			<CloudAccountSection />
		</div>
	)
}
