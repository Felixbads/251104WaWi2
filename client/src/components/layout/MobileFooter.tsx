import { useLocation } from "wouter";
import { Home, FileText, Package, RefreshCw } from "lucide-react";

// NavItem Komponente für Mobile Footer
const NavItem = ({ href, icon, label, isActive }: { 
  href: string; 
  icon: React.ReactNode; 
  label: string;
  isActive: boolean;
}) => {
  return (
    <a
      href={href}
      className={`flex flex-col items-center justify-center ${
        isActive ? "text-primary-600" : "text-gray-500"
      }`}
    >
      {icon}
      <span className="text-xs mt-1">{label}</span>
    </a>
  );
};

export default function MobileFooter() {
  const [location] = useLocation();

  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    return location === path;
  };

  return (
    <nav className="md:hidden bg-white border-t border-gray-200 fixed bottom-0 left-0 right-0 z-10">
      <div className="grid grid-cols-4 h-16">
        <NavItem 
          href="/" 
          icon={<Home className="h-6 w-6" />}
          label="Dashboard"
          isActive={isActive("/")}
        />
        <NavItem 
          href="/transactions" 
          icon={<FileText className="h-6 w-6" />}
          label="Transaktionen"
          isActive={isActive("/transactions")}
        />
        <NavItem 
          href="/machines" 
          icon={<Package className="h-6 w-6" />}
          label="Maschinen"
          isActive={isActive("/machines")}
        />
        <NavItem 
          href="/synchronization" 
          icon={<RefreshCw className="h-6 w-6" />}
          label="Sync"
          isActive={isActive("/synchronization")}
        />
      </div>
    </nav>
  );
}
