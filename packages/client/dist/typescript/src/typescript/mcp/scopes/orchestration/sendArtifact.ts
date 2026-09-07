import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { SendArtifactMutationRequest, SendArtifactMutationResponse, SendArtifactPathParams } from "../../../types/SendArtifact.ts";

/**
 * @description Deliver an already-recorded artifact to the contact on the channel
 * {@link /threads/:threadId/artifacts/:artifactId/send}
 */
export async function sendArtifactHandler({ threadId, artifactId, data }: { threadId: SendArtifactPathParams["threadId"]; artifactId: SendArtifactPathParams["artifactId"]; data?: SendArtifactMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<SendArtifactMutationResponse, ResponseErrorConfig<Error>, SendArtifactMutationRequest>({ method : "POST", url : `/threads/${threadId}/artifacts/${artifactId}/send`, data : requestData })
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