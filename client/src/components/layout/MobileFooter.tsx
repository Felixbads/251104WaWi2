import React from "react";
import { useLocation, Link } from "wouter";
import { Home, Package, ShoppingCart, PackageOpen, Trash2 } from "lucide-react";
import { menuItems } from "./AppShell";

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
          isActive ? "text-red-600" : "text-gray-500"
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

  // Wichtigste Seiten für die mobile Fußleiste
  const footerItems = [
    menuItems.overview[0], // Dashboard
    menuItems.overview[1], // Automaten
    menuItems.storage[2], // Bestellungen
    menuItems.storage[0], // Lagerbestand
    menuItems.storage[1], // Warenbewegung (statt Warenentnahme)
  ];

  return (
    <nav className="md:hidden bg-white border-t border-gray-200 fixed bottom-0 left-0 right-0 z-10">
      <div className="grid grid-cols-5 h-16">
        {footerItems.map((item, index) => (
          <NavItem 
            key={index}
            href={item.path} 
            icon={React.cloneElement(item.icon as React.ReactElement, { className: "h-6 w-6" })}
            label={item.title}
            isActive={isActive(item.path)}
          />
        ))}
      </div>
    </nav>
  );
}
