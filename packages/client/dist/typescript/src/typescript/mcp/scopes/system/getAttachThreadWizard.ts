import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { GetAttachThreadWizardQueryResponse, GetAttachThreadWizardQueryParams } from "../../../types/GetAttachThreadWizard.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Attach-thread wizard — contacts, workspaces, providers + attached/no-channel flags (T15)
 * {@link /v1/ui/attach-thread-wizard}
 */
export async function getAttachThreadWizardHandler({ params }: { params?: GetAttachThreadWizardQueryParams } = {}): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetAttachThreadWizardQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/ui/attach-thread-wizard`, params })
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