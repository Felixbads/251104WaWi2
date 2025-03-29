import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Search, RefreshCcw, FileDown } from "lucide-react";
import { getTransactions, getTransactionsByDateRange, formatDateTime } from "@/lib/api";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

export default function Transactions() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<Date | undefined>(
    new Date(new Date().setDate(new Date().getDate() - 7)) // 7 days ago
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [limit, setLimit] = useState(25);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Query to get transactions with date range
  const { data: transactions, isLoading, error, refetch } = useQuery({
    queryKey: [
      '/api/transactions/byDateRange',
      startDate?.toISOString(),
      endDate?.toISOString(),
      limit
    ],
    queryFn: () => 
      startDate && endDate 
        ? getTransactionsByDateRange(startDate.toISOString(), endDate.toISOString(), limit)
        : getTransactions(limit),
    enabled: !!startDate && !!endDate,
  });

  // Function to determine the status badge color
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Handle date filter apply
  const handleApplyFilter = () => {
    refetch();
    setIsCalendarOpen(false);
  };

  // Handle export
  const handleExport = () => {
    toast({
      title: "Export gestartet",
      description: "Die Transaktionen werden als CSV exportiert.",
    });
    // In a real implementation, this would trigger a download
  };

  // Filter transactions based on search query
  const filteredTransactions = transactions?.filter(transaction => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      transaction.productName?.toLowerCase().includes(query) ||
      transaction.machineName?.toLowerCase().includes(query) ||
      transaction.status?.toLowerCase().includes(query) ||
      String(transaction.price).includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Transaktionen</CardTitle>
          <CardDescription>
            Alle Transaktionen aus dem Vendon-System
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Date Range Selector */}
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate && endDate ? (
                      `${format(startDate, "dd.MM.yyyy", { locale: de })} - ${format(endDate, "dd.MM.yyyy", { locale: de })}`
                    ) : (
                      "Datum auswählen"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="flex flex-col sm:flex-row gap-4 p-3">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Startdatum</Label>
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">Enddatum</Label>
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                      />
                    </div>
                  </div>
                  <div className="border-t border-gray-200 p-3 flex justify-end">
                    <Button onClick={handleApplyFilter}>Anwenden</Button>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Search Field */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  className="pl-10"
                  placeholder="Suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              {/* Refresh Button */}
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCcw className="h-4 w-4 mr-2" />
                Aktualisieren
              </Button>

              {/* Export Button */}
              <Button variant="outline" onClick={handleExport}>
                <FileDown className="h-4 w-4 mr-2" />
                Exportieren
              </Button>

              {/* Limit Selector */}
              <Select value={String(limit)} onValueChange={(value) => setLimit(parseInt(value))}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Anzahl" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Datum
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Produkt
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Preis
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Maschine
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Zahlungsart
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Skeleton className="h-5 w-10" />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Skeleton className="h-5 w-32" />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Skeleton className="h-5 w-24" />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Skeleton className="h-5 w-16" />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Skeleton className="h-5 w-32" />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Skeleton className="h-5 w-20" />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Skeleton className="h-5 w-20" />
                        </td>
                      </tr>
                    ))
                  ) : error ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                        Fehler beim Laden der Transaktionen: {error instanceof Error ? error.message : "Unbekannter Fehler"}
                      </td>
                    </tr>
                  ) : filteredTransactions && filteredTransactions.length > 0 ? (
                    filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {transaction.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDateTime(transaction.datetime)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {transaction.productName || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {transaction.price?.toFixed(2)} {transaction.currency || "€"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {transaction.machineName || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {transaction.paymentMethod || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(transaction.status || "")}`}
                          >
                            {transaction.status === "success"
                              ? "Erfolg"
                              : transaction.status === "pending"
                              ? "Ausstehend"
                              : transaction.status === "failed"
                              ? "Fehlgeschlagen"
                              : transaction.status || "Unbekannt"}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                        Keine Transaktionen gefunden
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-700">
                  Zeige <span className="font-medium">{filteredTransactions?.length || 0}</span>{" "}
                  von <span className="font-medium">{transactions?.length || 0}</span>{" "}
                  Einträgen
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={limit >= 100} onClick={() => setLimit(prev => Math.min(prev + 25, 100))}>
                    Mehr laden
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
