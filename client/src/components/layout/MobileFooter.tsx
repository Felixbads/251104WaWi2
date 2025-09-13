import React from "react";
import { useLocation, Link } from "wouter";
import { Home, Package, ShoppingCart, PackageOpen, Trash2 } from "lucide-react";
import { menuItems } from "./AppShell";

// Enhanced NavItem component with better mobile UX
const NavItem = ({ href, icon, label, isActive }: { 
  href: string; 
  icon: React.ReactNode; 
  label: string;
  isActive: boolean;
}) => {
  return (
    <Link 
      href={href}
      className={`
        flex flex-col items-center justify-center
        min-h-[60px] min-w-[60px] px-2 py-1.5
        rounded-lg transition-all duration-200 ease-in-out
        cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
        ${isActive 
          ? "text-white dark:text-white bg-gradient-to-t from-red-600 to-red-500 shadow-lg scale-105" 
          : "text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700 active:bg-red-100 dark:active:bg-gray-600 active:scale-95"
        }
      `}
      data-testid={`nav-${href.replace('/', '').replace(/\//g, '-') || 'home'}`}
      aria-current={isActive ? "page" : undefined}
    >
      <div className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'scale-100'}`}>
        {icon}
      </div>
      <span 
        className={`
          text-xs mt-0.5 font-medium leading-tight text-center
          ${isActive ? 'text-white font-semibold' : 'text-gray-600 dark:text-gray-300'}
        `}
      >
        {label}
      </span>
    </Link>
  );
};

export default function MobileFooter() {
  const [location] = useLocation();

  // Enhanced helper function to determine if a link is active
  const isActive = (path: string) => {
    // Handle exact match for home route
    if (path === '/') {
      return location === '/';
    }
    return location.startsWith(path);
  };

  // Curated footer items optimized for mobile navigation with robust selection
  const footerItems = [
    menuItems.overview.find(item => item.path === '/') || menuItems.overview[0], // Dashboard
    menuItems.overview.find(item => item.path === '/standort-status') || menuItems.overview[1], // Standorte
    menuItems.storage.find(item => item.path === '/bestellungen') || menuItems.storage[5], // Bestellungen
    menuItems.storage.find(item => item.path === '/lagerbestand') || menuItems.storage[0], // Lagerbestand
    menuItems.storage.find(item => item.path === '/warenbewegung') || menuItems.storage[2], // Warenbewegung
  ].filter(Boolean);

  return (
    <>
      {/* Safe area spacer for devices with bottom insets */}
      <div className="md:hidden h-20" />
      
      {/* Enhanced mobile footer navigation */}
      <nav 
        className="
          md:hidden 
          bg-white/95 dark:bg-gray-900/95 backdrop-blur-md 
          border-t border-gray-200 dark:border-gray-700 
          fixed bottom-0 left-0 right-0 
          z-50 
          shadow-lg
          supports-[backdrop-filter]:bg-white/90 dark:supports-[backdrop-filter]:bg-gray-900/90
        "
        role="navigation"
        aria-label="Mobile navigation"
        data-testid="mobile-footer-nav"
      >
        {/* Navigation items container */}
        <div className="grid grid-cols-5 gap-1 px-2 py-2 pb-safe">
          {footerItems.map((item, index) => (
            <NavItem 
              key={`${item.path}-${index}`}
              href={item.path} 
              icon={React.cloneElement(
                item.icon as React.ReactElement, 
                { 
                  className: `h-6 w-6 transition-all duration-200 ${
                    isActive(item.path) ? 'drop-shadow-sm' : ''
                  }`
                }
              )}
              label={item.title}
              isActive={isActive(item.path)}
            />
          ))}
        </div>
        
        {/* Additional safe area for devices with home indicator */}
        <div className="h-safe-bottom" />
      </nav>
    </>
  );
}
