# Getting Started

## Installation

### NPM (recommended)

```bash
npm install -g overskill
```

### Homebrew

```bash
brew install overskill
```

### Build from source

```bash
git clone https://github.com/jchaselubitz/overskill-cli.git
cd overskill-cli
npm install
npm run build
npm link
```

This makes the `skill` command available globally.

### Requirements

- Node.js >= 18

## Add Overskill to your first repository

Navigate to a project where you want to use skills:

```bash
cd your-project
skill init
```

This creates:
- `.skills.yaml` — your project's skill configuration
- `.skills/` — the directory where skills are installed

You'll be asked whether to track installed skills in git. If your skills don't contain private information, tracking them lets other contributors (and AI agents cloning the repo) use them without running `skill sync`.

Next, add some skills:

```bash
# Create a brand new skill
skill new my-first-skill

# Or import skills you've already written for Claude, Cursor, or Codex
skill import
```

See [Managing Skills in a Repository](./managing-skills.md) for more detail on setting up your project.
