import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { RecordArtifactMutationRequest, RecordArtifactMutationResponse, RecordArtifactPathParams } from "../../../types/RecordArtifact.ts";

/**
 * @description Record a non-code agent output (image / file / link) (C30)
 * {@link /threads/:threadId/artifacts}
 */
export async function recordArtifactHandler({ threadId, data }: { threadId: RecordArtifactPathParams["threadId"]; data: RecordArtifactMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<RecordArtifactMutationResponse, ResponseErrorConfig<Error>, RecordArtifactMutationRequest>({ method : "POST", url : `/threads/${threadId}/artifacts`, data : requestData })
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