-- Seed data for Skills Platform

-- =============================================================================
-- OAuth Clients
-- =============================================================================

-- CLI client (no secret required for public client)
INSERT INTO oauth_clients (id, secret, name, redirect_uris)
VALUES (
  'cli',
  -- Using a placeholder hash since CLI is a public client
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'Skills CLI',
  ARRAY['http://localhost:9876/callback', 'http://127.0.0.1:9876/callback']
) ON CONFLICT (id) DO NOTHING;

-- Claude.ai MCP client
INSERT INTO oauth_clients (id, secret, name, redirect_uris)
VALUES (
  'claude-mcp',
  -- In production, this should be a properly hashed secret
  'placeholder_secret_hash_for_claude_mcp',
  'Claude.ai MCP',
  ARRAY['https://claude.ai/oauth/callback']
) ON CONFLICT (id) DO NOTHING;

-- ChatGPT MCP client
INSERT INTO oauth_clients (id, secret, name, redirect_uris)
VALUES (
  'chatgpt-mcp',
  -- In production, this should be a properly hashed secret
  'placeholder_secret_hash_for_chatgpt_mcp',
  'ChatGPT MCP',
  ARRAY['https://chat.openai.com/oauth/callback']
) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Test Data (optional, remove in production)
-- =============================================================================

-- Note: The following is commented out but can be used for testing
-- Uncomment and modify as needed for development

/*
-- Create a test user (in practice, users are created via auth.signUp)
-- This is just for reference - actual user creation happens through Supabase Auth

-- After a user signs up, they automatically get:
-- 1. A profile (via handle_new_user trigger)
-- 2. A personal registry (via handle_new_profile trigger)
-- 3. Admin membership in their personal registry

-- Example of manually inserting test skills (after user/registry creation):
-- INSERT INTO skills (registry_id, slug, name, description, tags, compat, created_by)
-- SELECT
--   r.id,
--   'example-skill',
--   'Example Skill',
--   'An example skill for testing',
--   ARRAY['example', 'test'],
--   ARRAY['claude-code', 'cursor'],
--   r.created_by
-- FROM registries r
-- WHERE r.slug = 'testuser';

-- INSERT INTO skill_versions (skill_id, version, content, published_by)
-- SELECT
--   s.id,
--   '1.0.0',
--   E'# Example Skill\n\nThis is an example skill for testing the platform.\n\n## Instructions\n\n1. Follow these instructions\n2. Do great things',
--   s.created_by
-- FROM skills s
-- WHERE s.slug = 'example-skill';
*/
