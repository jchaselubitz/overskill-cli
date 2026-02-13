# Configuration

Overskill stores global configuration in `~/.overskill/config.json`. This file holds settings that apply across all your projects.

## Viewing configuration

To see all current settings:

```bash
skill config show
```

This displays your config file path and all configured values including `editor`, `install_path`, and login status.

To check a single value:

```bash
skill config editor
```

## Setting the default editor

Overskill opens your editor when creating or editing skills. Set your preferred editor:

```bash
skill config editor "code --wait"
```

Common editor values:

| Editor | Command |
|--------|---------|
| VS Code | `code --wait` |
| Cursor | `cursor --wait` |
| Vim | `vim` |
| Nano | `nano` |
| Sublime Text | `subl --wait` |
| Zed | `zed --wait` |

If no editor is configured, Overskill falls back to the `$EDITOR` environment variable.

## Setting the default install path

By default, skills are installed to `.claude/skills/` in each project. To change the default:

```bash
skill config install_path .ai/skills
```

This only affects new projects created with `skill init`. Existing projects use the `install_path` in their `.skills.yaml`.

## Available config keys

| Key | Description |
|-----|-------------|
| `editor` | Editor command for creating and editing skills |
| `install_path` | Default install directory for new projects |
| `api_url` | API URL for cloud registry (future) |
| `web_app_url` | Web app URL for cloud registry (future) |

## Logging out

If you've authenticated with a cloud registry:

```bash
skill config logout
```
