#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { IssueResolver } from './resolver.js';
import { ORGANIZATIONS } from './config.js';

const program = new Command();

program
  .name('resolve-issues')
  .description('Automated issue resolution for ChitCommit organizations')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan all organizations and report issues that would be resolved')
  .option('-o, --org <org>', 'Scan specific organization')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      console.error(chalk.red('Error: GITHUB_TOKEN or GH_TOKEN environment variable required'));
      process.exit(1);
    }

    const resolver = new IssueResolver(token);
    const orgs = options.org ? [options.org] : ORGANIZATIONS;

    if (!options.json) {
      console.log(chalk.blue(`Scanning ${orgs.length} organization(s)...`));
    }

    const results = await resolver.scanAllOrganizations(orgs, true);
    const stats = resolver.getStats();

    if (options.json) {
      console.log(JSON.stringify({ results, stats }, null, 2));
      return;
    }

    // Group by action
    const toClose = results.filter(r => r.analysis.action === 'close');
    const toKeep = results.filter(r => r.analysis.action === 'keep');

    console.log(chalk.green(`\n=== Scan Results ===`));
    console.log(`Total scanned: ${stats.scanned}`);
    console.log(`Would close: ${toClose.length}`);
    console.log(`  - Stale: ${stats.stale}`);
    console.log(`  - Bot/Automated: ${stats.botCleanup}`);
    console.log(`  - Resolved: ${stats.resolved}`);
    console.log(`  - Labeled for closure: ${stats.duplicate}`);
    console.log(`Protected (skipped): ${stats.protected}`);
    console.log(`Keeping open: ${toKeep.length}`);

    if (toClose.length > 0) {
      console.log(chalk.yellow(`\n=== Issues to Close ===`));
      for (const r of toClose) {
        console.log(`  ${r.org}/${r.repo}#${r.issue}: ${r.title.substring(0, 50)}... (${r.analysis.reason})`);
      }
    }

    console.log(chalk.cyan(`\nRun 'resolve-issues resolve' to close these issues.`));
  });

program
  .command('resolve')
  .description('Resolve issues (close stale, duplicate, bot-generated)')
  .option('-o, --org <org>', 'Resolve in specific organization')
  .option('--dry-run', 'Preview without making changes', false)
  .action(async (options) => {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      console.error(chalk.red('Error: GITHUB_TOKEN or GH_TOKEN environment variable required'));
      process.exit(1);
    }

    const resolver = new IssueResolver(token);
    const orgs = options.org ? [options.org] : ORGANIZATIONS;
    const dryRun = options.dryRun;

    console.log(chalk.blue(`${dryRun ? '[DRY RUN] ' : ''}Resolving issues in ${orgs.length} organization(s)...`));

    const results = await resolver.scanAllOrganizations(orgs, dryRun);
    const stats = resolver.getStats();

    console.log(chalk.green(`\n=== Resolution Complete ===`));
    console.log(`Scanned: ${stats.scanned}`);
    console.log(`Closed: ${stats.closed}`);
    console.log(`  - Stale: ${stats.stale}`);
    console.log(`  - Bot/Automated: ${stats.botCleanup}`);
    console.log(`  - Resolved: ${stats.resolved}`);
    console.log(`Protected (skipped): ${stats.protected}`);
  });

program
  .command('report')
  .description('Generate a detailed report of all open issues')
  .option('-o, --org <org>', 'Report for specific organization')
  .option('--format <format>', 'Output format: table, json, markdown', 'table')
  .action(async (options) => {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      console.error(chalk.red('Error: GITHUB_TOKEN or GH_TOKEN environment variable required'));
      process.exit(1);
    }

    const resolver = new IssueResolver(token);
    const orgs = options.org ? [options.org] : ORGANIZATIONS;

    console.log(chalk.blue(`Generating report for ${orgs.length} organization(s)...`));

    const results = await resolver.scanAllOrganizations(orgs, true);

    if (options.format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else if (options.format === 'markdown') {
      console.log('# Issue Resolution Report\n');
      const byOrg = {};
      for (const r of results) {
        if (!byOrg[r.org]) byOrg[r.org] = [];
        byOrg[r.org].push(r);
      }
      for (const [org, issues] of Object.entries(byOrg)) {
        console.log(`## ${org}\n`);
        console.log('| Repo | Issue | Title | Action |');
        console.log('|------|-------|-------|--------|');
        for (const r of issues) {
          console.log(`| ${r.repo} | #${r.issue} | ${r.title.substring(0, 40)} | ${r.analysis.action} (${r.analysis.reason}) |`);
        }
        console.log('');
      }
    } else {
      // Table format
      for (const r of results) {
        const action = r.analysis.action === 'close' ? chalk.red('CLOSE') : chalk.green('KEEP');
        console.log(`${r.org}/${r.repo}#${r.issue} - ${action} (${r.analysis.reason})`);
      }
    }
  });

program.parse();
