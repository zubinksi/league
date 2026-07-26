import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { TabBar } from './components/TabBar';
import { LeaguePage } from './pages/LeaguePage';
import { MatchupPage } from './pages/MatchupPage';
import { TeamPage } from './pages/TeamPage';
import { PlayersPage } from './pages/PlayersPage';

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
        <Routes>
          <Route path="/" element={<LeaguePage />} />
          <Route path="/matchup" element={<MatchupPage />} />
          <Route path="/matchup/:week/:matchupId" element={<MatchupPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/team/:rosterId" element={<TeamPage />} />
          <Route path="/players" element={<PlayersPage />} />
        </Routes>
        <TabBar />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
