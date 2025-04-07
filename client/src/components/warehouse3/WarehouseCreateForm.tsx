import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

// Definiere ein Validierungsschema mit zod
const warehouseFormSchema = z.object({
  name: z.string().min(1, "Der Name des Lagers ist erforderlich").max(100, "Der Name darf maximal 100 Zeichen lang sein"),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  status: z.enum(["active", "inactive", "maintenance", "closed"]).default("active"),
  notes: z.string().optional(),
});

type WarehouseFormValues = z.infer<typeof warehouseFormSchema>;

interface WarehouseCreateFormProps {
  onSubmit: (data: WarehouseFormValues) => void;
  onCancel: () => void;
  initialData?: Partial<WarehouseFormValues>;
}

export default function WarehouseCreateForm({ onSubmit, onCancel, initialData }: WarehouseCreateFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Erstelle das Formular mit react-hook-form und zod-Validierung
  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseFormSchema),
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || "",
      address: initialData?.address || "",
      city: initialData?.city || "",
      postalCode: initialData?.postalCode || "",
      status: initialData?.status || "active",
      notes: initialData?.notes || "",
    },
  });

  // Handler für das Absenden des Formulars
  const handleSubmit = async (values: WarehouseFormValues) => {
    try {
      setIsSubmitting(true);
      
      // Rufe die übergebene onSubmit-Funktion auf
      await onSubmit(values);
      
      // Setze das Formular zurück
      form.reset();
    } catch (error) {
      console.error("Fehler beim Speichern des Lagers:", error);
      toast({
        title: "Fehler",
        description: "Das Lager konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name *</FormLabel>
              <FormControl>
                <Input placeholder="Lagername" {...field} />
              </FormControl>
              <FormDescription>
                Der Name des Lagerstandorts
              </FormDescription>
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
                  placeholder="Beschreibung des Lagers"
                  className="resize-none" 
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                Kurze Beschreibung des Lagerstandorts (optional)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Adresse</FormLabel>
                <FormControl>
                  <Input placeholder="Straße, Hausnummer" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <div className="grid grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="postalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PLZ</FormLabel>
                  <FormControl>
                    <Input placeholder="PLZ" {...field} />
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
                  <FormLabel>Stadt</FormLabel>
                  <FormControl>
                    <Input placeholder="Stadt" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
        
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Status auswählen" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                  <SelectItem value="maintenance">Wartung</SelectItem>
                  <SelectItem value="closed">Geschlossen</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Der aktuelle Status des Lagers
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notizen</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Zusätzliche Informationen"
                  className="resize-none" 
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                Interne Notizen zum Lager (optional)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <DialogFooter className="flex justify-end gap-2 pt-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Abbrechen
          </Button>
          <Button 
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Wird gespeichert..." : "Lager speichern"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}