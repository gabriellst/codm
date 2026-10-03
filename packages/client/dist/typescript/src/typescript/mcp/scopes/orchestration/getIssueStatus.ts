import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { GetIssueStatusQueryResponse, GetIssueStatusPathParams } from "../../../types/GetIssueStatus.ts";

/**
 * @description Status of one issue of this thread
 * {@link /threads/:threadId/issues/:issueId/status}
 */
export async function getIssueStatusHandler({ threadId, issueId }: { threadId: GetIssueStatusPathParams["threadId"]; issueId: GetIssueStatusPathParams["issueId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetIssueStatusQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/threads/${threadId}/issues/${issueId}/status` })
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