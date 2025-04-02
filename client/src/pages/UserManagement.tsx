import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib";
import axios from "axios";
import { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle, User as UserIcon, Shield, Calendar } from "lucide-react";

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState<string>("");
  const { user } = useAuth();
  const { toast } = useToast();

  // Benutzer laden
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/admin/users');
        if (response.data) {
          setUsers(response.data);
        }
      } catch (error) {
        const errorMessage = axios.isAxiosError(error) 
          ? error.response?.data?.error || "Fehler beim Laden der Benutzer" 
          : "Fehler beim Laden der Benutzer";
        setError(errorMessage);
        toast({
          variant: "destructive",
          title: "Fehler",
          description: errorMessage,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [toast]);

  // Benutzer genehmigen
  const approveUser = async (userId: number) => {
    try {
      const response = await axios.post(`/api/admin/users/${userId}/approve`);
      
      if (response.data.success) {
        // Benutzerliste aktualisieren
        setUsers(users.map(u => 
          u.id === userId 
            ? { ...u, approved: true, approvedBy: user?.id, approvedAt: new Date() }
            : u
        ));
        
        toast({
          title: "Benutzer freigegeben",
          description: "Der Benutzer wurde erfolgreich freigegeben.",
        });
        
        setIsApproveDialogOpen(false);
      } else {
        throw new Error(response.data.error || "Fehler bei der Benutzerfreigabe");
      }
    } catch (error) {
      const errorMessage = axios.isAxiosError(error) 
        ? error.response?.data?.error || "Fehler bei der Benutzerfreigabe" 
        : "Fehler bei der Benutzerfreigabe";
      
      toast({
        variant: "destructive",
        title: "Fehler",
        description: errorMessage,
      });
    }
  };

  // Benutzerrolle ändern
  const changeUserRole = async (userId: number, role: string) => {
    try {
      const response = await axios.post(`/api/admin/users/${userId}/role`, { role });
      
      if (response.data.success) {
        // Benutzerliste aktualisieren
        setUsers(users.map(u => 
          u.id === userId 
            ? { ...u, role }
            : u
        ));
        
        toast({
          title: "Rolle geändert",
          description: `Die Rolle wurde erfolgreich zu "${role}" geändert.`,
        });
        
        setIsRoleDialogOpen(false);
      } else {
        throw new Error(response.data.error || "Fehler beim Ändern der Rolle");
      }
    } catch (error) {
      const errorMessage = axios.isAxiosError(error) 
        ? error.response?.data?.error || "Fehler beim Ändern der Rolle" 
        : "Fehler beim Ändern der Rolle";
      
      toast({
        variant: "destructive",
        title: "Fehler",
        description: errorMessage,
      });
    }
  };

  // Dialog zur Rollenänderung öffnen
  const openRoleDialog = (user: User) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setIsRoleDialogOpen(true);
  };

  // Dialog zur Benutzerfreigabe öffnen
  const openApproveDialog = (user: User) => {
    setSelectedUser(user);
    setIsApproveDialogOpen(true);
  };

  // Formatiert ein Datum für die Anzeige
  const formatDate = (date?: Date) => {
    if (!date) return "Nicht verfügbar";
    return new Date(date).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertTriangle className="w-12 h-12 text-destructive" />
        <h2 className="text-xl font-semibold">Fehler beim Laden der Benutzerdaten</h2>
        <p>{error}</p>
        <Button onClick={() => window.location.reload()}>Erneut versuchen</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Benutzerverwaltung</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Benutzerübersicht</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-6">
              <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-lg font-medium">Keine Benutzer gefunden</h3>
              <p className="mt-1 text-gray-500">Es sind derzeit keine Benutzer im System registriert.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Benutzer</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Registriert am</TableHead>
                    <TableHead>Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">{user.username}</div>
                        <div className="text-sm text-muted-foreground">{user.name}</div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === "admin" ? "default" : "outline"}>
                          {user.role === "admin" ? "Administrator" : "Benutzer"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.approved ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="w-4 h-4 mr-1" /> Freigegeben
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertTriangle className="w-4 h-4 mr-1" /> Nicht freigegeben
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1 text-muted-foreground" />
                          <span className="text-sm">
                            {formatDate(user.createdAt)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRoleDialog(user)}
                          >
                            <Shield className="w-4 h-4 mr-1" /> Rolle ändern
                          </Button>
                          {!user.approved && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => openApproveDialog(user)}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" /> Freigeben
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog zur Rollenänderung */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Benutzerrolle ändern</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4">
              Sie ändern die Rolle für Benutzer <strong>{selectedUser?.username}</strong>.
            </p>
            <div className="space-y-2">
              <label htmlFor="role" className="text-sm font-medium">
                Neue Rolle
              </label>
              <Select
                value={newRole}
                onValueChange={setNewRole}
              >
                <SelectTrigger id="role">
                  <SelectValue placeholder="Rolle auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Benutzer</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Abbrechen</Button>
            </DialogClose>
            <Button 
              onClick={() => selectedUser && changeUserRole(selectedUser.id, newRole)}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog zur Benutzerfreigabe */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Benutzer freigeben</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>
              Möchten Sie den Benutzer <strong>{selectedUser?.username}</strong> freigeben?
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Nach der Freigabe kann sich der Benutzer anmelden und das System verwenden.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Abbrechen</Button>
            </DialogClose>
            <Button
              onClick={() => selectedUser && approveUser(selectedUser.id)}
            >
              Benutzer freigeben
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}