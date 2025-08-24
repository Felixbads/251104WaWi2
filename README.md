# Wawi-Proviantomat System

## Environment Variables

### Required Variables

- `DATABASE_URL`: PostgreSQL database connection string
- `SESSION_SECRET`: Cryptographically secure session signing key (32+ random characters)
- `JWT_SECRET`: JWT token signing key for API authentication

### Optional Variables

- `NODE_ENV`: Set to 'production' for production deployment
- `ENABLE_DEMO_LOGIN`: Enable demo admin login (development only)

## Security

The application implements secure session management with PostgreSQL storage and bcrypt password hashing. See `docs/security.md` for detailed security configuration.