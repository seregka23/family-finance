-- Additive credential discriminator: preserve all users, sessions and invite FKs.
-- password_version remains the legacy compatibility marker required by 0002;
-- password_scheme is the actual algorithm used to interpret password_hash.
ALTER TABLE auth_users ADD COLUMN password_scheme TEXT NOT NULL
 DEFAULT 'pbkdf2-sha256-hmac-v1'
 CHECK(password_scheme IN ('pbkdf2-sha256-hmac-v1','scrypt-hmac-v2'));
