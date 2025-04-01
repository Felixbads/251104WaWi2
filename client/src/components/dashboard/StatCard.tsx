import React from "react";
import { cn } from "@/lib/utils";

type StatVariant = "primary" | "secondary" | "accent" | "muted";

const variants: Record<StatVariant, string> = {
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  accent: "bg-accent text-accent-foreground",
  muted: "bg-muted text-foreground"
};

export interface StatCardProps {
  title: string;
  value: string | number;
  variant?: StatVariant;
  className?: string;
}

export function StatCard({ title, value, variant = "primary", className }: StatCardProps) {
  return (
    <div className={cn("rounded-lg p-5", variants[variant], className)}>
      <div className="text-sm font-medium opacity-80">{title}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}