DROP INDEX `agent_mcp_tool_approvals_lookup_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_mcp_tool_approvals_call_unq` ON `agent_mcp_tool_approvals` (`issue_id`,`call_hash`);