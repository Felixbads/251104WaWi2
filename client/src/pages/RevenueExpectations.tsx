import { RevenueExpectationsDashboard } from '@/components/RevenueExpectationsDashboard';

export default function RevenueExpectations() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Umsatzerwartungen</h1>
        <p className="text-gray-600 mt-2">
          KI-basierte 14-Tage Umsatzprognosen mit Wetter- und Feiertagsberücksichtigung
        </p>
      </div>
      
      <RevenueExpectationsDashboard />
    </div>
  );
}