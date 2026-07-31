import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PlayerCardProvider } from './components/PlayerCard';
import { LeaguePage } from './pages/LeaguePage';
import { MatchupPage } from './pages/MatchupPage';
import { TeamPage } from './pages/TeamPage';
import { PlayersPage } from './pages/PlayersPage';
import { ArcadePage } from './pages/ArcadePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PlayerCardProvider>
          <Routes>
            {/* The arcade is the whole app now — its lineup screen shows every
                player's ladders, form and availability, which is what the
                roster page was for. League, Matchup, Team and Players have no
                nav any more but still answer to their URLs. */}
            <Route path="/" element={<ArcadePage />} />
            <Route path="/league" element={<LeaguePage />} />
            <Route path="/matchup" element={<MatchupPage />} />
            <Route path="/matchup/:week/:matchupId" element={<MatchupPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/team/:rosterId" element={<TeamPage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/arcade" element={<ArcadePage />} />
            {/* /roster is a URL people have, and the SPA rewrite means every
                typo reaches the router rather than a 404 page. Both land here
                instead of on a blank screen. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PlayerCardProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
