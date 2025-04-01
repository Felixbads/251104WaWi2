import { useLocation, Link } from "wouter";
import { Home, Package, ShoppingCart, PackageOpen, Trash2 } from "lucide-react";

// NavItem Komponente für Mobile Footer
const NavItem = ({ href, icon, label, isActive }: { 
  href: string; 
  icon: React.ReactNode; 
  label: string;
  isActive: boolean;
}) => {
  return (
    <Link href={href}>
      <div
        className={`flex flex-col items-center justify-center cursor-pointer ${
          isActive ? "text-primary-600" : "text-gray-500"
        }`}
      >
        {icon}
        <span className="text-xs mt-1">{label}</span>
      </div>
    </Link>
  );
};

export default function MobileFooter() {
  const [location] = useLocation();

  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    return location.startsWith(path);
  };

  return (
    <nav className="md:hidden bg-white border-t border-gray-200 fixed bottom-0 left-0 right-0 z-10">
      <div className="grid grid-cols-5 h-16">
        <NavItem 
          href="/" 
          icon={<Home className="h-6 w-6" />}
          label="Dashboard"
          isActive={isActive("/")}
        />
        <NavItem 
          href="/automaten" 
          icon={<Package className="h-6 w-6" />}
          label="Automaten"
          isActive={isActive("/automaten")}
        />
        <NavItem 
          href="/bestellungen" 
          icon={<ShoppingCart className="h-6 w-6" />}
          label="Bestellungen"
          isActive={isActive("/bestellungen")}
        />
        <NavItem 
          href="/lager" 
          icon={<PackageOpen className="h-6 w-6" />}
          label="Lager"
          isActive={isActive("/lager")}
        />
        <NavItem 
          href="/warenentnahme" 
          icon={<Trash2 className="h-6 w-6" />}
          label="Entnahme"
          isActive={isActive("/warenentnahme")}
        />
      </div>
    </nav>
  );
}
