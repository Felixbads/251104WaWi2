import * as React from "react";
import { cn } from "@/lib/utils";

type KpiCardVariant = "orange" | "blue" | "green" | "teal";

const variantStyles: Record<KpiCardVariant, string> = {
  orange: "bg-[#FFA726]/10 text-[#FF8F00]",
  blue: "bg-[#29B6F6]/10 text-[#0288D1]",
  green: "bg-[#26A69A]/10 text-[#00796B]",
  teal: "bg-[#4DD0E1]/10 text-[#0097A7]"
};

export interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string | number;
  variant?: KpiCardVariant;
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export function KpiCard({
  title,
  value,
  variant = "blue",
  icon,
  isLoading = false,
  className,
  ...props
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg overflow-hidden p-5",
        "bg-card border border-border shadow-sm",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon && (
          <div className={cn("p-2 rounded-md", variantStyles[variant])}>
            {icon}
          </div>
        )}
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
      </div>
      <div className="text-2xl md:text-3xl font-bold">
        {isLoading ? (
          <div className="h-8 w-24 bg-muted animate-pulse rounded"></div>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export interface KpiGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  cols?: number;
}

export function KpiGrid({
  children,
  cols = 4,
  className,
  ...props
}: KpiGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4",
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
        cols === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}