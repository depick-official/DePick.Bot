import { Routes, Route } from 'react-router-dom';
import PredictPage from './pages/PredictPage';
import ClaimPage from './pages/ClaimPage';
import MiniGamePage from './pages/MiniGamePage';

function App() {
  return (
    <Routes>
      <Route path="/predict" element={<PredictPage />} />
      <Route path="/predict/:matchId" element={<PredictPage />} />
      <Route path="/claim" element={<ClaimPage />} />
      <Route path="/mini-game" element={<MiniGamePage />} />
    </Routes>
  );
}

export default App;
