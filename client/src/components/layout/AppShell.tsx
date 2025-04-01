import { useState } from "react";
import { useLocation } from "wouter";
import Sidebar from "./Sidebar";
import MobileFooter from "./MobileFooter";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // Extract page title from current location
  const getPageTitle = () => {
    // Check if path starts with specific prefixes
    if (location.startsWith("/automaten")) {
      if (location === "/automaten") return "Automaten";
      return "Automat Details";
    } else if (location.startsWith("/produkte")) {
      if (location === "/produkte") return "Produkte";
      return "Produkt Details";
    } else if (location.startsWith("/lieferanten")) {
      if (location === "/lieferanten") return "Lieferanten";
      return "Lieferant Details";
    } else if (location.startsWith("/bestellungen")) {
      if (location === "/bestellungen") return "Bestellungen";
      return "Neue Bestellung";
    }
    
    switch (location) {
      case "/":
        return "Dashboard";
      case "/transactions":
        return "Transaktionen";
      case "/machines":
        return "Maschinen";
      case "/lager":
        return "Lager";
      case "/auswertungen":
        return "Auswertungen";
      case "/synchronization":
        return "Synchronisierung";
      case "/sync-history":
        return "Sync-Verlauf";
      case "/forecast":
        return "Prognosen";
      case "/settings":
        return "Einstellungen";
      case "/grafik":
        return "Grafik";
      default:
        return "Proviantomat";
    }
  };

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar Navigation */}
      <Sidebar isOpen={showMobileMenu} onClose={() => setShowMobileMenu(false)} />

      {/* Main Content Area */}
      <main className={cn(
        "flex-1 transition-all duration-300 ease-in-out",
        "md:ml-[250px]" // Adjust for sidebar width
      )}>
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          {/* Page Header */}
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1">{getPageTitle()}</h1>
              
              {/* Optional breadcrumb path */}
              {location !== "/" && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <span>Dashboard</span>
                  <ChevronRight className="h-3 w-3 mx-1" />
                  <span className="font-medium text-foreground">{getPageTitle()}</span>
                </div>
              )}
            </div>
            
            {/* Optional Filter/Date Range Selector */}
            {location === "/" && (
              <div className="mt-2 sm:mt-0 bg-muted rounded-full px-4 py-1.5 text-sm font-medium flex items-center">
                <span>7 Tage</span>
                <ChevronRight className="h-4 w-4 ml-1" />
              </div>
            )}
          </header>

          {/* Page Content */}
          {children}
        </div>
      </main>

      {/* Mobile Footer Navigation - visible only on small screens */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border">
        <MobileFooter />
      </div>
    </div>
  );
}
