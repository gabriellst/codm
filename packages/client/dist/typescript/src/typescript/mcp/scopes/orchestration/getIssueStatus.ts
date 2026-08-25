import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { GetIssueStatusQueryResponse, GetIssueStatusPathParams } from "../../../types/GetIssueStatus.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Status of one issue of this thread
 * {@link /v1/threads/:threadId/issues/:issueId/status}
 */
export async function getIssueStatusHandler({ threadId, issueId }: { threadId: GetIssueStatusPathParams["threadId"]; issueId: GetIssueStatusPathParams["issueId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetIssueStatusQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/threads/${threadId}/issues/${issueId}/status` })
  return {
              content: [
                {
                  type: 'text',
                  text: res.data === undefined ? 'OK' : JSON.stringify(res.data)
                }
              ],
              structuredContent: { data: res.data }
             }
}