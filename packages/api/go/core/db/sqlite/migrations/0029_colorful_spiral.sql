CREATE TABLE `agent_mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`key` text NOT NULL,
	`transport` text NOT NULL,
	`command` text,
	`args` text,
	`env` text,
	`url` text,
	`headers` text,
	`enabled` integer DEFAULT true NOT NULL,
	`approval_policy` text DEFAULT 'ASK' NOT NULL,
	`tool_policies` text,
	`added_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "agent_mcp_servers_transport_check" CHECK("agent_mcp_servers"."transport" IN ('STDIO', 'HTTP')),
	CONSTRAINT "agent_mcp_servers_policy_check" CHECK("agent_mcp_servers"."approval_policy" IN ('AUTO', 'ASK'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_mcp_servers_owner_key_unq` ON `agent_mcp_servers` (`owner_id`,`key`);--> statement-breakpoint
CREATE INDEX `agent_mcp_servers_owner_idx` ON `agent_mcp_servers` (`owner_id`);--> statement-breakpoint
CREATE TABLE `agent_mcp_tool_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`server_key` text NOT NULL,
	`tool_name` text NOT NULL,
	`call_hash` text NOT NULL,
	`call_arguments` text NOT NULL,
	`decision` text,
	`stop_id` text NOT NULL,
	`requested_at` integer NOT NULL,
	`settled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "agent_mcp_tool_approvals_decision_check" CHECK("agent_mcp_tool_approvals"."decision" IN ('APPROVED', 'DENIED'))
);
--> statement-breakpoint
CREATE INDEX `agent_mcp_tool_approvals_lookup_idx` ON `agent_mcp_tool_approvals` (`issue_id`,`call_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_mcp_tool_approvals_stop_unq` ON `agent_mcp_tool_approvals` (`stop_id`);