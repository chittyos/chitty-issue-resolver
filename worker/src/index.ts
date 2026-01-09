interface Env {
  GITHUB_TOKEN: string;
  ORGS: string;
  STALE_DAYS: string;
}

interface Issue {
  number: number;
  title: string;
  updated_at: string;
  labels: Array<{ name: string }>;
  html_url: string;
}

interface Repo {
  name: string;
  archived: boolean;
  has_issues: boolean;
}

const BOT_PATTERNS = [
  /^\[P\d\]/,           // [P1], [P2], etc.
  /^_.*_$/,             // _italic titles_
  /Badge.*flat/i,       // Badge issues
  /Codex Review/i,      // Automated reviews
];

const PROTECTED_LABELS = ['critical', 'security', 'in-progress', 'help-wanted', 'bug'];
const AUTO_CLOSE_LABELS = ['wontfix', 'duplicate', 'invalid', 'stale'];

async function githubApi(endpoint: string, token: string, method = 'GET', body?: object) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ChittyIssueResolver/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok && response.status !== 404) {
    console.error(`GitHub API error: ${response.status} ${await response.text()}`);
  }

  return response;
}

function isBotIssue(title: string): boolean {
  return BOT_PATTERNS.some(pattern => pattern.test(title));
}

function isStale(updatedAt: string, staleDays: number): boolean {
  const updated = new Date(updatedAt).getTime();
  const now = Date.now();
  const diffDays = (now - updated) / (1000 * 60 * 60 * 24);
  return diffDays > staleDays;
}

function isProtected(labels: Array<{ name: string }>): boolean {
  return labels.some(l => PROTECTED_LABELS.includes(l.name.toLowerCase()));
}

function shouldAutoClose(labels: Array<{ name: string }>): boolean {
  return labels.some(l => AUTO_CLOSE_LABELS.includes(l.name.toLowerCase()));
}

async function closeIssue(org: string, repo: string, issueNumber: number, reason: string, token: string) {
  // Add comment
  await githubApi(`/repos/${org}/${repo}/issues/${issueNumber}/comments`, token, 'POST', {
    body: `🤖 Auto-closed by ChittyIssueResolver: ${reason}\n\nIf this was closed in error, please reopen with additional context.`
  });

  // Close issue
  await githubApi(`/repos/${org}/${repo}/issues/${issueNumber}`, token, 'PATCH', {
    state: 'closed',
    state_reason: 'not_planned'
  });

  console.log(`Closed ${org}/${repo}#${issueNumber}: ${reason}`);
}

async function processOrganization(org: string, staleDays: number, token: string): Promise<{ scanned: number; closed: number }> {
  let scanned = 0;
  let closed = 0;

  // Get repos
  const reposResponse = await githubApi(`/orgs/${org}/repos?per_page=100&type=all`, token);
  if (!reposResponse.ok) return { scanned, closed };

  const repos: Repo[] = await reposResponse.json();

  for (const repo of repos) {
    if (repo.archived || !repo.has_issues) continue;

    // Get open issues
    const issuesResponse = await githubApi(`/repos/${org}/${repo.name}/issues?state=open&per_page=100`, token);
    if (!issuesResponse.ok) continue;

    const issues: Issue[] = await issuesResponse.json();

    for (const issue of issues) {
      // Skip pull requests (they have a pull_request key)
      if ('pull_request' in issue) continue;

      scanned++;
      const labels = issue.labels || [];

      // Skip protected issues
      if (isProtected(labels)) continue;

      // Check for auto-close labels
      if (shouldAutoClose(labels)) {
        await closeIssue(org, repo.name, issue.number, 'Labeled for closure', token);
        closed++;
        continue;
      }

      // Check for bot issues
      if (isBotIssue(issue.title)) {
        await closeIssue(org, repo.name, issue.number, 'Bot/automated issue cleanup', token);
        closed++;
        continue;
      }

      // Check for stale issues
      if (isStale(issue.updated_at, staleDays)) {
        await closeIssue(org, repo.name, issue.number, `Stale (no activity for ${staleDays}+ days)`, token);
        closed++;
        continue;
      }
    }
  }

  return { scanned, closed };
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const orgs = env.ORGS.split(',').map(o => o.trim());
    const staleDays = parseInt(env.STALE_DAYS) || 90;

    console.log(`ChittyIssueResolver running at ${new Date().toISOString()}`);
    console.log(`Processing organizations: ${orgs.join(', ')}`);

    let totalScanned = 0;
    let totalClosed = 0;

    for (const org of orgs) {
      try {
        const { scanned, closed } = await processOrganization(org, staleDays, env.GITHUB_TOKEN);
        totalScanned += scanned;
        totalClosed += closed;
        console.log(`${org}: scanned ${scanned}, closed ${closed}`);
      } catch (error) {
        console.error(`Error processing ${org}:`, error);
      }
    }

    console.log(`Total: scanned ${totalScanned}, closed ${totalClosed}`);
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === '/run') {
      // Manual trigger
      ctx.waitUntil(this.scheduled({} as ScheduledEvent, env, ctx));
      return new Response(JSON.stringify({ status: 'triggered' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        orgs: env.ORGS.split(','),
        staleDays: env.STALE_DAYS
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('ChittyIssueResolver - GET /health or /run', { status: 200 });
  }
};
