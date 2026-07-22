import { useTranslation } from 'react-i18next'
import type { ThreadStatus } from '@codedm/client-typescript/typescript'
import { Chip } from './Chip'
import { threadStatusLabelKey } from './glyphs'
import { ThreadStatusDot } from './StatusDot'

/** Thread status as a dotted chip — solid black while RUNNING, hairline otherwise. */
export function StatusChip({ status }: { status: ThreadStatus }) {
	const { t } = useTranslation()
	return (
		<Chip
			tone={status === 'RUNNING' ? 'solid' : 'outline'}
			leading={<ThreadStatusDot status={status} />}
			label={t(threadStatusLabelKey(status))}
		/>
	)
}
