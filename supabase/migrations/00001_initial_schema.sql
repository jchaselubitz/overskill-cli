-- Skills Platform Initial Schema
-- This migration creates all tables, types, and basic structure

-- =============================================================================
-- CUSTOM TYPES
-- =============================================================================

CREATE TYPE registry_type AS ENUM ('personal', 'organization');
CREATE TYPE publish_policy AS ENUM ('open', 'require_approval');
CREATE TYPE member_role AS ENUM ('member', 'contributor', 'admin');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- =============================================================================
-- TABLES
-- =============================================================================

-- Profiles: Public user profile information linked to auth.users
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registries: Namespaces that hold skills
CREATE TABLE registries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type registry_type NOT NULL DEFAULT 'personal',
  publish_policy publish_policy NOT NULL DEFAULT 'open',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registry Members: Maps users to registries with role-based access
CREATE TABLE registry_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(registry_id, user_id)
);

-- Skills: Core skill records
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  compat TEXT[] DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(registry_id, slug)
);

-- Skill Versions: Version history with content
CREATE TABLE skill_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  content TEXT NOT NULL,
  changelog TEXT,
  published_by UUID NOT NULL REFERENCES profiles(id),
  is_latest BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(skill_id, version)
);

-- Skill Maintainers: Per-skill maintainer assignments
CREATE TABLE skill_maintainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(skill_id, user_id)
);

-- Invitations: Pending invitations to join a registry
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role member_role NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES profiles(id),
  status invitation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE(registry_id, email, status)
);

-- OAuth Clients: Registered OAuth clients for MCP connections
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- OAuth Codes: Temporary authorization codes
CREATE TABLE oauth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  redirect_uri TEXT NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  used BOOLEAN NOT NULL DEFAULT false
);

-- Skill Issues: Reported issues with skills
CREATE TABLE skill_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  reported_by UUID REFERENCES profiles(id),
  issue TEXT NOT NULL,
  context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_registry_members_user ON registry_members(user_id);
CREATE INDEX idx_registry_members_registry ON registry_members(registry_id);
CREATE INDEX idx_skills_registry ON skills(registry_id);
CREATE INDEX idx_skills_slug ON skills(registry_id, slug);
CREATE INDEX idx_skills_tags ON skills USING GIN(tags);
CREATE INDEX idx_skill_versions_skill ON skill_versions(skill_id);
CREATE INDEX idx_skill_versions_latest ON skill_versions(skill_id) WHERE is_latest = true;
CREATE INDEX idx_skill_maintainers_skill ON skill_maintainers(skill_id);
CREATE INDEX idx_skill_maintainers_user ON skill_maintainers(user_id);
CREATE INDEX idx_invitations_email ON invitations(email) WHERE status = 'pending';
