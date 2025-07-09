import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

// UI-Komponenten
import {
  Form,
  FormControl,
  FormDescription,
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// Icons
import { Plus, Trash2, Save, Calendar } from "lucide-react";

// Schema für die Formvalidierung
const recurringOrderSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  description: z.string().optional(),
  supplierId: z.number().min(1, "Lieferant auswählen"),
  warehouseId: z.number().min(1, "Lager auswählen"),
  interval: z.enum(["weekly", "biweekly", "triweekly", "monthly"]),
  intervalValue: z.number().min(1).default(1),
  weekday: z.string().optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  startDate: z.string().min(1, "Startdatum ist erforderlich"),
  endDate: z.string().optional(),
  isActive: z.boolean().default(true),
  isAutoGenerate: z.boolean().default(true),
  category: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  deliveryType: z.enum(["delivery", "pickup"]).default("delivery"),
  deliveryLocation: z.string().optional(),
  autoCreateInGoods: z.boolean().default(true),
  requiresApproval: z.boolean().default(false),
  notes: z.string().optional(),
  createdBy: z.number().min(1),
  createdByName: z.string().min(1),
  items: z.array(z.object({
    productId: z.number().min(1),
    productName: z.string().min(1),
    quantity: z.number().min(1),
    unit: z.string().default("stk"),
    unitPrice: z.number().optional(),
    notes: z.string().optional(),
  })).default([])
});

type RecurringOrderFormData = z.infer<typeof recurringOrderSchema>;

interface RecurringOrderFormProps {
  initialData?: any;
  onSuccess: () => void;
}

interface Supplier {
  id: number;
  name: string;
}

interface Warehouse {
  id: number;
  name: string;
}

interface Product {
  id: number;
  productName: string;
  price?: number;
  unit?: string;
}

