/**
 * Authentifizierungsmodul für die Benutzeranmeldung und -registrierung
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { users, insertUserSchema } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { notifyAdminsOfNewUser, notifyUserOfApprovalStatus } from './services/emailService';

// JWT-Konfiguration
const JWT_SECRET = process.env.JWT_SECRET || 'dev-fallback-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

// JWT Token-Interface
interface JWTPayload {
  userId: number;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

// Warnung bei unsicherem Fallback-Secret
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ WARNUNG: JWT_SECRET ist nicht gesetzt. Verwende Fallback-Secret für Entwicklung.');
}

// Validierungsschemas
export const loginSchema = z.object({
  username: z.string().min(1, "Benutzername ist erforderlich"),
  password: z.string().min(1, "Passwort ist erforderlich"),
});

export const registerSchema = insertUserSchema.extend({
  confirmPassword: z.string().min(6, "Passwort bestätigen ist erforderlich"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwörter stimmen nicht überein",
  path: ["confirmPassword"],
});

/**
 * Registriert einen neuen Benutzer
 */
export async function registerUser(userData: z.infer<typeof registerSchema>) {
  // Passwort hashen
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(userData.password, salt);

  // Benutzer in Datenbank speichern (ohne confirmPassword)
  const { confirmPassword, ...userDataToInsert } = userData;
  try {
    // Automatische Freischaltung für Admins
    const isAdmin = userDataToInsert.role === 'admin';
    
    const newUser = await db.insert(users).values({
      ...userDataToInsert,
      password: hashedPassword,
      approved: isAdmin, // Admins werden automatisch freigegeben
      approvedAt: isAdmin ? new Date() : undefined,
    }).returning();
    
    // Sensitiven Daten entfernen bevor Rückgabe
    if (newUser && newUser[0]) {
      const { password, ...userWithoutPassword } = newUser[0];
      
      // E-Mail-Benachrichtigung nur für nicht-Admin Benutzer
      if (!isAdmin) {
        try {
          await notifyAdminsOfNewUser({
            username: userDataToInsert.username,
            email: userDataToInsert.email || undefined,
            role: userDataToInsert.role,
            createdAt: new Date()
          });
          console.log(`📧 Admin-Benachrichtigung für neuen Benutzer ${userDataToInsert.username} gesendet`);
        } catch (emailError) {
          console.error('⚠️ Fehler beim Senden der Admin-Benachrichtigung:', emailError);
          // E-Mail-Fehler sollte die Registrierung nicht blockieren
        }
      }
      
      return { 
        success: true, 
        user: userWithoutPassword,
        message: isAdmin 
          ? "Admin-Konto wurde erfolgreich erstellt." 
          : "Dein Konto wurde erfolgreich erstellt. Du erhältst eine E-Mail, sobald ein Administrator deinen Account freigeschaltet hat."
      };
    }
    
    return { success: false, error: "Fehler beim Erstellen des Benutzers" };
  } catch (error: any) {
    if (error.code === '23505') { // PostgreSQL unique constraint violation
      return { success: false, error: "Benutzername oder E-Mail bereits in Verwendung" };
    }
    console.error("Registrierungsfehler:", error);
    return { success: false, error: "Fehler beim Erstellen des Benutzers" };
  }
}

/**
 * Gibt eine Liste aller Benutzer zurück (nur für Admins zugänglich)
 */
export async function getAllUsers() {
  try {
    const allUsers = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      approved: users.approved,
      approvedAt: users.approvedAt,
      approvedBy: users.approvedBy,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    }).from(users).orderBy(users.createdAt);
    
    return allUsers;
  } catch (error) {
    console.error("Fehler beim Abrufen der Benutzerliste:", error);
    throw error;
  }
}

/**
 * Genehmigt einen Benutzer (nur für Admins zugänglich)
 */
