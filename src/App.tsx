import { Routes, Route } from 'react-router-dom';
import PredictPage from './pages/PredictPage';
import ClaimPage from './pages/ClaimPage';
import MiniGamePage from './pages/MiniGamePage';
import OfficePoolPage from './pages/OfficePoolPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<OfficePoolPage />} />
      <Route path="/predict" element={<PredictPage />} />
      <Route path="/predict/:matchId" element={<PredictPage />} />
      <Route path="/claim" element={<ClaimPage />} />
      <Route path="/mini-game" element={<MiniGamePage />} />
      <Route path="/office-pool" element={<OfficePoolPage />} />
    </Routes>
  );
}

export default App;
