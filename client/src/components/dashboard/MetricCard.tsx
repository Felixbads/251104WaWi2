import { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  iconBgColor: string;
  iconColor: string;
  trend?: {
    value: string;
    label: string;
    isPositive: boolean;
  };
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function MetricCard({
  title,
  value,
  icon,
  iconBgColor,
  iconColor,
  trend,
  action,
}: MetricCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center">
        <div className={`flex-shrink-0 rounded-md ${iconBgColor} p-3`}>
          <div className={`h-6 w-6 ${iconColor}`}>{icon}</div>
        </div>
        <div className="ml-4">
          <h3 className="text-sm font-medium text-gray-500">{title}</h3>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center text-sm">
        {trend && (
          <>
            <span
              className={`${
                trend.isPositive ? "text-green-500" : "text-red-500"
              } font-medium flex items-center`}
            >
              {trend.isPositive ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              )}
              {trend.value}
            </span>
            <span className="text-gray-500 ml-2">{trend.label}</span>
          </>
        )}
        {action && !trend && (
          <button
            onClick={action.onClick}
            className="text-sm text-primary-600 font-medium hover:text-primary-800"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