export async function approveUser(userId: number, approvedById: number) {
  try {
    const [updatedUser] = await db.update(users)
      .set({
        approved: true,
        approvedBy: approvedById,
        approvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    
    if (!updatedUser) {
      return { success: false, error: "Benutzer konnte nicht gefunden werden" };
    }
    
    // E-Mail-Benachrichtigung an den freigeschalteten Benutzer senden
    if (updatedUser.email) {
      try {
        await notifyUserOfApprovalStatus(
          updatedUser.email,
          updatedUser.username,
          true,
          updatedUser.role || 'user'
        );
        console.log(`📧 Freigabe-Benachrichtigung für Benutzer ${updatedUser.username} gesendet`);
      } catch (emailError) {
        console.error('⚠️ Fehler beim Senden der Freigabe-Benachrichtigung:', emailError);
        // E-Mail-Fehler sollte die Genehmigung nicht blockieren
      }
    }
    
    const { password, ...userWithoutPassword } = updatedUser;
    return { success: true, user: userWithoutPassword };
  } catch (error) {
    console.error("Fehler beim Genehmigen des Benutzers:", error);
    return { success: false, error: "Benutzer konnte nicht genehmigt werden" };
  }
}

/**
 * Ändert die Rolle eines Benutzers (nur für Admins zugänglich)
 */
export async function changeUserRole(userId: number, newRole: string) {
  try {
    const [updatedUser] = await db.update(users)
      .set({
        role: newRole,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    
    if (!updatedUser) {
      return { success: false, error: "Benutzer konnte nicht gefunden werden" };
    }
    
    const { password, ...userWithoutPassword } = updatedUser;
    return { success: true, user: userWithoutPassword };
  } catch (error) {
    console.error("Fehler beim Ändern der Benutzerrolle:", error);
    return { success: false, error: "Benutzerrolle konnte nicht geändert werden" };
  }
}

/**
 * Authentifiziert einen Benutzer und gibt ein Token zurück
 */
export async function loginUser(credentials: z.infer<typeof loginSchema>) {
  try {
    // Demo-Account für Admin/Admin123 (nur in Entwicklung und wenn explizit aktiviert)
    if (process.env.ENABLE_DEMO_LOGIN === 'true' && 
        credentials.username === "Admin" && 
        credentials.password === "Admin123") {
      
      console.warn("⚠️ WARNUNG: Demo-Login verwendet! Dies sollte nur in der Entwicklung aktiviert sein.");
      
      const token = generateJWTToken({
        userId: 1,
        username: "Admin",
        role: "admin"
      });
      
      const decoded = jwt.decode(token) as JWTPayload;
      const expiresAt = new Date((decoded.exp || 0) * 1000);
      
      // Rückgabe für den Demo-Account
      return {
        success: true,
        token,
        user: {
          id: 1,
          username: "Admin",
          email: "admin@example.com",
          role: "admin",
          approved: true,
        },
        expiresAt,
      };
    }
    
    // Normale Benutzeranmeldung
    const user = await db.query.users.findFirst({
      where: eq(users.username, credentials.username),
    });
    
    if (!user) {
      return { success: false, error: "Ungültige Anmeldedaten" };
    }
    
    // Passwort überprüfen
    const isMatch = await bcrypt.compare(credentials.password, user.password);
    if (!isMatch) {
      return { success: false, error: "Ungültige Anmeldedaten" };
    }
    
    // Prüfen, ob der Benutzer freigegeben ist (außer für Admins)
    if (user.role !== "admin" && !user.approved) {
      return { success: false, error: "Dein Account wurde noch nicht freigegeben. Bitte warte auf die Freigabe durch einen Administrator." };
    }
    
    // JWT-Token erstellen
    const token = generateJWTToken({
      userId: user.id,
      username: user.username,
      role: user.role || 'user'
    });
    
    const decoded = jwt.decode(token) as JWTPayload;
    const expiresAt = new Date((decoded.exp || 0) * 1000);
    
    // Sensitiven Daten entfernen vor Rückgabe
    const { password, ...userWithoutPassword } = user;
    
    return {
      success: true,
      token,
      user: userWithoutPassword,
      expiresAt,
    };
  } catch (error) {
    console.error("Anmeldefehler:", error);
    return { success: false, error: "Fehler bei der Anmeldung" };
  }
}

/**
 * Validiert ein JWT-Token und gibt den zugehörigen Benutzer zurück
 */
export async function validateToken(token: string) {
  try {
    // JWT-Token verifizieren
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    
    // Demo-Account für Admin (nur wenn ENABLE_DEMO_LOGIN aktiviert ist)
    if (process.env.ENABLE_DEMO_LOGIN === 'true' && decoded.userId === 1) {
      return {
        id: 1,
        username: "Admin",
        email: "admin@example.com",
        role: "admin",
        approved: true,
        password: "-", // Nicht verwendet, nur für Typsicherheit
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    
    // Benutzer aus der Datenbank abrufen für normale Benutzer
    const user = await db.query.users.findFirst({
      where: eq(users.id, decoded.userId),
    });
    
    if (!user) {
      return null;
    }
    
    // Überprüfen ob Benutzer noch aktiv/genehmigt ist
    if (user.role !== 'admin' && !user.approved) {
      return null;
    }
    
    return user;
  } catch (error) {
    // Token ist ungültig oder abgelaufen
    console.error("JWT-Validierungsfehler:", error);
    return null;
  }
}

/**
 * Token invalidieren (Logout)
 * Da JWT stateless ist, können wir nur eine erfolgreiche Antwort zurückgeben
 * In einer erweiterten Implementierung könnte hier eine Blacklist geführt werden
 */
export function invalidateToken(token: string) {
  // Bei JWT ist keine server-seitige Invalidierung nötig,
  // da der Client das Token einfach vergisst
  return { success: true };
}

/**
 * Generiert ein JWT-Token
 */
function generateJWTToken(payload: Omit<JWTPayload, 'iat' | 'exp'>) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'vending-system',
    subject: payload.userId.toString()
  });
}

/**
 * Extrahiert Benutzerinformationen aus einem JWT-Token ohne Verifikation
 * (Nur für Debug-Zwecke verwenden)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
}