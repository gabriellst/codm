import { describe, expect, it } from 'bun:test'
import { resolveJobCadence } from '@codm/core-typescript'
import { AutoArchiveCompletedIssues } from './AutoArchiveCompletedIssues'

/**
 * THE CADENCE, asserted where the job lives.
 *
 * This came out of `tests/architecture/job-cadence.test.ts` JOB-02 on 2026-08-18. That rail proves
 * the STRUCTURAL rule — a cadence lives on the job, never in the barrel — and it proved it by
 * importing three concrete job classes from three different contexts, which made a portable rail
 * depend on this product having those three jobs. The structural half stayed there and is now
 * derived from the barrels; this half, "MY cadence is exactly this", is product knowledge and
 * belongs with the job it describes.
 *
 * It is not redundant with the rail: the rail can only check that SOME cadence exists. Only this
 * assertion catches the value silently changing — an hour becoming a millisecond keeps every
 * structural check green while hammering the database.
 *
 * A separate file rather than an addition to a suite, because this use case has no colocated tests
 * of its own yet; when it grows some, this belongs inside them.
 */
describe('AutoArchiveCompletedIssues — cadence', () => {
	it('repeats hourly', () => {
		expect(resolveJobCadence({ handler: AutoArchiveCompletedIssues })).toEqual({ every: 60 * 60 * 1000 })
	})
})
