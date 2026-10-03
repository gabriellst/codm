import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { GetHomeDashboardQueryResponse } from "../../../types/GetHomeDashboard.ts";

/**
 * @description Home dashboard — agents running, needs-you, active sessions, today metrics, channels (T03)
 * {@link /ui/home}
 */
export async function getHomeDashboardHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetHomeDashboardQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/ui/home` })
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