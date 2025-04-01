import { useLocation, Link } from "wouter";
import { X, Menu } from "lucide-react";
import {
  Home,
  FileText,
  Package,
  ShoppingBag,
  RefreshCw,
  Settings,
  LogOut,
  BarChart2,
  Truck,
  ShoppingCart,
  Building2,
  FileBarChart,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "@/lib";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isActive: boolean;
  onClick?: () => void;
}

const NavItem = ({ href, icon, children, isActive, onClick }: NavItemProps) => {
  return (
    <Link href={href}>
      <a 
        onClick={onClick} 
        className={cn(
          "flex items-center gap-3 px-3 py-2 mb-1 rounded-md text-sidebar-foreground/90 hover:bg-sidebar-accent transition-colors",
          isActive && "bg-sidebar-accent font-medium"
        )}
      >
        <div className="w-5 h-5 shrink-0 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-sm">{children}</span>
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
  
  // Function to close the menu on mobile devices
  const handleNavClick = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile overlay when sidebar is open */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={onClose}
        />
      )}
      
      <aside 
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-[250px] bg-sidebar-background flex flex-col shadow-lg",
          "transform transition-transform duration-300 ease-in-out",
          "md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo and header */}
        <div className="flex items-center px-4 py-5 border-b border-sidebar-border">
          <ClipboardList className="h-6 w-6 text-sidebar-foreground" />
          <span className="ml-3 text-lg font-semibold text-sidebar-foreground">Proviantomat</span>
          
          {/* Mobile Close Button */}
          {isOpen && onClose && (
            <Button 
              onClick={onClose}
              variant="ghost" 
              className="md:hidden ml-auto text-sidebar-foreground hover:bg-sidebar-accent p-1 h-8 w-8"
              size="icon"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Main navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
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

        {/* Admin/System section at the bottom */}
        <div className="mt-auto border-t border-sidebar-border px-3 py-4">
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
          <button 
            className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md text-sidebar-foreground/90 hover:bg-sidebar-accent transition-colors"
            onClick={() => {
              logout();
              if (onClose) onClose();
            }}
          >
            <div className="w-5 h-5 shrink-0 flex items-center justify-center">
              <LogOut className="h-5 w-5" />
            </div>
            <span className="text-sm">Abmelden</span>
          </button>
        </div>
      </aside>
      
      {/* Mobile menu toggle button */}
      <Button 
        variant="outline" 
        size="icon" 
        className="fixed bottom-20 right-4 md:hidden z-30 bg-white shadow-md" 
        onClick={() => isOpen ? onClose?.() : handleNavClick()}
      >
        <Menu className="h-5 w-5" />
      </Button>
    </>
  );
}
