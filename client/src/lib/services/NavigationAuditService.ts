import { nanoid } from 'nanoid';
import type {
  NavigationAuditSession,
  NavigationIssue,
  TouchTargetMetric,
  ScrollabilityTest,
  NavigationFix
} from '@shared/schema';

// Types for audit operations
export interface AuditOptions {
  auditType?: 'full' | 'tabs' | 'touch-targets' | 'responsive' | 'scrollability';
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  includeAutoFixes?: boolean;
  performanceThreshold?: number;
}

export interface AuditResults {
  session: NavigationAuditSession;
  issues: NavigationIssue[];
  touchTargets: TouchTargetMetric[];
  scrollabilityTests: ScrollabilityTest[];
  performanceScore: number;
  summary: {
    totalIssues: number;
    criticalIssues: number;
    warningIssues: number;
    autoFixableIssues: number;
    touchTargetCompliance: number;
    scrollContainerCompliance: number;
  };
}

export interface FixApplication {
  issueId: number;
  fixType: string;
  success: boolean;
  changes: Record<string, any>;
  errorMessage?: string;
}

export class NavigationAuditService {
  private static instance: NavigationAuditService;
  private readonly minTouchSize = 44; // Apple/Google recommendation
  
  static getInstance(): NavigationAuditService {
    if (!NavigationAuditService.instance) {
      NavigationAuditService.instance = new NavigationAuditService();
    }
    return NavigationAuditService.instance;
  }

