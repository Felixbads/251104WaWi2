import { useState, useEffect, useMemo } from 'react';

/**
 * Comprehensive breakpoint system for mobile-first responsive design
 * Following modern web standards and accessibility guidelines
 */
export const BREAKPOINTS = {
  // Mobile-first breakpoints (min-width)
  xs: '(min-width: 320px)',   // Extra small devices (older phones)
  sm: '(min-width: 640px)',   // Small devices (phones)
  md: '(min-width: 768px)',   // Medium devices (tablets)
  lg: '(min-width: 1024px)',  // Large devices (laptops)
  xl: '(min-width: 1280px)',  // Extra large devices (desktops)
  '2xl': '(min-width: 1536px)', // 2x extra large devices (large desktops)
  
  // Max-width breakpoints for mobile-first design
  'max-xs': '(max-width: 319px)',
  'max-sm': '(max-width: 639px)',
  'max-md': '(max-width: 767px)', 
  'max-lg': '(max-width: 1023px)',
  'max-xl': '(max-width: 1279px)',
  'max-2xl': '(max-width: 1535px)',
  
  // Device-specific breakpoints
  mobile: '(max-width: 640px)',
  tablet: '(min-width: 641px) and (max-width: 1024px)',
  desktop: '(min-width: 1025px)',
  
  // Touch-target optimized breakpoints for audit system
  'touch-small': '(max-width: 480px)',     // Small touch devices (require 48px+ targets)
  'touch-medium': '(min-width: 481px) and (max-width: 768px)', // Medium touch devices (require 44px+ targets)
  'touch-large': '(min-width: 769px)',     // Large devices (can use smaller targets)
  
  // Navigation-specific breakpoints
  'nav-compact': '(max-width: 768px)',     // Compact navigation needed
  'nav-full': '(min-width: 769px)',        // Full navigation available
  'nav-mobile': '(max-width: 640px)',      // Mobile navigation patterns
  'nav-tablet': '(min-width: 641px) and (max-width: 1024px)', // Tablet navigation patterns
  
  // Orientation breakpoints
  landscape: '(orientation: landscape)',
  portrait: '(orientation: portrait)',
  
  // High-resolution displays
  retina: '(-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi)',
  
  // Accessibility breakpoints
  'reduced-motion': '(prefers-reduced-motion: reduce)',
  'high-contrast': '(prefers-contrast: high)',
  'dark-mode': '(prefers-color-scheme: dark)',
  'light-mode': '(prefers-color-scheme: light)'
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

/**
 * Enhanced useMediaQuery hook with SSR support and better performance
 */
export const useMediaQuery = (query: string): boolean => {
  // Initialize with false to prevent hydration mismatches
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return;
    }
    
    const media = window.matchMedia(query);
    
    // Set initial value
    setMatches(media.matches);
    
    // Create listener function
    const listener = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };
    
    // Add listener
    if (media.addEventListener) {
      media.addEventListener('change', listener);
    } else {
      // Fallback for older browsers
      media.addListener(listener);
    }
    
    // Cleanup function
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', listener);
      } else {
        // Fallback for older browsers
        media.removeListener(listener);
      }
    };
  }, [query]);

  return matches;
};

/**
 * Hook to get a breakpoint match by key
 */
export const useBreakpoint = (breakpoint: BreakpointKey): boolean => {
  return useMediaQuery(BREAKPOINTS[breakpoint]);
};

/**
 * Hook to get multiple breakpoint matches efficiently
 */
export const useBreakpoints = (breakpoints: BreakpointKey[]): Record<BreakpointKey, boolean> => {
  const results = breakpoints.reduce((acc, breakpoint) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    acc[breakpoint] = useMediaQuery(BREAKPOINTS[breakpoint]);
    return acc;
  }, {} as Record<BreakpointKey, boolean>);
  
  return results;
};

/**
 * Enhanced responsive hook with comprehensive device and navigation information
 */
