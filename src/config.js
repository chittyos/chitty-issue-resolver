// ChitCommit Organizations to monitor
export const ORGANIZATIONS = [
  'chittyos',
  'chittyapps',
  'chittyfoundation',
  'chittycorp'
];

// Issue resolution rules
export const RESOLUTION_RULES = {
  // Auto-close issues older than this many days with no activity
  staleThresholdDays: 90,

  // Labels that indicate an issue should be auto-closed
  autoCloseLabels: ['wontfix', 'duplicate', 'invalid', 'stale'],

  // Labels that prevent auto-closing
  protectedLabels: ['critical', 'security', 'in-progress', 'help-wanted'],

  // Keywords in titles that indicate resolved issues
  resolvedKeywords: ['completed', 'done', 'fixed', 'resolved', 'shipped'],

  // Keywords that indicate bot-created issues to clean up
  botIssuePatterns: [
    /^\[P\d\]/,           // Priority tags like [P1], [P2]
    /^_.*_$/,             // Italic wrapped titles
    /Badge.*flat/,        // Badge issues
    /Codex Review/i,      // Automated review issues
  ],

  // Maximum issues to process per run
  maxIssuesPerRun: 100
};

// Resolution messages
export const MESSAGES = {
  stale: 'This issue has been automatically closed due to inactivity. If this is still relevant, please reopen with updated information.',
  duplicate: 'Closing as duplicate. Please refer to the linked issue for updates.',
  resolved: 'This issue appears to have been resolved. Closing automatically.',
  botCleanup: 'Closing automated/bot-generated issue as part of repository cleanup.',
  deprecated: 'This repository/feature has been deprecated. Closing related issues.'
};
