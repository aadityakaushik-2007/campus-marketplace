-- Replace youruniversity.edu in this constraint before deploying.
CREATE TABLE users (
    user_id BIGSERIAL PRIMARY KEY,
    auth_user_id UUID NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_auth_user_id_unique UNIQUE (auth_user_id),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_name_not_blank CHECK (btrim(name) <> ''),
    -- Email values must be stored lower case so the unique key is case-insensitive in practice.
    CONSTRAINT users_email_normalized_check CHECK (email = lower(email)),
    CONSTRAINT users_campus_email_check CHECK (email LIKE '%@youruniversity.edu')
);

COMMENT ON TABLE users IS 'Application profiles linked to Supabase Auth; credentials are never stored here.';
