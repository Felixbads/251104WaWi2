import { useAuth } from "@/lib";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, UserCheck, Mail } from "lucide-react";

export default function NotApproved() {
  const { logout, user } = useAuth();
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-xl shadow-lg">
        <div className="flex flex-col items-center">
          <div className="rounded-full bg-amber-100 p-3 mb-4">
            <AlertTriangle className="h-10 w-10 text-amber-600" />
          </div>
          <h2 className="mt-2 text-center text-2xl font-bold text-gray-900">
            Konto wartet auf Freigabe
          </h2>
          <p className="mt-4 text-center text-md text-gray-600">
            Ihr Konto wurde erfolgreich erstellt, muss aber vom Administrator noch freigegeben werden, 
            bevor Sie auf das System zugreifen können.
          </p>
          
          <div className="mt-6 w-full">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="font-medium text-gray-900 mb-2">Ihr Konto</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center">
                  <UserCheck className="h-4 w-4 mr-2 text-gray-500" />
                  <span className="text-gray-700">Benutzername: {user?.username}</span>
                </div>
                <div className="flex items-center">
                  <Mail className="h-4 w-4 mr-2 text-gray-500" />
                  <span className="text-gray-700">E-Mail: {user?.email}</span>
                </div>
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-2 text-gray-500" />
                  <span className="text-gray-700">Status: Warte auf Freigabe</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-5 p-3 bg-blue-50 border border-blue-100 rounded text-blue-800 text-sm">
            <p>Bitte kontaktieren Sie den Administrator, um den Freigabeprozess zu beschleunigen.</p>
          </div>
        </div>
        <div className="mt-6">
          <Button 
            onClick={logout}
            className="w-full"
          >
            Abmelden
          </Button>
        </div>
      </div>
    </div>
  );
}