export default function RecurringOrderForm({ initialData, onSuccess }: RecurringOrderFormProps) {
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const { toast } = useToast();

  const form = useForm<RecurringOrderFormData>({
    resolver: zodResolver(recurringOrderSchema),
    defaultValues: {
      name: "",
      description: "",
      supplierId: 0,
      warehouseId: 0,
      interval: "weekly",
      intervalValue: 1,
      weekday: "monday",
      dayOfMonth: 1,
      startDate: new Date().toISOString().split('T')[0],
      endDate: "",
      isActive: true,
      isAutoGenerate: true,
      category: "",
      priority: "normal",
      deliveryType: "delivery",
      deliveryLocation: "",
      autoCreateInGoods: true,
      requiresApproval: false,
      notes: "",
      createdBy: 1, // TODO: Aus User Context holen
      createdByName: "Admin", // TODO: Aus User Context holen
      items: []
    }
  });

  // Lieferanten abrufen
  const { data: suppliers = [] } = useQuery({
    queryKey: ["/api/suppliers"],
    queryFn: async () => {
      const response = await fetch("/api/suppliers");
      if (!response.ok) throw new Error("Fehler beim Laden der Lieferanten");
      const result = await response.json();
      return result.data || [];
    }
  });

  // Lager abrufen
  const { data: warehouses = [] } = useQuery({
    queryKey: ["/api/warehouses"],
    queryFn: async () => {
      const response = await fetch("/api/warehouses");
      if (!response.ok) throw new Error("Fehler beim Laden der Lager");
      const result = await response.json();
      return result.data || [];
    }
  });

  // Produkte für ausgewählten Lieferanten abrufen
  const { data: products = [] } = useQuery({
    queryKey: ["/api/suppliers", selectedSupplierId, "products"],
    queryFn: async () => {
      if (!selectedSupplierId) return [];
      const response = await fetch(`/api/suppliers/${selectedSupplierId}/products`);
      if (!response.ok) throw new Error("Fehler beim Laden der Produkte");
      const result = await response.json();
      return result.data || [];
    },
    enabled: !!selectedSupplierId
  });

  // Initialwerte setzen bei Bearbeitung
  useEffect(() => {
    if (initialData) {
      form.reset({
        ...initialData,
        supplierId: Number(initialData.supplierId),
        warehouseId: Number(initialData.warehouseId),
        intervalValue: Number(initialData.intervalValue) || 1,
        dayOfMonth: Number(initialData.dayOfMonth) || 1,
        createdBy: Number(initialData.createdBy) || 1,
        items: initialData.items || []
      });
      setSelectedSupplierId(Number(initialData.supplierId));
      if (initialData.startDate) {
        setStartDate(new Date(initialData.startDate));
      }
      if (initialData.endDate) {
        setEndDate(new Date(initialData.endDate));
      }
    }
  }, [initialData, form]);

  // Speichern/Aktualisieren Mutation
  const saveMutation = useMutation({
    mutationFn: async (data: RecurringOrderFormData) => {
      const url = initialData 
        ? `/api/recurring-orders/${initialData.id}` 
        : "/api/recurring-orders";
      const method = initialData ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Fehler beim Speichern");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Erfolg",
        description: initialData 
          ? "Wiederkehrende Bestellung wurde aktualisiert" 
          : "Wiederkehrende Bestellung wurde erstellt",
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error.message,
      });
    },
  });

  const onSubmit = (data: RecurringOrderFormData) => {
    // Datum formatieren
    const formattedData = {
      ...data,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate ? endDate.toISOString().split('T')[0] : undefined,
    };
    saveMutation.mutate(formattedData);
  };

  // Bestellposition hinzufügen
  const addItem = () => {
    const currentItems = form.getValues("items");
    form.setValue("items", [
      ...currentItems,
      {
        productId: 0,
        productName: "",
        quantity: 1,
        unit: "stk",
        unitPrice: 0,
        notes: ""
      }
    ]);
  };

  // Bestellposition entfernen
  const removeItem = (index: number) => {
    const currentItems = form.getValues("items");
    form.setValue("items", currentItems.filter((_, i) => i !== index));
  };

  const watchedInterval = form.watch("interval");
  const watchedItems = form.watch("items");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Grundinformationen */}
        <Card>
          <CardHeader>
            <CardTitle>Grundinformationen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. Bäckerei Montag" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategorie</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. Milchprodukte, Obst" {...field} />
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
                    <Textarea 
                      placeholder="Beschreibung der wiederkehrenden Bestellung..."
                      rows={3}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="supplierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferant *</FormLabel>
                    <Select 
                      onValueChange={(value) => {
                        const supplierId = Number(value);
                        field.onChange(supplierId);
                        setSelectedSupplierId(supplierId);
                      }}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Lieferant auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers.map((supplier: Supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id.toString()}>
                            {supplier.name}
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
                name="warehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lager *</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(Number(value))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Lager auswählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {warehouses.map((warehouse: Warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id.toString()}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Intervall-Konfiguration */}
        <Card>
          <CardHeader>
            <CardTitle>Ausführungsintervall</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="interval"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Intervall *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="weekly">Wöchentlich</SelectItem>
                        <SelectItem value="biweekly">Alle 2 Wochen</SelectItem>
                        <SelectItem value="triweekly">Alle 3 Wochen</SelectItem>
                        <SelectItem value="monthly">Monatlich</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchedInterval === "weekly" && (
                <FormField
                  control={form.control}
                  name="weekday"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Wochentag</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="monday">Montag</SelectItem>
                          <SelectItem value="tuesday">Dienstag</SelectItem>
                          <SelectItem value="wednesday">Mittwoch</SelectItem>
                          <SelectItem value="thursday">Donnerstag</SelectItem>
                          <SelectItem value="friday">Freitag</SelectItem>
                          <SelectItem value="saturday">Samstag</SelectItem>
                          <SelectItem value="sunday">Sonntag</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {watchedInterval === "monthly" && (
                <FormField
                  control={form.control}
                  name="dayOfMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tag des Monats</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="1" 
                          max="31" 
                          {...field}
                          value={field.value || 1}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormItem>
                <FormLabel>Startdatum *</FormLabel>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <DatePicker
                    selected={startDate}
                    onChange={(date) => {
                      if (date) {
                        setStartDate(date);
                        form.setValue("startDate", date.toISOString().split('T')[0]);
                      }
                    }}
                    dateFormat="dd.MM.yyyy"
                    locale={de}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholderText="Startdatum wählen"
                  />
                </div>
              </FormItem>

              <FormItem>
                <FormLabel>Enddatum (optional)</FormLabel>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <DatePicker
                    selected={endDate}
                    onChange={(date) => {
                      setEndDate(date);
                      form.setValue("endDate", date?.toISOString().split('T')[0] || "");
                    }}
                    dateFormat="dd.MM.yyyy"
                    locale={de}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholderText="Enddatum wählen (optional)"
                    isClearable
                  />
                </div>
              </FormItem>
            </div>
          </CardContent>
        </Card>

        {/* Einstellungen */}
        <Card>
          <CardHeader>
            <CardTitle>Einstellungen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priorität</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Niedrig</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">Hoch</SelectItem>
                        <SelectItem value="urgent">Dringend</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deliveryType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieferart</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="delivery">Lieferung</SelectItem>
                        <SelectItem value="pickup">Abholung</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
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
                      <div className="space-y-1 leading-none">
                        <FormLabel>Aktiv</FormLabel>
                        <FormDescription>
                          Wiederkehrende Bestellung ist aktiv und wird ausgeführt
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center space-x-2">
                <FormField
                  control={form.control}
                  name="autoCreateInGoods"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Automatisch in Wareneingang</FormLabel>
                        <FormDescription>
                          Bestellungen werden automatisch im Wareneingang erstellt
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center space-x-2">
                <FormField
                  control={form.control}
                  name="requiresApproval"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Genehmigung erforderlich</FormLabel>
                        <FormDescription>
                          Bestellungen müssen vor der Ausführung genehmigt werden
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notizen</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Zusätzliche Notizen zur wiederkehrenden Bestellung..."
                      rows={3}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Bestellpositionen */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Bestellpositionen</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
                disabled={!selectedSupplierId}
              >
                <Plus className="h-4 w-4 mr-2" />
                Position hinzufügen
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedSupplierId && (
              <p className="text-sm text-gray-500 mb-4">
                Wählen Sie zuerst einen Lieferanten aus, um Produkte hinzuzufügen.
              </p>
            )}

            {watchedItems.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                Noch keine Bestellpositionen hinzugefügt
              </div>
            ) : (
              <div className="space-y-4">
                {watchedItems.map((item, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-medium">Position {index + 1}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.productId`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Produkt</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                const productId = Number(value);
                                const product = products.find((p: Product) => p.id === productId);
                                field.onChange(productId);
                                if (product) {
                                  form.setValue(`items.${index}.productName`, product.productName);
                                  form.setValue(`items.${index}.unitPrice`, product.price || 0);
                                  form.setValue(`items.${index}.unit`, product.unit || "stk");
                                }
                              }}
                              value={field.value?.toString()}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Produkt auswählen" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {products.map((product: Product) => (
                                  <SelectItem key={product.id} value={product.id.toString()}>
                                    {product.productName}
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
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Menge</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="1"
                                {...field}
                                value={field.value || 1}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`items.${index}.unit`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Einheit</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name={`items.${index}.notes`}
                      render={({ field }) => (
                        <FormItem className="mt-4">
                          <FormLabel>Notizen</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Notizen zu dieser Position..."
                              rows={2}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aktionsbuttons */}
        <div className="flex justify-end space-x-2">
          <Button
            type="submit"
            disabled={saveMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending 
              ? "Speichern..." 
              : initialData 
                ? "Aktualisieren" 
                : "Erstellen"
            }
          </Button>
        </div>
      </form>
    </Form>
  );
}