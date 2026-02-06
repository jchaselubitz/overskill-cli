# Editing Skills

## Editing a skill

To open a skill in your configured editor:

```bash
skill edit my-skill
```

This opens the `SKILL.md` file from the installed `.skills/` directory. When you save and close the editor, the skill is marked as locally modified.

You can override the editor for a single command:

```bash
skill edit my-skill -e vim
```

To set your default editor, see [Configuration](./configuration.md).

## Publishing a new version

After editing a skill, publish a new version to your global registry so the changes are available across projects:

```bash
skill publish my-skill --patch
```

Version bump options:
- `--patch` — `1.0.0` becomes `1.0.1`
- `--minor` — `1.0.0` becomes `1.1.0`
- `--major` — `1.0.0` becomes `2.0.0`
- `-v, --version <version>` — set an explicit version

You can also provide a changelog message:

```bash
skill publish my-skill --patch -m "Added error handling examples"
```

If you don't specify a version bump, the CLI will prompt you interactively.

## Applying changes to a project

After publishing a new version, update the project that should use it:

```bash
skill update my-skill
```

Or update all skills at once:

```bash
skill update
```

## Viewing differences

To see what changed between the installed version and the registry version:

```bash
skill diff my-skill
```

## Validating skills

To check that all skill files are well-formed:

```bash
skill validate
```

Or validate a specific skill:

```bash
skill validate my-skill
```