export const useResponsive = () => {
  // Core breakpoints
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const isTablet = useMediaQuery(BREAKPOINTS.tablet);
  const isDesktop = useMediaQuery(BREAKPOINTS.desktop);
  
  // Standard breakpoints
  const isXs = useMediaQuery(BREAKPOINTS.xs);
  const isSm = useMediaQuery(BREAKPOINTS.sm);
  const isMd = useMediaQuery(BREAKPOINTS.md);
  const isLg = useMediaQuery(BREAKPOINTS.lg);
  const isXl = useMediaQuery(BREAKPOINTS.xl);
  const is2xl = useMediaQuery(BREAKPOINTS['2xl']);
  
  // Touch-target breakpoints
  const isTouchSmall = useMediaQuery(BREAKPOINTS['touch-small']);
  const isTouchMedium = useMediaQuery(BREAKPOINTS['touch-medium']);
  const isTouchLarge = useMediaQuery(BREAKPOINTS['touch-large']);
  
  // Navigation breakpoints
  const isNavCompact = useMediaQuery(BREAKPOINTS['nav-compact']);
  const isNavFull = useMediaQuery(BREAKPOINTS['nav-full']);
  const isNavMobile = useMediaQuery(BREAKPOINTS['nav-mobile']);
  const isNavTablet = useMediaQuery(BREAKPOINTS['nav-tablet']);
  
  // Orientation and display
  const isLandscape = useMediaQuery(BREAKPOINTS.landscape);
  const isPortrait = useMediaQuery(BREAKPOINTS.portrait);
  const isRetina = useMediaQuery(BREAKPOINTS.retina);
  
  // Accessibility preferences
  const prefersReducedMotion = useMediaQuery(BREAKPOINTS['reduced-motion']);
  const prefersHighContrast = useMediaQuery(BREAKPOINTS['high-contrast']);
  const prefersDarkMode = useMediaQuery(BREAKPOINTS['dark-mode']);
  const prefersLightMode = useMediaQuery(BREAKPOINTS['light-mode']);
  
  // Derived properties
  const deviceType = useMemo(() => {
    if (isMobile) return 'mobile' as const;
    if (isTablet) return 'tablet' as const;
    return 'desktop' as const;
  }, [isMobile, isTablet]);
  
  const touchTargetSize = useMemo(() => {
    if (isTouchSmall) return 48; // 48px for small touch devices
    if (isTouchMedium) return 44; // 44px for medium touch devices
    return 40; // 40px for large devices
  }, [isTouchSmall, isTouchMedium]);
  
  const navigationPattern = useMemo(() => {
    if (isNavMobile) return 'mobile' as const;
    if (isNavTablet) return 'tablet' as const;
    if (isNavCompact) return 'compact' as const;
    return 'full' as const;
  }, [isNavMobile, isNavTablet, isNavCompact]);
  
  return {
    // Core device detection
    isMobile,
    isTablet,
    isDesktop,
    deviceType,
    
    // Standard breakpoints
    isXs,
    isSm,
    isMd,
    isLg,
    isXl,
    is2xl,
    
    // Touch-target information
    isTouchSmall,
    isTouchMedium,
    isTouchLarge,
    touchTargetSize,
    
    // Navigation patterns
    isNavCompact,
    isNavFull,
    isNavMobile,
    isNavTablet,
    navigationPattern,
    
    // Orientation and display
    isLandscape,
    isPortrait,
    isRetina,
    
    // Accessibility preferences
    prefersReducedMotion,
    prefersHighContrast,
    prefersDarkMode,
    prefersLightMode,
    
    // Convenience properties (backward compatibility)
    isSmallScreen: isMobile,
    isMediumScreen: isTablet,
    isLargeScreen: isDesktop,
    
    // Viewport information
    viewport: useMemo(() => ({
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      height: typeof window !== 'undefined' ? window.innerHeight : 0,
      aspectRatio: typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 1
    }), [isMobile, isTablet, isDesktop]) // Re-calculate when breakpoints change
  };
};

/**
 * Hook for audit-specific responsive information
 */
export const useAuditResponsive = () => {
  const responsive = useResponsive();
  
  const auditContext = useMemo(() => ({
    // Touch target compliance
    requiredTouchTargetSize: responsive.touchTargetSize,
    isTouchTargetCompliant: (size: number) => size >= responsive.touchTargetSize,
    
    // Navigation audit categories
    shouldAuditTabScroll: responsive.isNavCompact,
    shouldAuditTouchTargets: responsive.isMobile || responsive.isTablet,
    shouldAuditScrollability: true,
    
    // Device context for audit reporting
    auditDeviceType: responsive.deviceType,
    auditBreakpoint: responsive.isMobile ? 'mobile' : responsive.isTablet ? 'tablet' : 'desktop',
    
    // Accessibility context
    shouldRespectReducedMotion: responsive.prefersReducedMotion,
    shouldProvideHighContrast: responsive.prefersHighContrast,
    
    // Performance considerations
    shouldOptimizeForTouch: responsive.isMobile || responsive.isTablet,
    shouldOptimizeScrolling: responsive.isNavCompact
  }), [responsive]);
  
  return {
    ...responsive,
    audit: auditContext
  };
};

/**
 * Utility function to get current device type without hook
 */
export const getDeviceType = (): 'mobile' | 'tablet' | 'desktop' => {
  if (typeof window === 'undefined') return 'desktop';
  
  const width = window.innerWidth;
  if (width <= 640) return 'mobile';
  if (width <= 1024) return 'tablet';
  return 'desktop';
};

/**
 * Utility function to check if a breakpoint matches without hook
 */
export const matchBreakpoint = (breakpoint: BreakpointKey): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(BREAKPOINTS[breakpoint]).matches;
};