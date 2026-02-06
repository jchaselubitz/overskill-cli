# Making the CLI Publicly Available

This document outlines a pragmatic, low-friction path to making the Overskill CLI publicly available. It prioritizes a reliable release flow, repeatable packaging, and multiple distribution channels (npm + Homebrew), without adding unnecessary complexity.

**Context**
- Package name: `overskill`
- CLI binary: `skill`
- Node requirement: `>=18`
- Build output: `dist/`

## Readiness Checklist
- Ensure `README` includes install, auth/setup, and a quickstart.
- Verify `LICENSE` is present and correct (currently `MIT`).
- Add a `CHANGELOG` or GitHub Release notes to communicate breaking changes.
- Confirm `npm publish` is possible from CI (2FA or automation tokens).
- Confirm `skill --version` prints package version.

## Recommended Distribution Strategy
1. **npm (primary)**  
   Easiest for Node CLIs, supports all platforms, and works well with Homebrew.

2. **Homebrew (secondary)**  
   Many users prefer `brew install`. A Homebrew formula can either:
   - Install from the npm tarball, or
   - Install from a prebuilt release tarball (requires bundling `node_modules` or a single-file binary).

3. **GitHub Releases (optional)**  
   Useful for announcements, release notes, and for Homebrew formula URLs.

## npm Publishing (Primary)
Recommendations:
- Use SemVer (`x.y.z`) and tag releases with the same version.
- Build before publishing: `npm run build`.
- Restrict published files via `files: ["dist"]` (already configured).

Suggested publish flow:
```
git tag vX.Y.Z
git push --tags
npm publish
```

## Homebrew Publishing (Secondary)

### Option A: Formula installs from npm (simplest)
Pros: no custom build pipeline.  
Cons: installs Node dependencies at install time.

Approach:
1. Create a tap: `brew tap yourname/overskill`
2. Create a formula that downloads the npm tarball.
3. In `install`, run `npm install` and link the `skill` binary.

Example formula (replace placeholders):
```ruby
class Overskill < Formula
  desc "Overskill CLI - manage skills across repositories"
  homepage "https://github.com/yourname/overskill"
  url "https://registry.npmjs.org/overskill/-/overskill-X.Y.Z.tgz"
  sha256 "REPLACE_WITH_TARBALL_SHA"
  license "MIT"

  depends_on "node@18"

  def install
    system "npm", "install", *std_npm_args
  end

  test do
    system "#{bin}/skill", "--version"
  end
end
```

### Option B: Formula installs from prebuilt tarball
Pros: faster installs, no npm at install time.  
Cons: you must build and host tarballs per release.

Approach:
- Build a release artifact that includes `dist/` and `node_modules/` or a bundled binary.
- Host it on GitHub Releases.
- Update the formula `url` + `sha256` each release.

## Release Automation (Recommended)
Use a CI pipeline to:
1. Build the CLI.
2. Publish to npm.
3. Create a GitHub Release.
4. Bump Homebrew formula (your tap).

## Minimum GitHub Release Notes Template
```
## vX.Y.Z
- Highlights / key changes
- Breaking changes (if any)
- Migration notes (if any)
```

## Suggested Next Steps
1. Decide on Homebrew approach (npm tarball vs prebuilt).
2. Add a GitHub Actions release workflow.
3. Create and publish the first tagged release.
