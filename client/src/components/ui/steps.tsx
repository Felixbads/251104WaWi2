import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CheckIcon } from 'lucide-react';

interface StepsProps {
  currentStep: number;
  children: React.ReactNode;
  className?: string;
}

export function Steps({ currentStep, children, className }: StepsProps) {
  // Count the total number of steps
  const steps = React.Children.toArray(children) as React.ReactElement[];
  const totalSteps = steps.length;

  return (
    <div className={cn("flex flex-col sm:flex-row justify-between gap-4", className)}>
      {steps.map((step, index) => {
        return React.cloneElement(step, {
          step: index + 1,
          current: currentStep === index,
          complete: currentStep > index,
          last: totalSteps === index + 1,
        });
      })}
    </div>
  );
}

interface StepProps {
  title: string;
  description?: string;
  step?: number;
  current?: boolean;
  complete?: boolean;
  last?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function Step({
  title,
  description,
  step,
  current,
  complete,
  last,
  icon,
  onClick,
  disabled = false,
}: StepProps) {
  return (
    <div 
      className={cn(
        "flex-1 flex flex-col gap-1 relative",
        !last && "after:content-[''] after:absolute after:top-5 after:left-5 after:right-0 after:h-0.5 after:bg-muted after:translate-y-px sm:after:w-full sm:after:left-1/2",
        current && "after:bg-primary",
        complete && "after:bg-primary",
        (onClick && !disabled) && "cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      onClick={() => !disabled && onClick && onClick()}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "relative flex items-center justify-center w-10 h-10 rounded-full border border-muted bg-background z-10",
            current && "border-primary bg-primary text-primary-foreground",
            complete && "border-primary bg-primary text-primary-foreground"
          )}
        >
          {complete ? (
            <CheckIcon className="w-5 h-5" />
          ) : icon ? (
            icon
          ) : (
            <span className="text-sm font-medium">{step}</span>
          )}
        </div>
        <div className="flex flex-col sm:min-w-[120px]">
          <span
            className={cn(
              "text-sm font-medium",
              current && "text-primary",
              complete && "text-primary"
            )}
          >
            {title}
          </span>
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </div>
      </div>
    </div>
  );
}