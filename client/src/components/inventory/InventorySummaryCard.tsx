import React from 'react';
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

// Einfache Komponente für Inventur-Aktionen ohne React.Fragments
interface InventorySummaryCardProps {
  status: string;
  isLoading: boolean;
  // Aktions-Callbacks
  onStart: () => void;
  onAddProducts: () => void;
  onSave: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onResume: () => void;
  // Loading-States
  isStarting?: boolean;
  isAdding?: boolean;
  isSaving?: boolean;
  isUpdating?: boolean;
}

export function InventorySummaryCard({
  status,
  isLoading,
  onStart,
  onAddProducts,
  onSave,
  onComplete,
  onCancel, 
  onDelete,
  onResume,
  isStarting = false,
  isAdding = false,
  isSaving = false,
  isUpdating = false
}: InventorySummaryCardProps) {
  // Buttons basierend auf dem Status rendern
  const renderActionButtons = () => {
    if (isLoading) {
      return (
        <div className="flex flex-wrap gap-3 my-4">
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
      );
    }

    // Verschiedene Button-Sets basierend auf Status
    if (status === 'pending') {
      return (
        <div className="flex flex-wrap gap-3 my-4">
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
          
          <Button 
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={onAddProducts}
            disabled={isAdding}
          >
            {isAdding ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Package className="h-4 w-4 mr-2" />
            )}
            Alle Produkte hinzufügen
          </Button>
          
          <Button 
            variant="outline"
            className="border-red-500 text-red-500 hover:bg-red-50"
            onClick={onCancel}
            disabled={isUpdating}
          >
            <Ban className="h-4 w-4 mr-2" />
            Abbrechen
          </Button>
          
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
        <div className="flex flex-wrap gap-3 my-4">
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
          
          <Button 
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={onComplete}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Inventur abschließen
          </Button>
          
          <Button 
            variant="outline"
            className="border-red-500 text-red-500 hover:bg-red-50"
            onClick={onCancel}
            disabled={isUpdating}
          >
            <Ban className="h-4 w-4 mr-2" />
            Abbrechen
          </Button>
          
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
        <div className="flex flex-wrap gap-3 my-4">
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={onResume}
            disabled={isUpdating}
          >
            <Pencil className="h-4 w-4 mr-2" />
            In Bearbeitung setzen
          </Button>
          
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
        <div className="flex flex-wrap gap-3 my-4">
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={onResume}
            disabled={isUpdating}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reaktivieren
          </Button>
          
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

    // Default: Keine Buttons
    return (
      <div className="text-muted-foreground">
        Keine Aktionen verfügbar für Status: {status}
      </div>
    );
  }
  
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">Inventur-Aktionen</CardTitle>
        <CardDescription>
          Verwalten Sie den Status und die Inhalte dieser Inventur
        </CardDescription>
      </CardHeader>
      <CardContent>
        {renderActionButtons()}
      </CardContent>
    </Card>
  );
}