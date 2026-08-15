-- Stores the application profile for each Thapar student.
-- Authentication itself is handled by Supabase Auth.
CREATE TABLE users (
    user_id BIGSERIAL PRIMARY KEY,
    auth_user_id UUID NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_auth_user_id_unique UNIQUE (auth_user_id),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_name_not_blank CHECK (btrim(name) <> ''),

    -- Store emails in lower case so the unique constraint treats
    -- different capitalizations of the same email as the same user.
    CONSTRAINT users_email_normalized_check CHECK (email = lower(email)),

    -- Only Thapar email addresses are allowed to register.
    CONSTRAINT users_campus_email_check CHECK (email LIKE '%@thapar.edu')
);

-- Passwords and other authentication credentials are intentionally not stored here.
COMMENT ON TABLE users IS 'Application profiles linked to Supabase Auth.';