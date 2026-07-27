# Representative frames — VERBATIM from the real capture

One line per distinct observed frame shape. Lines are byte-for-byte from `raw/*.jsonl` except where
explicitly marked TRUNCATED (only the two giant SessionStart hook frames).

### `system/hook_started`  _(from `raw/s1-text.jsonl`, line length 252)_

```json
{"type":"system","subtype":"hook_started","hook_id":"2021cdde-366a-4fda-8642-5ea85df8c39f","hook_name":"SessionStart:startup","hook_event":"SessionStart","uuid":"c4a99044-b15a-488f-bbd8-403f8566710a","session_id":"2e564f1b-2b2a-4929-83c1-e2e84a9290f4"}
```

### `system/hook_response`  _(from `raw/s1-text.jsonl`, line length 7553)_

```json
{"type":"system","subtype":"hook_response","hook_id":"2021cdde-366a-4fda-8642-5ea85df8c39f","hook_name":"SessionStart:startup","hook_event":"SessionStart","output":"{\n  \"hookSpecificOutput\": {\n    \"hookEventName\": \"SessionStart\",\n    \"additionalContext\": \"<EXTREMELY_IMPORTANT>\\nYou have superpowers.\\n\\n**Below is the full content of your 'superpowers:using-superpowers' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\\n\\n---\\nname: using-superpowers\\ndescription: Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying questions\\n---\\n\\n<SUBAGENT-STOP>\\nIf you were dispatched as a subagent to execute a specific task, ignore this skill.\\n</SUBAGENT-STOP>\\n\\n<EXTREMELY-IMPORTANT>\\nIf you think there is even a 1% chance a skill might apply …<TRUNCATED 6653 chars for readability; full line in raw/s1-text.jsonl>
```

### `system/init`  _(from `raw/s1-text.jsonl`, line length 5555)_

```json
{"type":"system","subtype":"init","cwd":"/private/var/folders/dq/jxsqcqgx2bx8sqx0vgqwl8h00000gn/T/p2-s1-text-Elyv8J","session_id":"2e564f1b-2b2a-4929-83c1-e2e84a9290f4","tools":["Task","Bash","CronCreate","CronDelete","CronList","DesignSync","Edit","EnterWorktree","ExitWorktree","Monitor","NotebookEdit","PushNotification","Read","RemoteTrigger","ReportFindings","ScheduleWakeup","SendMessage","Skill","TaskCreate","TaskGet","TaskList","TaskOutput","TaskStop","TaskUpdate","ToolSearch","WebFetch","WebSearch","Workflow","Write","mcp__railway__add_reference_variable","mcp__railway__connect_service_source","mcp__railway__create_bucket","mcp__railway__create_environment","mcp__railway__create_project","mcp__railway__create_service","mcp__railway__create_tcp_proxy","mcp__railway__create_volume","mcp__railway__delete_domain","mcp__railway__deploy","mcp__railway__deploy_template","mcp__railway__dis …<TRUNCATED 4655 chars for readability; full line in raw/s1-text.jsonl>
```

### `assistant:text`  _(from `raw/s1-text.jsonl`, line length 738)_

```json
{"type":"assistant","message":{"model":"claude-opus-5","id":"msg_011CdSnJ7J1bHQf7Q4ztPNW8","type":"message","role":"assistant","content":[{"type":"text","text":"SMOKE-OK"}],"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":2,"cache_creation_input_tokens":9188,"cache_read_input_tokens":15273,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":9188},"output_tokens":1,"service_tier":"standard","inference_geo":"not_available"},"diagnostics":null,"context_management":null},"parent_tool_use_id":null,"session_id":"2e564f1b-2b2a-4929-83c1-e2e84a9290f4","uuid":"42f21462-beec-410e-abe2-f666e4527553","timestamp":"2026-07-27T15:15:21.597Z","request_id":"req_011CdSnJ4g111p1nNsztKxKe"}
```

### `rate_limit_event`  _(from `raw/s1-text.jsonl`, line length 309)_

```json
{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1785180600,"rateLimitType":"five_hour","overageStatus":"rejected","overageDisabledReason":"org_level_disabled","isUsingOverage":false},"uuid":"965e4027-1ad5-4fa8-9b20-d4cbd51c787c","session_id":"2e564f1b-2b2a-4929-83c1-e2e84a9290f4"}
```

### `result/success`  _(from `raw/s1-text.jsonl`, line length 1330)_

