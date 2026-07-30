-- DECISION (Fase 4 review, 27-jul): this CREATE+DROP intentionally discards every row already in
-- `terminal_terminal_llm_sessions` — there is no INSERT...SELECT backfilling `agent_agent_sessions`.
-- This is NOT decision (d) "fresh start" from GOAL-agent-abstraction.md §1.2 — that decision covers
-- only the one-time PGlite→SQLite substrate flip (Fase 0), where the new SQLite file starts empty by
-- construction. This table has been living in that SQLite substrate since Fase 0 and may hold rows
-- from real turns by the time this migration runs, so the drop is a SEPARATE decision, made here:
--   (1) pre-release branch — no deployed instance has a user depending on a resumed CLI session
--       surviving a migration deploy.
--   (2) a row here is a RESUMABILITY CACHE, not a record of business fact: losing it never loses
--       conversation data (the transcript lives in `thread`), it only costs the next turn its
--       `--resume` and sends it down the same "no existing session" path a brand-new issue already
--       takes (`AgentSession.create`, never `resumeDecision`) — i.e. AC-4.2's guards already handle
--       this exact shape of degradation by design.
--   (3) there is no safe backfill for the two premises the new schema adds: `model` would have to be
--       invented (no prior column recorded which model a `claudeSessionId` ran under) and a row
--       carried forward under a guessed value can fail `MODEL_CHANGED` on its very first comparison —
--       worse than a row that never existed, which instead takes the clean "no existing session" path.
-- If this table ever needs to carry rows across a migration, this decision must be re-made explicitly
-- for that migration — it is not standing precedent.
CREATE TABLE `agent_agent_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`provider` text NOT NULL,
	`cwd` text NOT NULL,
	`agent_session_id` text NOT NULL,
	`model` text DEFAULT 'DEFAULT' NOT NULL,
	`last_message_id` text,
	`last_turn_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "agent_agent_sessions_provider_check" CHECK("agent_agent_sessions"."provider" IN ('CLAUDE_CODE', 'CODEX', 'OPENCODE')),
	CONSTRAINT "agent_agent_sessions_model_check" CHECK("agent_agent_sessions"."model" IN ('DEFAULT', 'SONNET', 'OPUS', 'HAIKU'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sessions_issue_unq` ON `agent_agent_sessions` (`issue_id`);--> statement-breakpoint
CREATE INDEX `agent_sessions_last_turn_idx` ON `agent_agent_sessions` (`last_turn_at`);--> statement-breakpoint
DROP TABLE `terminal_terminal_llm_sessions`;