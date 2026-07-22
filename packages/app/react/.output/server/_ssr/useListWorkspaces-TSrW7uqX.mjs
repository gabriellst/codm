import { f as fetch } from "../_http-B7Tvv7R3.mjs";
import { a as useQuery, q as queryOptions } from "../_libs/tanstack__react-query.mjs";
function getListWorkspacesUrl() {
  const res = { method: "GET", url: `/v1/workspaces` };
  return res;
}
async function listWorkspaces(config = {}) {
  const { client: request = fetch, ...requestConfig } = config;
  const res = await request({ method: "GET", url: getListWorkspacesUrl().url.toString(), ...requestConfig });
  return res.data;
}
const listWorkspacesQueryKey = () => [{ url: "/v1/workspaces" }];
function listWorkspacesQueryOptions(config = {}) {
  const queryKey = listWorkspacesQueryKey();
  return queryOptions({
    queryKey,
    queryFn: async ({ signal }) => {
      return listWorkspaces({ ...config, signal: config.signal ?? signal });
    }
  });
}
function useListWorkspaces(options = {}) {
  const { query: queryConfig = {}, client: config = {} } = options ?? {};
  const { client: queryClient, ...resolvedOptions } = queryConfig;
  const queryKey = resolvedOptions?.queryKey ?? listWorkspacesQueryKey();
  const query = useQuery({
    ...listWorkspacesQueryOptions(config),
    ...resolvedOptions,
    queryKey
  }, queryClient);
  query.queryKey = queryKey;
  return query;
}
export {
  listWorkspacesQueryKey as l,
  useListWorkspaces as u
};
