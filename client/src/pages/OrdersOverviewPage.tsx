import OrdersOverview from "@/components/orderv2/OrdersOverview";

export default function OrdersOverviewPage() {
  // Dummy function for onSelectOrder since it's required by OrdersOverview
  const handleSelectOrder = (orderId: number) => {
    // Navigate to order details
    window.location.href = `/bestellungen/${orderId}`;
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Bestellungen</h1>
        <p className="text-gray-600 mt-2">Übersicht aller Bestellungen im System</p>
      </div>
      
      <OrdersOverview onSelectOrder={handleSelectOrder} />
    </div>
  );
}