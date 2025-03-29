// Erweiterung des Express Request Typs um den Benutzer zu unterstützen
import { User } from "../../shared/schema";

declare namespace Express {
  export interface Request {
    user?: User;
  }
}