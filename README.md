# git-cleanup 🧹

A CLI tool to clean up your git repositories. Delete merged branches, find stale branches, remove branches with deleted remotes, and identify large files in your git history.

## Installation

```bash
# Install globally
npm install -g git-cleanup-cli

# Or run directly with npx
npx git-cleanup-cli <command>
```

## Usage

```bash
git-cleanup <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `merged` | List and delete branches already merged into main/master |
| `stale` | Find branches with no commits in the last N days |
| `gone` | Delete local branches whose remote tracking branch was deleted |
| `large` | Find large files in git history |
| `all` | Run all cleanup checks at once |
| `prune` | Prune remote tracking branches |

### Options

| Option | Description |
|--------|-------------|
| `--days <n>` | Days threshold for stale branches (default: 30) |
| `--dry-run` | Preview what would be deleted without deleting |
| `--force` | Delete without confirmation prompts |
| `--top <n>` | Number of large files to show (default: 10) |

## Examples

### Delete merged branches
```bash
git-cleanup merged
```
```
🧹 git-cleanup

📋 Merged Branches
   Found 3 merged branch(es):

   • feature/old-login
   • fix/typo
   • chore/deps-update

   Delete 3 merged branch(es)? [y/N] y
   ✓ Deleted feature/old-login
   ✓ Deleted fix/typo
   ✓ Deleted chore/deps-update

   Deleted 3/3 branches
```

### Find stale branches (60+ days inactive)
```bash
git-cleanup stale --days 60
```
```
📅 Stale Branches (>60 days)
   Found 2 stale branch(es):

   • experiment/ai-feature (120 days ago)
   • wip/refactor (85 days ago)
```

### Find large files in history
```bash
git-cleanup large --top 5
```
```
📦 Large Files in History (top 5)

    15.2 MB  assets/video.mp4
     8.4 MB  data/dump.sql
     2.1 MB  node_modules.zip
   512.0 KB  images/hero.png
   256.0 KB  docs/guide.pdf

   Tip: Use 'git filter-repo' or BFG to remove large files from history
```

### Preview all cleanup (dry run)
```bash
git-cleanup all --dry-run
```

### Clean everything without prompts
```bash
git-cleanup all --force
```

## Why?

Over time, git repos accumulate:
- **Merged branches** that were never deleted
- **Stale branches** from abandoned experiments  
- **Gone branches** where the remote was deleted but local remains
- **Large files** accidentally committed to history

This tool helps you identify and clean up all of these in seconds.

## License

MIT © Han Kim
