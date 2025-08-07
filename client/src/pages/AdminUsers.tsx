/**
 * Admin-Benutzerverwaltung
 * Deutsche Benutzeroberfläche für die Verwaltung von Benutzern und Freigaben
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  UserCheck,
  UserX, 
  Users,
  Clock,
  Shield,
  User,
  Mail,
  Calendar,
  Settings
} from 'lucide-react';

interface User {
  id: number;
  username: string;
  email?: string;
  role: 'user' | 'admin';
  approved: boolean;
  approvedBy?: number;
  approvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

interface ApiResponse {
  success: boolean;
  users?: User[];
  message?: string;
  error?: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<number | null>(null);
  const [changingRole, setChangingRole] = useState<number | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const { toast } = useToast();

  // Neue Benutzer-Formular-Daten
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user'
  });

  // Benutzer laden
  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/users');
      const data: ApiResponse = await response.json();
      
      if (data.success && data.users) {
        setUsers(data.users);
        setPendingUsers(data.users.filter(user => !user.approved));
      } else {
        toast({
          title: 'Fehler',
          description: data.error || 'Fehler beim Laden der Benutzer',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Fehler beim Laden der Benutzer:', error);
      toast({
        title: 'Fehler',
        description: 'Verbindungsfehler beim Laden der Benutzer',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Benutzer freigeben
  const approveUser = async (userId: number, username: string) => {
    try {
      setApproving(userId);
      const response = await fetch(`/api/admin/users/${userId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Benutzer freigegeben',
          description: `${username} wurde erfolgreich freigegeben`,
          variant: 'default',
        });
        await loadUsers();
      } else {
        toast({
          title: 'Fehler',
          description: data.error || 'Fehler bei der Benutzerfreigabe',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Fehler bei Benutzerfreigabe:', error);
      toast({
        title: 'Fehler',
        description: 'Verbindungsfehler bei der Benutzerfreigabe',
        variant: 'destructive',
      });
    } finally {
      setApproving(null);
    }
  };

  // Benutzerrolle ändern
  const changeUserRole = async (userId: number, newRole: string, username: string) => {
    try {
      setChangingRole(userId);
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      
      const data = await response.json();
      
      if (data.success) {
        const roleLabel = newRole === 'admin' ? 'Administrator' : 'Standardbenutzer';
        toast({
          title: 'Rolle geändert',
          description: `${username} ist jetzt ${roleLabel}`,
          variant: 'default',
        });
        await loadUsers();
      } else {
        toast({
          title: 'Fehler',
          description: data.error || 'Fehler bei der Rollenänderung',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Fehler bei Rollenänderung:', error);
      toast({
        title: 'Fehler',
        description: 'Verbindungsfehler bei der Rollenänderung',
        variant: 'destructive',
      });
    } finally {
      setChangingRole(null);
    }
  };

  // Neuen Benutzer erstellen
  const createUser = async () => {
    if (!newUser.username || !newUser.password) {
      toast({
        title: 'Fehler',
        description: 'Benutzername und Passwort sind erforderlich',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      
      const data = await response.json();
      
      if (response.ok && data) {
        toast({
          title: 'Benutzer erstellt',
          description: `${newUser.username} wurde erfolgreich erstellt`,
          variant: 'default',
        });
        setShowCreateUser(false);
        setNewUser({ username: '', email: '', password: '', role: 'user' });
        await loadUsers();
      } else {
        toast({
          title: 'Fehler',
          description: data.error || 'Fehler bei der Benutzererstellung',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Fehler bei Benutzererstellung:', error);
      toast({
        title: 'Fehler',
        description: 'Verbindungsfehler bei der Benutzererstellung',
        variant: 'destructive',
      });
    }
  };

  // Hilfsfunktionen
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE');
  };

  const getRoleBadge = (role: string) => {
    return role === 'admin' ? (
      <Badge variant="destructive" className="flex items-center gap-1">
        <Shield size={12} />
        Administrator
      </Badge>
    ) : (
      <Badge variant="secondary" className="flex items-center gap-1">
        <User size={12} />
        Benutzer
      </Badge>
    );
  };

  const getStatusBadge = (approved: boolean) => {
    return approved ? (
      <Badge variant="default" className="flex items-center gap-1">
        <UserCheck size={12} />
        Freigegeben
      </Badge>
    ) : (
      <Badge variant="outline" className="flex items-center gap-1">
        <Clock size={12} />
        Wartend
      </Badge>
    );
  };

  useEffect(() => {
    loadUsers();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Benutzer werden geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Benutzerverwaltung</h1>
          <p className="text-gray-600 mt-1">
            Verwalten Sie Benutzer, Freigaben und Rollen
          </p>
        </div>
        
        <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Users size={16} />
              Neuer Benutzer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Neuen Benutzer erstellen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label htmlFor="username">Benutzername *</Label>
                <Input
                  id="username"
                  value={newUser.username}
                  onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Benutzername eingeben"
                />
              </div>
              <div>
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="E-Mail-Adresse eingeben"
                />
              </div>
              <div>
                <Label htmlFor="password">Passwort *</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Passwort eingeben"
                />
              </div>
              <div>
                <Label htmlFor="role">Rolle</Label>
                <Select value={newUser.role} onValueChange={(value) => setNewUser(prev => ({ ...prev, role: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Benutzer</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-4">
                <Button onClick={createUser} className="flex-1">
                  Benutzer erstellen
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowCreateUser(false)}
                  className="flex-1"
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistiken */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Gesamt</p>
                <p className="text-2xl font-bold">{users.length}</p>
              </div>
              <Users className="text-blue-600" size={24} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Wartend</p>
                <p className="text-2xl font-bold text-orange-600">{pendingUsers.length}</p>
              </div>
              <Clock className="text-orange-600" size={24} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Freigegeben</p>
                <p className="text-2xl font-bold text-green-600">
                  {users.filter(u => u.approved).length}
                </p>
              </div>
              <UserCheck className="text-green-600" size={24} />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Admins</p>
                <p className="text-2xl font-bold text-purple-600">
                  {users.filter(u => u.role === 'admin').length}
                </p>
              </div>
              <Shield className="text-purple-600" size={24} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Wartende Benutzer */}
      {pendingUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock size={20} />
              Wartende Benutzer ({pendingUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div>
                      <p className="font-medium">{user.username}</p>
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        {user.email && (
                          <>
                            <Mail size={12} />
                            {user.email}
                          </>
                        )}
                        {user.email && ' • '}
                        <Calendar size={12} />
                        {formatDate(user.createdAt)}
                      </p>
                    </div>
                    {getRoleBadge(user.role)}
                  </div>
                  
                  <Button
                    onClick={() => approveUser(user.id, user.username)}
                    disabled={approving === user.id}
                    className="flex items-center gap-2"
                  >
                    {approving === user.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <UserCheck size={16} />
                    )}
                    Freigeben
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alle Benutzer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users size={20} />
            Alle Benutzer ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Benutzer</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Erstellt</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.email || '-'}</TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell>{getStatusBadge(user.approved)}</TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {!user.approved && (
                        <Button
                          size="sm"
                          onClick={() => approveUser(user.id, user.username)}
                          disabled={approving === user.id}
                          className="flex items-center gap-1"
                        >
                          {approving === user.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          ) : (
                            <UserCheck size={14} />
                          )}
                          Freigeben
                        </Button>
                      )}
                      
                      <Select
                        value={user.role}
                        onValueChange={(value) => changeUserRole(user.id, value, user.username)}
                        disabled={changingRole === user.id}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Benutzer</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}