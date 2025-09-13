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
      <div className="h-full w-72 bg-red-800 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-red-900 bg-red-900/30">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-white rounded-md flex items-center justify-center">
              <span className="text-red-600 font-bold">P</span>
            </div>
            <span className="ml-3 font-semibold text-lg text-white">Proviantomat</span>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-lg text-white bg-red-900/50 hover:bg-red-700 transition-colors duration-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
            data-testid="button-close-menu"
          >
            <X className="h-7 w-7" />
          </button>
        </div>

        {/* Mobile Nav - Übersicht */}
        <div className="py-6 border-b border-red-900">
          <h3 className="px-6 text-xs font-bold text-white/90 uppercase tracking-wider mb-4">
            Übersicht
          </h3>
          <nav className="space-y-1">
            {menuItems.overview.map((item, index) => (
              <Link href={item.path} onClick={handleLinkClick} key={index}>
                <div
                  className={`flex items-center px-6 py-4 text-base font-medium cursor-pointer transition-all duration-200 min-h-[48px] ${
                    isActive(item.path)
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

        {/* Mobile Nav - LAGER */}
        <div className="py-6 border-b border-red-900">
          <h3 className="px-6 text-xs font-bold text-white/90 uppercase tracking-wider mb-4">
            LAGER
          </h3>
          <nav className="space-y-1">
            {menuItems.storage.map((item, index) => (
              <Link href={item.path} onClick={handleLinkClick} key={index}>
                <div
                  className={`flex items-center px-6 py-4 text-base font-medium cursor-pointer transition-all duration-200 min-h-[48px] ${
                    isActive(item.path)
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

        {/* Mobile Nav - Verwaltung */}
        {menuItems.management.length > 0 && (
          <div className="py-6 border-b border-red-900">
            <h3 className="px-6 text-xs font-bold text-white/90 uppercase tracking-wider mb-4">
              Verwaltung
            </h3>
            <nav className="space-y-1">
              {menuItems.management.map((item, index) => (
                <Link href={item.path === "/bestellungen" ? "/bestellungen/neu-v2" : item.path} onClick={handleLinkClick} key={index}>
                  <div
                    className={`flex items-center px-6 py-4 text-base font-medium cursor-pointer transition-all duration-200 min-h-[48px] ${
                      isActive(item.path === "/bestellungen" ? "/bestellungen/neu-v2" : item.path)
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
        <div className="py-6 border-b border-red-900">
          <h3 className="px-6 text-xs font-bold text-white/90 uppercase tracking-wider mb-4">
            ANALYSE
          </h3>
          <nav className="space-y-1">
            {menuItems.analysis.map((item, index) => (
              <Link href={item.path} onClick={handleLinkClick} key={index}>
                <div
                  className={`flex items-center px-6 py-4 text-base font-medium cursor-pointer transition-all duration-200 min-h-[48px] ${
                    isActive(item.path)
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

        {/* Mobile System Nav */}
        <div className="py-6 border-b border-red-900">
          <h3 className="px-6 text-xs font-bold text-white/90 uppercase tracking-wider mb-4">
            SYSTEM
          </h3>
          <nav className="space-y-1">
            {menuItems.system.map((item, index) => (
              <Link href={item.path} onClick={handleLinkClick} key={index}>
                <div
                  className={`flex items-center px-6 py-4 text-base font-medium cursor-pointer transition-all duration-200 min-h-[48px] ${
                    isActive(item.path)
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

        {/* User Profile in Mobile Menu */}
        <div className="mt-auto p-6 border-t border-red-900 bg-red-900/20">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center shadow-lg">
                <Users className="h-7 w-7 text-white" />
              </div>
            </div>
            <div className="ml-4 flex-1">
              <p className="text-base font-semibold text-white">{user?.username || 'Admin'}</p>
              <p className="text-sm font-medium text-white/80">{user?.role || 'Administrator'}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-4 rounded-full text-white hover:bg-red-700 bg-red-900/50 min-h-[44px] min-w-[44px] transition-all duration-200 shadow-lg"
              onClick={() => {
                logout();
                onClose();
              }}
              data-testid="button-logout"
            >
              <LogOut className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}