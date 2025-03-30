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
        <header className="hidden md:flex md:items-center md:justify-between bg-white shadow-sm px-6 py-4">
          <h1 className="text-2xl font-semibold text-gray-800">{getPageTitle()}</h1>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Suchen..."
                className="w-64 pl-10 pr-4 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <div className="absolute left-3 top-2.5 text-gray-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>
            <button className="p-2 rounded-md text-gray-500 hover:bg-gray-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </button>
            <button className="p-2 rounded-md text-gray-500 hover:bg-gray-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
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
