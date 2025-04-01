import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  Filter, 
  RefreshCw, 
  Download, 
  Plus, 
  SlidersHorizontal, 
  X 
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PageHeaderProps {
  title?: string; // Titel ist jetzt optional
  showSearch?: boolean;
  showFilter?: boolean;
  showRefresh?: boolean;
  showDownload?: boolean;
  showAdd?: boolean;
  showSettings?: boolean; 
  onSearch?: (value: string) => void;
  onFilter?: () => void;
  onRefresh?: () => void;
  onDownload?: () => void;
  onAdd?: () => void;
  onSettings?: () => void;
  searchPlaceholder?: string;
  additionalButtons?: React.ReactNode;
  activeFilters?: string[];
  onClearFilter?: (filter: string) => void;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  showSearch = false,
  showFilter = false,
  showRefresh = false,
  showDownload = false,
  showAdd = false,
  showSettings = false,
  onSearch,
  onFilter,
  onRefresh,
  onDownload,
  onAdd,
  onSettings,
  searchPlaceholder = "Suchen...",
  additionalButtons,
  activeFilters = [],
  onClearFilter
}) => {
  return (
    <div className="mb-6">
      {/* Haupttitel Zeile */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        {title && <h1 className="text-2xl font-bold">{title}</h1>}
        
        <div className={`flex flex-wrap items-center gap-2 w-full ${title ? 'sm:w-auto' : 'sm:w-full'}`}>
          {/* Suchfeld */}
          {showSearch && (
            <div className="relative w-full sm:w-auto flex-grow sm:flex-grow-0 sm:max-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={searchPlaceholder}
                className="pl-8 h-9"
                onChange={(e) => onSearch && onSearch(e.target.value)}
              />
            </div>
          )}
          
          {/* Icons als Buttons */}
          <div className="flex items-center gap-1.5">
            <TooltipProvider>
              {showFilter && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={onFilter}
                    >
                      <Filter className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Filter</TooltipContent>
                </Tooltip>
              )}
              
              {showRefresh && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={onRefresh}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Aktualisieren</TooltipContent>
                </Tooltip>
              )}
              
              {showDownload && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={onDownload}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Exportieren</TooltipContent>
                </Tooltip>
              )}
              
              {showSettings && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={onSettings}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Einstellungen</TooltipContent>
                </Tooltip>
              )}
              
              {showAdd && (
                <Button
                  className="h-9"
                  onClick={onAdd}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Neu
                </Button>
              )}
              
              {additionalButtons}
            </TooltipProvider>
          </div>
        </div>
      </div>
      
      {/* Aktive Filter anzeigen, wenn vorhanden */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {activeFilters.map((filter, index) => (
            <div 
              key={index} 
              className="text-xs py-1 px-2 bg-gray-100 rounded-md flex items-center gap-1.5"
            >
              {filter}
              {onClearFilter && (
                <button 
                  onClick={() => onClearFilter(filter)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PageHeader;