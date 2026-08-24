-- List profiles.
SELECT user_id, auth_user_id, name, email, contact_info, created_at FROM users ORDER BY user_id;

-- Find one profile (replace value as needed).
SELECT * FROM users WHERE email = 'aarav.sharma@thapar.edu';

-- New emails must be lower-case and use the campus domain. contact_info is optional.
INSERT INTO users (auth_user_id, name, email, contact_info)
VALUES ('auth0|query-new-student', 'New Student', 'new.student@thapar.edu', '@new.student');

-- Expected failures (keep each in a rolled-back transaction).
BEGIN;
INSERT INTO users (auth_user_id, name, email)
VALUES ('auth0|query-duplicate', 'Duplicate', 'aarav.sharma@thapar.edu');
ROLLBACK;

BEGIN;
INSERT INTO users (auth_user_id, name, email)
VALUES ('auth0|query-outside-campus', 'Outside Campus', 'student@example.com');
ROLLBACK;
