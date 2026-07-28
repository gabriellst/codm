import fetch from "@codedm/client-typescript/typescript/mcp-issue-handling/_http";
import type { RecordArtifactMutationRequest, RecordArtifactMutationResponse, RecordArtifactPathParams } from "../types/RecordArtifact.ts";
import type { ResponseErrorConfig } from "@codedm/client-typescript/typescript/mcp-issue-handling/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Record a non-code agent output (image / file / link) (C30)
 * {@link /v1/threads/:threadId/artifacts}
 */
export async function recordArtifactHandler({ threadId, data }: { threadId: RecordArtifactPathParams["threadId"]; data: RecordArtifactMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<RecordArtifactMutationResponse, ResponseErrorConfig<Error>, RecordArtifactMutationRequest>({ method : "POST", url : `/v1/threads/${threadId}/artifacts`, data : requestData })
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