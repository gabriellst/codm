import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { ConfigureStreamingMutationRequest, ConfigureStreamingMutationResponse, ConfigureStreamingPathParams } from "../../../types/ConfigureStreaming.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Turn intermediate content cuts on or off for this conversation
 * {@link /threads/:threadId/streaming}
 */
export async function configureStreamingHandler({ threadId, data }: { threadId: ConfigureStreamingPathParams["threadId"]; data: ConfigureStreamingMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ConfigureStreamingMutationResponse, ResponseErrorConfig<Error>, ConfigureStreamingMutationRequest>({ method : "PUT", url : `/threads/${threadId}/streaming`, data : requestData })
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