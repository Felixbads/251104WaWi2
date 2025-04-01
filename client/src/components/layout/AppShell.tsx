import { useState } from "react";
import { useLocation } from "wouter";
import Sidebar from "./Sidebar";
import MobileHeader from "./MobileHeader";
import MobileFooter from "./MobileFooter";
import MobileMenu from "./MobileMenu";
import { Menu } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // Extract page title from current location
  const getPageTitle = () => {
    // Erkennen, ob Pfad mit bestimmten Präfixen beginnt
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
    <div className="app-container">
      {/* Mobile Menu Toggle */}
      <button
        className="mobile-menu-toggle md:hidden"
        onClick={toggleMobileMenu}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Sidebar Navigation */}
      <Sidebar isOpen={showMobileMenu} onClose={toggleMobileMenu as any} />

      {/* Main Content Area */}
      <div className="main-content">
        {/* Page Header */}
        <header className="flex items-center justify-between pb-6">
          <h1 className="text-2xl font-semibold">{getPageTitle()}</h1>
          
          {/* Optional Filter/Date Range Selector kann hier eingefügt werden */}
          {location === "/" && (
            <div className="bg-[var(--card-bg)] rounded-full px-4 py-1 text-sm">
              7 Tage
            </div>
          )}
        </header>

        {/* Page Content */}
        {children}
      </div>

      {/* Mobile Footer Navigation - auf kleinen Geräten sichtbar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <MobileFooter />
      </div>
    </div>
  );
}
