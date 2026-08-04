import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { SteerIssueTurnMutationRequest, SteerIssueTurnMutationResponse, SteerIssueTurnPathParams } from "../../../types/SteerIssueTurn.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Redirect an issue of this thread — including one that already finished
 * {@link /v1/threads/:threadId/issues/:issueId/steer}
 */
export async function steerIssueTurnHandler({ threadId, issueId, data }: { threadId: SteerIssueTurnPathParams["threadId"]; issueId: SteerIssueTurnPathParams["issueId"]; data: SteerIssueTurnMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<SteerIssueTurnMutationResponse, ResponseErrorConfig<Error>, SteerIssueTurnMutationRequest>({ method : "POST", url : `/v1/threads/${threadId}/issues/${issueId}/steer`, data : requestData })
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