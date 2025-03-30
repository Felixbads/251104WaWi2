
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  LayoutDashboard,
  Router,
  Package,
  ShoppingCart,
  Truck,
  BarChart3,
  Settings,
  RefreshCw,
  Warehouse
} from "lucide-react";

export function MainNavigation() {
  const [location] = useLocation();

  const mainItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: <LayoutDashboard className="h-4 w-4 mr-2" />,
      active: location === "/"
    },
    {
      name: "Automaten",
      href: "/automaten",
      icon: <Router className="h-4 w-4 mr-2" />,
      active: location === "/automaten"
    },
    {
      name: "Produkte",
      href: "/produkte",
      icon: <Package className="h-4 w-4 mr-2" />,
      active: location === "/produkte"
    },
    {
      name: "Lager",
      href: "/lager",
      icon: <Warehouse className="h-4 w-4 mr-2" />,
      active: location === "/lager"
    },
    {
      name: "Bestellungen",
      href: "/bestellungen",
      icon: <ShoppingCart className="h-4 w-4 mr-2" />,
      active: location === "/bestellungen"
    },
    {
      name: "Lieferanten",
      href: "/lieferanten",
      icon: <Truck className="h-4 w-4 mr-2" />,
      active: location === "/lieferanten"
    },
    {
      name: "Auswertungen",
      href: "/auswertungen",
      icon: <BarChart3 className="h-4 w-4 mr-2" />,
      active: location === "/auswertungen"
    },
    {
      name: "Synchronisation",
      href: "/synchronisation",
      icon: <RefreshCw className="h-4 w-4 mr-2" />,
      active: location === "/synchronisation"
    },
    {
      name: "Einstellungen",
      href: "/einstellungen",
      icon: <Settings className="h-4 w-4 mr-2" />,
      active: location === "/einstellungen"
    }
  ];

  return (
    <NavigationMenu className="ml-6">
      <NavigationMenuList>
        {mainItems.map((item) => (
          <NavigationMenuItem key={item.name}>
            <Link href={item.href}>
              <NavigationMenuLink 
                className={cn(
                  navigationMenuTriggerStyle(), 
                  "flex items-center",
                  item.active && "bg-accent"
                )}
                active={item.active}
              >
                {item.icon}
                {item.name}
              </NavigationMenuLink>
            </Link>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
