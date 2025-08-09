import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Machine {
  id: number;
  vendonId: string;
  machineName: string;
  location?: string;
  status: string;
  serialNumber?: string;
  machineType?: string;
}

interface MachineEditDialogProps {
  machine: Machine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MachineEditDialog({ machine, open, onOpenChange }: MachineEditDialogProps) {
  const [formData, setFormData] = useState({
    machineName: machine.machineName || '',
    location: machine.location || '',
    status: machine.status || 'active',
    serialNumber: machine.serialNumber || '',
    machineType: machine.machineType || '',
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest(`/api/machines/${machine.id}`, data, 'PUT');
    },
    onSuccess: () => {
      toast({
        title: "Automat aktualisiert",
        description: "Die Änderungen wurden erfolgreich gespeichert.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/machines/${machine.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/machines'] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Fehler beim Speichern",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Automat bearbeiten</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="machineName">Name</Label>
            <Input
              id="machineName"
              value={formData.machineName}
              onChange={(e) => handleInputChange('machineName', e.target.value)}
              placeholder="Automatenname"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Standort</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => handleInputChange('location', e.target.value)}
              placeholder="Standort"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Status wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="inactive">Inaktiv</SelectItem>
                <SelectItem value="maintenance">Wartung</SelectItem>
                <SelectItem value="error">Fehler</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serialNumber">Seriennummer</Label>
            <Input
              id="serialNumber"
              value={formData.serialNumber}
              onChange={(e) => handleInputChange('serialNumber', e.target.value)}
              placeholder="Seriennummer"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="machineType">Automatentyp</Label>
            <Input
              id="machineType"
              value={formData.machineType}
              onChange={(e) => handleInputChange('machineType', e.target.value)}
              placeholder="Automatentyp"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Speichere...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}