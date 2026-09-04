import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { ForkIssueMutationRequest, ForkIssueMutationResponse, ForkIssuePathParams } from "../../../types/ForkIssue.ts";

/**
 * @description Fork a new issue out of the conversation, from the operator's own words
 * {@link /threads/:threadId/issues/fork}
 */
export async function forkIssueHandler({ threadId, data }: { threadId: ForkIssuePathParams["threadId"]; data: ForkIssueMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ForkIssueMutationResponse, ResponseErrorConfig<Error>, ForkIssueMutationRequest>({ method : "POST", url : `/threads/${threadId}/issues/fork`, data : requestData })
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