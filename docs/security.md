# Security Guide

## Sessions & Cookies

### Express Session Configuration

The application uses `express-session` with PostgreSQL storage for secure session management:

- **Store**: `connect-pg-simple` with PostgreSQL backend
- **Secret**: `SESSION_SECRET` environment variable (required for production)
- **Table**: Automatic `session` table creation
- **Rolling**: Sessions extend on activity

### Session Cookie Security

- **httpOnly**: `true` - Prevents XSS access to cookies
- **secure**: `true` in production - HTTPS-only transmission
- **sameSite**: `'lax'` - CSRF protection with cross-origin navigation
- **maxAge**: 8 hours (28,800,000ms) - Automatic expiration
- **rolling**: `true` - Session extends on user activity

### Password Hashing

The application uses `bcryptjs` for secure password hashing:

- **Salt rounds**: 10 (recommended minimum)
- **Hash function**: `bcrypt.hash(password, salt)`
- **Verification**: `bcrypt.compare(password, hash)`

### Environment Variables Required

- `SESSION_SECRET`: Cryptographically secure session signing key
- `JWT_SECRET`: JWT token signing (still used for API tokens)
- `DATABASE_URL`: PostgreSQL connection string

## Implementation Notes

Session storage automatically creates the required database table on first startup.