import fetch from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { AskDecisionMutationRequest, AskDecisionMutationResponse, AskDecisionPathParams } from "../../../types/AskDecision.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Ask the group for a decision you cannot go on without (2–6 options; declare every effect the answer authorizes). Holds the task until someone answers.
 * {@link /threads/:threadId/issues/:issueId/decisions}
 */
export async function askDecisionHandler({ threadId, issueId, data }: { threadId: AskDecisionPathParams["threadId"]; issueId: AskDecisionPathParams["issueId"]; data: AskDecisionMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<AskDecisionMutationResponse, ResponseErrorConfig<Error>, AskDecisionMutationRequest>({ method : "POST", url : `/threads/${threadId}/issues/${issueId}/decisions`, data : requestData })
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