```json
{"is_error":false,"duration_api_ms":2212,"num_turns":1,"stop_reason":"end_turn","session_id":"2e564f1b-2b2a-4929-83c1-e2e84a9290f4","total_cost_usd":0.0997765,"usage":{"input_tokens":2,"cache_creation_input_tokens":9188,"cache_read_input_tokens":15273,"output_tokens":10,"server_tool_use":{"web_search_requests":0,"web_fetch_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":9188,"ephemeral_5m_input_tokens":0},"inference_geo":"not_available","iterations":[{"input_tokens":2,"output_tokens":10,"cache_read_input_tokens":15273,"cache_creation_input_tokens":9188,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":9188},"type":"message"}],"speed":"standard"},"modelUsage":{"claude-opus-5[1m]":{"inputTokens":2,"outputTokens":10,"cacheReadInputTokens":15273,"cacheCreationInputTokens":9188,"webSearchRequests":0,"costUSD":0.0997765,"contextWin …<TRUNCATED 430 chars for readability; full line in raw/s1-text.jsonl>
```

### `assistant:tool_use`  _(from `raw/s2-tool.jsonl`, line length 914)_

```json
{"type":"assistant","message":{"model":"claude-opus-5","id":"msg_011CdSnJN3XKcgnKY7ud2PzZ","type":"message","role":"assistant","content":[{"type":"tool_use","id":"toolu_014gZzVmz9aD3PJw93yUXYWy","name":"Read","input":{"file_path":"/private/var/folders/dq/jxsqcqgx2bx8sqx0vgqwl8h00000gn/T/p2-s2-tool-vSzKeb/target.txt"},"caller":{"type":"direct"}}],"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":2,"cache_creation_input_tokens":9186,"cache_read_input_tokens":15273,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":9186},"output_tokens":44,"service_tier":"standard","inference_geo":"not_available"},"diagnostics":null,"context_management":null},"parent_tool_use_id":null,"session_id":"a8002833-e33e-4e72-81e1-f4d381dbebbf","uuid":"04f0815b-6dd3-42c1-a3eb-78031bf3f33a","timestamp":"2026-07-27T15:15:26.695Z","request_id":"req_011CdSnJKWia …<TRUNCATED 14 chars for readability; full line in raw/s2-tool.jsonl>
```

### `user:tool_result`  _(from `raw/s2-tool.jsonl`, line length 532)_

```json
{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_014gZzVmz9aD3PJw93yUXYWy","type":"tool_result","content":"1\tSMOKE-TOOL-OK\n2\t"}]},"parent_tool_use_id":null,"session_id":"a8002833-e33e-4e72-81e1-f4d381dbebbf","uuid":"39db15ed-3778-41e3-aa01-2b458f3683ca","timestamp":"2026-07-27T15:15:26.712Z","tool_use_result":{"type":"text","file":{"filePath":"/private/var/folders/dq/jxsqcqgx2bx8sqx0vgqwl8h00000gn/T/p2-s2-tool-vSzKeb/target.txt","content":"SMOKE-TOOL-OK\n","numLines":2,"startLine":1,"totalLines":2}}}
```

### `system/thinking_tokens`  _(from `raw/s3-subagent.jsonl`, line length 193)_

```json
{"type":"system","subtype":"thinking_tokens","estimated_tokens":50,"estimated_tokens_delta":50,"uuid":"4b2366c8-2e9f-4cb3-87e1-4d9850bbacf6","session_id":"861a7a4f-e951-4210-847e-5b48167ca7e0"}
```

### `assistant:thinking`  _(from `raw/s3-subagent.jsonl`, line length 1545)_

```json
{"type":"assistant","message":{"model":"claude-opus-5","id":"msg_011CdSnK1iRkz1JeA6uSiAKX","type":"message","role":"assistant","content":[{"type":"thinking","thinking":"","signature":"CAISyQQKhwEIEBgCKkDibgLhewT5ST9xVvZ9zoWwRP1cLLv5CSQLo0V/WnqiiGXlK9XrKR7G3Za71/+iMA7VUdsGvHSqBR2jZph7oC9sMg1jbGF1ZGUtb3B1cy01OAFCCHRoaW5raW5nWiQyZmJjNjk2Zi1lNGI1LTQ4ZTItOTc0YS0yNjg1N2M1MjJjNTYSDPAoz+YS+5MqH5ti6xoMhvt30pWTua826dWaIjBsm/ZgU2CrY8nzxgEMh4kdxVfuEVK5XNuXRho/b6pv1NyhmZkhhurT+dfZ1v2J5QUq7gKTDekhogF2w6OvGFqMjySWYx+W3NYZPTwQinf2xr0MpF4YcB6WZKCRhDuxlocX9635WUYnSWunBT/PXosWWQnEY1WiBqWcqU64Bi3tEtExC9m7yl8K4DsR7TI+T1KkvA+mTP3jJJo5i/Q4GnSUbaWbdx6zo8OrQ/bjZUzuisUZ1WxYwW9ZJny4Lnm8GQNlbnGycqm/lmOnS7DMKNg1QB5Socb3goA9r5yKchXCQ5uOhCh0cFBgaX23m/nMIjBxTHD9gtfnCKHz8aBIILLgOczbArP30w2uQ1PwkwtQ8xJQMUQ0L6PnorTg4MFoFk7mTwveMhHrP4RIceuRXVSWpDP9oG2i0HD8JEPzhIQvHuyhR2F0Kz6jqNwatnP+KAT8QHkzgnWsuN3hYMXcSquBK0QCkYGeJzterM5N …<TRUNCATED 645 chars for readability; full line in raw/s3-subagent.jsonl>
```

