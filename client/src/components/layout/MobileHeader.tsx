import { Menu, ShoppingBag } from "lucide-react";

interface MobileHeaderProps {
  pageTitle: string;
  onMenuToggle: () => void;
}

export default function MobileHeader({ pageTitle, onMenuToggle }: MobileHeaderProps) {
  return (
    <header className="bg-white shadow-sm px-4 py-2 flex justify-between items-center md:hidden">
      <div className="flex items-center space-x-3">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-md text-gray-500 hover:bg-gray-100"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex items-center">
          <div className="h-8 w-8 bg-primary rounded-md flex items-center justify-center">
            <ShoppingBag className="h-5 w-5 text-white" />
          </div>
          <span className="ml-2 font-semibold text-lg">Proviantomat</span>
        </div>
      </div>
      {/* Rechtes Menü entfernt */}
    </header>
  );
}
