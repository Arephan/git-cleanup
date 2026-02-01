#!/usr/bin/env node

const { execSync, spawnSync } = require('child_process');
const readline = require('readline');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: options.silent ? 'pipe' : undefined, ...options }).trim();
  } catch (e) {
    if (options.ignoreError) return '';
    throw e;
  }
}

function isGitRepo() {
  try {
    run('git rev-parse --git-dir', { silent: true });
    return true;
  } catch {
    return false;
  }
}

function getMergedBranches() {
  const current = run('git branch --show-current', { silent: true });
  const defaultBranch = getDefaultBranch();
  
  const merged = run(`git branch --merged ${defaultBranch}`, { silent: true, ignoreError: true })
    .split('\n')
    .map(b => b.trim().replace(/^\* /, ''))
    .filter(b => b && b !== current && b !== defaultBranch && !b.startsWith('remotes/'));
  
  return merged;
}

function getDefaultBranch() {
  try {
    const remote = run('git remote', { silent: true }).split('\n')[0] || 'origin';
    const ref = run(`git symbolic-ref refs/remotes/${remote}/HEAD`, { silent: true, ignoreError: true });
    if (ref) return ref.split('/').pop();
  } catch {}
  
  // Fallback: check for main or master
  const branches = run('git branch -a', { silent: true });
  if (branches.includes('main')) return 'main';
  if (branches.includes('master')) return 'master';
  return 'main';
}

function getStaleBranches(days = 30) {
  const current = run('git branch --show-current', { silent: true });
  const defaultBranch = getDefaultBranch();
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const branches = run('git branch', { silent: true })
    .split('\n')
    .map(b => b.trim().replace(/^\* /, ''))
    .filter(b => b && b !== current && b !== defaultBranch);
  
  const stale = [];
  for (const branch of branches) {
    try {
      const dateStr = run(`git log -1 --format=%ci ${branch}`, { silent: true });
      const lastCommit = new Date(dateStr).getTime();
      if (lastCommit < cutoff) {
        const daysAgo = Math.floor((Date.now() - lastCommit) / (24 * 60 * 60 * 1000));
        stale.push({ branch, daysAgo });
      }
    } catch {}
  }
  
  return stale.sort((a, b) => b.daysAgo - a.daysAgo);
}

function getGoneBranches() {
  // Branches that track remotes that no longer exist
  run('git fetch --prune', { silent: true, ignoreError: true });
  
  const branches = run('git branch -vv', { silent: true })
    .split('\n')
    .filter(line => line.includes(': gone]'))
    .map(line => line.trim().split(/\s+/)[0].replace(/^\* /, ''));
  
  return branches;
}

function getLargeFiles(count = 10) {
  try {
    // Find large files in git history
    const result = run(`git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | sed -n 's/^blob //p' | sort -rnk2 | head -${count}`, { silent: true, ignoreError: true });
    
    if (!result) return [];
    
    return result.split('\n').filter(Boolean).map(line => {
      const [hash, size, ...pathParts] = line.split(/\s+/);
      const path = pathParts.join(' ');
      const sizeNum = parseInt(size, 10);
      const sizeStr = sizeNum > 1024 * 1024 
        ? `${(sizeNum / 1024 / 1024).toFixed(1)} MB`
        : sizeNum > 1024 
          ? `${(sizeNum / 1024).toFixed(1)} KB`
          : `${sizeNum} B`;
      return { hash, size: sizeNum, sizeStr, path };
    });
  } catch {
    return [];
  }
}

function deleteBranch(branch, force = false) {
  const flag = force ? '-D' : '-d';
  try {
    run(`git branch ${flag} ${branch}`, { silent: true });
    return true;
  } catch {
    return false;
  }
}

