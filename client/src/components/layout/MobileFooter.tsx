import { useLocation, Link } from "wouter";
import { Home, Package, ShoppingCart, Building2, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FooterNavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
}

// NavItem component for mobile footer
const FooterNavItem = ({ href, icon, label, isActive }: FooterNavItemProps) => {
  return (
    <Link href={href}>
      <a
        className={cn(
          "flex flex-col items-center justify-center py-2 px-1",
          isActive 
            ? "text-primary" 
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <div className={cn(
          "relative flex items-center justify-center mb-1", 
          isActive && "after:content-[''] after:absolute after:-bottom-1 after:w-1.5 after:h-1.5 after:bg-primary after:rounded-full"
        )}>
          {icon}
        </div>
        <span className="text-xs font-medium">{label}</span>
      </a>
    </Link>
  );
};

export default function MobileFooter() {
  const [location] = useLocation();

  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    return path !== "/" && location.startsWith(path);
  };

  return (
    <nav className="grid grid-cols-5 h-16 bg-background">
      <FooterNavItem 
        href="/" 
        icon={<Home className="h-5 w-5" />}
        label="Dashboard"
        isActive={isActive("/")}
      />
      <FooterNavItem 
        href="/automaten" 
        icon={<Package className="h-5 w-5" />}
        label="Automaten"
        isActive={isActive("/automaten")}
      />
      <FooterNavItem 
        href="/bestellungen" 
        icon={<ShoppingCart className="h-5 w-5" />}
        label="Bestellungen"
        isActive={isActive("/bestellungen")}
      />
      <FooterNavItem 
        href="/lager" 
        icon={<Building2 className="h-5 w-5" />}
        label="Lager"
        isActive={isActive("/lager")}
      />
      <FooterNavItem 
        href="/forecast" 
        icon={<BarChart2 className="h-5 w-5" />}
        label="Prognose"
        isActive={isActive("/forecast")}
      />
    </nav>
  );
}
