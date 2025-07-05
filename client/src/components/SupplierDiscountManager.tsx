import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Trash2, Edit, Plus, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Schema für Rabattbedingungen
const supplierDiscountSchema = z.object({
  supplierId: z.number(),
  discountType: z.enum(['volume_discount', 'order_value', 'cash_discount', 'quantity_scale']),
  description: z.string().optional(),
  discountPercentage: z.number().min(0).max(100).optional(),
  discountAmount: z.number().min(0).optional(),
  thresholdQuantity: z.number().min(0).optional(),
  thresholdAmount: z.number().min(0).optional(),
  maxQuantity: z.number().min(0).optional(),
  paymentTermsDays: z.number().min(0).optional(),
  skontoPercentage: z.number().min(0).max(100).optional(),
  minimumOrderQuantity: z.number().min(0).optional(),
  applicableProductCategories: z.string().optional(),
  excludedProductIds: z.string().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  priority: z.number().default(0),
  isActive: z.boolean().default(true),
  canCombineWithOtherDiscounts: z.boolean().default(false),
});

type SupplierDiscountCondition = {
  id: number;
  supplierId: number;
  discountType: string;
  description?: string;
  discountPercentage?: number;
  discountAmount?: number;
  thresholdQuantity?: number;
  thresholdAmount?: number;
  maxQuantity?: number;
  paymentTermsDays?: number;
  skontoPercentage?: number;
  minimumOrderQuantity?: number;
  applicableProductCategories?: string;
  excludedProductIds?: string;
  validFrom?: string;
  validTo?: string;
  priority: number;
  isActive: boolean;
  canCombineWithOtherDiscounts: boolean;
  createdAt: string;
  updatedAt: string;
};

interface SupplierDiscountManagerProps {
  supplierId: number;
}

const discountTypeLabels = {
  volume_discount: 'Mengenrabatt',
  order_value: 'Bestellwertrabatt',
  cash_discount: 'Skonto',
  quantity_scale: 'Staffelpreise'
};

