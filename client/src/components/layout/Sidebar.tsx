import { useLocation, Link } from "wouter";
import {
  Home,
  FileText,
  Package,
  ShoppingBag,
  RefreshCw,
  Clock,
  Settings,
  LogOut,
  BarChart2,
  LineChart,
  Truck,
  ShoppingCart,
  Users,
  Building2,
  TrashIcon,
  Download,
  ClipboardCheck,
  Database,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib";
import WarehouseSidebar from "./WarehouseSidebar";

// Verwenden wir die wouter Link-Komponente für korrekte Navigation
const NavItem = ({ href, icon, children, isActive, disabled = false }: { 
  href: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
  isActive: boolean;
  disabled?: boolean;
}) => {
  // Wenn das Element deaktiviert ist, zeigen wir es ausgegraut an und deaktivieren die Navigation
  if (disabled) {
    return (
      <div
        className={`flex items-center px-6 py-2 text-sm font-medium cursor-not-allowed text-gray-400`}
      >
        {icon}
        {children}
      </div>
    );
  }
  
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

export default function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    return location.startsWith(path);
  };

  return (
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
            VERWALTUNG
          </h3>
          <nav>
            <NavItem 
              href="/warenentnahme" 
              icon={<TrashIcon className="h-5 w-5 mr-3" />}
              isActive={isActive("/warenentnahme")}
            >
              Warenentnahme
            </NavItem>
            {/* Downloads nur für Admins sichtbar */}
            <NavItem 
              href="/downloads" 
              icon={<Download className="h-5 w-5 mr-3" />}
              isActive={isActive("/downloads")}
              disabled={!isAdmin}
            >
              Downloads
            </NavItem>
          </nav>
        </div>

        {/* Nav Section: LAGER */}
        <div className="py-4 border-b border-gray-200 bg-white">
          <h3 className="px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            LAGER
          </h3>
          <nav>
            <NavItem 
              href="/lagerbestand" 
              icon={<Package className="h-5 w-5 mr-3" />}
              isActive={isActive("/lagerbestand")}
            >
              Lagerbestand
            </NavItem>
            <NavItem 
              href="/inventur" 
              icon={<ClipboardCheck className="h-5 w-5 mr-3" />}
              isActive={isActive("/inventur")}
            >
              Inventur
            </NavItem>
            <NavItem 
              href="/bestellung-v2" 
              icon={<ShoppingCart className="h-5 w-5 mr-3" />}
              isActive={isActive("/bestellung-v2")}
            >
              Bestellungen 2.0
            </NavItem>
            {/* Lager-Einträge werden dynamisch geladen */}
            <WarehouseSidebar />
          </nav>
        </div>
        
        {/* Nav Section: ANALYSE */}
        <div className="py-4 border-b border-gray-200 bg-white">
          <h3 className="px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            ANALYSE
          </h3>
          <nav>
            <NavItem 
              href="/auswertungen" 
              icon={<BarChart2 className="h-5 w-5 mr-3" />}
              isActive={isActive("/auswertungen")}
            >
              Auswertung
            </NavItem>
            <NavItem 
              href="/erweiterte-auswertung" 
              icon={<TrendingUp className="h-5 w-5 mr-3" />}
              isActive={isActive("/erweiterte-auswertung")}
            >
              Erweiterte Auswertung
            </NavItem>
            <NavItem 
              href="/forecast" 
              icon={<BarChart2 className="h-5 w-5 mr-3" />}
              isActive={isActive("/forecast") && !isActive("/forecast-evaluation")}
            >
              Prognose
            </NavItem>
            <NavItem 
              href="/forecast-evaluation" 
              icon={<LineChart className="h-5 w-5 mr-3" />}
              isActive={isActive("/forecast-evaluation")}
            >
              Prognoseanalyse
            </NavItem>
          </nav>
        </div>
        
        {/* Nav Section: System */}
        <div className="py-4 border-b border-gray-200 bg-white">
          <h3 className="px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            SYSTEM
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
              href="/datenverfuegbarkeit" 
              icon={<Database className="h-5 w-5 mr-3" />}
              isActive={isActive("/datenverfuegbarkeit")}
            >
              Datenverfügbarkeit
            </NavItem>
            
            {/* Benutzerverwaltung nur für Admins sichtbar */}
            <NavItem 
              href="/benutzer" 
              icon={<Users className="h-5 w-5 mr-3" />}
              isActive={isActive("/benutzer")}
              disabled={!isAdmin}
            >
              Benutzerverwaltung
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
              {!user?.approved && (
                <p className="text-xs font-medium text-red-500">Nicht freigegeben</p>
              )}
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
  );
}
