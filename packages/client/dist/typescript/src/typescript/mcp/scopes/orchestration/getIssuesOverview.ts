import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { GetIssuesOverviewQueryResponse, GetIssuesOverviewQueryParams } from "../../../types/GetIssuesOverview.ts";

/**
 * @description All issues across every thread, grouped by status (T04)
 * {@link /issues}
 */
export async function getIssuesOverviewHandler({ params }: { params?: GetIssuesOverviewQueryParams } = {}): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetIssuesOverviewQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/issues`, params })
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