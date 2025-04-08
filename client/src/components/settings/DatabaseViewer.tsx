import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  CardContent,
  CardDescription,
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { 
  Database, 
  Table as TableIcon, 
  LayoutList, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw,
  ArrowUpDown
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

// Typdefinitionen für die Komponente
interface Database {
  datname: string;
}

interface Table {
  table_name: string;
  table_schema: string;
}

interface Column {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  column_default: string | null;
  is_nullable: string;
}

interface TableContentResponse {
  items: any[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export default function DatabaseViewer() {
  // Zustandsvariablen
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedSchema, setSelectedSchema] = useState<string>("public");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortColumn, setSortColumn] = useState<string>("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Datenbankliste abrufen
  const { 
    data: databases, 
    isLoading: isLoadingDatabases, 
    refetch: refetchDatabases 
  } = useQuery({
    queryKey: ["/api/database-viewer/databases"],
    queryFn: () => fetch("/api/database-viewer/databases").then(res => res.json()),
    enabled: true
  });

  // Tabellen für die ausgewählte Datenbank abrufen
  const { 
    data: tables, 
    isLoading: isLoadingTables, 
    refetch: refetchTables 
  } = useQuery({
    queryKey: ["/api/database-viewer/tables", selectedDatabase],
    queryFn: () => 
      fetch(`/api/database-viewer/databases/${selectedDatabase}/tables`)
        .then(res => res.json()),
    enabled: !!selectedDatabase
  });

  // Spalten für die ausgewählte Tabelle abrufen
  const { 
    data: columns, 
    isLoading: isLoadingColumns, 
    refetch: refetchColumns 
  } = useQuery({
    queryKey: ["/api/database-viewer/columns", selectedDatabase, selectedTable, selectedSchema],
    queryFn: () => 
      fetch(`/api/database-viewer/databases/${selectedDatabase}/tables/${selectedTable}/columns?schema=${selectedSchema}`)
        .then(res => res.json()),
    enabled: !!selectedDatabase && !!selectedTable
  });

  // Tabelleninhalt abrufen
  const { 
    data: tableContent, 
    isLoading: isLoadingTableContent, 
    refetch: refetchTableContent 
  } = useQuery<TableContentResponse>({
    queryKey: [
      "/api/database-viewer/content", 
      selectedDatabase, 
      selectedTable, 
      selectedSchema, 
      page, 
      pageSize,
      sortColumn,
      sortDirection
    ],
    queryFn: () => 
      fetch(`/api/database-viewer/databases/${selectedDatabase}/tables/${selectedTable}/content?schema=${selectedSchema}&page=${page}&pageSize=${pageSize}&orderBy=${sortColumn}&orderDirection=${sortDirection}`)
        .then(res => res.json()),
    enabled: !!selectedDatabase && !!selectedTable
  });

  // Wenn sich die Datenbank ändert, setze die ausgewählte Tabelle zurück
  useEffect(() => {
    setSelectedTable(null);
  }, [selectedDatabase]);

  // Wenn sich die Tabelle ändert, setze die Seite zurück
  useEffect(() => {
    setPage(1);
    if (columns && columns.length > 0) {
      // Versuche, "id" als Standardsortierfeld zu verwenden, oder verwende das erste Feld
      const hasIdColumn = columns.some((col: Column) => col.column_name === "id");
      setSortColumn(hasIdColumn ? "id" : columns[0].column_name);
    }
  }, [selectedTable, columns]);

  // Aktualisieren aller Daten
  const refreshAll = () => {
    refetchDatabases();
    if (selectedDatabase) refetchTables();
    if (selectedDatabase && selectedTable) {
      refetchColumns();
      refetchTableContent();
    }
  };

  // Sortierreihenfolge umschalten
  const toggleSort = (columnName: string) => {
    if (sortColumn === columnName) {
      // Wenn es bereits die Sortierspalte ist, umschalten der Sortierrichtung
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Sonst neue Spalte mit aufsteigender Sortierung auswählen
      setSortColumn(columnName);
      setSortDirection("asc");
    }
  };

  // Pagination-Links für die Tabellendaten generieren
  const renderPaginationLinks = () => {
    if (!tableContent) return null;
    
    const { totalPages } = tableContent.pagination;
    
    // Berechne, welche Seiten angezeigt werden sollen
    let pageLinks: (number | string)[] = [];
    
    if (totalPages <= 7) {
      // Wenn weniger als 7 Seiten, zeige alle an
      for (let i = 1; i <= totalPages; i++) {
        pageLinks.push(i);
      }
    } else {
      // Immer die erste und letzte Seite anzeigen
      pageLinks = [1];
      
      // Seiten um die aktuelle Seite herum
      const startPage = Math.max(2, page - 1);
      const endPage = Math.min(totalPages - 1, page + 1);
      
      // Wenn Lücke vor startPage, füge Ellipsis hinzu
      if (startPage > 2) {
        pageLinks.push("ellipsis1");
      }
      
      // Füge Seiten zwischen startPage und endPage hinzu
      for (let i = startPage; i <= endPage; i++) {
        pageLinks.push(i);
      }
      
      // Wenn Lücke nach endPage, füge Ellipsis hinzu
      if (endPage < totalPages - 1) {
        pageLinks.push("ellipsis2");
      }
      
      // Letzte Seite
      pageLinks.push(totalPages);
    }

    return (
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious 
            href="#" 
            onClick={(e) => {
              e.preventDefault();
              if (page > 1) setPage(page - 1);
            }}
            className={page === 1 ? "pointer-events-none opacity-50" : ""}
          />
        </PaginationItem>
        
        {pageLinks.map((pageNum, index) => {
          if (typeof pageNum === 'string' && (pageNum === "ellipsis1" || pageNum === "ellipsis2")) {
            return (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            );
          }
          
          return (
            <PaginationItem key={index}>
              <PaginationLink 
                href="#" 
                isActive={page === Number(pageNum)}
                onClick={(e) => {
                  e.preventDefault();
                  setPage(Number(pageNum));
                }}
              >
                {pageNum}
              </PaginationLink>
            </PaginationItem>
          );
        })}
        
        <PaginationItem>
          <PaginationNext 
            href="#" 
            onClick={(e) => {
              e.preventDefault();
              if (tableContent && page < tableContent.pagination.totalPages) {
                setPage(page + 1);
              }
            }}
            className={tableContent && page >= tableContent.pagination.totalPages ? "pointer-events-none opacity-50" : ""}
          />
        </PaginationItem>
      </PaginationContent>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-start">
        {/* Datenbank- und Tabellenselektion */}
        <Card className="w-full md:w-72">
          <CardHeader className="pb-3">
            <CardTitle className="text-md flex items-center">
              <Database className="h-5 w-5 mr-2" />
              Datenbankstruktur
            </CardTitle>
            <CardDescription>
              Datenbanken und Tabellen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Datenbank-Auswahl */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Datenbank</label>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={refreshAll}
                    disabled={isLoadingDatabases}
                    className="h-8 w-8"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingDatabases ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <Select
                  value={selectedDatabase || ""}
                  onValueChange={(value) => setSelectedDatabase(value || null)}
                  disabled={isLoadingDatabases || !databases || databases.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Datenbank auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {databases?.map((db: Database) => (
                      <SelectItem key={db.datname} value={db.datname}>
                        {db.datname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tabellenliste */}
              {selectedDatabase && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tabellen</label>
                  <div className="border rounded-md h-[300px] overflow-auto">
                    {isLoadingTables ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Tabellen werden geladen...
                      </div>
                    ) : tables && tables.length > 0 ? (
                      <ScrollArea className="h-[300px]">
                        <div className="p-2 space-y-1">
                          {tables.map((table: Table) => (
                            <Button
                              key={`${table.table_schema}.${table.table_name}`}
                              variant={
                                selectedTable === table.table_name && 
                                selectedSchema === table.table_schema
                                  ? "secondary" 
                                  : "ghost"
                              }
                              className="w-full justify-start text-left text-sm"
                              onClick={() => {
                                setSelectedTable(table.table_name);
                                setSelectedSchema(table.table_schema);
                              }}
                            >
                              <TableIcon className="h-4 w-4 mr-2" />
                              <span>
                                {table.table_schema !== 'public' && (
                                  <span className="text-muted-foreground mr-1">{table.table_schema}.</span>
                                )}
                                {table.table_name}
                              </span>
                            </Button>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Keine Tabellen gefunden
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabelleninhalt und Struktur */}
        <Card className="flex-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-md flex items-center">
              {selectedTable ? (
                <>
                  <LayoutList className="h-5 w-5 mr-2" />
                  Tabelleninhalt: {selectedSchema}.{selectedTable}
                </>
              ) : (
                <>
                  <LayoutList className="h-5 w-5 mr-2" />
                  {selectedDatabase ? 'Wähle eine Tabelle' : 'Wähle eine Datenbank'}
                </>
              )}
            </CardTitle>
            {selectedTable && (
              <CardDescription>
                Zeige Datensätze {tableContent ? (page - 1) * pageSize + 1 : 0} bis {
                  tableContent ? Math.min(page * pageSize, tableContent.pagination.totalItems) : 0
                } von {
                  tableContent ? tableContent.pagination.totalItems : 0
                }
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {selectedTable ? (
              <div className="space-y-4">
                {/* Spaltenübersicht */}
                <div className="overflow-auto">
                  <h3 className="text-sm font-medium mb-2">Tabellenschema</h3>
                  {isLoadingColumns ? (
                    <div className="text-sm text-muted-foreground">Spalten werden geladen...</div>
                  ) : columns && columns.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Datentyp</TableHead>
                          <TableHead>Nullable</TableHead>
                          <TableHead>Default</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {columns.map((column: Column) => (
                          <TableRow key={column.column_name}>
                            <TableCell className="font-medium">{column.column_name}</TableCell>
                            <TableCell>
                              {column.data_type}
                              {column.character_maximum_length && 
                                `(${column.character_maximum_length})`}
                            </TableCell>
                            <TableCell>{column.is_nullable === 'YES' ? 'Ja' : 'Nein'}</TableCell>
                            <TableCell>{column.column_default || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-sm text-muted-foreground">Keine Spalten gefunden</div>
                  )}
                </div>

                {/* Paginierung und Einstellungen */}
                <div className="flex flex-col md:flex-row gap-2 justify-between">
                  <div className="flex gap-2 items-center">
                    <div className="flex items-center">
                      <label className="text-sm mr-2">Zeilen:</label>
                      <Select
                        value={pageSize.toString()}
                        onValueChange={(value) => {
                          setPageSize(Number(value));
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue placeholder={pageSize.toString()} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="250">250</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Paginierung */}
                  {tableContent && tableContent.pagination.totalPages > 1 && (
                    <div className="flex justify-center md:justify-end">
                      <Pagination>
                        {renderPaginationLinks()}
                      </Pagination>
                    </div>
                  )}
                </div>

                {/* Tabelleninhalt */}
                <div className="overflow-auto border rounded-md">
                  {isLoadingTableContent ? (
                    <div className="p-4 text-center">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Tabelleninhalt wird geladen...</p>
                    </div>
                  ) : tableContent && tableContent.items.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {columns && columns.map((column: Column) => (
                            <TableHead key={column.column_name} className="whitespace-nowrap">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 -ml-2 font-semibold"
                                onClick={() => toggleSort(column.column_name)}
                              >
                                {column.column_name}
                                {sortColumn === column.column_name ? (
                                  sortDirection === "asc" ? (
                                    <ChevronUp className="ml-1 h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="ml-1 h-4 w-4" />
                                  )
                                ) : (
                                  <ArrowUpDown className="ml-1 h-4 w-4 opacity-30" />
                                )}
                              </Button>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableContent.items.map((row: any, rowIndex: number) => (
                          <TableRow key={rowIndex}>
                            {columns && columns.map((column: Column) => (
                              <TableCell key={column.column_name} className="max-w-[400px] truncate">
                                {row[column.column_name] === null
                                  ? <span className="text-muted-foreground italic">NULL</span>
                                  : typeof row[column.column_name] === 'object'
                                    ? JSON.stringify(row[column.column_name])
                                    : String(row[column.column_name])}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Keine Daten gefunden
                    </div>
                  )}
                </div>

                {/* Untere Paginierung */}
                {tableContent && tableContent.pagination.totalPages > 1 && (
                  <div className="flex justify-center">
                    <Pagination>
                      {renderPaginationLinks()}
                    </Pagination>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <TableIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-2">Keine Tabelle ausgewählt</h3>
                <p className="text-sm text-muted-foreground">
                  Wähle eine Datenbank und Tabelle aus dem linken Menü aus, um deren Inhalt anzuzeigen.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}