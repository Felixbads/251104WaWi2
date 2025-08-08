import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMachineCosts } from '@/lib/api';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Euro, Calendar, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MachineCost {
  id: number;
  machine_location: string;
  cost_type: string;
  amount: number;
  currency: string;
  frequency: string;
  description: string;
  is_active: boolean;
  valid_from: string;
  valid_until?: string;
  created_at: string;
  updated_at: string;
}

interface MachineCostsTabProps {
  machineId: number | null;
}

const MachineCostsTab: React.FC<MachineCostsTabProps> = ({ machineId }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newCost, setNewCost] = useState({
    costType: '',
    amount: '',
    frequency: 'monthly',
    description: ''
  });

  // Fetch machine costs
  const { data: costs, isLoading, error } = useQuery({
    queryKey: ['/api/machines', machineId, 'costs'],
    queryFn: () => getMachineCosts(machineId!),
    enabled: !!machineId
  });

  // Add new cost mutation
  const addCostMutation = useMutation({
    mutationFn: (data: typeof newCost) => 
      apiRequest('post', `/machines/${machineId}/costs`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/machines', machineId, 'costs'] });
      setShowForm(false);
      setNewCost({
        costType: '',
        amount: '',
        frequency: 'monthly',
        description: ''
      });
      toast({
        title: "Erfolg",
        description: "Neue Kosten wurden erfolgreich hinzugefügt."
      });
    },
    onError: (error) => {
      console.error('Error adding cost:', error);
      toast({
        title: "Fehler",
        description: "Fehler beim Hinzufügen der Kosten.",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCost.costType || !newCost.amount) {
      toast({
        title: "Validierungsfehler",
        description: "Bitte füllen Sie alle erforderlichen Felder aus.",
        variant: "destructive"
      });
      return;
    }
    addCostMutation.mutate(newCost);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { 
      style: 'currency', 
      currency: 'EUR' 
    }).format(amount);
  };

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'monthly': return 'Monatlich';
      case 'yearly': return 'Jährlich';
      case 'quarterly': return 'Vierteljährlich';
      case 'weekly': return 'Wöchentlich';
      case 'once': return 'Einmalig';
      default: return frequency;
    }
  };

  const getFrequencyColor = (frequency: string) => {
    switch (frequency) {
      case 'monthly': return 'bg-blue-100 text-blue-800';
      case 'yearly': return 'bg-green-100 text-green-800';
      case 'quarterly': return 'bg-purple-100 text-purple-800';
      case 'weekly': return 'bg-orange-100 text-orange-800';
      case 'once': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Kosten</h3>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Lade Kostendaten...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Kosten</h3>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-600">
              <p>Fehler beim Laden der Kostendaten</p>
              <p className="text-sm text-gray-500 mt-1">
                {error instanceof Error ? error.message : 'Unbekannter Fehler'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const costsArray = Array.isArray(costs) ? costs : [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Kosten</h3>
        <Button 
          onClick={() => setShowForm(!showForm)}
          size="sm"
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Neue Kosten hinzufügen
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Neue Kosten hinzufügen</CardTitle>
            <CardDescription>
              Fügen Sie neue Kosten für diesen Automaten hinzu
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="costType">Kostenart *</Label>
                  <Input
                    id="costType"
                    value={newCost.costType}
                    onChange={(e) => setNewCost(prev => ({ ...prev, costType: e.target.value }))}
                    placeholder="z.B. Miete, Strom, Wartung"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="amount">Betrag (€) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={newCost.amount}
                    onChange={(e) => setNewCost(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="frequency">Häufigkeit</Label>
                  <Select
                    value={newCost.frequency}
                    onValueChange={(value) => setNewCost(prev => ({ ...prev, frequency: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monatlich</SelectItem>
                      <SelectItem value="yearly">Jährlich</SelectItem>
                      <SelectItem value="quarterly">Vierteljährlich</SelectItem>
                      <SelectItem value="weekly">Wöchentlich</SelectItem>
                      <SelectItem value="once">Einmalig</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="description">Beschreibung</Label>
                  <Input
                    id="description"
                    value={newCost.description}
                    onChange={(e) => setNewCost(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Weitere Details (optional)"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowForm(false)}
                >
                  Abbrechen
                </Button>
                <Button 
                  type="submit" 
                  disabled={addCostMutation.isPending}
                >
                  {addCostMutation.isPending ? 'Speichern...' : 'Speichern'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {costsArray.length > 0 ? (
        <div className="grid gap-4">
          {costsArray.map((cost: MachineCost) => (
            <Card key={cost.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">{cost.cost_type}</h4>
                      <Badge className={getFrequencyColor(cost.frequency)}>
                        {getFrequencyLabel(cost.frequency)}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Euro className="h-4 w-4 text-green-600" />
                        <span className="font-medium">{formatCurrency(cost.amount)}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-600" />
                        <span>Seit {new Date(cost.valid_from).toLocaleDateString('de-DE')}</span>
                      </div>
                      
                      {cost.description && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-600" />
                          <span className="text-gray-600">{cost.description}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled
                    title="Löschen (nicht implementiert)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-gray-500">
              <Euro className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p className="font-medium">Keine Kosten vorhanden</p>
              <p className="text-sm">Fügen Sie Kosten für diesen Automaten hinzu, um die Rentabilität zu verfolgen.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MachineCostsTab;