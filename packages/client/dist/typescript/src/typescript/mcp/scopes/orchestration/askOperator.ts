import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { AskOperatorMutationRequest, AskOperatorMutationResponse, AskOperatorPathParams } from "../../../types/AskOperator.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Ask the operator a question (fire-and-forget; surfaces as a Needs-you stop)
 * {@link /threads/:threadId/issues/:issueId/operator-questions}
 */
export async function askOperatorHandler({ threadId, issueId, data }: { threadId: AskOperatorPathParams["threadId"]; issueId: AskOperatorPathParams["issueId"]; data: AskOperatorMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<AskOperatorMutationResponse, ResponseErrorConfig<Error>, AskOperatorMutationRequest>({ method : "POST", url : `/threads/${threadId}/issues/${issueId}/operator-questions`, data : requestData })
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