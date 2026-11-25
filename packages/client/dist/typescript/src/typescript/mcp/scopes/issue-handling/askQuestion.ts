import fetch from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { AskQuestionMutationRequest, AskQuestionMutationResponse, AskQuestionPathParams } from "../../../types/AskQuestion.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Ask the group a question you can go on without: declare the default you will follow if nobody answers within 15 minutes. Declaring any effect turns it into a decision. The question: plain words, at most 3 short sentences, no task key or jargon.
 * {@link /threads/:threadId/issues/:issueId/questions}
 */
export async function askQuestionHandler({ threadId, issueId, data }: { threadId: AskQuestionPathParams["threadId"]; issueId: AskQuestionPathParams["issueId"]; data: AskQuestionMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<AskQuestionMutationResponse, ResponseErrorConfig<Error>, AskQuestionMutationRequest>({ method : "POST", url : `/threads/${threadId}/issues/${issueId}/questions`, data : requestData })
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