### `system/task_started`  _(from `raw/s3-subagent.jsonl`, line length 548)_

```json
{"type":"system","subtype":"task_started","task_id":"a800822ce7116df2a","tool_use_id":"toolu_01WpAVhnCvdR8Ywmh4rK4jed","description":"Read target.txt word","subagent_type":"general-purpose","task_type":"local_agent","prompt":"Read the file target.txt in the current working directory (/private/var/folders/dq/jxsqcqgx2bx8sqx0vgqwl8h00000gn/T/p2-s3-subagent-LEE4nA) and report the single word it contains. Return only that word as your final output.","uuid":"702f882c-a650-43b2-8209-44fe66da111f","session_id":"861a7a4f-e951-4210-847e-5b48167ca7e0"}
```

### `user:text:SUBAGENT`  _(from `raw/s3-subagent.jsonl`, line length 568)_

```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Read the file target.txt in the current working directory (/private/var/folders/dq/jxsqcqgx2bx8sqx0vgqwl8h00000gn/T/p2-s3-subagent-LEE4nA) and report the single word it contains. Return only that word as your final output."}]},"parent_tool_use_id":"toolu_01WpAVhnCvdR8Ywmh4rK4jed","session_id":"861a7a4f-e951-4210-847e-5b48167ca7e0","uuid":"b7fbdc96-d6b9-4a36-a6ee-72a102f9ba63","timestamp":"2026-07-27T15:15:38.145Z","subagent_type":"general-purpose","task_description":"Read target.txt word"}
```

### `system/task_progress`  _(from `raw/s3-subagent.jsonl`, line length 375)_

```json
{"type":"system","subtype":"task_progress","task_id":"a800822ce7116df2a","tool_use_id":"toolu_01WpAVhnCvdR8Ywmh4rK4jed","description":"Reading target.txt","subagent_type":"general-purpose","usage":{"total_tokens":11330,"tool_uses":1,"duration_ms":8149},"last_tool_name":"Read","uuid":"0162cf1a-c927-4d79-8cdf-588a7f21999e","session_id":"861a7a4f-e951-4210-847e-5b48167ca7e0"}
```

### `assistant:tool_use:SUBAGENT`  _(from `raw/s3-subagent.jsonl`, line length 1019)_

```json
{"type":"assistant","message":{"model":"claude-opus-5","id":"msg_011CdSnKTUjDUyPe1cQTBYDF","type":"message","role":"assistant","content":[{"type":"tool_use","id":"toolu_01Lk5FWepugEwseNuuYMEYi2","name":"Read","input":{"file_path":"/private/var/folders/dq/jxsqcqgx2bx8sqx0vgqwl8h00000gn/T/p2-s3-subagent-LEE4nA/target.txt"},"caller":{"type":"direct"}}],"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":2,"cache_creation_input_tokens":11324,"cache_read_input_tokens":0,"cache_creation":{"ephemeral_5m_input_tokens":11324,"ephemeral_1h_input_tokens":0},"output_tokens":2,"service_tier":"standard","inference_geo":"not_available"},"diagnostics":null,"context_management":null},"parent_tool_use_id":"toolu_01WpAVhnCvdR8Ywmh4rK4jed","session_id":"861a7a4f-e951-4210-847e-5b48167ca7e0","uuid":"2d8e5c26-d1d5-4c2b-bb2f-86f4ad9fb57e","timestamp":"2026-07-27T15:15:46.292Z"," …<TRUNCATED 119 chars for readability; full line in raw/s3-subagent.jsonl>
```

### `user:tool_result:SUBAGENT`  _(from `raw/s3-subagent.jsonl`, line length 428)_

```json
{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_01Lk5FWepugEwseNuuYMEYi2","type":"tool_result","content":"1\tSMOKE-SUBAGENT-OK\n2\t"}]},"parent_tool_use_id":"toolu_01WpAVhnCvdR8Ywmh4rK4jed","session_id":"861a7a4f-e951-4210-847e-5b48167ca7e0","uuid":"14d603c7-8f2e-4797-aab2-120228c6f228","timestamp":"2026-07-27T15:15:46.298Z","subagent_type":"general-purpose","task_description":"Read target.txt word"}
```

