# ChitCommit Issue Resolver

Automated issue resolution system for ChitCommit organizations.

## Features

- **Stale Issue Detection**: Auto-closes issues with no activity for 90+ days
- **Bot Issue Cleanup**: Identifies and closes automated/bot-generated issues
- **Label-based Resolution**: Respects protected labels (critical, security, in-progress)
- **Multi-org Support**: Works across all ChitCommit organizations
- **Dry Run Mode**: Preview changes before applying

## Quick Start (Shell Script)

No dependencies required, just `gh` CLI:

```bash
# Preview what would be closed (dry run)
./resolve.sh

# Actually close issues
DRY_RUN=false ./resolve.sh

# Custom stale threshold (days)
STALE_DAYS=60 ./resolve.sh
```

## Node.js CLI

```bash
# Install dependencies
npm install

# Scan all organizations
npm run scan

# Generate report
npm run report

# Resolve issues (closes stale/bot issues)
npm run resolve
```

### CLI Commands

```bash
# Scan and preview
node src/cli.js scan
node src/cli.js scan --org chittyos
node src/cli.js scan --json

# Resolve issues
node src/cli.js resolve
node src/cli.js resolve --dry-run
node src/cli.js resolve --org chittyapps

# Generate reports
node src/cli.js report
node src/cli.js report --format markdown
node src/cli.js report --format json
```

## GitHub Actions

Two workflows are included:

1. **auto-resolve.yml**: Runs daily at 6 AM UTC
   - Scans all orgs
   - Closes stale/bot issues
   - Can be triggered manually with dry-run option

2. **weekly-report.yml**: Runs every Monday
   - Generates comprehensive issue report
   - Creates an issue with the report

### Setup

1. Create a GitHub token with `repo` and `org:read` permissions
2. Add it as `CHITTY_ORG_TOKEN` secret in the repository

## Resolution Rules

| Rule | Action |
|------|--------|
| No activity for 90+ days | Close as stale |
| Title matches `[P1]`, `_text_`, etc. | Close as bot issue |
| Has label: wontfix, duplicate, invalid | Close |
| Has label: critical, security, in-progress | Skip (protected) |

## Configuration

Edit `src/config.js` to customize:

- Organizations to monitor
- Stale threshold (days)
- Auto-close labels
- Protected labels
- Bot issue patterns

## Environment Variables

- `GITHUB_TOKEN` or `GH_TOKEN`: GitHub access token (required)
- `DRY_RUN`: Set to `false` for live mode (shell script)
- `STALE_DAYS`: Override stale threshold (shell script)
