CREATE TABLE auth_users (
 id TEXT PRIMARY KEY NOT NULL,
 email TEXT NOT NULL UNIQUE CHECK(email=lower(trim(email)) AND length(email)<=254),
 name TEXT NOT NULL DEFAULT '' CHECK(length(name)<=100),
 role TEXT NOT NULL CHECK(role IN ('member','admin')),
 status TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','disabled')),
 password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
 password_version TEXT NOT NULL CHECK(password_version='pbkdf2-sha256-hmac-v1'),
 created_at INTEGER NOT NULL CHECK(created_at>0)
) STRICT;
CREATE TABLE auth_invites (
 token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64),
 email TEXT NOT NULL CHECK(email=lower(trim(email)) AND length(email)<=254),
 role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')),
 created_at INTEGER NOT NULL CHECK(created_at>0),
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+86400),
 consumed_at INTEGER CHECK(consumed_at>=created_at),
 user_id TEXT REFERENCES auth_users(id)
) STRICT;
CREATE TABLE auth_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64),
 user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL CHECK(created_at>0),
 expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+604800)
) STRICT;
CREATE TABLE auth_rate_limits (
 bucket_hash TEXT PRIMARY KEY NOT NULL CHECK(length(bucket_hash)=64),
 attempts INTEGER NOT NULL CHECK(attempts>0),
 expires_at INTEGER NOT NULL CHECK(expires_at>0)
) STRICT;
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE INDEX auth_invites_email_expiry ON auth_invites(email,expires_at);
CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits(expires_at);
