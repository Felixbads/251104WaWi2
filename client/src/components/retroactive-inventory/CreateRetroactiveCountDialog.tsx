import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calendar, Package, MapPin } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const createCountSchema = z.object({
  countName: z.string().min(1, 'Name der Inventur ist erforderlich'),
  countDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss im Format YYYY-MM-DD sein'),
  warehouseId: z.string().min(1, 'Lager ist erforderlich'),
  description: z.string().optional(),
  reasonForRetroactiveCount: z.string().optional(),
  notes: z.string().optional(),
});

type CreateCountForm = z.infer<typeof createCountSchema>;

interface Warehouse {
  id: number;
  name: string;
  city: string;
  isActive: boolean;
}

interface CreateRetroactiveCountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateRetroactiveCountDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: CreateRetroactiveCountDialogProps) {
  const { toast } = useToast();

  const form = useForm<CreateCountForm>({
    resolver: zodResolver(createCountSchema),
    defaultValues: {
      countName: '',
      countDate: '',
      warehouseId: '',
      description: '',
      reasonForRetroactiveCount: '',
      notes: '',
    },
  });

  // Lade verfügbare Lager
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['/api/retroactive-inventory/warehouses'],
    queryFn: () => fetch('/api/retroactive-inventory/warehouses').then(res => res.json()),
  });

  // Mutation zum Erstellen der Inventur
  const createCountMutation = useMutation({
    mutationFn: async (data: CreateCountForm) => {
      const response = await fetch('/api/retroactive-inventory/counts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          warehouseId: parseInt(data.warehouseId),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Fehler beim Erstellen der Inventur');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Inventur erstellt',
        description: 'Die retroaktive Inventur wurde erfolgreich erstellt.',
      });
      form.reset();
      onOpenChange(false);
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: CreateCountForm) => {
    createCountMutation.mutate(data);
  };

  // Berechne maximales Datum (gestern)
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() - 1);
  const maxDateString = maxDate.toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Neue retroaktive Inventur
          </DialogTitle>
          <DialogDescription>
            Erstellen Sie eine nachträgliche Inventurzählung für einen vergangenen Stichtag.
            Das System wird automatisch die aktuellen Bestände basierend auf der Zählung anpassen.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Grunddaten */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="countName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name der Inventur</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="z.B. Quartalsabschluss Q2 2025" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="countDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Stichtag der Inventur
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        max={maxDateString}
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Der Stichtag muss in der Vergangenheit liegen
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="warehouseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Lager
                  </FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Lager auswählen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {warehouses.map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                          {warehouse.name} ({warehouse.city})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschreibung</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Beschreibung der Inventur (optional)"
                      className="min-h-[80px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reasonForRetroactiveCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grund für nachträgliche Inventur</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="z.B. Quartalsabschluss, Prüfung, Verdacht auf Abweichungen (optional)"
                      className="min-h-[80px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zusätzliche Notizen</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Weitere Hinweise oder Kommentare (optional)"
                      className="min-h-[60px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createCountMutation.isPending}
              >
                Abbrechen
              </Button>
              <Button 
                type="submit" 
                disabled={createCountMutation.isPending}
                className="flex items-center gap-2"
              >
                {createCountMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Erstelle...
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    Inventur erstellen
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}