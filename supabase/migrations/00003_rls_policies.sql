-- Skills Platform Row-Level Security Policies
-- This migration enables RLS and creates all security policies

-- =============================================================================
-- ENABLE RLS ON ALL TABLES
-- =============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE registries ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_maintainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_issues ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PROFILES POLICIES
-- =============================================================================

-- Anyone authenticated can read profiles
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

-- Users can update only their own profile
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- =============================================================================
-- REGISTRIES POLICIES
-- =============================================================================

-- Members can see registries they belong to
CREATE POLICY "registries_select" ON registries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = registries.id
      AND registry_members.user_id = auth.uid()
    )
  );

-- Any authenticated user can create a registry (for organizations)
CREATE POLICY "registries_insert" ON registries
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Only admins can update registry settings
CREATE POLICY "registries_update" ON registries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = registries.id
      AND registry_members.user_id = auth.uid()
      AND registry_members.role = 'admin'
    )
  );

-- =============================================================================
-- REGISTRY MEMBERS POLICIES
-- =============================================================================

-- Members can see other members in their registries
CREATE POLICY "registry_members_select" ON registry_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM registry_members AS rm
      WHERE rm.registry_id = registry_members.registry_id
      AND rm.user_id = auth.uid()
    )
  );

-- Only admins can add members
CREATE POLICY "registry_members_insert" ON registry_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM registry_members AS rm
      WHERE rm.registry_id = registry_members.registry_id
      AND rm.user_id = auth.uid()
      AND rm.role = 'admin'
    )
  );

-- Only admins can update member roles
CREATE POLICY "registry_members_update" ON registry_members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM registry_members AS rm
      WHERE rm.registry_id = registry_members.registry_id
      AND rm.user_id = auth.uid()
      AND rm.role = 'admin'
    )
  );

-- Only admins can remove members (or users can remove themselves)
CREATE POLICY "registry_members_delete" ON registry_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM registry_members AS rm
      WHERE rm.registry_id = registry_members.registry_id
      AND rm.user_id = auth.uid()
      AND rm.role = 'admin'
    )
  );

-- =============================================================================
-- SKILLS POLICIES
-- =============================================================================

-- Members can read skills in their registries
CREATE POLICY "skills_select" ON skills
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = skills.registry_id
      AND registry_members.user_id = auth.uid()
    )
  );

-- Contributors and admins can create skills
CREATE POLICY "skills_insert" ON skills
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = skills.registry_id
      AND registry_members.user_id = auth.uid()
      AND registry_members.role IN ('contributor', 'admin')
    )
  );

-- Skill creators, maintainers, and registry admins can update skills
CREATE POLICY "skills_update" ON skills
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM skill_maintainers
      WHERE skill_maintainers.skill_id = skills.id
      AND skill_maintainers.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = skills.registry_id
      AND registry_members.user_id = auth.uid()
      AND registry_members.role = 'admin'
    )
  );

-- Skill creators and registry admins can delete skills
CREATE POLICY "skills_delete" ON skills
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = skills.registry_id
      AND registry_members.user_id = auth.uid()
      AND registry_members.role = 'admin'
    )
  );

-- =============================================================================
-- SKILL VERSIONS POLICIES
-- =============================================================================

-- Same read access as skills (members of the registry)
CREATE POLICY "skill_versions_select" ON skill_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM skills
      JOIN registry_members ON registry_members.registry_id = skills.registry_id
      WHERE skills.id = skill_versions.skill_id
      AND registry_members.user_id = auth.uid()
    )
  );

-- Contributors+ can publish versions for skills they have write access to
CREATE POLICY "skill_versions_insert" ON skill_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    published_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM skills
      WHERE skills.id = skill_versions.skill_id
      AND (
        skills.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM skill_maintainers
          WHERE skill_maintainers.skill_id = skills.id
          AND skill_maintainers.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM registry_members
          WHERE registry_members.registry_id = skills.registry_id
          AND registry_members.user_id = auth.uid()
          AND registry_members.role = 'admin'
        )
      )
    )
  );

-- =============================================================================
-- SKILL MAINTAINERS POLICIES
-- =============================================================================

-- Readable by registry members
CREATE POLICY "skill_maintainers_select" ON skill_maintainers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM skills
      JOIN registry_members ON registry_members.registry_id = skills.registry_id
      WHERE skills.id = skill_maintainers.skill_id
      AND registry_members.user_id = auth.uid()
    )
  );

-- Skill creators and registry admins can manage maintainers
CREATE POLICY "skill_maintainers_insert" ON skill_maintainers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM skills
      WHERE skills.id = skill_maintainers.skill_id
      AND (
        skills.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM registry_members
          WHERE registry_members.registry_id = skills.registry_id
          AND registry_members.user_id = auth.uid()
          AND registry_members.role = 'admin'
        )
      )
    )
  );

CREATE POLICY "skill_maintainers_delete" ON skill_maintainers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM skills
      WHERE skills.id = skill_maintainers.skill_id
      AND (
        skills.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM registry_members
          WHERE registry_members.registry_id = skills.registry_id
          AND registry_members.user_id = auth.uid()
          AND registry_members.role = 'admin'
        )
      )
    )
  );

-- =============================================================================
-- INVITATIONS POLICIES
-- =============================================================================

-- Admins can see invitations for their registries, or users can see their own
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = invitations.registry_id
      AND registry_members.user_id = auth.uid()
      AND registry_members.role = 'admin'
    )
  );

-- Admins can create invitations
CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = invitations.registry_id
      AND registry_members.user_id = auth.uid()
      AND registry_members.role = 'admin'
    )
  );

-- Invited user can update their own invitation (accept/decline)
CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- =============================================================================
-- OAUTH CLIENTS POLICIES (service role only for management)
-- =============================================================================

-- Allow read for token validation (public clients list)
CREATE POLICY "oauth_clients_select" ON oauth_clients
  FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- OAUTH CODES POLICIES (managed by service role)
-- =============================================================================

-- Users can see their own codes
CREATE POLICY "oauth_codes_select" ON oauth_codes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- SKILL ISSUES POLICIES
-- =============================================================================

-- Members can read issues for skills in their registries
CREATE POLICY "skill_issues_select" ON skill_issues
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM skills
      JOIN registry_members ON registry_members.registry_id = skills.registry_id
      WHERE skills.id = skill_issues.skill_id
      AND registry_members.user_id = auth.uid()
    )
  );

-- Members can create issues
CREATE POLICY "skill_issues_insert" ON skill_issues
  FOR INSERT TO authenticated
  WITH CHECK (
    reported_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM skills
      JOIN registry_members ON registry_members.registry_id = skills.registry_id
      WHERE skills.id = skill_issues.skill_id
      AND registry_members.user_id = auth.uid()
    )
  );
