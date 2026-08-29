import 'dotenv/config';

const requiredEnv = [
    'DATABASE_URL',
    'AUTH0_ISSUER_BASE_URL',
    'AUTH0_AUDIENCE',
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY'
];

for (const key of requiredEnv) {
    if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
}

export const config = {
    port: Number(process.env.PORT) || 3000,
    databaseUrl: process.env.DATABASE_URL,
    auth0IssuerBaseUrl: process.env.AUTH0_ISSUER_BASE_URL,
    auth0Audience: process.env.AUTH0_AUDIENCE,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY
};