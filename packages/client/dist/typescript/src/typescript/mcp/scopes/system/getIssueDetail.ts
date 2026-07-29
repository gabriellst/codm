import fetch from "@codedm/client-typescript/typescript/mcp/scopes/system/_http";
import type { GetIssueDetailQueryResponse, GetIssueDetailPathParams } from "../../../types/GetIssueDetail.ts";
import type { ResponseErrorConfig } from "@codedm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description One issue drill-down: terminal log, routed messages, stops (T12)
 * {@link /v1/issues/:issueId}
 */
export async function getIssueDetailHandler({ issueId }: { issueId: GetIssueDetailPathParams["issueId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetIssueDetailQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/issues/${issueId}` })
  return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(res.data)
                }
              ],
              structuredContent: { data: res.data }
             }
}