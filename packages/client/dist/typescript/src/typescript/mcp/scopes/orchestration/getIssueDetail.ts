import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { GetIssueDetailQueryResponse, GetIssueDetailPathParams } from "../../../types/GetIssueDetail.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description One issue drill-down: terminal log, routed messages, stops (T12)
 * {@link /issues/:issueId}
 */
export async function getIssueDetailHandler({ issueId }: { issueId: GetIssueDetailPathParams["issueId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetIssueDetailQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/issues/${issueId}` })
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