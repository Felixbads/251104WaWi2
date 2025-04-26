import React from "react";

export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-600"></div>
      <span className="ml-3 text-sm text-gray-500">Wird geladen...</span>
    </div>
  );
}