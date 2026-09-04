import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the
 * client side for web.
 *
 * The server has no color scheme, so the pre-rendered HTML is always light.
 * The client's first render must match it or hydration mismatches; only
 * afterwards may it switch to the device's real scheme.
 *
 * `useSyncExternalStore` is how React expresses exactly that: it returns the
 * server snapshot while hydrating and the client snapshot once hydrated. The
 * older way to detect this — flipping a flag from an effect — costs an extra
 * render pass and trips `react-hooks/set-state-in-effect`.
 */

/** No external store to watch: the value changes once, at hydration. */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
