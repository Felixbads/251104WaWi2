import { ReactNode } from 'react';

interface PageTitleProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageTitle({ title, description, actions }: PageTitleProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 mb-4 border-b">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="mt-4 sm:mt-0 flex space-x-2">{actions}</div>}
    </div>
  );
}