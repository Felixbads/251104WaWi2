import React from 'react';
import { Button } from '@/components/ui/button';
import { PlayCircle, Save, CheckCircle2, RefreshCw } from 'lucide-react';

interface SimpleInventoryActionsProps {
  inventoryId: number;
  status: string;
  onAction: (action: 'start' | 'save' | 'complete', notes?: string) => void;
  isLoading?: boolean;
  showSaveButton?: boolean;
}

export const SimpleInventoryActions: React.FC<SimpleInventoryActionsProps> = ({
  inventoryId,
  status,
  onAction,
  isLoading = false,
  showSaveButton = true
}) => {
  

  
  const handleStart = () => {
    onAction('start');
  };
  
  const handleSave = () => {
    onAction('save');
  };
  
  const handleComplete = () => {
    // Einfacher Bestätigungs-Dialog über Browser-API
    const confirmed = window.confirm(
      'Möchten Sie die Inventur wirklich abschließen? Diese Aktion kann nicht rückgängig gemacht werden.'
    );
    
    if (confirmed) {
      const notes = window.prompt('Abschlussnotizen (optional):') || '';
      onAction('complete', notes);
    }
  };

  // Zeige verschiedene Buttons basierend auf Status
  return (
    <div className="flex gap-3 my-4">
      {(status === 'pending' || status === 'open') && (
        <Button 
          onClick={handleStart}
          disabled={isLoading}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {isLoading ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4 mr-2" />
          )}
          Inventur starten
        </Button>
      )}
      
      {status === 'in_progress' && (
        <>
          {showSaveButton && (
            <Button 
              onClick={handleSave}
              disabled={isLoading}
              variant="outline"
              className="border-blue-500 text-blue-600 hover:bg-blue-50"
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Zwischenspeichern
            </Button>
          )}
          
          <Button 
            onClick={handleComplete}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Inventur abschließen
          </Button>
        </>
      )}
      
      {status === 'completed' && (
        <div className="text-green-600 font-medium flex items-center">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Inventur abgeschlossen
        </div>
      )}
    </div>
  );
};