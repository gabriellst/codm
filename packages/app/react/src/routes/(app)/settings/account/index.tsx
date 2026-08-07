import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AccountHeaderSection } from './-components/AccountHeaderSection'
import { CloudAccountSection } from './-components/CloudAccountSection'
import { SecuritySection } from './-components/SecuritySection'

export const Route = createFileRoute('/(app)/settings/account/')({
	staticData: { breadcrumb: 'Minha Conta' },
	component: RouteComponent,
})

function RouteComponent() {
	const { t } = useTranslation()

	return (
		<div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
			<AccountHeaderSection title={t('account.header.title')} />
			<CloudAccountSection />
			<SecuritySection />
		</div>
	)
}
