import React from 'react';
import { Button } from "@/components/ui/button";
import { 
  PlayCircle, 
  Package, 
  Ban, 
  Trash2, 
  Save, 
  CheckCircle2, 
  Pencil, 
  RefreshCw 
} from "lucide-react";

interface InventoryActionsProps {
  status: string;
  onStart: () => void;
  onAddAllProducts: () => void;
  onSave: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onResume: () => void;
  isStarting?: boolean;
  isAdding?: boolean;
  isSaving?: boolean;
  isUpdating?: boolean;
}

export const InventoryActions: React.FC<InventoryActionsProps> = ({
  status,
  onStart,
  onAddAllProducts,
  onSave,
  onComplete,
  onCancel,
  onDelete,
  onResume,
  isStarting = false,
  isAdding = false,
  isSaving = false,
  isUpdating = false
}) => {
  
  // Render different buttons based on status
  if (status === 'pending') {
    return (
      <div className="flex flex-wrap gap-3 my-4 z-50 relative">
        {/* Start inventory button */}
        <Button 
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={onStart}
          disabled={isStarting}
        >
          {isStarting ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4 mr-2" />
          )}
          Inventur starten
        </Button>
        
        {/* Add all products button */}
        <Button 
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={onAddAllProducts}
          disabled={isAdding}
        >
          {isAdding ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Package className="h-4 w-4 mr-2" />
          )}
          Alle Produkte hinzufügen
        </Button>
        
        {/* Cancel button */}
        <Button 
          variant="outline"
          className="border-red-500 text-red-500 hover:bg-red-50"
          onClick={onCancel}
          disabled={isUpdating}
        >
          <Ban className="h-4 w-4 mr-2" />
          Abbrechen
        </Button>
        
        {/* Delete button */}
        <Button 
          variant="outline"
          className="border-red-500 text-red-500 hover:bg-red-50"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Löschen
        </Button>
      </div>
    );
  } 
  
  if (status === 'in_progress') {
    return (
      <div className="flex flex-wrap gap-3 my-4 z-50 relative">
        {/* Save button */}
        <Button 
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Zwischenspeichern
        </Button>
        
        {/* Complete button */}
        <Button 
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={onComplete}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Inventur abschließen
        </Button>
        
        {/* Cancel button */}
        <Button 
          variant="outline"
          className="border-red-500 text-red-500 hover:bg-red-50"
          onClick={onCancel}
          disabled={isUpdating}
        >
          <Ban className="h-4 w-4 mr-2" />
          Abbrechen
        </Button>
        
        {/* Delete button */}
        <Button 
          variant="outline"
          className="border-red-500 text-red-500 hover:bg-red-50"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Löschen
        </Button>
      </div>
    );
  } 
  
  if (status === 'completed') {
    return (
      <div className="flex flex-wrap gap-3 my-4 z-50 relative">
        {/* Resume button */}
        <Button 
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={onResume}
          disabled={isUpdating}
        >
          <Pencil className="h-4 w-4 mr-2" />
          In Bearbeitung setzen
        </Button>
        
        {/* Delete button */}
        <Button 
          variant="outline"
          className="border-red-500 text-red-500 hover:bg-red-50"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Löschen
        </Button>
      </div>
    );
  } 
  
  if (status === 'cancelled') {
    return (
      <div className="flex flex-wrap gap-3 my-4 z-50 relative">
        {/* Reactivate button */}
        <Button 
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={onResume}
          disabled={isUpdating}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Reaktivieren
        </Button>
      </div>
    );
  }
  
  // Fallback
  return null;
};