import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

// UI-Komponenten
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Validierungsschema für das Lager-Formular
const warehouseSchema = z.object({
  name: z.string().min(1, "Der Name ist erforderlich"),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default("Deutschland"),
  contactPerson: z.string().optional(),
  contactEmail: z.string().email("Ungültige E-Mail-Adresse").optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

type NewWarehouseFormData = z.infer<typeof warehouseSchema>;

interface NewWarehouseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (warehouseData: NewWarehouseFormData) => void;
}

export default function NewWarehouseDialog({ isOpen, onClose, onSave }: NewWarehouseDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Formular initialisieren
  const form = useForm<NewWarehouseFormData>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: '',
      description: '',
      address: '',
      city: '',
      postalCode: '',
      country: 'Deutschland',
      contactPerson: '',
      contactEmail: '',
      contactPhone: '',
      notes: '',
      status: 'active',
    },
  });

  // Formular absenden
  const onSubmit = async (data: NewWarehouseFormData) => {
    setIsSubmitting(true);
    
    try {
      await onSave(data);
      form.reset(); // Formular zurücksetzen
    } catch (error) {
      console.error('Fehler beim Speichern des Lagers:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neues Lager hinzufügen</DialogTitle>
          <DialogDescription>
            Fügen Sie ein neues Lager hinzu, um Produkte und Bestände zu verwalten.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Name*</FormLabel>
                    <FormControl>
                      <Input placeholder="Lagername eingeben" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Beschreibung */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Beschreibung</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Kurze Beschreibung des Lagers" 
                        {...field} 
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Adresse */}
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Adresse</FormLabel>
                    <FormControl>
                      <Input placeholder="Straße, Hausnummer" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* PLZ und Ort */}
              <FormField
                control={form.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PLZ</FormLabel>
                    <FormControl>
                      <Input placeholder="PLZ" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ort</FormLabel>
                    <FormControl>
                      <Input placeholder="Ort" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Land */}
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Land</FormLabel>
                    <FormControl>
                      <Input placeholder="Land" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Kontaktperson */}
              <FormField
                control={form.control}
                name="contactPerson"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Kontaktperson</FormLabel>
                    <FormControl>
                      <Input placeholder="Name der Kontaktperson" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Kontakt-Email und Telefon */}
              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-Mail</FormLabel>
                    <FormControl>
                      <Input placeholder="E-Mail-Adresse" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefon</FormLabel>
                    <FormControl>
                      <Input placeholder="Telefonnummer" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Notizen */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Notizen</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Zusätzliche Informationen" 
                        {...field} 
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Status */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Status auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="inactive">Inaktiv</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Wird gespeichert...' : 'Lager hinzufügen'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}