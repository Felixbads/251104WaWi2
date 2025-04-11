import React from 'react';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepProps {
  title: string;
  description?: string;
  isActive?: boolean;
  isCompleted?: boolean;
  isClickable?: boolean;
  onClick?: () => void;
}

export const Step: React.FC<StepProps> = ({
  title,
  description,
  isActive = false,
  isCompleted = false,
  isClickable = false,
  onClick
}) => {
  const handleClick = () => {
    if (isClickable && onClick) {
      onClick();
    }
  };
  
  return (
    <div 
      className={cn(
        "flex flex-col items-center text-center space-y-2",
        isClickable ? "cursor-pointer" : "cursor-default"
      )}
      onClick={handleClick}
    >
      <div
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-medium",
          isActive
            ? "border-primary bg-primary text-primary-foreground"
            : isCompleted
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/20 bg-background text-muted-foreground",
          isClickable && !isActive && !isCompleted && "hover:border-muted-foreground/50"
        )}
      >
        {isCompleted ? <CheckIcon className="h-5 w-5" /> : null}
        {!isCompleted ? <span>{title.charAt(0)}</span> : null}
        <span className="sr-only">{title}</span>
      </div>
      <div className="flex flex-col space-y-1">
        <span
          className={cn(
            "text-sm font-medium",
            isActive || isCompleted
              ? "text-foreground"
              : "text-muted-foreground"
          )}
        >
          {title}
        </span>
        {description ? (
          <span
            className={cn(
              "text-xs",
              isActive || isCompleted
                ? "text-muted-foreground"
                : "text-muted-foreground/70"
            )}
          >
            {description}
          </span>
        ) : null}
      </div>
    </div>
  );
};

interface StepsProps {
  steps: Array<{
    title: string;
    description?: string;
  }>;
  currentStep: number;
  goToStep?: (step: number) => void;
  allowStepClick?: boolean;
}

export const Steps: React.FC<StepsProps> = ({
  steps,
  currentStep,
  goToStep,
  allowStepClick = false,
}) => {
  const handleStepClick = (index: number) => {
    if (goToStep && allowStepClick) {
      goToStep(index);
    }
  };
  
  return (
    <div className="w-full">
      <div className="flex w-full items-center justify-center">
        <div className="flex w-full flex-row items-center">
          {steps.map((step, index) => (
            <React.Fragment key={index}>
              <div className="flex-1">
                <Step
                  title={step.title}
                  description={step.description}
                  isActive={currentStep === index}
                  isCompleted={currentStep > index}
                  isClickable={allowStepClick && (currentStep > index || index <= Math.min(currentStep + 1, steps.length - 1))}
                  onClick={() => handleStepClick(index)}
                />
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "h-[2px] flex-1",
                    currentStep > index
                      ? "bg-primary"
                      : "bg-muted-foreground/20"
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Steps;