import { Menu, Bell } from "lucide-react";

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
      </div>
      <div>
        <button className="p-2 rounded-md text-gray-500 hover:bg-gray-100">
          <Bell className="h-6 w-6" />
        </button>
      </div>
    </header>
  );
}
