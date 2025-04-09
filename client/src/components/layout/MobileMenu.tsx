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
    <div className="fixed inset-0 z-20 bg-gray-800 bg-opacity-75 md:hidden">
      <div className="h-full w-64 bg-red-600 overflow-y-auto">
        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-red-700">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-white rounded-md flex items-center justify-center">
              <span className="text-red-600 font-bold">P</span>
            </div>
            <span className="ml-3 font-semibold text-lg text-white">Proviantomat</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-white hover:bg-red-700"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Mobile Nav - Übersicht */}
        <div className="py-4 border-b border-red-700">
          <h3 className="px-6 text-xs font-semibold text-white uppercase tracking-wider mb-2">
            Übersicht
          </h3>
          <nav>
            {menuItems.overview.map((item, index) => (
              <Link href={item.path} onClick={handleLinkClick} key={index}>
                <div
                  className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                    isActive(item.path)
                      ? "text-white bg-red-700"
                      : "text-white hover:bg-red-700"
                  }`}
                >
                  {item.icon}
                  {item.title}
                </div>
              </Link>
            ))}
          </nav>
        </div>

        {/* Mobile Nav - LAGER */}
        <div className="py-4 border-b border-red-700">
          <h3 className="px-6 text-xs font-semibold text-white uppercase tracking-wider mb-2">
            LAGER
          </h3>
          <nav>
            {menuItems.storage.map((item, index) => (
              <Link href={item.path} onClick={handleLinkClick} key={index}>
                <div
                  className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                    isActive(item.path)
                      ? "text-white bg-red-700"
                      : "text-white hover:bg-red-700"
                  }`}
                >
                  {item.icon}
                  {item.title}
                </div>
              </Link>
            ))}
          </nav>
        </div>

        {/* Mobile Nav - Verwaltung */}
        <div className="py-4 border-b border-red-700">
          <h3 className="px-6 text-xs font-semibold text-white uppercase tracking-wider mb-2">
            Verwaltung
          </h3>
          <nav>
            {menuItems.management.map((item, index) => (
              <Link href={item.path} onClick={handleLinkClick} key={index}>
                <div
                  className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                    isActive(item.path)
                      ? "text-white bg-red-700"
                      : "text-white hover:bg-red-700"
                  }`}
                >
                  {item.icon}
                  {item.title}
                </div>
              </Link>
            ))}
          </nav>
        </div>
        
        {/* Mobile Nav - ANALYSE */}
        <div className="py-4 border-b border-red-700">
          <h3 className="px-6 text-xs font-semibold text-white uppercase tracking-wider mb-2">
            ANALYSE
          </h3>
          <nav>
            {menuItems.analysis.map((item, index) => (
              <Link href={item.path} onClick={handleLinkClick} key={index}>
                <div
                  className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                    isActive(item.path)
                      ? "text-white bg-red-700"
                      : "text-white hover:bg-red-700"
                  }`}
                >
                  {item.icon}
                  {item.title}
                </div>
              </Link>
            ))}
          </nav>
        </div>

        {/* Mobile System Nav */}
        <div className="py-4 border-b border-red-700">
          <h3 className="px-6 text-xs font-semibold text-white uppercase tracking-wider mb-2">
            SYSTEM
          </h3>
          <nav>
            {menuItems.system.map((item, index) => (
              <Link href={item.path} onClick={handleLinkClick} key={index}>
                <div
                  className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                    isActive(item.path)
                      ? "text-white bg-red-700"
                      : "text-white hover:bg-red-700"
                  }`}
                >
                  {item.icon}
                  {item.title}
                </div>
              </Link>
            ))}
          </nav>
        </div>

        {/* User Profile in Mobile Menu */}
        <div className="mt-auto p-6 border-t border-red-700">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-white">{user?.username || 'Admin'}</p>
              <p className="text-xs font-medium text-white/70">{user?.role || 'Administrator'}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto rounded-full text-white hover:bg-red-700"
              onClick={() => {
                logout();
                onClose();
              }}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
