import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { ConfigureLanguageMutationRequest, ConfigureLanguageMutationResponse, ConfigureLanguagePathParams } from "../../../types/ConfigureLanguage.ts";

/**
 * @description Set the language this conversation speaks, or clear it to follow the account default
 * {@link /threads/:threadId/language}
 */
export async function configureLanguageHandler({ threadId, data }: { threadId: ConfigureLanguagePathParams["threadId"]; data?: ConfigureLanguageMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ConfigureLanguageMutationResponse, ResponseErrorConfig<Error>, ConfigureLanguageMutationRequest>({ method : "PUT", url : `/threads/${threadId}/language`, data : requestData })
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