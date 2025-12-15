'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  const initializedRef = useRef(false);

  const updateMatches = useCallback((value: boolean) => {
    setMatches(prev => prev !== value ? value : prev);
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

export default useMediaQuery;
