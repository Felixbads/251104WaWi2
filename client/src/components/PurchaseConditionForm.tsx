import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Check, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { createPurchaseCondition, updatePurchaseCondition } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DatePicker } from "@/components/ui/date-picker";

// Schema für Einkaufsbedingung
const purchaseConditionSchema = z.object({
  productId: z.number(),
  supplierId: z.number(),
  unitPrice: z.coerce.number().min(0, {
    message: "Preis muss mindestens 0 sein",
  }),
  minQuantity: z.coerce.number().min(1, {
    message: "Mindestmenge muss mindestens 1 sein",
  }),
  packagingUnit: z.string().optional(),
  deliveryTime: z.string().optional(),
  validFrom: z.date().nullable().optional(),
  validTo: z.date().nullable().optional(),
  isPreferred: z.boolean().default(false),
  notes: z.string().optional(),
  leadTime: z.coerce.number().optional(),
});

type FormData = z.infer<typeof purchaseConditionSchema>;

interface PurchaseConditionFormProps {
  productId: number;
  supplierId: number;
  existingCondition?: any;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function PurchaseConditionForm({
  productId,
  supplierId,
  existingCondition,
  onSuccess,
  onCancel,
}: PurchaseConditionFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form mit bestehenden Werten initialisieren, falls vorhanden
  const form = useForm<FormData>({
    resolver: zodResolver(purchaseConditionSchema),
    defaultValues: existingCondition 
      ? {
          ...existingCondition,
          validFrom: existingCondition.validFrom ? new Date(existingCondition.validFrom) : null,
          validTo: existingCondition.validTo ? new Date(existingCondition.validTo) : null,
        }
      : {
          productId,
          supplierId,
          unitPrice: 0,
          minQuantity: 1,
          packagingUnit: "",
          deliveryTime: "",
          validFrom: new Date(),
          validTo: null,
          isPreferred: false,
          notes: "",
          leadTime: 0,
        },
  });

  async function onSubmit(data: FormData) {
    try {
      setIsSubmitting(true);
      
      // Validierung der Pflichtfelder
      if (!data.productId) {
        toast({
          title: "Fehler",
          description: "Bitte wählen Sie ein Produkt aus.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      if (!data.unitPrice && data.unitPrice !== 0) {
        toast({
          title: "Fehler",
          description: "Bitte geben Sie einen Einheitspreis an.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // Stelle sicher, dass supplierId vorhanden ist
      if (!supplierId && !data.supplierId) {
        toast({
          title: "Fehler",
          description: "Fehler: Kein Lieferant ausgewählt.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }
      
      // Datumsfelder und numerische Werte korrekt formatieren
      // Explizit Date-Objekte erstellen für korrekte Serialisierung zum Server
      const dateValidFrom = data.validFrom ? new Date(data.validFrom) : new Date();
      const dateValidTo = data.validTo ? new Date(data.validTo) : null;
      
      console.log("Erstelle Einkaufsbedingung mit Daten:", {
        ...data,
        productId: typeof data.productId === 'string' ? parseInt(data.productId) : data.productId,
        supplierId: supplierId,
        unitPrice: typeof data.unitPrice === 'string' ? parseFloat(data.unitPrice) : data.unitPrice,
        taxRate: data.taxRate || 19,
        grossPrice: data.grossPrice || null,
        packagingUnit: data.packagingUnit || "Stück",
        packagingQuantity: data.packagingQuantity || 1,
        minQuantity: typeof data.minQuantity === 'string' ? parseInt(data.minQuantity) : (data.minQuantity || 0),
        validFrom: dateValidFrom.toISOString(),
        validTo: dateValidTo ? dateValidTo.toISOString() : undefined,
        notes: data.notes || "",
        supplierId: supplierId,
        isPreferred: data.isPreferred || false
      });
      
      // formatierte Daten für die API
      const formattedData = {
        productId: typeof data.productId === 'string' ? parseInt(data.productId) : data.productId,
        supplierId: supplierId,
        unitPrice: typeof data.unitPrice === 'string' ? parseFloat(data.unitPrice) : data.unitPrice,
        taxRate: data.taxRate || 19,
        grossPrice: data.grossPrice || null,
        packagingUnit: data.packagingUnit || "Stück",
        packagingQuantity: data.packagingQuantity || 1,
        minQuantity: typeof data.minQuantity === 'string' ? parseInt(data.minQuantity) : (data.minQuantity || 0),
        validFrom: dateValidFrom.toISOString(),
        validTo: dateValidTo ? dateValidTo.toISOString() : undefined,
        notes: data.notes || "",
        isPreferred: data.isPreferred || false
      };
      
      console.log("Formatierte Daten:", formattedData);

      if (existingCondition) {
        // Bestehende Bedingung aktualisieren
        try {
          await updatePurchaseCondition(existingCondition.id, formattedData);
          toast({
            title: "Einkaufsbedingung aktualisiert",
            description: "Die Einkaufsbedingung wurde erfolgreich aktualisiert.",
          });
        } catch (error) {
          console.error("Fehler beim Aktualisieren der Einkaufsbedingung:", error);
          toast({
            title: "Fehler",
            description: "Die Einkaufsbedingung konnte nicht aktualisiert werden. Bitte überprüfen Sie die Eingaben.",
            variant: "destructive"
          });
        }
      } else {
        // Neue Bedingung erstellen
        try {
          await createPurchaseCondition(formattedData);
          toast({
            title: "Einkaufsbedingung erstellt",
            description: "Die Einkaufsbedingung wurde erfolgreich erstellt.",
          });
        } catch (error) {
          console.error("Fehler beim Erstellen der Einkaufsbedingung:", error);
          toast({
            title: "Fehler",
            description: "Die Einkaufsbedingung konnte nicht erstellt werden. Bitte überprüfen Sie die Eingaben.",
            variant: "destructive"
          });
        }
      }

      // Cache invalidieren, um frische Daten zu laden
      queryClient.invalidateQueries({queryKey: [`/api/products/${productId}/purchaseConditions`]});
      queryClient.invalidateQueries({queryKey: [`/api/suppliers/${supplierId}/purchaseConditions`]});
      
      // Callback aufrufen, wenn vorhanden
      if (onSuccess) onSuccess();
      
    } catch (error) {
      console.error("Fehler beim Speichern der Einkaufsbedingung:", error);
      toast({
        title: "Fehler",
        description: "Die Einkaufsbedingung konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Einheitspreis */}
          <FormField
            control={form.control}
            name="unitPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Einheitspreis (€)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Mindestmenge */}
          <FormField
            control={form.control}
            name="minQuantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mindestbestellmenge</FormLabel>
                <FormControl>
                  <Input type="number" min="1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Verpackungseinheit */}
          <FormField
            control={form.control}
            name="packagingUnit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Verpackungseinheit</FormLabel>
                <FormControl>
                  <Input placeholder="z.B. Karton mit 6 Flaschen" {...field} />
                </FormControl>
                <FormDescription>
                  Beschreibung der Verpackungseinheit
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Lieferzeit */}
          <FormField
            control={form.control}
            name="deliveryTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lieferzeit</FormLabel>
                <FormControl>
                  <Input placeholder="z.B. 2-3 Tage" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gültig ab */}
          <FormField
            control={form.control}
            name="validFrom"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Gültig ab</FormLabel>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 opacity-70" />
                  <DatePicker 
                    date={field.value || undefined} 
                    setDate={field.onChange}
                  />
                </div>
                <FormDescription>
                  Datum, ab dem diese Einkaufsbedingung gilt
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Gültig bis */}
          <FormField
            control={form.control}
            name="validTo"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Gültig bis (optional)</FormLabel>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 opacity-70" />
                  <DatePicker 
                    date={field.value || undefined} 
                    setDate={field.onChange}
                  />
                </div>
                <FormDescription>
                  Optional: Datum, bis zu dem diese Einkaufsbedingung gilt
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Vorlaufzeit */}
        <FormField
          control={form.control}
          name="leadTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vorlaufzeit (Tage)</FormLabel>
              <FormControl>
                <Input type="number" min="0" {...field} />
              </FormControl>
              <FormDescription>
                Vorlaufzeit für Bestellungen in Tagen
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Bevorzugter Lieferant */}
        <FormField
          control={form.control}
          name="isPreferred"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Bevorzugter Lieferant</FormLabel>
                <FormDescription>
                  Markiert diesen Lieferanten als bevorzugt für dieses Produkt
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {/* Notizen */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notizen</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Zusätzliche Informationen zu dieser Einkaufsbedingung"
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2 justify-end">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Abbrechen
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-1">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-b-transparent"></span>
                Speichern...
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Check className="h-4 w-4" />
                {existingCondition ? "Aktualisieren" : "Erstellen"}
              </span>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}