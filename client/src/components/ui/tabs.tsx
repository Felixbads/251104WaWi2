import * as React from "react"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"

// Enhanced Mobile-First Tab Implementation with Audit-Optimized Features
interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
  scrollToTab: (value: string) => void
  registerTabRef: (value: string, ref: HTMLButtonElement | null) => void
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined)

function useTabsContext() {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error("Tabs components must be used within a Tabs provider")
  }
  return context
}

const Tabs = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    value: string
    onValueChange: (value: string) => void
    defaultValue?: string
  }
>(({ className, value, onValueChange, defaultValue, ...props }, ref) => {
  const [tabValue, setTabValue] = React.useState(value || defaultValue || "")
  const tabRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map())
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  
  React.useEffect(() => {
    if (value !== undefined) {
      setTabValue(value)
    }
  }, [value])
  
  const handleValueChange = React.useCallback(
    (newValue: string) => {
      setTabValue(newValue)
      onValueChange?.(newValue)
    },
    [onValueChange]
  )
  
  const scrollToTab = React.useCallback((tabValue: string) => {
    const tabElement = tabRefs.current.get(tabValue)
    const container = scrollContainerRef.current
    
    if (tabElement && container) {
      const containerRect = container.getBoundingClientRect()
      const tabRect = tabElement.getBoundingClientRect()
      const containerScrollLeft = container.scrollLeft
      
      // Calculate the position to center the tab
      const targetScrollLeft = containerScrollLeft + tabRect.left - containerRect.left - (containerRect.width - tabRect.width) / 2
      
      container.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth'
      })
    }
  }, [])
  
  const registerTabRef = React.useCallback((value: string, ref: HTMLButtonElement | null) => {
    if (ref) {
      tabRefs.current.set(value, ref)
    } else {
      tabRefs.current.delete(value)
    }
  }, [])
  
  // Auto-scroll to active tab when value changes
  React.useEffect(() => {
    if (tabValue) {
      scrollToTab(tabValue)
    }
  }, [tabValue, scrollToTab])
  
  const contextValue = React.useMemo(() => ({
    value: tabValue,
    onValueChange: handleValueChange,
    scrollToTab,
    registerTabRef
  }), [tabValue, handleValueChange, scrollToTab, registerTabRef])
  
  return (
    <TabsContext.Provider value={contextValue}>
      <div
        ref={ref}
        className={cn("", className)}
        data-testid="tabs-container"
        {...props}
      />
    </TabsContext.Provider>
  )
})
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)
  const [showOverflowIndicators, setShowOverflowIndicators] = React.useState(false)
  
  const checkScrollButtons = React.useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    
    const { scrollLeft, scrollWidth, clientWidth } = container
    const hasOverflow = scrollWidth > clientWidth
    
    setShowOverflowIndicators(hasOverflow)
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1) // -1 for rounding
  }, [])
  
  const scrollLeft = React.useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    
    const scrollAmount = container.clientWidth * 0.7 // Scroll 70% of container width
    container.scrollTo({
      left: container.scrollLeft - scrollAmount,
      behavior: 'smooth'
    })
  }, [])
  
  const scrollRight = React.useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    
    const scrollAmount = container.clientWidth * 0.7
    container.scrollTo({
      left: container.scrollLeft + scrollAmount,
      behavior: 'smooth'
    })
  }, [])
  
  React.useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    
    const handleScroll = () => {
      checkScrollButtons()
    }
    
    const resizeObserver = new ResizeObserver(() => {
      checkScrollButtons()
    })
    
    container.addEventListener('scroll', handleScroll)
    resizeObserver.observe(container)
    
    // Initial check
    setTimeout(checkScrollButtons, 100)
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
    }
  }, [checkScrollButtons])
  
  if (isMobile) {
    return (
      <div className={cn("w-full border-b bg-background relative", className)} data-testid="tabs-list-mobile">
        {/* Left scroll button */}
        {showOverflowIndicators && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 p-0 bg-background/80 backdrop-blur-sm border border-border/50 shadow-sm",
              "min-h-[44px] min-w-[44px]", // Minimum touch target size
              !canScrollLeft && "opacity-50 cursor-not-allowed"
            )}
            onClick={scrollLeft}
            disabled={!canScrollLeft}
            aria-label="Scroll tabs left"
            data-testid="button-scroll-left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        
        {/* Right scroll button */}
        {showOverflowIndicators && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 p-0 bg-background/80 backdrop-blur-sm border border-border/50 shadow-sm",
              "min-h-[44px] min-w-[44px]", // Minimum touch target size
              !canScrollRight && "opacity-50 cursor-not-allowed"
            )}
            onClick={scrollRight}
            disabled={!canScrollRight}
            aria-label="Scroll tabs right"
            data-testid="button-scroll-right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        
        {/* Left overflow indicator */}
        {showOverflowIndicators && canScrollLeft && (
          <div className="absolute left-0 top-0 h-full w-8 bg-gradient-to-r from-background to-transparent z-[5] pointer-events-none" />
        )}
        
        {/* Right overflow indicator */}
        {showOverflowIndicators && canScrollRight && (
          <div className="absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-background to-transparent z-[5] pointer-events-none" />
        )}
        
        {/* Scrollable tabs container */}
        <div
          ref={scrollContainerRef}
          className={cn(
            "flex h-12 items-center overflow-x-auto scrollbar-hide space-x-1",
            showOverflowIndicators ? "px-12" : "px-4" // Add padding when scroll buttons are shown
          )}
          style={{ 
            scrollbarWidth: 'none', // Firefox
            msOverflowStyle: 'none', // Internet Explorer 10+
          }}
          role="tablist"
          data-testid="tabs-scroll-container"
        >
          <div
            ref={ref}
            className="flex items-center space-x-1 whitespace-nowrap"
            {...props}
          />
        </div>
        
        {/* Mobile overflow indicator in center */}
        {showOverflowIndicators && (
          <div className="absolute top-1 right-1/2 translate-x-1/2 z-10">
            <MoreHorizontal className="h-3 w-3 text-muted-foreground opacity-50" />
          </div>
        )}
      </div>
    )
  }
  
  // Desktop version
  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      role="tablist"
      data-testid="tabs-list-desktop"
      {...props}
    />
  )
})
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, children, ...props }, ref) => {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const { value: selectedValue, onValueChange, registerTabRef } = useTabsContext()
  const isActive = selectedValue === value
  
  const combinedRef = React.useCallback((node: HTMLButtonElement | null) => {
    // Register with context for scrolling
    registerTabRef(value, node)
    
    // Forward ref
    if (typeof ref === 'function') {
      ref(node)
    } else if (ref) {
      ref.current = node
    }
  }, [ref, registerTabRef, value])
  
  if (isMobile) {
    return (
      <button
        ref={combinedRef}
        type="button"
        role="tab"
        aria-selected={isActive}
        data-state={isActive ? "active" : "inactive"}
        data-testid={`tab-trigger-${value}`}
        className={cn(
          // Enhanced mobile touch targets - minimum 44px height and width
          "flex-shrink-0 min-h-[44px] min-w-[44px] px-4 py-2 text-sm font-medium transition-all duration-200 border-b-2",
          "touch-manipulation select-none", // Better touch behavior
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2", // Enhanced focus states
          "active:scale-95", // Tactile feedback
          isActive
            ? "border-primary text-primary bg-primary/5 font-semibold"
            : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted hover:bg-muted/50",
          className
        )}
        onClick={() => onValueChange(value)}
        {...props}
      >
        <span className="truncate">{children}</span>
      </button>
    )
  }
  
  return (
    <button
      ref={combinedRef}
      type="button"
      role="tab"
      aria-selected={isActive}
      data-state={isActive ? "active" : "inactive"}
      data-testid={`tab-trigger-${value}`}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium",
        "min-h-[44px] touch-manipulation", // Ensure desktop also meets touch target requirements
        "ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      onClick={() => onValueChange(value)}
      {...props}
    >
      {children}
    </button>
  )
})
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, children, ...props }, ref) => {
  const { value: selectedValue } = useTabsContext()
  const isActive = selectedValue === value
  
  if (!isActive) return null
  
  return (
    <div
      ref={ref}
      role="tabpanel"
      tabIndex={0}
      data-state={isActive ? "active" : "inactive"}
      data-testid={`tab-content-${value}`}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
