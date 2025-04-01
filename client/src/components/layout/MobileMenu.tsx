import { Link, useLocation } from "wouter";
import { X, Home, FileText, Package, ShoppingBag, RefreshCw, Clock, Settings, BarChart2, Truck, ShoppingCart, Building2, Users, LogOut, TrashIcon } from "lucide-react";
import { useAuth } from "@/lib";
import { Button } from "@/components/ui/button";

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
      <div className="h-full w-64 bg-white overflow-y-auto">
        {/* Header */}
        <div className="p-6 flex items-center justify-between border-b border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-primary rounded-md flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-white" />
            </div>
            <span className="ml-3 font-semibold text-lg">Proviantomat</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-gray-500 hover:bg-gray-100"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Mobile Nav - Übersicht */}
        <div className="py-4 border-b border-gray-200 bg-white">
          <h3 className="px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Übersicht
          </h3>
          <nav>
            <Link href="/" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Home className="h-5 w-5 mr-3" />
                Dashboard
              </div>
            </Link>
            <Link href="/automaten" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/automaten")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Package className="h-5 w-5 mr-3" />
                Automaten
              </div>
            </Link>
            <Link href="/produkte" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/produkte")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <ShoppingBag className="h-5 w-5 mr-3" />
                Produkte
              </div>
            </Link>
            <Link href="/lieferanten" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/lieferanten")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Truck className="h-5 w-5 mr-3" />
                Lieferanten
              </div>
            </Link>
            <Link href="/transactions" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/transactions")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <FileText className="h-5 w-5 mr-3" />
                Transaktionen
              </div>
            </Link>
          </nav>
        </div>

        {/* Mobile Nav - Verwaltung */}
        <div className="py-4 border-b border-gray-200 bg-white">
          <h3 className="px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Verwaltung
          </h3>
          <nav>
            <Link href="/bestellungen" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/bestellungen")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <ShoppingCart className="h-5 w-5 mr-3" />
                Bestellungen
              </div>
            </Link>
            <Link href="/lager" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/lager")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Building2 className="h-5 w-5 mr-3" />
                Lager
              </div>
            </Link>
            <Link href="/warenentnahme" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/warenentnahme")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <TrashIcon className="h-5 w-5 mr-3" />
                Warenentnahme
              </div>
            </Link>
            <Link href="/forecast" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/forecast")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <BarChart2 className="h-5 w-5 mr-3" />
                Prognosen
              </div>
            </Link>
            <Link href="/auswertungen" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/auswertungen")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <BarChart2 className="h-5 w-5 mr-3" />
                Auswertungen
              </div>
            </Link>
          </nav>
        </div>

        {/* Mobile System Nav */}
        <div className="py-4 border-b border-gray-200 bg-white">
          <h3 className="px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            System
          </h3>
          <nav>
            <Link href="/synchronization" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/synchronization")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <RefreshCw className="h-5 w-5 mr-3" />
                Synchronisierung
              </div>
            </Link>
            <Link href="/sync-history" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/sync-history")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Clock className="h-5 w-5 mr-3" />
                Sync-Verlauf
              </div>
            </Link>
            <Link href="/settings" onClick={handleLinkClick}>
              <div
                className={`flex items-center px-6 py-2 text-sm font-medium cursor-pointer ${
                  isActive("/settings")
                    ? "text-primary-600 bg-primary-50"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Settings className="h-5 w-5 mr-3" />
                Einstellungen
              </div>
            </Link>
          </nav>
        </div>

        {/* User Profile in Mobile Menu */}
        <div className="mt-auto p-6 border-t border-gray-200 bg-white">
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
                onClose();
              }}
            >
              <LogOut className="h-5 w-5 text-gray-500" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
