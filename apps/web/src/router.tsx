import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from 'react';

/**
 * A four-route app does not need a router library. This one keeps the URL as the source of
 * truth so tabs are linkable and reload-safe — the previous shell toggled `hidden` on
 * sections and the URL never changed.
 *
 * The server already falls back to `index.html` for unknown non-API paths, so a deep link
 * works on first load; the service worker's navigate fallback covers it offline.
 */

export type Route = 'home' | 'scan' | 'saved' | 'profile';

const ROUTES: readonly Route[] = ['home', 'scan', 'saved', 'profile'];

export function parseRoute(pathname: string): Route {
  const first = pathname.split('/').filter((segment) => segment.length > 0)[0];
  return ROUTES.find((route) => route === first) ?? 'home';
}

const listeners = new Set<() => void>();

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  window.addEventListener('popstate', notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('popstate', notify);
  };
}

function getSnapshot(): string {
  return window.location.pathname;
}

/** Client-side navigation. Falls back to a full load if anything goes wrong. */
export function navigate(route: Route): void {
  const target = route === 'home' ? '/' : `/${route}`;
  if (window.location.pathname === target) return;
  window.history.pushState(null, '', target);
  for (const notify of listeners) notify();
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, getSnapshot, () => '/');
  return parseRoute(pathname);
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  readonly to: Route;
}

/** A real anchor, so middle-click and "open in new tab" behave. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      navigate(to);
    },
    [onClick],
  );

  return <a href={to === 'home' ? '/' : `/${to}`} onClick={handleClick} {...rest} />;
}

/** Keeps the document title and the tab's `aria-current` in step with the route. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title === '' ? 'FreshSkin' : `${title} · FreshSkin`;
  }, [title]);
}