  /**
   * Run a comprehensive navigation audit
   */
  async runAudit(options: AuditOptions = {}): Promise<AuditResults> {
    const startTime = Date.now();
    const sessionId = nanoid(12);
    
    const {
      auditType = 'full',
      deviceType = this.getDeviceType(),
      includeAutoFixes = false,
      performanceThreshold = 70
    } = options;

    // Initialize audit session
    const session: Partial<NavigationAuditSession> = {
      sessionId,
      auditType,
      deviceType,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      userAgent: navigator.userAgent,
      totalIssues: 0,
      criticalIssues: 0,
      warningIssues: 0,
      testedElements: 0,
      passedElements: 0,
      failedElements: 0
    };

    let issues: NavigationIssue[] = [];
    let touchTargets: TouchTargetMetric[] = [];
    let scrollabilityTests: ScrollabilityTest[] = [];

    try {
      // Run different audit types
      if (auditType === 'full' || auditType === 'tabs') {
        const tabIssues = await this.auditTabNavigation();
        issues.push(...tabIssues);
      }

      if (auditType === 'full' || auditType === 'touch-targets') {
        touchTargets = await this.auditTouchTargets();
      }

      if (auditType === 'full' || auditType === 'scrollability') {
        scrollabilityTests = await this.auditScrollability();
      }

      if (auditType === 'full' || auditType === 'responsive') {
        const responsiveIssues = await this.auditResponsiveBreakpoints();
        issues.push(...responsiveIssues);
      }

      // Calculate performance metrics
      const performanceScore = this.calculatePerformanceScore(issues, touchTargets, scrollabilityTests);
      const summary = this.generateSummary(issues, touchTargets, scrollabilityTests);

      // Update session with results
      const completedSession: NavigationAuditSession = {
        ...session,
        id: 0, // Will be set by backend
        performanceScore,
        totalIssues: summary.totalIssues,
        criticalIssues: summary.criticalIssues,
        warningIssues: summary.warningIssues,
        testedElements: touchTargets.length + scrollabilityTests.length,
        passedElements: summary.touchTargetCompliance + summary.scrollContainerCompliance,
        failedElements: summary.totalIssues,
        executionTime: Date.now() - startTime,
        createdAt: new Date(),
        createdBy: null
      } as NavigationAuditSession;

      // Apply automatic fixes if requested
      if (includeAutoFixes) {
        const autoFixableIssues = issues.filter(issue => issue.autoFixable);
        await this.applyAutomaticFixes(autoFixableIssues);
      }

      return {
        session: completedSession,
        issues,
        touchTargets,
        scrollabilityTests,
        performanceScore,
        summary
      };

    } catch (error) {
      console.error('Navigation audit failed:', error);
      throw new Error(`Audit execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Audit horizontal tab navigation for overflow and scrollability issues
   */
  private async auditTabNavigation(): Promise<NavigationIssue[]> {
    const issues: NavigationIssue[] = [];
    
    // Find all tab containers
    const tabContainers = document.querySelectorAll('[role="tablist"], [data-testid*="tabs-list"]');
    
    tabContainers.forEach((container, index) => {
      const containerRect = container.getBoundingClientRect();
      const tabs = container.querySelectorAll('[role="tab"], [data-testid*="tab-trigger"]');
      let totalTabWidth = 0;
      
      tabs.forEach(tab => {
        totalTabWidth += tab.getBoundingClientRect().width;
      });
      
      if (totalTabWidth > containerRect.width) {
        const isScrollable = container.scrollWidth > container.clientWidth;
        const computedStyle = window.getComputedStyle(container);
        const hasScrollBehavior = computedStyle.overflowX !== 'hidden';
        const hasScrollButtons = container.querySelector('[data-testid*="scroll"]') !== null;
        
        if (!isScrollable || !hasScrollBehavior) {
          issues.push({
            id: 0, // Will be set by backend
            sessionId: 0, // Will be set when saved
            issueType: 'tab-overflow',
            severity: 'critical',
            component: 'TabsList',
            elementSelector: this.generateSelector(container),
            description: 'Horizontale Tabs überschreiten Container-Breite ohne Scroll-Funktionalität',
            location: `Tab-Container #${index}`,
            recommendation: hasScrollButtons ? 
              'Überflüfen-X Scrolling aktivieren oder ScrollArea implementieren' :
              'Scroll-Buttons und horizontales Scrollen implementieren',
            affectedBreakpoints: this.getDeviceType() === 'mobile' ? ['mobile', 'tablet'] : ['desktop'],
            currentValue: `${totalTabWidth}px Gesamtbreite`,
            expectedValue: `≤${containerRect.width}px Container-Breite oder scrollbar`,
            autoFixable: true,
            isFixed: false,
            additionalData: {
              containerWidth: containerRect.width,
              totalTabWidth,
              tabCount: tabs.length,
              hasScrollButtons,
              currentOverflowX: computedStyle.overflowX
            },
            createdAt: new Date(),
            fixedAt: null,
            fixedBy: null
          } as NavigationIssue);
        }
      }
    });
    
    return issues;
  }

  /**
   * Audit touch target sizes for mobile compliance
   */
  private async auditTouchTargets(): Promise<TouchTargetMetric[]> {
    const touchTargets: TouchTargetMetric[] = [];
    
    // Find all interactive elements
    const selectors = [
      'nav a', '[role="tab"]', 'button', 'input[type="button"]', 
      'input[type="submit"]', '[data-testid*="button"]', '[data-testid*="link"]'
    ];
    
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        const isCompliant = rect.width >= this.minTouchSize && rect.height >= this.minTouchSize;
        const complianceScore = Math.min(100, Math.round(
          ((Math.min(rect.width, rect.height) / this.minTouchSize) * 100)
        ));

        // Check accessibility attributes
        const accessibility = {
          hasAriaLabel: element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby'),
          hasRoleAttribute: element.hasAttribute('role'),
          keyboardAccessible: element.getAttribute('tabindex') !== '-1' && 
                             !element.hasAttribute('disabled')
        };

        touchTargets.push({
          id: 0, // Will be set by backend
          sessionId: 0, // Will be set when saved
          elementType: this.getElementType(element),
          elementSelector: this.generateSelector(element),
          width: rect.width,
          height: rect.height,
          minTouchSize: this.minTouchSize,
          isCompliant,
          complianceScore,
          accessibility,
          createdAt: new Date()
        } as TouchTargetMetric);
      });
    });
    
    return touchTargets;
  }

  /**
   * Audit scrollability of containers
   */
  private async auditScrollability(): Promise<ScrollabilityTest[]> {
    const scrollTests: ScrollabilityTest[] = [];
    
    // Test different container types
    const containers = [
      { selector: '[role="tablist"]', name: 'tablist' },
      { selector: '[data-testid*="tabs-scroll"]', name: 'tablist' },
      { selector: 'nav', name: 'navigation' },
      { selector: '.mobile-menu', name: 'mobile-menu' },
      { selector: '[data-testid*="scroll"]', name: 'scroll-container' }
    ];
    
    containers.forEach(({ selector, name }) => {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach((element, index) => {
        const hasOverflow = element.scrollWidth > element.clientWidth || 
                          element.scrollHeight > element.clientHeight;
        const computedStyle = window.getComputedStyle(element);
        const isScrollable = computedStyle.overflow !== 'hidden' && 
                           computedStyle.overflowX !== 'hidden';
        
        const hasScrollIndicators = element.querySelector('.gradient') !== null ||
                                  element.querySelector('[class*="gradient"]') !== null;
        const hasScrollButtons = element.querySelector('[data-testid*="scroll"]') !== null;
        
        const issues = [];
        const recommendations = [];
        
        if (hasOverflow && !isScrollable) {
          issues.push('Overflow ohne Scroll-Funktionalität');
          recommendations.push('Horizontales Scrollen aktivieren (overflow-x: auto)');
        }
        
        if (hasOverflow && isScrollable && !hasScrollIndicators) {
          recommendations.push('Visuelle Overflow-Indikatoren hinzufügen');
        }
        
        if (hasOverflow && isScrollable && !hasScrollButtons && name === 'tablist') {
          recommendations.push('Scroll-Buttons für bessere UX hinzufügen');
        }

        scrollTests.push({
          id: 0, // Will be set by backend
          sessionId: 0, // Will be set when saved
          containerType: name,
          containerSelector: this.generateSelector(element),
          hasOverflow,
          isScrollable,
          scrollMethod: computedStyle.overflow,
          containerWidth: element.clientWidth,
          contentWidth: element.scrollWidth,
          scrollWidth: element.scrollWidth,
          hasScrollIndicators,
          hasScrollButtons,
          issues,
          recommendations,
          createdAt: new Date()
        } as ScrollabilityTest);
      });
    });
    
    return scrollTests;
  }

  /**
   * Audit responsive breakpoints
   */
  private async auditResponsiveBreakpoints(): Promise<NavigationIssue[]> {
    const issues: NavigationIssue[] = [];
    
    // Test various viewport sizes
    const breakpoints = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'mobile-large', width: 414, height: 896 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1024, height: 768 }
    ];
    
    const currentBreakpoint = this.getDeviceType();
    
    // Check if mobile navigation exists when needed
    if (currentBreakpoint === 'mobile') {
      const mobileNavigation = document.querySelector('[data-testid*="mobile"]') ||
                              document.querySelector('.mobile-menu') ||
                              document.querySelector('[class*="mobile"]');
      
      if (!mobileNavigation) {
        issues.push({
          id: 0,
          sessionId: 0,
          issueType: 'breakpoint-mismatch',
          severity: 'critical',
          component: 'MobileNavigation',
          elementSelector: 'body',
          description: 'Mobile Navigation nicht verfügbar bei mobiler Bildschirmgröße',
          location: `Viewport: ${window.innerWidth}x${window.innerHeight}`,
          recommendation: 'Mobile-optimierte Navigation implementieren',
          affectedBreakpoints: ['mobile'],
          currentValue: 'Keine mobile Navigation gefunden',
          expectedValue: 'Mobile Navigation erforderlich bei <768px',
          autoFixable: false,
          isFixed: false,
          additionalData: {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            detectedDevice: currentBreakpoint
          },
          createdAt: new Date(),
          fixedAt: null,
          fixedBy: null
        } as NavigationIssue);
      }
    }
    
    return issues;
  }

  /**
   * Apply automatic fixes to issues
   */
  async applyAutomaticFixes(issues: NavigationIssue[]): Promise<FixApplication[]> {
    const applications: FixApplication[] = [];
    
    for (const issue of issues) {
      if (!issue.autoFixable) continue;
      
      try {
        const application = await this.applyFix(issue);
        applications.push(application);
      } catch (error) {
        applications.push({
          issueId: issue.id,
          fixType: issue.issueType,
          success: false,
          changes: {},
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return applications;
  }

  /**
   * Apply a specific fix to an issue
   */
  private async applyFix(issue: NavigationIssue): Promise<FixApplication> {
    const element = document.querySelector(issue.elementSelector || '');
    if (!element) {
      throw new Error(`Element nicht gefunden: ${issue.elementSelector}`);
    }

    const changes: Record<string, any> = {};
    
    switch (issue.issueType) {
      case 'tab-overflow':
        // Apply scroll functionality
        if (element instanceof HTMLElement) {
          changes.overflowX = 'auto';
          changes.scrollBehavior = 'smooth';
          element.style.overflowX = 'auto';
          element.style.scrollBehavior = 'smooth';
          
          // Add scrollbar-hide class if available
          element.classList.add('scrollbar-hide');
          changes.className = element.className;
        }
        break;

      case 'touch-target-small':
        // Increase touch target size
        if (element instanceof HTMLElement) {
          const currentWidth = element.offsetWidth;
          const currentHeight = element.offsetHeight;
          
          if (currentWidth < this.minTouchSize) {
            element.style.minWidth = `${this.minTouchSize}px`;
            changes.minWidth = `${this.minTouchSize}px`;
          }
          
          if (currentHeight < this.minTouchSize) {
            element.style.minHeight = `${this.minTouchSize}px`;
            changes.minHeight = `${this.minTouchSize}px`;
          }
        }
        break;

      default:
        throw new Error(`Automatische Korrektur für ${issue.issueType} nicht implementiert`);
    }

    return {
      issueId: issue.id,
      fixType: issue.issueType,
      success: true,
      changes
    };
  }

  /**
   * Calculate overall performance score
   */
  private calculatePerformanceScore(
    issues: NavigationIssue[], 
    touchTargets: TouchTargetMetric[], 
    scrollTests: ScrollabilityTest[]
  ): number {
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const warningIssues = issues.filter(i => i.severity === 'warning').length;
    
    const touchCompliance = touchTargets.length > 0 ? 
      touchTargets.filter(t => t.isCompliant).length / touchTargets.length * 100 : 100;
    
    const scrollCompliance = scrollTests.length > 0 ?
      scrollTests.filter(t => t.issues && t.issues.length === 0).length / scrollTests.length * 100 : 100;
    
    // Weight different factors
    const issueScore = Math.max(0, 100 - (criticalIssues * 20 + warningIssues * 10));
    const touchScore = touchCompliance;
    const scrollScore = scrollCompliance;
    
    // Weighted average
    return Math.round((issueScore * 0.4 + touchScore * 0.3 + scrollScore * 0.3));
  }

  /**
   * Generate audit summary
   */
  private generateSummary(
    issues: NavigationIssue[], 
    touchTargets: TouchTargetMetric[], 
    scrollTests: ScrollabilityTest[]
  ) {
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const warningIssues = issues.filter(i => i.severity === 'warning').length;
    const autoFixableIssues = issues.filter(i => i.autoFixable).length;
    
    const touchTargetCompliance = touchTargets.filter(t => t.isCompliant).length;
    const scrollContainerCompliance = scrollTests.filter(t => t.issues && t.issues.length === 0).length;

    return {
      totalIssues: issues.length,
      criticalIssues,
      warningIssues,
      autoFixableIssues,
      touchTargetCompliance,
      scrollContainerCompliance
    };
  }

  /**
   * Get current device type based on viewport
   */
  private getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    const width = window.innerWidth;
    if (width <= 640) return 'mobile';
    if (width <= 1024) return 'tablet';
    return 'desktop';
  }

  /**
   * Generate a CSS selector for an element
   */
  private generateSelector(element: Element): string {
    // Try data-testid first
    const testId = element.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId}"]`;
    
    // Try ID
    if (element.id) return `#${element.id}`;
    
    // Try class names
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c).slice(0, 2);
      if (classes.length > 0) return `.${classes.join('.')}`;
    }
    
    // Fallback to tag name
    return element.tagName.toLowerCase();
  }

  /**
   * Determine element type for categorization
   */
  private getElementType(element: Element): string {
    if (element.getAttribute('role') === 'tab') return 'tab';
    if (element.tagName.toLowerCase() === 'button') return 'button';
    if (element.tagName.toLowerCase() === 'a') return 'link';
    if (element.tagName.toLowerCase() === 'input') return 'input';
    return 'interactive';
  }
}

// Export singleton instance
export const navigationAuditService = NavigationAuditService.getInstance();