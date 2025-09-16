import { Link, useLocation } from "wouter";
import { X, Users, LogOut } from "lucide-react";
import { useAuth } from "@/lib";
import { Button } from "@/components/ui/button";
import { menuItems } from "./AppShell";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    return location.startsWith(path);
  };

  // Helper function to close menu when a link is clicked
  const handleLinkClick = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden">
      <div className="h-full w-72 bg-white shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-gray-200 bg-gray-50">
          <div className="flex items-center">
            <div className="h-7 w-7 bg-red-600 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="ml-3 font-semibold text-base text-gray-900">Proviantomat</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
            data-testid="button-close-menu"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Mobile Nav - Übersicht */}
        <div className="py-3 border-b border-gray-200">
          <h3 className="px-4 text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
            Übersicht
          </h3>
          <nav className="space-y-0">
            {menuItems.overview.map((item, index) => (
              <Link 
                href={item.path} 
                onClick={handleLinkClick} 
                key={index}
                className={`flex items-center px-4 py-2 text-sm font-medium cursor-pointer transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-white ${
                  isActive(item.path)
                    ? "text-white bg-red-600 border-l-4 border-red-800 shadow-lg"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 hover:shadow-md active:bg-gray-200"
                }`}
                data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                aria-current={isActive(item.path) ? "page" : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="ml-1">{item.title}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Mobile Nav - LAGER */}
        <div className="py-3 border-b border-gray-200">
          <h3 className="px-4 text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
            LAGER
          </h3>
          <nav className="space-y-0">
            {menuItems.storage.map((item, index) => (
              <Link 
                href={item.path} 
                onClick={handleLinkClick} 
                key={index}
                className={`flex items-center px-4 py-2 text-sm font-medium cursor-pointer transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-white ${
                  isActive(item.path)
                    ? "text-white bg-red-600 border-l-4 border-red-800 shadow-lg"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 hover:shadow-md active:bg-gray-200"
                }`}
                data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                aria-current={isActive(item.path) ? "page" : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="ml-1">{item.title}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Mobile Nav - Verwaltung */}
        {menuItems.management.length > 0 && (
          <div className="py-3 border-b border-red-900">
            <h3 className="px-4 text-xs font-bold text-white/90 uppercase tracking-wider mb-2">
              Verwaltung
            </h3>
            <nav className="space-y-0">
              {menuItems.management.map((item, index) => (
                <Link href={item.path === "/bestellungen" ? "/bestellungen/neu" : item.path} onClick={handleLinkClick} key={index}>
                  <div
                    className={`flex items-center px-4 py-2 text-sm font-medium cursor-pointer transition-all duration-200 min-h-[44px] ${
                      isActive(item.path === "/bestellungen" ? "/bestellungen/neu" : item.path)
                        ? "text-white bg-red-900/80 border-l-4 border-white shadow-lg"
                        : "text-white/95 hover:bg-red-700/80 hover:text-white hover:shadow-md active:bg-red-900"
                    }`}
                    data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="ml-1">{item.title}</span>
                  </div>
                </Link>
              ))}
            </nav>
          </div>
        )}

        {/* Mobile Nav - ANALYSE */}
        <div className="py-3 border-b border-gray-200">
          <h3 className="px-4 text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
            ANALYSE
          </h3>
          <nav className="space-y-0">
            {menuItems.analysis.map((item, index) => (
              <Link 
                href={item.path} 
                onClick={handleLinkClick} 
                key={index}
                className={`flex items-center px-4 py-2 text-sm font-medium cursor-pointer transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-white ${
                  isActive(item.path)
                    ? "text-white bg-red-600 border-l-4 border-red-800 shadow-lg"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 hover:shadow-md active:bg-gray-200"
                }`}
                data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                aria-current={isActive(item.path) ? "page" : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="ml-1">{item.title}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Mobile System Nav */}
        <div className="py-3 border-b border-gray-200">
          <h3 className="px-4 text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
            SYSTEM
          </h3>
          <nav className="space-y-0">
            {menuItems.system.map((item, index) => (
              <Link 
                href={item.path} 
                onClick={handleLinkClick} 
                key={index}
                className={`flex items-center px-4 py-2 text-sm font-medium cursor-pointer transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-white ${
                  isActive(item.path)
                    ? "text-white bg-red-600 border-l-4 border-red-800 shadow-lg"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 hover:shadow-md active:bg-gray-200"
                }`}
                data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                aria-current={isActive(item.path) ? "page" : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="ml-1">{item.title}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* User Profile in Mobile Menu */}
        <div className="mt-auto p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center shadow-lg">
                <Users className="h-5 w-5 text-gray-600" />
              </div>
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-semibold text-gray-900">{user?.username || 'Admin'}</p>
              <p className="text-xs font-medium text-gray-600">{user?.role || 'Administrator'}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-3 rounded-full text-gray-600 hover:bg-gray-200 bg-gray-100 min-h-[44px] min-w-[44px] transition-all duration-200 shadow-lg"
              onClick={() => {
                logout();
                onClose();
              }}
              data-testid="button-logout"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}