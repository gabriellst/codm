import { render } from '@react-email/render'
import { Layout } from '@shared/services/MailSender/components/Layout'
import type { Language } from '@template/contracts-typescript/wire/enums'

import type { DeclineClass } from '@billing/services/DeclineClassifier'

import { BILLING_MESSAGES } from '@billing/i18n'
import { DeclineReason, PlanName } from '@template/contracts-typescript/wire/enums'

interface DunningStartedProps {
	phase: 'started'
	ownerId: string
	invoiceId: string
	planName: PlanName
	amountCents: number
	declineCode?: DeclineReason
	classification: DeclineClass
	attemptNo: number
	maxAttempts: number
	nextRetryAt: string | null
}

interface DunningAttemptProps {
	phase: 'attempt'
	ownerId: string
	invoiceId: string
	attemptNo: number
	remainingAttempts: number
	declineCode?: DeclineReason
	nextRetryAt: string | null
}

interface DunningSucceededProps {
	phase: 'succeeded'
	ownerId: string
	invoiceId: string
	totalAttempts: number
	recoveredVia: 'retry' | 'manual'
}

interface DunningFailedProps {
	phase: 'failed'
	ownerId: string
	invoiceId: string
	totalAttempts: number
	finalDeclineCode?: DeclineReason
}

/**
 * One variant per dunning lifecycle phase (Decision 9/10) — mirrors DunningStartedEvent /
 * DunningAttemptFailedEvent / DunningSucceededEvent / DunningFailedEvent payloads exactly, plus
 * the owner's resolved language. `phase` is the discriminant both the notifier and the template
 * switch on.
 */
export type DunningEmailProps = (DunningStartedProps | DunningAttemptProps | DunningSucceededProps | DunningFailedProps) & {
	/** Owner's language — copy falls back to PT when absent or not shipped by the catalog. */
	language?: Language | null
}

/** Classified decline → the specific issuer-reported cause; unknown → generic causes. */
const DeclineCauseLine = ({ declineCode, language }: { declineCode?: DeclineReason; language?: Language | null }) => (
	<p>
		{declineCode ? BILLING_MESSAGES.dunningReasonLine(language, { code: declineCode }) : BILLING_MESSAGES.dunningCauseGeneric(language)}
	</p>
)

/** Next scheduled retry, or a "no more automatic attempts" notice when there isn't one. */
const NextRetryLine = ({ nextRetryAt, language }: { nextRetryAt: string | null; language?: Language | null }) => (
	<p>
		{nextRetryAt ? BILLING_MESSAGES.dunningNextRetryLine(language, { nextRetryAt }) : BILLING_MESSAGES.dunningNoMoreRetriesLine(language)}
	</p>
)

/**
 * Shared tail for the 'started' and 'attempt' phases (Defect #9): decline cause + next retry +
 * body paragraphs are identical between the two — only the intro line differs per phase, so it
 * stays in each case below.
 */
const DunningRetryTail = ({
	declineCode,
	nextRetryAt,
	language,
}: {
	declineCode?: DeclineReason
	nextRetryAt: string | null
	language?: Language | null
}) => (
	<>
		<DeclineCauseLine declineCode={declineCode} language={language} />
		<NextRetryLine nextRetryAt={nextRetryAt} language={language} />
		{BILLING_MESSAGES.dunningBody(language).map(paragraph => (
			<p key={paragraph}>{paragraph}</p>
		))}
	</>
)

const DunningEmailBody = (props: DunningEmailProps) => {
	const { language } = props

	switch (props.phase) {
		case 'started':
			return (
				<>
					<p>{BILLING_MESSAGES.dunningIntro(language, { invoiceId: props.invoiceId })}</p>
					<DunningRetryTail declineCode={props.declineCode} nextRetryAt={props.nextRetryAt} language={language} />
				</>
			)
		case 'attempt':
			return (
				<>
					<p>{BILLING_MESSAGES.dunningAttemptIntro(language, { invoiceId: props.invoiceId, attemptNo: props.attemptNo })}</p>
					<DunningRetryTail declineCode={props.declineCode} nextRetryAt={props.nextRetryAt} language={language} />
				</>
			)
		case 'succeeded':
			return (
				<>
					<p>{BILLING_MESSAGES.dunningSucceededIntro(language, { invoiceId: props.invoiceId })}</p>
					{BILLING_MESSAGES.dunningSucceededBody(language).map(paragraph => (
						<p key={paragraph}>{paragraph}</p>
					))}
				</>
			)
		case 'failed':
			return (
				<>
					<p>{BILLING_MESSAGES.dunningFailedIntro(language, { invoiceId: props.invoiceId })}</p>
					{props.finalDeclineCode && <DeclineCauseLine declineCode={props.finalDeclineCode} language={language} />}
					{BILLING_MESSAGES.dunningFailedBody(language).map(paragraph => (
						<p key={paragraph}>{paragraph}</p>
					))}
				</>
			)
	}
}

/**
 * Dunning notice — one variant per lifecycle phase, sent so the owner can update or retry their
 * payment method before (or learn that) the subscription lapses.
 */
const DunningEmailHtml = (props: DunningEmailProps) => {
	return (
		<Layout>
			<div>
				<p>
					<strong>{BILLING_MESSAGES.dunningGreeting(props.language)}</strong>
				</p>
				<DunningEmailBody {...props} />
				<p>{BILLING_MESSAGES.signoff(props.language)}</p>
				<p>
					<strong>{BILLING_MESSAGES.team(props.language)}</strong>
				</p>
			</div>
		</Layout>
	)
}

export class DunningEmail {
	constructor(private readonly props: DunningEmailProps) {}

	async getSubject() {
		switch (this.props.phase) {
			case 'started':
				return BILLING_MESSAGES.dunningSubject(this.props.language)
			case 'attempt':
				return BILLING_MESSAGES.dunningAttemptSubject(this.props.language)
			case 'succeeded':
				return BILLING_MESSAGES.dunningSucceededSubject(this.props.language)
			case 'failed':
				return BILLING_MESSAGES.dunningFailedSubject(this.props.language)
		}
	}

	async getBody() {
		return render(<DunningEmailHtml {...this.props} />)
	}
}
