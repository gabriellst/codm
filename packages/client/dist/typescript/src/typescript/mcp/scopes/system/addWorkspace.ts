import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { AddWorkspaceMutationRequest, AddWorkspaceMutationResponse } from "../../../types/AddWorkspace.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Register a local project folder; auto-detects git / Claude-project badges
 * {@link /workspaces}
 */
export async function addWorkspaceHandler({ data }: { data: AddWorkspaceMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<AddWorkspaceMutationResponse, ResponseErrorConfig<Error>, AddWorkspaceMutationRequest>({ method : "POST", url : `/workspaces`, data : requestData })
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