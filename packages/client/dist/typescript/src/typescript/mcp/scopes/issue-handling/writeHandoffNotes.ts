import fetch from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { WriteHandoffNotesMutationRequest, WriteHandoffNotesMutationResponse, WriteHandoffNotesPathParams } from "../../../types/WriteHandoffNotes.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Write handoff notes for this task (goal, state, decisions, files/branch, next step) — a fresh session will continue from them.
 * {@link /threads/:threadId/issues/:issueId/handoff-notes}
 */
export async function writeHandoffNotesHandler({ threadId, issueId, data }: { threadId: WriteHandoffNotesPathParams["threadId"]; issueId: WriteHandoffNotesPathParams["issueId"]; data: WriteHandoffNotesMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<WriteHandoffNotesMutationResponse, ResponseErrorConfig<Error>, WriteHandoffNotesMutationRequest>({ method : "POST", url : `/threads/${threadId}/issues/${issueId}/handoff-notes`, data : requestData })
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