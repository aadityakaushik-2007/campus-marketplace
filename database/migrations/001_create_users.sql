-- Stores the application profile for each Thapar student.
-- Authentication itself is handled by Supabase Auth.
CREATE TABLE users (
    user_id BIGSERIAL PRIMARY KEY,
    auth_user_id UUID NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    contact_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_auth_user_id_unique UNIQUE (auth_user_id),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_name_not_blank CHECK (btrim(name) <> ''),

    -- Store emails in lower case so the unique constraint treats
    -- different capitalizations of the same email as the same user.
    CONSTRAINT users_email_normalized_check CHECK (email = lower(email)),

    -- Only Thapar email addresses are allowed to register.
    CONSTRAINT users_campus_email_check CHECK (email LIKE '%@thapar.edu'),

    -- Optional handle (phone/Instagram/etc) so a matched buyer/seller or
    -- borrower/owner can arrange their own meetup and payment off-platform.
    -- The app only reveals this to the other party once a request has been
    -- accepted -- that visibility rule lives in the app, not the database.
    CONSTRAINT users_contact_info_not_blank CHECK (contact_info IS NULL OR btrim(contact_info) <> '')
);

-- Passwords and other authentication credentials are intentionally not stored here.
COMMENT ON TABLE users IS 'Application profiles linked to Supabase Auth.';
