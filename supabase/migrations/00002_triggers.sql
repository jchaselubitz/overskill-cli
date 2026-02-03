-- Skills Platform Triggers and Functions
-- This migration creates all triggers and stored functions

-- =============================================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- AUTO-CREATE PERSONAL REGISTRY ON PROFILE CREATION
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_profile()
RETURNS TRIGGER AS $$
DECLARE
  new_registry_id UUID;
BEGIN
  -- Create personal registry
  INSERT INTO registries (slug, name, type, created_by)
  VALUES (NEW.username, NEW.username || '''s Skills', 'personal', NEW.id)
  RETURNING id INTO new_registry_id;

  -- Add user as admin of their own registry
  INSERT INTO registry_members (registry_id, user_id, role)
  VALUES (new_registry_id, NEW.id, 'admin');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_new_profile();

-- =============================================================================
-- ENSURE ONLY ONE VERSION IS MARKED AS LATEST
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_skill_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_latest = true THEN
    UPDATE skill_versions
    SET is_latest = false
    WHERE skill_id = NEW.skill_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_skill_version_created
  AFTER INSERT ON skill_versions
  FOR EACH ROW EXECUTE FUNCTION handle_new_skill_version();

-- =============================================================================
-- UPDATE TIMESTAMPS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_registries_updated_at
  BEFORE UPDATE ON registries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_registry_members_updated_at
  BEFORE UPDATE ON registry_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- HELPER FUNCTION: CHECK IF USER IS REGISTRY MEMBER
-- =============================================================================

CREATE OR REPLACE FUNCTION is_registry_member(registry_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM registry_members rm
    WHERE rm.registry_id = $1 AND rm.user_id = $2
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- HELPER FUNCTION: CHECK IF USER IS REGISTRY ADMIN
-- =============================================================================

CREATE OR REPLACE FUNCTION is_registry_admin(registry_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM registry_members rm
    WHERE rm.registry_id = $1 AND rm.user_id = $2 AND rm.role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- HELPER FUNCTION: CHECK IF USER CAN WRITE TO SKILL
-- =============================================================================

CREATE OR REPLACE FUNCTION can_write_skill(skill_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  skill_record RECORD;
BEGIN
  SELECT s.created_by, s.registry_id INTO skill_record
  FROM skills s WHERE s.id = $1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- User is skill creator
  IF skill_record.created_by = $2 THEN
    RETURN true;
  END IF;

  -- User is skill maintainer
  IF EXISTS (SELECT 1 FROM skill_maintainers sm WHERE sm.skill_id = $1 AND sm.user_id = $2) THEN
    RETURN true;
  END IF;

  -- User is registry admin
  IF is_registry_admin(skill_record.registry_id, $2) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
