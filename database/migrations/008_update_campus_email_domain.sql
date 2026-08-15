-- Brings databases created before the Thapar domain update into line with 001.
-- Fresh databases already use @thapar.edu; this remains safe for their seeded data.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_campus_email_check;

UPDATE users
SET email = regexp_replace(email, '@youruniversity\.edu$', '@thapar.edu')
WHERE email LIKE '%@youruniversity.edu';

ALTER TABLE users
    ADD CONSTRAINT users_campus_email_check CHECK (email LIKE '%@thapar.edu');
