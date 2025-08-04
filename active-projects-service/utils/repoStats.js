function calculateRepoStats(repositories) {
  if (!Array.isArray(repositories) || repositories.length === 0) {
    return {
      total_repositories: 0,
      average_stats: {},
      repositories: [],
    };
  }

  const totalStats = {
    total_commits: 0,
    stars: 0,
    forks: 0,
    watchers: 0,
    open_issues: 0,
  };

  repositories.forEach((repo) => {
    const stats = repo.stats || {};
    totalStats.total_commits += stats.total_commits || 0;
    totalStats.stars += stats.stars || 0;
    totalStats.forks += stats.forks || 0;
    totalStats.watchers += stats.watchers || 0;
    totalStats.open_issues += stats.open_issues || 0;
  });

  const count = repositories.length;

  const average_stats = {
    total_commits: +(totalStats.total_commits / count).toFixed(2),
    stars: +(totalStats.stars / count).toFixed(2),
    forks: +(totalStats.forks / count).toFixed(2),
    watchers: +(totalStats.watchers / count).toFixed(2),
    open_issues: +(totalStats.open_issues / count).toFixed(2),
  };

  return {
    total_repositories: count,
    average_stats,
    repositories,
  };
}

module.exports = { calculateRepoStats };
