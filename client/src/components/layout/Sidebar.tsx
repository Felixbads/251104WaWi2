import { Link, useLocation } from "wouter";
import {
  Home,
  FileText,
  Package,
  ShoppingBag,
  RefreshCw,
  Clock,
  Settings,
  LogOut,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Sidebar() {
  const [location] = useLocation();

  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    return location === path;
  };

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-gray-200 h-screen sticky top-0">
      <div className="p-4 flex items-center border-b border-gray-200">
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

      {/* Nav Section: Main */}
      <div className="py-4 border-b border-gray-200">
        <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Übersicht
        </h3>
        <nav>
          <Link href="/">
            <a
              className={`flex items-center px-4 py-2 text-sm font-medium ${
                isActive("/")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Home className="h-5 w-5 mr-3" />
              Dashboard
            </a>
          </Link>
          <Link href="/transactions">
            <a
              className={`flex items-center px-4 py-2 text-sm font-medium ${
                isActive("/transactions")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <FileText className="h-5 w-5 mr-3" />
              Transaktionen
            </a>
          </Link>
          <Link href="/machines">
            <a
              className={`flex items-center px-4 py-2 text-sm font-medium ${
                isActive("/machines")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Package className="h-5 w-5 mr-3" />
              Maschinen
            </a>
          </Link>
          <Link href="/products">
            <a
              className={`flex items-center px-4 py-2 text-sm font-medium ${
                isActive("/products")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <ShoppingBag className="h-5 w-5 mr-3" />
              Produkte
            </a>
          </Link>
        </nav>
      </div>

      {/* Nav Section: System */}
      <div className="py-4 border-b border-gray-200">
        <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          System
        </h3>
        <nav>
          <Link href="/synchronization">
            <a
              className={`flex items-center px-4 py-2 text-sm font-medium ${
                isActive("/synchronization")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <RefreshCw className="h-5 w-5 mr-3" />
              Synchronisierung
            </a>
          </Link>
          <Link href="/sync-history">
            <a
              className={`flex items-center px-4 py-2 text-sm font-medium ${
                isActive("/sync-history")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Clock className="h-5 w-5 mr-3" />
              Sync-Verlauf
            </a>
          </Link>
          <Link href="/forecast">
            <a
              className={`flex items-center px-4 py-2 text-sm font-medium ${
                isActive("/forecast")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <BarChart2 className="h-5 w-5 mr-3" />
              Prognosen
            </a>
          </Link>
          <Link href="/settings">
            <a
              className={`flex items-center px-4 py-2 text-sm font-medium ${
                isActive("/settings")
                  ? "text-primary-600 bg-primary-50"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Settings className="h-5 w-5 mr-3" />
              Einstellungen
            </a>
          </Link>
        </nav>
      </div>

      {/* User Profile Section */}
      <div className="mt-auto p-4 border-t border-gray-200">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <svg
                className="h-6 w-6 text-primary"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-700">{localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}').username : 'Benutzer'}</p>
            <p className="text-xs font-medium text-gray-500">{localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}').role : 'Gast'}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto rounded-full"
            onClick={() => {
              localStorage.removeItem('user');
              window.location.href = '/login';
            }}
          >
            <LogOut className="h-5 w-5 text-gray-500" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
