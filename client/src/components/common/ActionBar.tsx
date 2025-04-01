import React, { ReactNode } from 'react';
import { 
  Search, 
  Filter, 
  RefreshCw, 
  Download, 
  Plus, 
  Grid, 
  List, 
  Map,
  SlidersHorizontal
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export interface ActionBarProps {
  // Suchfeld
  showSearch?: boolean;
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  searchValue?: string;
  
  // Filter
  showFilter?: boolean;
  onFilter?: () => void;
  activeFiltersCount?: number;
  
  // Ansichts-Schalter
  showViewToggle?: boolean;
  viewMode?: 'grid' | 'list' | 'map';
  onViewChange?: (mode: 'grid' | 'list' | 'map') => void;
  availableViews?: ('grid' | 'list' | 'map')[];
  
  // Aktualisieren
  showRefresh?: boolean;
  onRefresh?: () => void;
  
  // Neuer Eintrag
  showAdd?: boolean;
  onAdd?: () => void;
  addLabel?: string;
  
  // Filter-Dropdowns 
  filterDropdowns?: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  }[];
  
  // Einstellungen
  showSettings?: boolean; 
  onSettings?: () => void;
  
  // Extra Buttons
  extraButtons?: ReactNode;
}

/**
 * ActionBar - Eine einheitliche Komponente für Suchfeld, Filter, Ansicht und Aktionen 
 * die auf allen Seiten konsistent verwendet wird.
 */
export const ActionBar: React.FC<ActionBarProps> = ({
  // Standardwerte für alle Props
  showSearch = false,
  searchPlaceholder = "Suchen...",
  onSearch,
  searchValue = "",
  
  showFilter = false,
  onFilter,
  activeFiltersCount = 0,
  
  showViewToggle = false,
  viewMode = 'grid',
  onViewChange,
  availableViews = ['grid', 'list'],
  
  showRefresh = false,
  onRefresh,
  
  showAdd = false,
  onAdd,
  addLabel = "Neu",
  
  filterDropdowns = [],
  
  showSettings = false,
  onSettings,
  
  extraButtons
}) => {
  return (
    <div className="w-full flex flex-col md:flex-row gap-3 mb-6">
      {/* Linke Seite: Suchfeld und Filter-Dropdowns */}
      <div className="flex-grow flex flex-col sm:flex-row gap-2">
        {/* Suchfeld */}
        {showSearch && (
          <div className="relative flex-grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              value={searchValue}
              placeholder={searchPlaceholder}
              className="pl-8 h-9 w-full"
              onChange={(e) => onSearch && onSearch(e.target.value)}
            />
          </div>
        )}
        
        {/* Filter-Dropdowns */}
        {filterDropdowns.map((dropdown) => (
          <Select 
            key={dropdown.id} 
            value={dropdown.value} 
            onValueChange={dropdown.onChange}
          >
            <SelectTrigger className="h-9 min-w-[140px] w-auto">
              <SelectValue placeholder={dropdown.label} />
            </SelectTrigger>
            <SelectContent>
              {dropdown.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>
      
      {/* Rechte Seite: Aktionen */}
      <div className="flex flex-wrap items-center gap-2">
        <TooltipProvider>
          {/* Filter Button */}
          {showFilter && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 relative"
                  onClick={onFilter}
                >
                  <Filter className="h-4 w-4" />
                  {activeFiltersCount > 0 && (
                    <Badge 
                      variant="secondary" 
                      className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center"
                    >
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Filter</TooltipContent>
            </Tooltip>
          )}
          
          {/* Ansichts-Schalter */}
          {showViewToggle && (
            <div className="border rounded-md p-0.5 flex">
              {availableViews.includes('grid') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "grid" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => onViewChange && onViewChange("grid")}
                      className="h-8 w-8 rounded-sm"
                    >
                      <Grid className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Kachelansicht</TooltipContent>
                </Tooltip>
              )}
              
              {availableViews.includes('list') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "list" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => onViewChange && onViewChange("list")}
                      className="h-8 w-8 rounded-sm"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Listenansicht</TooltipContent>
                </Tooltip>
              )}
              
              {availableViews.includes('map') && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewMode === "map" ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => onViewChange && onViewChange("map")}
                      className="h-8 w-8 rounded-sm"
                    >
                      <Map className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Kartenansicht</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
          
          {/* Aktualisieren Button */}
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
          
          {/* Einstellungen Button */}
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
          
          {/* Neu Button */}
          {showAdd && (
            <Button
              className="h-9"
              onClick={onAdd}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {addLabel}
            </Button>
          )}
          
          {/* Zusätzliche Buttons */}
          {extraButtons}
        </TooltipProvider>
      </div>
    </div>
  );
};

export default ActionBar;