async function confirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === '--help' || command === '-h' || !command) {
    console.log(`
${c('bold', 'git-cleanup')} - Clean up your git repository

${c('yellow', 'USAGE')}
  git-cleanup <command> [options]

${c('yellow', 'COMMANDS')}
  ${c('green', 'merged')}      List and delete branches merged into main/master
  ${c('green', 'stale')}       List and delete branches with no recent commits
  ${c('green', 'gone')}        Delete branches whose remote tracking branch is gone
  ${c('green', 'large')}       Find large files in git history
  ${c('green', 'all')}         Run all cleanup checks
  ${c('green', 'prune')}       Prune remote tracking branches

${c('yellow', 'OPTIONS')}
  --days <n>    Days threshold for stale branches (default: 30)
  --dry-run     Show what would be deleted without deleting
  --force       Delete without confirmation
  --top <n>     Number of large files to show (default: 10)

${c('yellow', 'EXAMPLES')}
  git-cleanup merged           # Delete merged branches
  git-cleanup stale --days 60  # Find branches inactive for 60+ days
  git-cleanup large --top 20   # Show top 20 large files
  git-cleanup all --dry-run    # Preview all cleanup actions
`);
    return;
  }
  
  if (!isGitRepo()) {
    console.error(c('red', 'Error: Not a git repository'));
    process.exit(1);
  }
  
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx > -1 ? parseInt(args[daysIdx + 1], 10) : 30;
  const topIdx = args.indexOf('--top');
  const top = topIdx > -1 ? parseInt(args[topIdx + 1], 10) : 10;
  
  console.log(c('cyan', `\n🧹 git-cleanup\n`));
  
  if (command === 'merged' || command === 'all') {
    console.log(c('bold', '📋 Merged Branches'));
    const merged = getMergedBranches();
    
    if (merged.length === 0) {
      console.log(c('dim', '   No merged branches to clean up\n'));
    } else {
      console.log(c('dim', `   Found ${merged.length} merged branch(es):\n`));
      merged.forEach(b => console.log(`   ${c('yellow', '•')} ${b}`));
      console.log();
      
      if (!dryRun) {
        const shouldDelete = force || await confirm(`   Delete ${merged.length} merged branch(es)? [y/N] `);
        if (shouldDelete) {
          let deleted = 0;
          for (const branch of merged) {
            if (deleteBranch(branch)) {
              console.log(`   ${c('green', '✓')} Deleted ${branch}`);
              deleted++;
            } else {
              console.log(`   ${c('red', '✗')} Failed to delete ${branch}`);
            }
          }
          console.log(c('green', `\n   Deleted ${deleted}/${merged.length} branches\n`));
        }
      }
    }
  }
  
  if (command === 'stale' || command === 'all') {
    console.log(c('bold', `📅 Stale Branches (>${days} days)`));
    const stale = getStaleBranches(days);
    
    if (stale.length === 0) {
      console.log(c('dim', '   No stale branches found\n'));
    } else {
      console.log(c('dim', `   Found ${stale.length} stale branch(es):\n`));
      stale.forEach(({ branch, daysAgo }) => {
        console.log(`   ${c('yellow', '•')} ${branch} ${c('dim', `(${daysAgo} days ago)`)}`);
      });
      console.log();
      
      if (!dryRun) {
        const shouldDelete = force || await confirm(`   Delete ${stale.length} stale branch(es)? [y/N] `);
        if (shouldDelete) {
          let deleted = 0;
          for (const { branch } of stale) {
            if (deleteBranch(branch, true)) {
              console.log(`   ${c('green', '✓')} Deleted ${branch}`);
              deleted++;
            } else {
              console.log(`   ${c('red', '✗')} Failed to delete ${branch}`);
            }
          }
          console.log(c('green', `\n   Deleted ${deleted}/${stale.length} branches\n`));
        }
      }
    }
  }
  
  if (command === 'gone' || command === 'all') {
    console.log(c('bold', '👻 Gone Branches (remote deleted)'));
    const gone = getGoneBranches();
    
    if (gone.length === 0) {
      console.log(c('dim', '   No gone branches found\n'));
    } else {
      console.log(c('dim', `   Found ${gone.length} gone branch(es):\n`));
      gone.forEach(b => console.log(`   ${c('yellow', '•')} ${b}`));
      console.log();
      
      if (!dryRun) {
        const shouldDelete = force || await confirm(`   Delete ${gone.length} gone branch(es)? [y/N] `);
        if (shouldDelete) {
          let deleted = 0;
          for (const branch of gone) {
            if (deleteBranch(branch, true)) {
              console.log(`   ${c('green', '✓')} Deleted ${branch}`);
              deleted++;
            } else {
              console.log(`   ${c('red', '✗')} Failed to delete ${branch}`);
            }
          }
          console.log(c('green', `\n   Deleted ${deleted}/${gone.length} branches\n`));
        }
      }
    }
  }
  
  if (command === 'large' || command === 'all') {
    console.log(c('bold', `📦 Large Files in History (top ${top})`));
    const large = getLargeFiles(top);
    
    if (large.length === 0) {
      console.log(c('dim', '   No large files found\n'));
    } else {
      console.log();
      large.forEach(({ sizeStr, path }) => {
        const color = sizeStr.includes('MB') ? 'red' : 'yellow';
        console.log(`   ${c(color, sizeStr.padStart(10))}  ${path}`);
      });
      console.log(c('dim', `\n   Tip: Use 'git filter-repo' or BFG to remove large files from history\n`));
    }
  }
  
  if (command === 'prune') {
    console.log(c('bold', '🔄 Pruning Remote Tracking Branches'));
    try {
      run('git fetch --prune');
      console.log(c('green', '   ✓ Pruned remote tracking branches\n'));
    } catch (e) {
      console.log(c('red', `   ✗ Failed to prune: ${e.message}\n`));
    }
  }
  
  console.log(c('dim', 'Done!\n'));
}

main().catch(console.error);
