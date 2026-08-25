import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { ListWorkspacesQueryResponse } from "../../../types/ListWorkspaces.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description List registered workspaces with badges and thread counts (T07)
 * {@link /v1/workspaces}
 */
export async function listWorkspacesHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<ListWorkspacesQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/workspaces` })
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