export default function SupplierDiscountManager({ supplierId }: SupplierDiscountManagerProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<SupplierDiscountCondition | null>(null);
  const [calculationData, setCalculationData] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Laden der Rabattbedingungen
  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ['/api/supplier-discounts', supplierId],
    queryFn: async () => {
      const response = await fetch(`/api/supplier-discounts/${supplierId}`);
      if (!response.ok) throw new Error('Fehler beim Laden der Rabattbedingungen');
      return response.json();
    }
  });

  // Erstellen einer neuen Rabattbedingung
  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof supplierDiscountSchema>) => {
      const response = await fetch('/api/supplier-discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Fehler beim Erstellen der Rabattbedingung');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-discounts', supplierId] });
      setIsCreateDialogOpen(false);
      toast({ title: "Rabattbedingung erstellt", description: "Die neue Rabattbedingung wurde erfolgreich erstellt." });
    },
    onError: (error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  });

  // Aktualisieren einer Rabattbedingung
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: z.infer<typeof supplierDiscountSchema> }) => {
      const response = await fetch(`/api/supplier-discounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Fehler beim Aktualisieren der Rabattbedingung');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-discounts', supplierId] });
      setEditingDiscount(null);
      toast({ title: "Rabattbedingung aktualisiert", description: "Die Rabattbedingung wurde erfolgreich aktualisiert." });
    },
    onError: (error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  });

  // Löschen einer Rabattbedingung
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/supplier-discounts/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Fehler beim Löschen der Rabattbedingung');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supplier-discounts', supplierId] });
      toast({ title: "Rabattbedingung gelöscht", description: "Die Rabattbedingung wurde erfolgreich gelöscht." });
    },
    onError: (error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  });

  // Rabattberechnung testen
  const calculateDiscount = async () => {
    try {
      const response = await fetch('/api/supplier-discounts/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          orderValue: 1000,
          orderQuantity: 50,
          paymentTermsDays: 14,
          productCategories: ['Getränke'],
          productIds: []
        }),
      });
      
      if (!response.ok) throw new Error('Fehler bei der Rabattberechnung');
      const result = await response.json();
      setCalculationData(result);
      
      toast({ 
        title: "Rabattberechnung", 
        description: `Gesamtrabatt: €${result.totalDiscount.toFixed(2)} (${result.discountPercentage}%)` 
      });
    } catch (error) {
      toast({ title: "Fehler", description: "Fehler bei der Rabattberechnung", variant: "destructive" });
    }
  };

  const form = useForm<z.infer<typeof supplierDiscountSchema>>({
    resolver: zodResolver(supplierDiscountSchema),
    defaultValues: {
      supplierId,
      discountType: 'volume_discount',
      priority: 0,
      isActive: true,
      canCombineWithOtherDiscounts: false,
    },
  });

  useEffect(() => {
    if (editingDiscount) {
      form.reset({
        supplierId: editingDiscount.supplierId,
        discountType: editingDiscount.discountType as any,
        description: editingDiscount.description || '',
        discountPercentage: editingDiscount.discountPercentage || undefined,
        discountAmount: editingDiscount.discountAmount || undefined,
        thresholdQuantity: editingDiscount.thresholdQuantity || undefined,
        thresholdAmount: editingDiscount.thresholdAmount || undefined,
        maxQuantity: editingDiscount.maxQuantity || undefined,
        paymentTermsDays: editingDiscount.paymentTermsDays || undefined,
        skontoPercentage: editingDiscount.skontoPercentage || undefined,
        minimumOrderQuantity: editingDiscount.minimumOrderQuantity || undefined,
        validFrom: editingDiscount.validFrom ? editingDiscount.validFrom.split('T')[0] : '',
        validTo: editingDiscount.validTo ? editingDiscount.validTo.split('T')[0] : '',
        priority: editingDiscount.priority,
        isActive: editingDiscount.isActive,
        canCombineWithOtherDiscounts: editingDiscount.canCombineWithOtherDiscounts,
      });
    } else {
      form.reset({
        supplierId,
        discountType: 'volume_discount',
        priority: 0,
        isActive: true,
        canCombineWithOtherDiscounts: false,
      });
    }
  }, [editingDiscount, form, supplierId]);

  const onSubmit = (data: z.infer<typeof supplierDiscountSchema>) => {
    if (editingDiscount) {
      updateMutation.mutate({ id: editingDiscount.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const selectedDiscountType = form.watch('discountType');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Rabattbedingungen</h3>
          <p className="text-sm text-muted-foreground">
            Verwalten Sie die Rabatt- und Konditionensysteme für diesen Lieferanten
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={calculateDiscount} variant="outline" size="sm">
            <Calculator className="h-4 w-4 mr-2" />
            Test-Berechnung
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Neue Rabattbedingung
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingDiscount ? 'Rabattbedingung bearbeiten' : 'Neue Rabattbedingung'}
                </DialogTitle>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="discountType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rabatttyp</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Rabatttyp wählen" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(discountTypeLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
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
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priorität</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Beschreibung</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Beschreibung der Rabattbedingung" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="discountPercentage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rabatt (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              max="100"
                              placeholder="z.B. 5.00"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="discountAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rabatt (€)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="z.B. 50.00"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {(selectedDiscountType === 'volume_discount' || selectedDiscountType === 'quantity_scale') && (
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="thresholdQuantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mindestmenge</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="z.B. 100"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {selectedDiscountType === 'quantity_scale' && (
                        <FormField
                          control={form.control}
                          name="maxQuantity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Maximalmenge</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="z.B. 500"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  )}

                  {selectedDiscountType === 'order_value' && (
                    <FormField
                      control={form.control}
                      name="thresholdAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mindestbestellwert (€)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="z.B. 500.00"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {selectedDiscountType === 'cash_discount' && (
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="paymentTermsDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Zahlungsziel (Tage)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="z.B. 14"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="skontoPercentage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Skonto (%)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                max="100"
                                placeholder="z.B. 2.00"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="validFrom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gültig von</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="validTo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gültig bis</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex items-center space-x-6">
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel>Aktiv</FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="canCombineWithOtherDiscounts"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel>Kombinierbar</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsCreateDialogOpen(false);
                        setEditingDiscount(null);
                      }}
                    >
                      Abbrechen
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending || updateMutation.isPending}
                    >
                      {editingDiscount ? 'Aktualisieren' : 'Erstellen'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {calculationData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Test-Rabattberechnung</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="font-medium">Bestellwert</p>
                <p>€{calculationData.originalOrderValue.toFixed(2)}</p>
              </div>
              <div>
                <p className="font-medium">Gesamtrabatt</p>
                <p>€{calculationData.totalDiscount.toFixed(2)}</p>
              </div>
              <div>
                <p className="font-medium">Rabatt %</p>
                <p>{calculationData.discountPercentage}%</p>
              </div>
              <div>
                <p className="font-medium">Endwert</p>
                <p>€{calculationData.finalOrderValue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p>Laden...</p>
      ) : (
        <div className="space-y-4">
          {discounts.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">
                  Keine Rabattbedingungen konfiguriert
                </p>
              </CardContent>
            </Card>
          ) : (
            discounts.map((discount: SupplierDiscountCondition) => (
              <Card key={discount.id}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={discount.isActive ? "default" : "secondary"}>
                          {discountTypeLabels[discount.discountType as keyof typeof discountTypeLabels]}
                        </Badge>
                        {discount.canCombineWithOtherDiscounts && (
                          <Badge variant="outline">Kombinierbar</Badge>
                        )}
                        <span className="text-sm text-muted-foreground">
                          Priorität: {discount.priority}
                        </span>
                      </div>
                      {discount.description && (
                        <p className="text-sm text-muted-foreground">
                          {discount.description}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {discount.discountPercentage && (
                          <div>
                            <span className="font-medium">Rabatt: </span>
                            {discount.discountPercentage}%
                          </div>
                        )}
                        {discount.discountAmount && (
                          <div>
                            <span className="font-medium">Betrag: </span>
                            €{discount.discountAmount}
                          </div>
                        )}
                        {discount.thresholdQuantity && (
                          <div>
                            <span className="font-medium">Mindestmenge: </span>
                            {discount.thresholdQuantity}
                          </div>
                        )}
                        {discount.thresholdAmount && (
                          <div>
                            <span className="font-medium">Mindestbestellwert: </span>
                            €{discount.thresholdAmount}
                          </div>
                        )}
                        {discount.paymentTermsDays && (
                          <div>
                            <span className="font-medium">Zahlungsziel: </span>
                            {discount.paymentTermsDays} Tage
                          </div>
                        )}
                        {discount.skontoPercentage && (
                          <div>
                            <span className="font-medium">Skonto: </span>
                            {discount.skontoPercentage}%
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingDiscount(discount);
                          setIsCreateDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteMutation.mutate(discount.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}