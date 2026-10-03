import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { ResolveStopMutationRequest, ResolveStopMutationResponse, ResolveStopPathParams } from "../../../types/ResolveStop.ts";

/**
 * @description Resolve a stop — retry / review&send / take over / approve / deny (C25)
 * {@link /stops/:stopId/resolve}
 */
export async function resolveStopHandler({ stopId, data }: { stopId: ResolveStopPathParams["stopId"]; data: ResolveStopMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ResolveStopMutationResponse, ResponseErrorConfig<Error>, ResolveStopMutationRequest>({ method : "POST", url : `/stops/${stopId}/resolve`, data : requestData })
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