import * as React from "react";
import { cn } from "@/lib/utils";

interface StepsProps extends React.HTMLAttributes<HTMLDivElement> {
  currentStep: number;
}

export function Steps({ currentStep = 0, className, children }: StepsProps) {
  // Count the steps using React.Children
  const steps = React.Children.toArray(children);
  const totalSteps = steps.length;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex w-full items-center justify-between gap-3">
        {React.Children.map(children, (step, index) => {
          return React.cloneElement(step as React.ReactElement, {
            step: index + 1,
            isActive: currentStep === index,
            isCompleted: index < currentStep,
            isLastStep: index === totalSteps - 1,
          });
        })}
      </div>
    </div>
  );
}

interface StepProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  step?: number;
  isActive?: boolean;
  isCompleted?: boolean;
  isLastStep?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export function Step({
  title,
  description,
  step,
  isActive = false,
  isCompleted = false,
  isLastStep = false,
  className,
  icon,
  disabled = false,
  onClick,
  ...props
}: StepProps) {
  return (
    <div 
      className={cn(
        "flex flex-1 flex-col relative",
        {
          "cursor-pointer": !disabled && onClick,
          "cursor-not-allowed opacity-60": disabled,
        },
        className
      )}
      onClick={disabled ? undefined : onClick}
      {...props}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-medium",
            {
              "border-primary bg-primary text-white": isActive,
              "border-primary/70 text-primary": isCompleted,
              "border-muted-foreground text-muted-foreground": !isActive && !isCompleted,
            }
          )}
        >
          {icon && (
            <div className="flex items-center justify-center">
              {icon}
            </div>
          )}
          {!icon && (
            <>{isCompleted ? "✓" : step}</>
          )}
        </div>
        <div className="flex flex-col">
          <div
            className={cn("text-sm font-medium", {
              "text-foreground": isActive || isCompleted,
              "text-muted-foreground": !isActive && !isCompleted,
            })}
          >
            {title}
          </div>
          {description && (
            <div
              className={cn("text-xs", {
                "text-muted-foreground": isActive || isCompleted,
                "text-muted-foreground/70": !isActive && !isCompleted,
              })}
            >
              {description}
            </div>
          )}
        </div>
      </div>
      {!isLastStep && (
        <div
          className={cn(
            "absolute top-4 left-4 h-[calc(100%-16px)] w-px ml-3 border-l-2",
            {
              "border-primary": isCompleted,
              "border-muted": !isCompleted,
            }
          )}
        />
      )}
    </div>
  );
}