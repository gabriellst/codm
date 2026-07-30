// Context-private facts BC5 owns and BRIDGES to frozen integration events. (Execution facts —
// opened / completed — are published by the terminal engine; BC5 reacts to those, it does not
// re-publish them.)
//
// `issue.stop_resolved` left in B4 (spec decision 4): the Stop is a child of the `Thread` aggregate,
// so the fact is `thread.stop_resolved` and lives in `thread/events/`.
export * from './IssueArchivedEvent'
