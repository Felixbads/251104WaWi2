import { useState } from "react";
import { useLocation } from "wouter";
import MobileHeader from "./MobileHeader";
import MobileFooter from "./MobileFooter";
import MobileMenu from "./MobileMenu";
import { 
  LogOut, Users, Home, Package, ShoppingBag, Truck, Mail, 
  ShoppingCart, Building2, TrashIcon, BarChart2, Settings, 
  PieChart, BarChart4, ClipboardCheck, MoveHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAuth } from "@/lib";

// Zentrale Menüdefinition für konsistente Navigation in der gesamten App
interface MenuItem {
  title: string;
  icon: React.ReactNode | null;
  path: string;
}

export const menuItems = {
  overview: [
    { title: 'Dashboard', icon: <Home className="h-5 w-5 mr-3" />, path: '/' },
    { title: 'Standorte', icon: <BarChart4 className="h-5 w-5 mr-3" />, path: '/standort-status' },
    { title: 'Produkte', icon: <ShoppingBag className="h-5 w-5 mr-3" />, path: '/produkte' },
    { title: 'Lieferanten', icon: <Truck className="h-5 w-5 mr-3" />, path: '/lieferanten' },
    { title: 'Transaktionen', icon: <Mail className="h-5 w-5 mr-3" />, path: '/transactions' },
  ] as MenuItem[],
  management: [] as MenuItem[],
  storage: [
    { title: 'Lagerbestand', icon: <Building2 className="h-5 w-5 mr-3" />, path: '/lagerbestand' },
    { title: 'Rückläufer', icon: <TrashIcon className="h-5 w-5 mr-3" />, path: '/ruecklaufer' },
    { title: 'Warenbewegung', icon: <MoveHorizontal className="h-5 w-5 mr-3" />, path: '/warenbewegung' },
    { title: 'Refill-Tracking', icon: <Package className="h-5 w-5 mr-3" />, path: '/refill-tracking' },
    { title: 'Inventur', icon: <ClipboardCheck className="h-5 w-5 mr-3" />, path: '/inventur' },
    { title: 'Bestellungen', icon: <ShoppingCart className="h-5 w-5 mr-3" />, path: '/bestellungen' },
    { title: 'Neue Bestellungen', icon: <Package className="h-5 w-5 mr-3" />, path: '/bestellungen/neu' },
    { title: 'Wiederkehrende Bestellungen', icon: <BarChart2 className="h-5 w-5 mr-3" />, path: '/wiederkehrende-bestellungen' },
  ] as MenuItem[],
  analysis: [
    { title: 'Umsatz- und Ergebnisübersicht', icon: <BarChart4 className="h-5 w-5 mr-3" />, path: '/umsatz-ergebnis-uebersicht' },
    { title: 'DB-Index', icon: <BarChart2 className="h-5 w-5 mr-3" />, path: '/db-index' },
    { title: 'Auswertung', icon: <PieChart className="h-5 w-5 mr-3" />, path: '/auswertungen' },
    { title: 'Erweiterte Auswertung', icon: <PieChart className="h-5 w-5 mr-3" />, path: '/erweiterte-analyse' },
    { title: 'Standort-Analyse', icon: <PieChart className="h-5 w-5 mr-3" />, path: '/standort-analyse' },
    { title: 'Umsatzerwartungen', icon: <BarChart4 className="h-5 w-5 mr-3" />, path: '/revenue-expectations' },
    { title: 'Wirtschaftlichkeit', icon: <BarChart2 className="h-5 w-5 mr-3" />, path: '/wirtschaftlichkeit' },
    { title: 'Moderne Wirtschaftlichkeit', icon: <PieChart className="h-5 w-5 mr-3" />, path: '/wirtschaftlichkeit-modern' },
  ] as MenuItem[],
  system: [
    { title: 'Benutzer', icon: <Users className="h-5 w-5 mr-3" />, path: '/benutzer' },
    { title: 'Einstellungen', icon: <Settings className="h-5 w-5 mr-3" />, path: '/settings' },
  ] as MenuItem[]
};

interface AppShellProps {
  children: React.ReactNode;
}