### `system/task_updated`  _(from `raw/s3-subagent.jsonl`, line length 226)_

```json
{"type":"system","subtype":"task_updated","task_id":"a800822ce7116df2a","patch":{"status":"completed","end_time":1785165347611},"uuid":"234ac3ce-ec9c-4629-afc5-a77704843410","session_id":"861a7a4f-e951-4210-847e-5b48167ca7e0"}
```

### `system/task_notification`  _(from `raw/s3-subagent.jsonl`, line length 524)_

```json
{"type":"system","subtype":"task_notification","task_id":"a800822ce7116df2a","tool_use_id":"toolu_01WpAVhnCvdR8Ywmh4rK4jed","status":"completed","output_file":"/private/tmp/claude-501/-private-var-folders-dq-jxsqcqgx2bx8sqx0vgqwl8h00000gn-T-p2-s3-subagent-LEE4nA/861a7a4f-e951-4210-847e-5b48167ca7e0/tasks/a800822ce7116df2a.output","summary":"SMOKE-SUBAGENT-OK","usage":{"total_tokens":12400,"tool_uses":1,"duration_ms":9468},"uuid":"d5aef99e-4936-4c63-b31a-7c9417e272c2","session_id":"861a7a4f-e951-4210-847e-5b48167ca7e0"}
```

### `system/status`  _(from `raw/s4-partial.jsonl`, line length 156)_

```json
{"type":"system","subtype":"status","status":"requesting","uuid":"cb777a53-7228-4237-8854-72ee388b7978","session_id":"4c3a88c5-6593-4593-8b84-7a970bb0e815"}
```

### `stream_event:message_start`  _(from `raw/s4-partial.jsonl`, line length 647)_

```json
{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-opus-5","id":"msg_011CdSnLLFRZ5pTQ22nZEFX5","type":"message","role":"assistant","content":[],"stop_reason":null,"stop_sequence":null,"stop_details":null,"usage":{"input_tokens":2,"cache_creation_input_tokens":9358,"cache_read_input_tokens":15273,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":9358},"output_tokens":1,"service_tier":"standard","inference_geo":"not_available"},"diagnostics":null}},"session_id":"4c3a88c5-6593-4593-8b84-7a970bb0e815","parent_tool_use_id":null,"uuid":"d6306f05-3621-45c0-8acf-0cf56f642e37","ttft_ms":1085}
```

### `stream_event:content_block_start`  _(from `raw/s4-partial.jsonl`, line length 238)_

```json
{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}},"session_id":"4c3a88c5-6593-4593-8b84-7a970bb0e815","parent_tool_use_id":null,"uuid":"3631f1f7-c310-4d46-a157-1d03c2379637"}
```

### `stream_event:content_block_delta`  _(from `raw/s4-partial.jsonl`, line length 240)_

```json
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"part"}},"session_id":"4c3a88c5-6593-4593-8b84-7a970bb0e815","parent_tool_use_id":null,"uuid":"70720c67-605c-4fcf-b37a-663f33bc0efb"}
```

### `stream_event:content_block_stop`  _(from `raw/s4-partial.jsonl`, line length 195)_

```json
{"type":"stream_event","event":{"type":"content_block_stop","index":0},"session_id":"4c3a88c5-6593-4593-8b84-7a970bb0e815","parent_tool_use_id":null,"uuid":"6bf5ef0a-23c3-40db-a24c-cbfe49cba418"}
```

### `stream_event:message_delta`  _(from `raw/s4-partial.jsonl`, line length 676)_

```json
{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null,"stop_details":null},"usage":{"input_tokens":2,"cache_creation_input_tokens":9358,"cache_read_input_tokens":15273,"output_tokens":13,"output_tokens_details":{"thinking_tokens":0},"iterations":[{"input_tokens":2,"output_tokens":13,"cache_read_input_tokens":15273,"cache_creation_input_tokens":9358,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":9358},"type":"message"}]},"context_management":{"applied_edits":[]}},"session_id":"4c3a88c5-6593-4593-8b84-7a970bb0e815","parent_tool_use_id":null,"uuid":"40addf96-e34e-4720-963c-27891adf3fa1"}
```

### `stream_event:message_stop`  _(from `raw/s4-partial.jsonl`, line length 179)_

```json
{"type":"stream_event","event":{"type":"message_stop"},"session_id":"4c3a88c5-6593-4593-8b84-7a970bb0e815","parent_tool_use_id":null,"uuid":"ec6ebf9c-aa0d-4831-a2fc-b5842e9a5677"}
```

