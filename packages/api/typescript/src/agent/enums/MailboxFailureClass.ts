/**
 * WHY A QUEUE ITEM'S TURN FAILED (fase 5, item 2) — declared by whoever records the failure, never read off the
 * error's text. It picks the retry schedule (`RETRY_SCHEDULE`, by lane and class) and, once the schedule is spent,
 * the stop that asks someone (`STOP_OF_FAILURE`).
 *  - `PROVIDER_ERROR` — the provider failed the turn (a server error, an overload).
 *  - `CLI_LOGIN` — the provider CLI needs a login; time alone does not fix it.
 *  - `CRASH` — the turn threw.
 *  - `ABANDONED` — the turn passed the hard ceiling and was abandoned (it may still be alive).
 */
export enum MailboxFailureClass {
	PROVIDER_ERROR = 'PROVIDER_ERROR',
	CLI_LOGIN = 'CLI_LOGIN',
	CRASH = 'CRASH',
	ABANDONED = 'ABANDONED',
}
