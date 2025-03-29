/**
 * Authentifizierungsmodul für die Benutzeranmeldung und -registrierung
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db';
import { users, insertUserSchema } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Token-Speicher (in Produktion sollte dies in der Datenbank oder in Redis gespeichert werden)
// In dieser Version speichern wir das Token für längere Zeit (30 Tage)
const tokenStore: Record<string, { userId: number; expires: Date }> = {};

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
    const newUser = await db.insert(users).values({
      ...userDataToInsert,
      password: hashedPassword,
    }).returning();
    
    // Sensitiven Daten entfernen bevor Rückgabe
    if (newUser && newUser[0]) {
      const { password, ...userWithoutPassword } = newUser[0];
      return { success: true, user: userWithoutPassword };
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
 * Authentifiziert einen Benutzer und gibt ein Token zurück
 */
export async function loginUser(credentials: z.infer<typeof loginSchema>) {
  try {
    // Demo-Account für Admin/Admin123 (für Entwicklungszwecke)
    if (credentials.username === "Admin" && credentials.password === "Admin123") {
      const token = generateToken();
      const expiresIn = 30 * 24 * 60 * 60 * 1000; // 30 Tage statt 24 Stunden
      const expiresAt = new Date(Date.now() + expiresIn);
      
      // Token speichern
      tokenStore[token] = {
        userId: 1, // Admin-ID
        expires: expiresAt,
      };
      
      // Rückgabe für den Demo-Account
      return {
        success: true,
        token,
        user: {
          id: 1,
          username: "Admin",
          email: "admin@example.com",
          role: "admin",
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
    
    // Token erstellen
    const token = generateToken();
    const expiresIn = 30 * 24 * 60 * 60 * 1000; // 30 Tage statt 24 Stunden
    const expiresAt = new Date(Date.now() + expiresIn);
    
    // Token speichern
    tokenStore[token] = {
      userId: user.id,
      expires: expiresAt,
    };
    
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
 * Validiert ein Token und gibt den zugehörigen Benutzer zurück
 */
export async function validateToken(token: string) {
  // Überprüfen, ob Token existiert
  if (!tokenStore[token]) {
    return null;
  }
  
  // Überprüfen, ob Token abgelaufen ist
  if (tokenStore[token].expires < new Date()) {
    delete tokenStore[token];
    return null;
  }
  
  // Demo-Account für Admin (Hartcodiert für Entwicklungszwecke)
  if (tokenStore[token].userId === 1) {
    return {
      id: 1,
      username: "Admin",
      email: "admin@example.com",
      role: "admin",
      password: "-", // Nicht verwendet, nur für Typsicherheit
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  
  // Benutzer abrufen für normale Benutzer
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, tokenStore[token].userId),
    });
    
    if (!user) {
      delete tokenStore[token];
      return null;
    }
    
    return user;
  } catch (error) {
    console.error("Token-Validierungsfehler:", error);
    return null;
  }
}

/**
 * Token aus dem Speicher löschen (Logout)
 */
export function invalidateToken(token: string) {
  delete tokenStore[token];
  return { success: true };
}

/**
 * Generiert ein zufälliges Token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}