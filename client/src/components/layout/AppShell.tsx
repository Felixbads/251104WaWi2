import { useState } from "react";
import { useLocation } from "wouter";
import Sidebar from "./Sidebar";
import MobileHeader from "./MobileHeader";
import MobileFooter from "./MobileFooter";
import MobileMenu from "./MobileMenu";

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
      default:
        return "Proviantomat";
    }
  };

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile Header */}
      <MobileHeader
        pageTitle={getPageTitle()}
        onMenuToggle={toggleMobileMenu}
      />

      {/* Mobile Menu Overlay */}
      <MobileMenu
        isOpen={showMobileMenu}
        onClose={toggleMobileMenu}
      />

      {/* Sidebar Navigation (hidden on mobile) */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        {/* Desktop Header (hidden on mobile) */}
        <header className="hidden md:flex md:items-center bg-white shadow-sm px-6 py-4">
          <h1 className="text-2xl font-semibold text-gray-800">{getPageTitle()}</h1>
        </header>

        {/* Page Content */}
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileFooter />
    </div>
  );
}
