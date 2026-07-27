import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlayerCardProvider } from './components/PlayerCard';
import { TabBar } from './components/TabBar';
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
            <Route path="/" element={<LeaguePage />} />
            <Route path="/matchup" element={<MatchupPage />} />
            <Route path="/matchup/:week/:matchupId" element={<MatchupPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/team/:rosterId" element={<TeamPage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/arcade" element={<ArcadePage />} />
          </Routes>
          <TabBar />
        </PlayerCardProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
