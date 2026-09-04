import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { RemoveWorkspaceMutationResponse, RemoveWorkspacePathParams } from "../../../types/RemoveWorkspace.ts";

/**
 * @description Remove a registered workspace (refused while an issue is WORKING on it)
 * {@link /workspaces/:workspaceId}
 */
export async function removeWorkspaceHandler({ workspaceId }: { workspaceId: RemoveWorkspacePathParams["workspaceId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<RemoveWorkspaceMutationResponse, ResponseErrorConfig<Error>, unknown>({ method : "DELETE", url : `/workspaces/${workspaceId}` })
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