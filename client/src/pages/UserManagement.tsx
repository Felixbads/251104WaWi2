import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { 
  Check, 
  X, 
  UserCheck, 
  UserX, 
  Shield, 
  Mail, 
  Calendar, 
  TrashIcon, 
  CheckCircle, 
  XCircle 
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useAuth } from '@/lib/auth';

interface User {
  id: number;
  username: string;
  email: string | null;
  role: string | null;
  approved: boolean | null;
  approvedBy: number | null;
  approvedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

const UserManagement: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Abfrage zum Abrufen aller Benutzer
  const { data: users, isLoading, error } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    staleTime: 60 * 1000, // 1 Minute
  });

  // Mutation zum Genehmigen eines Benutzers
  const approveMutation = useMutation({
    mutationFn: (userId: number) =>
      apiRequest(`/api/admin/users/${userId}/approve`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: "Benutzer genehmigt",
        description: "Der Benutzer wurde erfolgreich freigeschaltet.",
        variant: "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Genehmigen des Benutzers: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutation zum Löschen eines Benutzers
  const deleteMutation = useMutation({
    mutationFn: (userId: number) =>
      apiRequest(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: "Benutzer gelöscht",
        description: "Der Benutzer wurde erfolgreich gelöscht.",
        variant: "default",
      });
      setDeleteDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Löschen des Benutzers: ${error.message}`,
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
    },
  });

  // Mutation zum Zurücksetzen einer Genehmigung
  const resetApprovalMutation = useMutation({
    mutationFn: (userId: number) =>
      apiRequest(`/api/admin/users/${userId}/reset-approval`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: "Genehmigung zurückgesetzt",
        description: "Die Benutzerfreigabe wurde zurückgesetzt.",
        variant: "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: `Fehler beim Zurücksetzen der Genehmigung: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Behandlung des Löschens eines Benutzers
  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  // Bestätigung des Löschens
  const confirmDelete = () => {
    if (userToDelete) {
      deleteMutation.mutate(userToDelete.id);
    }
  };

  // Funktion zum Formatieren eines Datums
  const formatDate = (date: Date | null) => {
    if (!date) return 'Nicht verfügbar';
    return format(new Date(date), 'dd.MM.yyyy HH:mm', { locale: de });
  };

  // Funktion zum Generieren eines Badge-Typs basierend auf der Benutzerrolle
  const getRoleBadgeVariant = (role: string | null) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'manager':
        return 'yellow';
      default:
        return 'secondary';
    }
  };

  // Funktion zum Formatieren eines Rollennamens
  const formatRoleName = (role: string | null) => {
    if (!role) return 'Keine Rolle';
    
    switch (role) {
      case 'admin':
        return 'Administrator';
      case 'manager':
        return 'Manager';
      case 'user':
        return 'Benutzer';
      default:
        return role;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Benutzerverwaltung</CardTitle>
            <CardDescription>Verwaltung von Benutzerkonten und Freigaben</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Fehler beim Laden der Benutzerdaten</CardTitle>
            <CardDescription className="text-red-600">
              Es ist ein Fehler beim Abrufen der Benutzer aufgetreten. Bitte versuchen Sie es später erneut.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] })}>
              Erneut versuchen
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingApprovalUsers = users?.filter(user => !user.approved) || [];
  const approvedUsers = users?.filter(user => user.approved) || [];

  return (
    <div className="container mx-auto py-6 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Benutzerverwaltung</CardTitle>
          <CardDescription>
            Verwaltung von Benutzerkonten, Genehmigungen und Berechtigungen.
          </CardDescription>
        </CardHeader>
      </Card>

      {pendingApprovalUsers.length > 0 && (
        <Card>
          <CardHeader className="bg-yellow-50">
            <CardTitle className="flex items-center">
              <UserCheck className="mr-2 h-5 w-5 text-yellow-600" />
              Ausstehende Genehmigungen
            </CardTitle>
            <CardDescription>
              Diese Benutzer haben sich registriert und warten auf Freigabe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Benutzername</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Registrierungsdatum</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApprovalUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>{user.email || 'Keine E-Mail'}</TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate(user.id)}
                          disabled={approveMutation.isPending}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Check className="mr-1 h-4 w-4" />
                          Genehmigen
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteUser(user)}
                          disabled={deleteMutation.isPending}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Ablehnen
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="mr-2 h-5 w-5" />
            Alle Benutzer
          </CardTitle>
          <CardDescription>
            Übersicht aller Benutzerkonten und deren Status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Benutzername</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Genehmigt von</TableHead>
                <TableHead>Genehmigungsdatum</TableHead>
                <TableHead>Registrierungsdatum</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((user) => (
                <TableRow key={user.id} className={user.id === currentUser?.id ? 'bg-blue-50' : ''}>
                  <TableCell className="font-medium">
                    {user.username}
                    {user.id === currentUser?.id && (
                      <Badge className="ml-2 bg-blue-500" variant="secondary">Sie</Badge>
                    )}
                  </TableCell>
                  <TableCell className="flex items-center">
                    <Mail className="mr-1 h-4 w-4 text-muted-foreground" />
                    {user.email || 'Keine E-Mail'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {formatRoleName(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.approved ? (
                      <span className="flex items-center text-green-600">
                        <CheckCircle className="mr-1 h-4 w-4" />
                        Genehmigt
                      </span>
                    ) : (
                      <span className="flex items-center text-yellow-600">
                        <XCircle className="mr-1 h-4 w-4" />
                        Ausstehend
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.approvedBy ? `ID: ${user.approvedBy}` : 'Nicht genehmigt'}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center">
                      <Calendar className="mr-1 h-4 w-4 text-muted-foreground" />
                      {user.approvedAt ? formatDate(user.approvedAt) : 'Nicht genehmigt'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center">
                      <Calendar className="mr-1 h-4 w-4 text-muted-foreground" />
                      {formatDate(user.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      {user.id !== currentUser?.id && (
                        <>
                          {!user.approved && (
                            <Button
                              size="sm"
                              onClick={() => approveMutation.mutate(user.id)}
                              disabled={approveMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Check className="mr-1 h-4 w-4" />
                              Genehmigen
                            </Button>
                          )}
                          {user.approved && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resetApprovalMutation.mutate(user.id)}
                              disabled={resetApprovalMutation.isPending}
                            >
                              <UserX className="mr-1 h-4 w-4" />
                              Freigabe zurücksetzen
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteUser(user)}
                            disabled={deleteMutation.isPending}
                          >
                            <TrashIcon className="mr-1 h-4 w-4" />
                            Löschen
                          </Button>
                        </>
                      )}
                      {user.id === currentUser?.id && (
                        <Badge variant="outline">Aktueller Benutzer</Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Benutzer löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Sind Sie sicher, dass Sie den Benutzer <span className="font-bold">{userToDelete?.username}</span> löschen möchten?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserManagement;