import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ForkIssueMutationRequest, ForkIssueMutationResponse, ForkIssuePathParams } from "../../../types/ForkIssue.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Fork a new issue out of the conversation, from the operator's own words
 * {@link /v1/threads/:threadId/issues/fork}
 */
export async function forkIssueHandler({ threadId, data }: { threadId: ForkIssuePathParams["threadId"]; data: ForkIssueMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ForkIssueMutationResponse, ResponseErrorConfig<Error>, ForkIssueMutationRequest>({ method : "POST", url : `/v1/threads/${threadId}/issues/fork`, data : requestData })
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