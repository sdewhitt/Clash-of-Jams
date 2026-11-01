export function navigateToMatch(
    navigate: (path: string, options?: { replace?: boolean }) => void,
    matchId: string,
  ) {
    navigate(`/multiplayer/${encodeURIComponent(matchId)}`, {
      replace: true,
    });
  }