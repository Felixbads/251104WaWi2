import { Link, useLocation } from "wouter";
import { Home, FileText, Package, RefreshCw } from "lucide-react";

export default function MobileFooter() {
  const [location] = useLocation();

  // Helper function to determine if a link is active
  const isActive = (path: string) => {
    return location === path;
  };

  return (
    <nav className="md:hidden bg-white border-t border-gray-200 fixed bottom-0 left-0 right-0 z-10">
      <div className="grid grid-cols-4 h-16">
        <Link href="/">
          <a className={`flex flex-col items-center justify-center ${isActive("/") ? "text-primary-600" : "text-gray-500"}`}>
            <Home className="h-6 w-6" />
            <span className="text-xs mt-1">Dashboard</span>
          </a>
        </Link>
        <Link href="/transactions">
          <a className={`flex flex-col items-center justify-center ${isActive("/transactions") ? "text-primary-600" : "text-gray-500"}`}>
            <FileText className="h-6 w-6" />
            <span className="text-xs mt-1">Transaktionen</span>
          </a>
        </Link>
        <Link href="/machines">
          <a className={`flex flex-col items-center justify-center ${isActive("/machines") ? "text-primary-600" : "text-gray-500"}`}>
            <Package className="h-6 w-6" />
            <span className="text-xs mt-1">Maschinen</span>
          </a>
        </Link>
        <Link href="/synchronization">
          <a className={`flex flex-col items-center justify-center ${isActive("/synchronization") ? "text-primary-600" : "text-gray-500"}`}>
            <RefreshCw className="h-6 w-6" />
            <span className="text-xs mt-1">Sync</span>
          </a>
        </Link>
      </div>
    </nav>
  );
}
