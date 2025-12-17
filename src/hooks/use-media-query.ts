/**
 * useMediaQuery Hook
 * Responsive breakpoint detection
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { breakpoints } from '@/styles/design-tokens';

type BreakpointKey = keyof typeof breakpoints;

/**
 * Check if a media query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  const initializedRef = useRef(false);

  const updateMatches = useCallback((value: boolean) => {
    setMatches((prev) => (prev !== value ? value : prev));
  }, []);

  useEffect(() => {
    const media = window.matchMedia(query);

    // Set initial value only once
    if (!initializedRef.current) {
      initializedRef.current = true;
      updateMatches(media.matches);
    }

    // Create listener
    const listener = (event: MediaQueryListEvent) => {
      updateMatches(event.matches);
    };

    // Add listener
    media.addEventListener('change', listener);

    // Cleanup
    return () => media.removeEventListener('change', listener);
  }, [query, updateMatches]);

  return matches;
}

/**
 * Check if viewport is at or above a breakpoint
 */
export function useBreakpoint(breakpoint: BreakpointKey): boolean {
  const minWidth = breakpoints[breakpoint];
  return useMediaQuery(`(min-width: ${minWidth})`);
}

/**
 * Check if viewport is below a breakpoint
 */
export function useBreakpointDown(breakpoint: BreakpointKey): boolean {
  const minWidth = breakpoints[breakpoint];
  return useMediaQuery(`(max-width: calc(${minWidth} - 1px))`);
}

/**
 * Get current breakpoint name
 */
export function useCurrentBreakpoint(): BreakpointKey {
  const isXs = useBreakpoint('xs');
  const isSm = useBreakpoint('sm');
  const isMd = useBreakpoint('md');
  const isLg = useBreakpoint('lg');
  const isXl = useBreakpoint('xl');
  const is2xl = useBreakpoint('2xl');

  if (is2xl) return '2xl';
  if (isXl) return 'xl';
  if (isLg) return 'lg';
  if (isMd) return 'md';
  if (isSm) return 'sm';
  if (isXs) return 'xs';
  return 'xs';
}

/**
 * Common breakpoint hooks
 */
export function useIsMobile(): boolean {
  return useBreakpointDown('md');
}

export function useIsTablet(): boolean {
  const isMd = useBreakpoint('md');
  const isLg = useBreakpoint('lg');
  return isMd && !isLg;
}

export function useIsDesktop(): boolean {
  return useBreakpoint('lg');
}

/**
 * Check for prefers-reduced-motion
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Check for prefers-color-scheme
 */
export function usePrefersColorScheme(): 'light' | 'dark' | 'no-preference' {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const prefersLight = useMediaQuery('(prefers-color-scheme: light)');

  if (prefersDark) return 'dark';
  if (prefersLight) return 'light';
  return 'no-preference';
}

export default useMediaQuery;
