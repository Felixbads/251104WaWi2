import { useLocation, Link } from "wouter";
import { X } from "lucide-react";
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
  Truck,
  ShoppingCart,
  Users,
  Building2,
  TrashIcon,
  FileBarChart,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "@/lib";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

// Verwenden wir die wouter Link-Komponente für Navigation
const NavItem = ({ href, icon, children, isActive, onClick }: { 
  href: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
  isActive: boolean;
  onClick?: () => void;
}) => {
  return (
    <Link href={href}>
      <a onClick={onClick} className="nav-item">
        {icon}
        <span>{children}</span>
      </a>
    </Link>
  );
};

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    return location === path || (path !== "/" && location.startsWith(path));
  };
  
  // Optionale Funktion zum Schließen des Menüs auf Mobilgeräten
  const handleNavClick = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      {/* Logo und Kopfbereich */}
      <div className="sidebar-logo">
        <ClipboardList className="h-6 w-6 text-white" />
        <span className="ml-3 text-xl font-semibold">Proviantomat</span>
        
        {/* Mobile Close Button */}
        {isOpen && onClose && (
          <button 
            onClick={onClose}
            className="md:hidden ml-auto text-white hover:bg-white/10 p-1 rounded-full"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Hauptnavigation */}
      <nav className="sidebar-nav">
        <NavItem 
          href="/" 
          icon={<Home className="h-5 w-5" />}
          isActive={isActive("/")}
          onClick={handleNavClick}
        >
          Dashboard
        </NavItem>
        
        <NavItem 
          href="/automaten" 
          icon={<Package className="h-5 w-5" />}
          isActive={isActive("/automaten")}
          onClick={handleNavClick}
        >
          Automaten
        </NavItem>
        
        <NavItem 
          href="/bestellungen" 
          icon={<ShoppingCart className="h-5 w-5" />}
          isActive={isActive("/bestellungen")}
          onClick={handleNavClick}
        >
          Bestellungen
        </NavItem>
        
        <NavItem 
          href="/transactions" 
          icon={<FileText className="h-5 w-5" />}
          isActive={isActive("/transactions")}
          onClick={handleNavClick}
        >
          Transaktionen
        </NavItem>
        
        <NavItem 
          href="/forecast" 
          icon={<BarChart2 className="h-5 w-5" />}
          isActive={isActive("/forecast")}
          onClick={handleNavClick}
        >
          Prognosen
        </NavItem>
        
        <NavItem 
          href="/produkte" 
          icon={<ShoppingBag className="h-5 w-5" />}
          isActive={isActive("/produkte")}
          onClick={handleNavClick}
        >
          Produkte
        </NavItem>
        
        <NavItem 
          href="/lieferanten" 
          icon={<Truck className="h-5 w-5" />}
          isActive={isActive("/lieferanten")}
          onClick={handleNavClick}
        >
          Lieferanten
        </NavItem>
        
        <NavItem 
          href="/lager" 
          icon={<Building2 className="h-5 w-5" />}
          isActive={isActive("/lager")}
          onClick={handleNavClick}
        >
          Lager
        </NavItem>
        
        <NavItem 
          href="/auswertungen" 
          icon={<FileBarChart className="h-5 w-5" />}
          isActive={isActive("/auswertungen")}
          onClick={handleNavClick}
        >
          Bericht
        </NavItem>
      </nav>

      {/* Admin/System-Bereich - am unteren Rand */}
      <div className="mt-auto border-t border-white/10 py-4">
        <NavItem 
          href="/settings" 
          icon={<Settings className="h-5 w-5" />}
          isActive={isActive("/settings")}
          onClick={handleNavClick}
        >
          Einstellungen
        </NavItem>
        
        <NavItem 
          href="/synchronization" 
          icon={<RefreshCw className="h-5 w-5" />}
          isActive={isActive("/synchronization")}
          onClick={handleNavClick}
        >
          Synchronisierung
        </NavItem>
        
        {/* Logout Button */}
        <div 
          className="nav-item cursor-pointer" 
          onClick={() => {
            logout();
            if (onClose) onClose();
          }}
        >
          <LogOut className="h-5 w-5" />
          <span>Abmelden</span>
        </div>
      </div>
    </aside>
  );
}
