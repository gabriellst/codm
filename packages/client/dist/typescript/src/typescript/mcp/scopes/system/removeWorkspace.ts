import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { RemoveWorkspaceMutationResponse, RemoveWorkspacePathParams } from "../../../types/RemoveWorkspace.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Remove a registered workspace (refused while an issue is WORKING on it)
 * {@link /v1/workspaces/:workspaceId}
 */
export async function removeWorkspaceHandler({ workspaceId }: { workspaceId: RemoveWorkspacePathParams["workspaceId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<RemoveWorkspaceMutationResponse, ResponseErrorConfig<Error>, unknown>({ method : "DELETE", url : `/v1/workspaces/${workspaceId}` })
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