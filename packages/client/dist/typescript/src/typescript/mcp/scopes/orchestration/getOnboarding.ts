import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { GetOnboardingQueryResponse } from "../../../types/GetOnboarding.ts";

/**
 * @description Onboarding — jornada persistida (currentStep/completedAt/state) + satisfação derivada dos passos de setup
 * {@link /ui/onboarding}
 */
export async function getOnboardingHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetOnboardingQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/ui/onboarding` })
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