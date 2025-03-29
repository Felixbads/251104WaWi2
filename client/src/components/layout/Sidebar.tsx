import { useLocation } from "wouter";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib";

// Statt Link verwenden wir eine Hilfsfunktion, um das verschachtelte <a> Problem zu vermeiden
const NavItem = ({ href, icon, children, isActive }: { 
  href: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
  isActive: boolean;
}) => {
  return (
    <a
      href={href}
      className={`flex items-center px-4 py-2 text-sm font-medium ${
        isActive
          ? "text-primary-600 bg-primary-50"
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      {icon}
      {children}
    </a>
  );
};

export default function Sidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    return location === path;
  };

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200 h-screen sticky top-0">
      <div className="p-4 flex items-center border-b border-gray-200">
        <div className="h-8 w-8 bg-primary rounded-md flex items-center justify-center">
          <ShoppingBag className="h-5 w-5 text-white" />
        </div>
        <span className="ml-2 font-semibold text-lg">Proviantomat</span>
      </div>

      {/* Nav Section: Main */}
      <div className="py-4 border-b border-gray-200">
        <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
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
            href="/machines" 
            icon={<Package className="h-5 w-5 mr-3" />}
            isActive={isActive("/machines")}
          >
            Maschinen
          </NavItem>
          <NavItem 
            href="/products" 
            icon={<ShoppingBag className="h-5 w-5 mr-3" />}
            isActive={isActive("/products")}
          >
            Produkte
          </NavItem>
          <NavItem 
            href="/suppliers" 
            icon={<Truck className="h-5 w-5 mr-3" />}
            isActive={isActive("/suppliers")}
          >
            Lieferanten
          </NavItem>
          <NavItem 
            href="/orders" 
            icon={<ShoppingCart className="h-5 w-5 mr-3" />}
            isActive={isActive("/orders")}
          >
            Bestellungen
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

      {/* Nav Section: System */}
      <div className="py-4 border-b border-gray-200">
        <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
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
            href="/forecast" 
            icon={<BarChart2 className="h-5 w-5 mr-3" />}
            isActive={isActive("/forecast")}
          >
            Prognosen
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
      <div className="mt-auto p-4 border-t border-gray-200">
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
    </aside>
  );
}
