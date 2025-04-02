// Benutzertyp für die Authentifizierung
export interface User {
  id: number;
  username: string;
  email: string;
  name?: string;
  role: string;
  approved?: boolean;
  approvedBy?: number;
  approvedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// API Response Typen
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  expiresAt?: Date;
  error?: string;
}

// Formular-Typen
export interface LoginFormValues {
  username: string;
  password: string;
}

export interface RegisterFormValues {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  role?: string;
}