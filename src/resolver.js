import { Octokit } from '@octokit/rest';
import { RESOLUTION_RULES, MESSAGES } from './config.js';

export class IssueResolver {
  constructor(token) {
    this.octokit = new Octokit({ auth: token });
    this.stats = {
      scanned: 0,
      stale: 0,
      duplicate: 0,
      resolved: 0,
      botCleanup: 0,
      protected: 0,
      closed: 0
    };
  }

  async getOrgRepos(org) {
    const repos = [];
    let page = 1;
    while (true) {
      const { data } = await this.octokit.repos.listForOrg({
        org,
        per_page: 100,
        page,
        type: 'all'
      });
      if (data.length === 0) break;
      repos.push(...data.filter(r => !r.archived && r.has_issues));
      page++;
    }
    return repos;
  }

  async getOpenIssues(owner, repo) {
    const issues = [];
    let page = 1;
    while (true) {
      const { data } = await this.octokit.issues.listForRepo({
        owner,
        repo,
        state: 'open',
        per_page: 100,
        page
      });
      if (data.length === 0) break;
      // Filter out pull requests
      issues.push(...data.filter(i => !i.pull_request));
      page++;
    }
    return issues;
  }

  analyzeIssue(issue) {
    const labels = issue.labels.map(l => typeof l === 'string' ? l : l.name);
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if protected
    const isProtected = labels.some(l =>
      RESOLUTION_RULES.protectedLabels.includes(l.toLowerCase())
    );
    if (isProtected) {
      return { action: 'skip', reason: 'protected' };
    }

    // Check for auto-close labels
    const hasAutoCloseLabel = labels.some(l =>
      RESOLUTION_RULES.autoCloseLabels.includes(l.toLowerCase())
    );
    if (hasAutoCloseLabel) {
      return { action: 'close', reason: 'labeled', message: MESSAGES.duplicate };
    }

    // Check for bot-generated issues
    const isBotIssue = RESOLUTION_RULES.botIssuePatterns.some(pattern =>
      pattern.test(issue.title)
    );
    if (isBotIssue) {
      return { action: 'close', reason: 'botCleanup', message: MESSAGES.botCleanup };
    }

    // Check for resolved keywords in title
    const hasResolvedKeyword = RESOLUTION_RULES.resolvedKeywords.some(kw =>
      issue.title.toLowerCase().includes(kw.toLowerCase())
    );
    if (hasResolvedKeyword) {
      return { action: 'close', reason: 'resolved', message: MESSAGES.resolved };
    }

    // Check for staleness
    if (daysSinceUpdate > RESOLUTION_RULES.staleThresholdDays) {
      return { action: 'close', reason: 'stale', message: MESSAGES.stale };
    }

    return { action: 'keep', reason: 'active' };
  }

  async closeIssue(owner, repo, issueNumber, message) {
    await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: message
    });

    await this.octokit.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      state: 'closed',
      state_reason: 'not_planned'
    });
  }

  async scanOrganization(org, dryRun = true) {
    const results = [];
    const repos = await this.getOrgRepos(org);

    for (const repo of repos) {
      const issues = await this.getOpenIssues(org, repo.name);

      for (const issue of issues) {
        this.stats.scanned++;
        const analysis = this.analyzeIssue(issue);

        const result = {
          org,
          repo: repo.name,
          issue: issue.number,
          title: issue.title,
          url: issue.html_url,
          analysis
        };

        if (analysis.action === 'close') {
          this.stats[analysis.reason]++;
          if (!dryRun) {
            await this.closeIssue(org, repo.name, issue.number, analysis.message);
            this.stats.closed++;
          }
        } else if (analysis.reason === 'protected') {
          this.stats.protected++;
        }

        results.push(result);

        if (this.stats.scanned >= RESOLUTION_RULES.maxIssuesPerRun) {
          return results;
        }
      }
    }

    return results;
  }

  async scanAllOrganizations(orgs, dryRun = true) {
    const allResults = [];
    for (const org of orgs) {
      const results = await this.scanOrganization(org, dryRun);
      allResults.push(...results);
    }
    return allResults;
  }

  getStats() {
    return this.stats;
  }
}
