import { useState } from "react";
import { useLocation } from "wouter";
import MobileHeader from "./MobileHeader";
import MobileFooter from "./MobileFooter";
import MobileMenu from "./MobileMenu";
import { LogOut, Users, Home, Package, ShoppingBag, Truck, FileText, ShoppingCart, Building2, TrashIcon, BarChart2, RefreshCw, Clock, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAuth } from "@/lib";

interface AppShellProps {
  children: React.ReactNode;
}

// Sidebar Navigation Item
const NavItem = ({ href, icon, children, isActive }: { 
  href: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
  isActive: boolean;
}) => {
  return (
    <Link href={href}>
      <div
        className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
          isActive
            ? "text-primary-600 bg-primary-50"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`}
      >
        {icon}
        {children}
      </div>
    </Link>
  );
};

export default function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { logout, user } = useAuth();
  
  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    return location.startsWith(path);
  };
  
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

      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200 h-screen sticky top-0 shadow-md z-10">
        <div className="p-6 flex items-center border-b border-gray-200 bg-white">
          <div className="h-8 w-8 bg-primary rounded-md flex items-center justify-center">
            <ShoppingBag className="h-5 w-5 text-white" />
          </div>
          <span className="ml-3 font-semibold text-lg">Proviantomat</span>
        </div>

        <div className="flex flex-col h-full overflow-y-auto bg-white">
          {/* Nav Section: Main */}
          <div className="py-4 border-b border-gray-200 bg-white">
            <h3 className="px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Übersicht
            </h3>
            <nav>
              <NavItem 
                href="/" 
                icon={<Home className="h-5 w-5 mr-3" />}
                isActive={isActive("/")}
              >
                Dashboard
              </NavItem>
              <NavItem 
                href="/automaten" 
                icon={<Package className="h-5 w-5 mr-3" />}
                isActive={isActive("/automaten")}
              >
                Automaten
              </NavItem>
              <NavItem 
                href="/produkte" 
                icon={<ShoppingBag className="h-5 w-5 mr-3" />}
                isActive={isActive("/produkte")}
              >
                Produkte
              </NavItem>
              <NavItem 
                href="/lieferanten" 
                icon={<Truck className="h-5 w-5 mr-3" />}
                isActive={isActive("/lieferanten")}
              >
                Lieferanten
              </NavItem>
              <NavItem 
                href="/transactions" 
                icon={<FileText className="h-5 w-5 mr-3" />}
                isActive={isActive("/transactions")}
              >
                Transaktionen
              </NavItem>
            </nav>
          </div>

          {/* Nav Section: Verwaltung */}
          <div className="py-4 border-b border-gray-200 bg-white">
            <h3 className="px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Verwaltung
            </h3>
            <nav>
              <NavItem 
                href="/bestellungen" 
                icon={<ShoppingCart className="h-5 w-5 mr-3" />}
                isActive={isActive("/bestellungen")}
              >
                Bestellungen
              </NavItem>
              <NavItem 
                href="/lager" 
                icon={<Building2 className="h-5 w-5 mr-3" />}
                isActive={isActive("/lager")}
              >
                Lager
              </NavItem>
              <NavItem 
                href="/warenentnahme" 
                icon={<TrashIcon className="h-5 w-5 mr-3" />}
                isActive={isActive("/warenentnahme")}
              >
                Warenentnahme
              </NavItem>
              <NavItem 
                href="/forecast" 
                icon={<BarChart2 className="h-5 w-5 mr-3" />}
                isActive={isActive("/forecast")}
              >
                Prognosen
              </NavItem>
              <NavItem 
                href="/auswertungen" 
                icon={<BarChart2 className="h-5 w-5 mr-3" />}
                isActive={isActive("/auswertungen")}
              >
                Auswertungen
              </NavItem>
            </nav>
          </div>

          {/* Nav Section: System */}
          <div className="py-4 border-b border-gray-200 bg-white">
            <h3 className="px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              System
            </h3>
            <nav>
              <NavItem 
                href="/synchronization" 
                icon={<RefreshCw className="h-5 w-5 mr-3" />}
                isActive={isActive("/synchronization")}
              >
                Synchronisierung
              </NavItem>
              <NavItem 
                href="/sync-history" 
                icon={<Clock className="h-5 w-5 mr-3" />}
                isActive={isActive("/sync-history")}
              >
                Sync-Verlauf
              </NavItem>
              <NavItem 
                href="/settings" 
                icon={<Settings className="h-5 w-5 mr-3" />}
                isActive={isActive("/settings")}
              >
                Einstellungen
              </NavItem>
            </nav>
          </div>

          {/* User Profile Section */}
          <div className="mt-auto p-6 border-t border-gray-200 bg-white">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">{user?.username || 'Admin'}</p>
                <p className="text-xs font-medium text-gray-500">{user?.role || 'Administrator'}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto rounded-full"
                onClick={() => {
                  logout();
                }}
              >
                <LogOut className="h-5 w-5 text-gray-500" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0 bg-gray-50">
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
