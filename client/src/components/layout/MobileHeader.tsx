import { Menu, ShoppingBag } from "lucide-react";

interface MobileHeaderProps {
  pageTitle: string;
  onMenuToggle: () => void;
}

export default function MobileHeader({ pageTitle, onMenuToggle }: MobileHeaderProps) {
  return (
    <header className="bg-white dark:bg-gray-900 shadow-md border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex flex-col md:hidden sticky top-0 z-50">
      {/* Erste Zeile: Menü und Logo */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-4">
          {/* Verbesserter Hamburger-Button mit größerer Touch-Target */}
          <button
            onClick={onMenuToggle}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label="Menü öffnen"
            data-testid="button-menu-toggle"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          {/* Verbessertes Logo und Branding */}
          <div className="flex items-center">
            <div className="h-10 w-10 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center shadow-sm">
              <ShoppingBag className="h-6 w-6 text-white" />
            </div>
            <span className="ml-3 font-bold text-xl text-gray-900 dark:text-white tracking-tight">
              Proviantomat
            </span>
          </div>
        </div>
      </div>
      
      {/* Zweite Zeile: Prominenter Seitentitel */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight" data-testid="text-page-title">
          {pageTitle}
        </h1>
      </div>
    </header>
  );
}
