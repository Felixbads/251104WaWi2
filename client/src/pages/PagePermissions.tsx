import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Check, X, Users, Settings, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PagePermission, InsertPagePermission } from "../../../shared/schema";

interface PagePermissionsState {
  permissions: PagePermission[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  updating: Set<string>;
}

export default function PagePermissions() {
  const [state, setState] = useState<PagePermissionsState>({
    permissions: [],
    loading: true,
    error: null,
    searchQuery: "",
    updating: new Set()
  });
  
  const { toast } = useToast();

  const fetchPermissions = async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const response = await fetch('/api/page-permissions', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch page permissions');
      }
      
      setState(prev => ({
        ...prev,
        permissions: result.data,
        loading: false
      }));
    } catch (error) {
      console.error('Error fetching page permissions:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false
      }));
      
      toast({
        title: "Fehler beim Laden",
        description: "Seitenberechtigungen konnten nicht geladen werden",
        variant: "destructive",
      });
    }
  };

  const updatePermission = async (pageId: string, visibleForEmployee: boolean) => {
    try {
      // Optimistic UI update
      setState(prev => ({
        ...prev,
        updating: new Set([...prev.updating, pageId]),
        permissions: prev.permissions.map(p => 
          p.pageId === pageId ? { ...p, visibleForEmployee } : p
        )
      }));
      
      const response = await fetch(`/api/page-permissions/${pageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ visibleForEmployee })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update permission');
      }
      
      // Update with server response
      setState(prev => ({
        ...prev,
        updating: new Set([...prev.updating].filter(id => id !== pageId)),
        permissions: prev.permissions.map(p => 
          p.pageId === pageId ? result.data : p
        )
      }));
      
      toast({
        title: "Erfolgreich gespeichert",
        description: `${result.data.pageTitle} wurde ${visibleForEmployee ? 'aktiviert' : 'deaktiviert'}`,
      });
      
    } catch (error) {
      console.error('Error updating permission:', error);
      
      // Rollback optimistic update
      setState(prev => ({
        ...prev,
        updating: new Set([...prev.updating].filter(id => id !== pageId)),
        permissions: prev.permissions.map(p => 
          p.pageId === pageId ? { ...p, visibleForEmployee: !visibleForEmployee } : p
        )
      }));
      
      toast({
        title: "Fehler beim Speichern",
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: "destructive",
      });
    }
  };

  const bulkUpdate = async (action: 'select-all' | 'deselect-all') => {
    try {
      const visibleValue = action === 'select-all';
      const filteredPermissions = getFilteredPermissions();
      const pageIds = filteredPermissions.map(p => p.pageId);
      
      // Optimistic UI update
      setState(prev => ({
        ...prev,
        permissions: prev.permissions.map(p => 
          pageIds.includes(p.pageId) ? { ...p, visibleForEmployee: visibleValue } : p
        )
      }));
      
      const response = await fetch('/api/page-permissions/bulk-update', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, pageIds })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to bulk update');
      }
      
      toast({
        title: "Massenaktualisierung erfolgreich",
        description: result.message,
      });
      
      // Refresh to get latest state
      fetchPermissions();
      
    } catch (error) {
      console.error('Error with bulk update:', error);
      
      // Rollback on error
      fetchPermissions();
      
      toast({
        title: "Fehler bei Massenaktualisierung",
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: "destructive",
      });
    }
  };

  const initializeDefaultPages = async () => {
    try {
      const response = await fetch('/api/page-permissions/seed', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to initialize default pages');
      }
      
      toast({
        title: "Standardseiten initialisiert",
        description: result.message,
      });
      
      fetchPermissions();
      
    } catch (error) {
      console.error('Error initializing default pages:', error);
      toast({
        title: "Fehler bei Initialisierung",
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: "destructive",
      });
    }
  };

  const getFilteredPermissions = () => {
    if (!state.searchQuery.trim()) {
      return state.permissions;
    }
    
    const query = state.searchQuery.toLowerCase();
    return state.permissions.filter(permission =>
      permission.pageTitle.toLowerCase().includes(query) ||
      permission.pageId.toLowerCase().includes(query) ||
      (permission.category && permission.category.toLowerCase().includes(query))
    );
  };

  const getCategoryStats = () => {
    const filteredPermissions = getFilteredPermissions();
    const enabled = filteredPermissions.filter(p => p.visibleForEmployee).length;
    const total = filteredPermissions.length;
    return { enabled, total };
  };

  useEffect(() => {
    fetchPermissions();
  }, []);

  const filteredPermissions = getFilteredPermissions();
  const { enabled, total } = getCategoryStats();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Seitenzugriff für Mitarbeitende</h1>
          <p className="text-gray-600 mt-1">
            Verwalten Sie hier, welche App-Bereiche für Mitarbeitende sichtbar sind
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-gray-500" />
          <span className="text-sm text-gray-600">
            {enabled} von {total} Seiten aktiviert
          </span>
        </div>
      </div>

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Änderungen wirken sofort für alle Mitarbeitenden. Admins haben immer Zugriff auf alle Bereiche.
        </AlertDescription>
      </Alert>

      {/* Error Display */}
      {state.error && (
        <Alert variant="destructive">
          <X className="h-4 w-4" />
          <AlertDescription>
            {state.error}
          </AlertDescription>
        </Alert>
      )}

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Seitenberechtigungen verwalten
          </CardTitle>
          <CardDescription>
            Aktivieren oder deaktivieren Sie den Zugriff auf einzelne App-Bereiche
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Seiten durchsuchen..."
              value={state.searchQuery}
              onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
              className="pl-10"
            />
          </div>

          {/* Bulk Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkUpdate('select-all')}
              disabled={state.updating.size > 0}
            >
              <Check className="h-4 w-4 mr-2" />
              Alle auswählen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkUpdate('deselect-all')}
              disabled={state.updating.size > 0}
            >
              <X className="h-4 w-4 mr-2" />
              Alle abwählen
            </Button>
            <div className="flex-1" />
            {state.permissions.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={initializeDefaultPages}
                disabled={state.updating.size > 0}
              >
                Standardseiten laden
              </Button>
            )}
          </div>

          {/* Permissions List */}
          <div className="space-y-2">
            {filteredPermissions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {state.searchQuery ? 
                  "Keine Seiten gefunden" : 
                  "Keine Seitenberechtigungen vorhanden. Klicken Sie auf 'Standardseiten laden' um zu beginnen."
                }
              </div>
            ) : (
              filteredPermissions.map((permission) => (
                <div
                  key={permission.pageId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-gray-900">
                        {permission.pageTitle}
                      </h3>
                      {permission.category && (
                        <Badge variant="secondary" className="text-xs">
                          {permission.category}
                        </Badge>
                      )}
                    </div>
                    {permission.description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {permission.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      ID: {permission.pageId}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-gray-600">
                      {permission.visibleForEmployee ? (
                        <span className="text-green-600 font-medium">Aktiviert</span>
                      ) : (
                        <span className="text-gray-500">Deaktiviert</span>
                      )}
                    </div>
                    <Switch
                      checked={permission.visibleForEmployee}
                      onCheckedChange={(checked) => updatePermission(permission.pageId, checked)}
                      disabled={state.updating.has(permission.pageId)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}