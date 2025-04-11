import React from "react";
import { cn } from "@/lib/utils";

interface StepsProps extends React.HTMLAttributes<HTMLDivElement> {
  currentStep: number;
}

export function Steps({ currentStep = 0, className, children }: StepsProps) {
  // Count the number of steps
  const steps = React.Children.toArray(children);
  const totalSteps = steps.length;
  
  // Set active and completed states for steps based on current step
  const modifiedChildren = React.Children.map(children, (child, index) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child as React.ReactElement<StepProps>, {
        isActive: index === currentStep,
        isCompleted: index < currentStep,
        isLastStep: index === totalSteps - 1,
        step: index + 1,
      });
    }
    return child;
  });
  
  return (
    <div className={cn("flex flex-col sm:flex-row justify-between", className)}>
      {modifiedChildren}
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
  icon,
  disabled = false,
  className,
  onClick,
  ...props
}: StepProps) {
  return (
    <div
      className={cn(
        "relative flex items-center mt-4 sm:mt-0",
        isLastStep ? "flex-[0_0_auto]" : "flex-[1_0_auto]",
        isActive && "text-primary",
        isCompleted && "text-primary",
        !isActive && !isCompleted && "text-muted-foreground",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        onClick && !disabled ? "hover:text-primary" : "",
        className
      )}
      onClick={disabled ? undefined : onClick}
      {...props}
    >
      {/* Step Circle */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-solid text-xs font-semibold",
          isActive 
            ? "border-primary bg-primary text-white"
            : isCompleted 
              ? "border-primary bg-primary text-white"
              : "border-muted-foreground bg-background text-muted-foreground"
        )}
      >
        {icon || step}
      </div>
      
      {/* Step Text */}
      <div className="ml-3 hidden md:block">
        <div className="font-semibold">
          {title}
        </div>
        {description && (
          <div className="text-xs">
            {description}
          </div>
        )}
      </div>
      
      {/* Mobile display for title only */}
      <div className="ml-3 block md:hidden text-xs font-semibold">
        {title}
      </div>
      
      {/* Connector Line */}
      {!isLastStep && (
        <div
          className={cn(
            "ml-3 hidden h-0.5 grow sm:block",
            isCompleted ? "bg-primary" : "bg-muted"
          )}
        />
      )}
    </div>
  );
}