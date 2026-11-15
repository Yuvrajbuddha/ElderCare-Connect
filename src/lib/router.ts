import { useCallback, useEffect, useState } from 'react';
import type { AppSection } from '../types/healthcare';

export type AppRoute =
  | '/'
  | '/login'
  | '/signup'
  | '/get-started'
  | '/forgot-password'
  | '/verify-email'
  | '/accept-invite'
  | '/dashboard'
  | '/medications'
  | '/appointments'
  | '/records'
  | '/routines'
  | '/messages'
  | '/circle';

const SECTION_TO_ROUTE: Record<AppSection, AppRoute> = {
  overview: '/dashboard',
  medications: '/medications',
  appointments: '/appointments',
  records: '/records',
  routines: '/routines',
  messages: '/messages',
  circle: '/circle',
};

const ROUTE_TO_SECTION: Partial<Record<AppRoute, AppSection>> = {
  '/dashboard': 'overview',
  '/medications': 'medications',
  '/appointments': 'appointments',
  '/records': 'records',
  '/routines': 'routines',
  '/messages': 'messages',
  '/circle': 'circle',
};

export function normalizeRoute(pathname: string): AppRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const validRoutes: AppRoute[] = [
    '/',
    '/login',
    '/signup',
    '/get-started',
    '/forgot-password',
    '/verify-email',
    '/accept-invite',
    '/dashboard',
    '/medications',
    '/appointments',
    '/records',
    '/routines',
    '/messages',
    '/circle',
  ];
  return (validRoutes.includes(clean as AppRoute) ? clean : '/') as AppRoute;
}

export function sectionToRoute(section: AppSection): AppRoute {
  return SECTION_TO_ROUTE[section];
}

export function routeToSection(route: AppRoute): AppSection | null {
  return ROUTE_TO_SECTION[route] ?? null;
}

export function useAppRouter() {
  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window !== 'undefined' ? normalizeRoute(window.location.pathname) : '/',
  );

  useEffect(() => {
    const onPopState = () => {
      setRoute(normalizeRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((target: string, options?: { replace?: boolean }) => {
    if (typeof window === 'undefined') return;
    const [pathAndQuery, hashPart] = target.split('#');
    const [rawPath, queryPart] = pathAndQuery.split('?');
    const nextRoute = normalizeRoute(rawPath || '/');
    const nextPathWithQuery = queryPart ? `${nextRoute}?${queryPart}` : nextRoute;
    const nextHash = hashPart ? `#${hashPart}` : '';

    if (
      window.location.pathname !== nextRoute ||
      window.location.search !== (queryPart ? `?${queryPart}` : '') ||
      window.location.hash !== nextHash
    ) {
      const fullUrl = `${nextPathWithQuery}${nextHash}`;
      if (options?.replace) {
        window.history.replaceState({}, '', fullUrl);
      } else {
        window.history.pushState({}, '', fullUrl);
      }
    }

    setRoute(nextRoute);

    if (hashPart) {
      requestAnimationFrame(() => {
        const el = document.getElementById(hashPart);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  return { route, navigate };
}