// Sidebar Navigation Item
const NavItem = ({ href, icon, children, isActive }: { 
  href: string; 
  icon: React.ReactNode | null; 
  children: React.ReactNode;
  isActive: boolean;
}) => {
  return (
    <Link href={href}>
      <div
        className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
          isActive
            ? "text-white bg-red-700"
            : "text-white hover:bg-red-800"
        }`}
      >
        {icon && icon}
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
    } else if (location.startsWith("/bestellungen/neu-v2")) {
      return "Bestellungen";
    } else if (location.startsWith("/bestellungen")) {
      return "Bestellungsdetails";
    } else if (location.startsWith("/inventur")) {
      if (location === "/inventur") return "Inventur";
      return "Inventur Details";
    }
    
    switch (location) {
      case "/":
        return "Dashboard";
      case "/standort-status":
        return "Standorte";
      case "/transactions":
        return "Transaktionen";
      case "/machines":
        return "Maschinen";
      case "/lager":
        return "Lager";
      case "/lager-neu":
        return "Lager (Neu)";
      case "/lagerhaltung":
        return "Lagerhaltung";
      case "/warenbewegung":
        return "Warenumlagerung";
      case "/auswertungen":
        return "Auswertungen";
      case "/erweiterte-analyse":
        return "Erweiterte Analyse";
      case "/datenverfuegbarkeit":
        return "Datenverfügbarkeit";
      case "/synchronization":
        return "Synchronisierung";
      case "/sync-history":
        return "Sync-Verlauf";
      case "/forecast":
        return "Prognosen";
      case "/settings":
        return "Einstellungen";
      case "/umsatz-ergebnis-uebersicht":
        return "Umsatz- und Ergebnisübersicht";
      case "/db-index":
        return "DB-Index";
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
      <aside className="hidden md:flex md:flex-col md:w-64 bg-red-600 h-screen sticky top-0 shadow-md z-10">
        <div className="p-6 flex items-center border-b border-red-700">
          <div className="h-8 w-8 bg-white rounded-md flex items-center justify-center">
            <ShoppingBag className="h-5 w-5 text-red-600" />
          </div>
          <span className="ml-3 font-semibold text-lg text-white">Proviantomat</span>
        </div>

        <div className="flex flex-col h-full overflow-y-auto bg-red-600">
          {/* Nav Section: Übersicht */}
          <div className="py-4 border-b border-red-700">
            <h3 className="px-6 text-xs font-semibold text-white uppercase tracking-wider mb-2">
              Übersicht
            </h3>
            <nav>
              {menuItems.overview.map((item, index) => (
                <NavItem
                  key={index}
                  href={item.path}
                  icon={item.icon}
                  isActive={isActive(item.path)}
                >
                  {item.title}
                </NavItem>
              ))}
            </nav>
          </div>

          {/* Nav Section: LAGER */}
          <div className="py-4 border-b border-red-700">
            <h3 className="px-6 text-xs font-semibold text-white uppercase tracking-wider mb-2">
              LAGER
            </h3>
            <nav>
              {menuItems.storage.map((item, index) => (
                <NavItem
                  key={index}
                  href={item.path}
                  icon={item.icon}
                  isActive={isActive(item.path)}
                >
                  {item.title}
                </NavItem>
              ))}
            </nav>
          </div>

          {/* Nav Section: Verwaltung */}
          {menuItems.management.length > 0 && (
            <div className="py-4 border-b border-red-700">
              <h3 className="px-6 text-xs font-semibold text-white uppercase tracking-wider mb-2">
                Verwaltung
              </h3>
              <nav>
                {menuItems.management.map((item, index) => (
                  <NavItem
                    key={index}
                    href={item.path}
                    icon={item.icon}
                    isActive={isActive(item.path)}
                  >
                    {item.title}
                  </NavItem>
                ))}
              </nav>
            </div>
          )}
          
          {/* Nav Section: ANALYSE */}
          <div className="py-4 border-b border-red-700">
            <h3 className="px-6 text-xs font-semibold text-white uppercase tracking-wider mb-2">
              ANALYSE
            </h3>
            <nav>
              {menuItems.analysis.map((item, index) => (
                <NavItem
                  key={index}
                  href={item.path}
                  icon={item.icon}
                  isActive={isActive(item.path)}
                >
                  {item.title}
                </NavItem>
              ))}
            </nav>
          </div>

          {/* Nav Section: SYSTEM */}
          <div className="py-4 border-b border-red-700">
            <h3 className="px-6 text-xs font-semibold text-white uppercase tracking-wider mb-2">
              SYSTEM
            </h3>
            <nav>
              {menuItems.system.map((item, index) => (
                <NavItem
                  key={index}
                  href={item.path}
                  icon={item.icon}
                  isActive={isActive(item.path)}
                >
                  {item.title}
                </NavItem>
              ))}
            </nav>
          </div>

          {/* User Profile Section */}
          <div className="mt-auto p-6 border-t border-red-700">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-white" />
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-white">{user?.username || 'Admin'}</p>
                <p className="text-xs font-medium text-white/70">{user?.role || 'Administrator'}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto rounded-full text-white hover:bg-red-700"
                onClick={() => {
                  logout();
                }}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
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
