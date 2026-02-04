-- Fix RLS infinite recursion in registry_members policies
-- The issue is that registry_members policies reference themselves

-- Create a SECURITY DEFINER function to check membership without triggering RLS
CREATE OR REPLACE FUNCTION is_registry_member(registry_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM registry_members
    WHERE registry_id = registry_uuid
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create a function to check if user is admin of a registry
CREATE OR REPLACE FUNCTION is_registry_admin(registry_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM registry_members
    WHERE registry_id = registry_uuid
    AND user_id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Drop old policies
DROP POLICY IF EXISTS "registry_members_select" ON registry_members;
DROP POLICY IF EXISTS "registry_members_insert" ON registry_members;
DROP POLICY IF EXISTS "registry_members_update" ON registry_members;
DROP POLICY IF EXISTS "registry_members_delete" ON registry_members;
DROP POLICY IF EXISTS "registries_select" ON registries;
DROP POLICY IF EXISTS "registries_update" ON registries;

-- Recreate registry_members policies using the helper function
-- Members can see other members in their registries
CREATE POLICY "registry_members_select" ON registry_members
  FOR SELECT TO authenticated
  USING (is_registry_member(registry_id));

-- Only admins can add members (but trigger also adds on registry creation)
CREATE POLICY "registry_members_insert" ON registry_members
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Allow if user is admin OR if this is the user being added as first member
    is_registry_admin(registry_id)
    OR (user_id = auth.uid() AND role = 'admin')
  );

-- Only admins can update member roles
CREATE POLICY "registry_members_update" ON registry_members
  FOR UPDATE TO authenticated
  USING (is_registry_admin(registry_id));

-- Only admins can remove members (or users can remove themselves)
CREATE POLICY "registry_members_delete" ON registry_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR is_registry_admin(registry_id)
  );

-- Recreate registries policies using helper function
-- Members can see registries they belong to
CREATE POLICY "registries_select" ON registries
  FOR SELECT TO authenticated
  USING (is_registry_member(id));

-- Only admins can update registry settings
CREATE POLICY "registries_update" ON registries
  FOR UPDATE TO authenticated
  USING (is_registry_admin(id));
