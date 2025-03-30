import { Link, useLocation } from "wouter";
import { X, Home, FileText, Package, ShoppingBag, RefreshCw, Clock, Settings, BarChart2, Truck, ShoppingCart, Database } from "lucide-react";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const [location] = useLocation();

  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    return location === path;
  };

  // Helper function to close menu when a link is clicked
  const handleLinkClick = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-20 bg-gray-800 bg-opacity-75 md:hidden">
      <div className="h-full w-64 bg-white p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-primary-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <span className="ml-2 font-semibold text-lg">Vendon Sync</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-gray-500 hover:bg-gray-100"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Mobile Nav */}
        <div className="py-4 border-b border-gray-200">
          <h3 className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Übersicht
          </h3>
          <nav>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Home className="h-5 w-5 mr-3" />
              Dashboard
            </div>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/transactions'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/transactions")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <FileText className="h-5 w-5 mr-3" />
              Transaktionen
            </div>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/automaten'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/automaten")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Package className="h-5 w-5 mr-3" />
              Automaten
            </div>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/produkte'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/produkte")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <ShoppingBag className="h-5 w-5 mr-3" />
              Produkte
            </div>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/lieferanten'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/lieferanten")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Truck className="h-5 w-5 mr-3" />
              Lieferanten
            </div>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/bestellungen'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/bestellungen")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <ShoppingCart className="h-5 w-5 mr-3" />
              Bestellungen
            </div>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/inventory'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/inventory")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Database className="h-5 w-5 mr-3" />
              Lager
            </div>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/auswertungen'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/auswertungen")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <BarChart2 className="h-5 w-5 mr-3" />
              Auswertungen
            </div>
          </nav>
        </div>

        {/* Mobile System Nav */}
        <div className="py-4 border-b border-gray-200">
          <h3 className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            System
          </h3>
          <nav>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/synchronization'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/synchronization")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <RefreshCw className="h-5 w-5 mr-3" />
              Synchronisierung
            </div>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/sync-history'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/sync-history")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Clock className="h-5 w-5 mr-3" />
              Sync-Verlauf
            </div>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/forecast'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/forecast")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <BarChart2 className="h-5 w-5 mr-3" />
              Prognosen
            </div>
            <div
              onClick={() => { handleLinkClick(); window.location.href = '/settings'; }}
              className={`flex items-center px-2 py-2 mb-1 rounded-md text-sm font-medium cursor-pointer ${
                isActive("/settings")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Settings className="h-5 w-5 mr-3" />
              Einstellungen
            </div>
          </nav>
        </div>

        {/* User Profile in Mobile Menu */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <img
                className="h-10 w-10 rounded-full"
                src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                alt="User avatar"
              />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-700">Max Mustermann</p>
              <p className="text-xs font-medium text-gray-500">Administrator</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
