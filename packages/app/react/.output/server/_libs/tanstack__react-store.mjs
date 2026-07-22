import { r as reactExports } from "./react.mjs";
import { w as withSelectorExports } from "./use-sync-external-store.mjs";
function defaultCompare(a, b) {
  return a === b;
}
function useSelector(source, selector = (s) => s, options) {
  const compare = defaultCompare;
  const subscribe = reactExports.useCallback((handleStoreChange) => {
    const { unsubscribe } = source.subscribe(handleStoreChange);
    return unsubscribe;
  }, [source]);
  const getSnapshot = reactExports.useCallback(() => source.get(), [source]);
  return withSelectorExports.useSyncExternalStoreWithSelector(subscribe, getSnapshot, getSnapshot, selector, compare);
}
export {
  useSelector as u
};
