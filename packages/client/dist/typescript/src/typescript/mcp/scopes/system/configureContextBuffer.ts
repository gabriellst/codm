import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { ConfigureContextBufferMutationRequest, ConfigureContextBufferMutationResponse, ConfigureContextBufferPathParams } from "../../../types/ConfigureContextBuffer.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Set the rolling context-buffer size {25,50,100,200} (C14)
 * {@link /threads/:threadId/buffer}
 */
export async function configureContextBufferHandler({ threadId, data }: { threadId: ConfigureContextBufferPathParams["threadId"]; data: ConfigureContextBufferMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ConfigureContextBufferMutationResponse, ResponseErrorConfig<Error>, ConfigureContextBufferMutationRequest>({ method : "PUT", url : `/threads/${threadId}/buffer`, data : requestData })
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