import * as React from "react"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Column<T = any> {
  key: string
  label: string
  className?: string
  render?: (value: any, row: T, index: number) => React.ReactNode
  mobileLabel?: string
  showOnMobile?: boolean
}

interface ResponsiveTableProps<T = any> {
  data: T[]
  columns: Column<T>[]
  className?: string
  emptyMessage?: string
  loading?: boolean
  keyField?: keyof T
  onRowClick?: (row: T, index: number) => void
  mobileCardClassName?: string
}

interface MobileTableCardProps<T = any> {
  row: T
  columns: Column<T>[]
  index: number
  onClick?: (row: T, index: number) => void
  className?: string
}

const MobileTableCard = <T,>({ 
  row, 
  columns, 
  index, 
  onClick, 
  className 
}: MobileTableCardProps<T>) => {
  const mobileColumns = columns.filter(col => col.showOnMobile !== false)
  
  return (
    <Card 
      className={cn(
        "cursor-pointer transition-colors hover:bg-accent/50 touch-manipulation",
        onClick && "hover:shadow-sm",
        className
      )}
      onClick={onClick ? () => onClick(row, index) : undefined}
    >
      <CardContent className="p-4 space-y-2">
        {mobileColumns.map((column) => {
          const value = (row as any)[column.key]
          const displayValue = column.render 
            ? column.render(value, row, index)
            : value

          return (
            <div key={column.key} className="flex justify-between items-center py-1">
              <span className="text-sm font-medium text-muted-foreground">
                {column.mobileLabel || column.label}:
              </span>
              <span className="text-sm text-right flex-1 ml-2">
                {displayValue}
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export const ResponsiveTable = <T,>({
  data,
  columns,
  className,
  emptyMessage = "Keine Daten verfügbar",
  loading = false,
  keyField = "id" as keyof T,
  onRowClick,
  mobileCardClassName
}: ResponsiveTableProps<T>) => {
  const isMobile = useMediaQuery("(max-width: 768px)")
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground">Lädt...</div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground">{emptyMessage}</div>
      </div>
    )
  }

  // Mobile Card Layout
  if (isMobile) {
    return (
      <div className={cn("space-y-3", className)}>
        {data.map((row, index) => (
          <MobileTableCard
            key={String((row as any)[keyField]) || index}
            row={row}
            columns={columns}
            index={index}
            onClick={onRowClick}
            className={mobileCardClassName}
          />
        ))}
      </div>
    )
  }

  // Desktop Table Layout
  return (
    <div className={cn("rounded-md border", className)}>
      <ScrollArea className="w-full">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => (
              <TableRow
                key={String((row as any)[keyField]) || index}
                className={cn(
                  onRowClick && "cursor-pointer hover:bg-accent/50",
                  "transition-colors"
                )}
                onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              >
                {columns.map((column) => {
                  const value = (row as any)[column.key]
                  const displayValue = column.render 
                    ? column.render(value, row, index)
                    : value

                  return (
                    <TableCell key={column.key} className={column.className}>
                      {displayValue}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}

// Convenience components for common table patterns
export const StatusBadge = ({ status, variant }: { 
  status: string
  variant?: "default" | "secondary" | "destructive" | "outline"
}) => {
  const getVariant = () => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'aktiv':
      case 'completed':
      case 'abgeschlossen':
        return 'default'
      case 'inactive':
      case 'inaktiv':
      case 'pending':
      case 'ausstehend':
        return 'secondary'
      case 'error':
      case 'fehler':
      case 'failed':
      case 'fehlgeschlagen':
        return 'destructive'
      default:
        return variant || 'outline'
    }
  }

  return (
    <Badge variant={getVariant()} className="text-xs">
      {status}
    </Badge>
  )
}

export const CurrencyCell = ({ amount, className }: { 
  amount: number
  className?: string 
}) => (
  <span className={cn("font-mono text-right", className)}>
    {new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount)}
  </span>
)

export const DateCell = ({ date, className }: { 
  date: string | Date
  className?: string 
}) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  return (
    <span className={cn("text-sm", className)}>
      {dateObj.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })}
    </span>
  )
}

export default ResponsiveTable