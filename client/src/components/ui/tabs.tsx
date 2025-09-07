import * as React from "react"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

// Komplett eigene Tab-Implementierung ohne Radix UI, um die RovingFocusGroup-Probleme zu umgehen
interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
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
  // Verwende defaultValue falls vorhanden und kein value gesetzt ist
  const [tabValue, setTabValue] = React.useState(value || defaultValue || "")
  
  // Wenn value von außen geändert wird, setze es als aktiv
  React.useEffect(() => {
    if (value !== undefined) {
      setTabValue(value)
    }
  }, [value])
  
  // Handler für Tab-Wechsel
  const handleValueChange = React.useCallback(
    (newValue: string) => {
      setTabValue(newValue)
      onValueChange?.(newValue)
    },
    [onValueChange]
  )
  
  return (
    <TabsContext.Provider value={{ value: tabValue, onValueChange: handleValueChange }}>
      <div
        ref={ref}
        className={cn("", className)}
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
  
  if (isMobile) {
    return (
      <div className={cn("w-full border-b bg-background", className)}>
        <ScrollArea className="w-full">
          <div
            ref={ref}
            className="flex h-12 items-center space-x-1 px-4 whitespace-nowrap"
            {...props}
          />
        </ScrollArea>
      </div>
    )
  }
  
  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
})
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, ...props }, ref) => {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const { value: selectedValue, onValueChange } = useTabsContext()
  const isActive = selectedValue === value
  
  if (isMobile) {
    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isActive}
        data-state={isActive ? "active" : "inactive"}
        className={cn(
          "flex-shrink-0 px-4 py-2 text-sm font-medium transition-all duration-200 border-b-2 min-w-fit touch-manipulation",
          isActive
            ? "border-primary text-primary bg-primary/5"
            : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
          className
        )}
        onClick={() => onValueChange(value)}
        {...props}
      />
    )
  }
  
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={isActive}
      data-state={isActive ? "active" : "inactive"}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      onClick={() => onValueChange(value)}
      {...props}
    />
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
      data-state={isActive ? "active" : "inactive"}
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
