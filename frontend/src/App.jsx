import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GhostnetProvider } from './context/GhostnetContext';
import { ReplayProvider } from './context/ReplayContext';
import { useMockStream } from './hooks/useMockStream';
import { T } from './lib/theme';
import Topbar from './components/shared/Topbar';
import Sidebar from './components/shared/Sidebar';
import Dashboard from './pages/Dashboard';
import SectorBrowser from './pages/SectorBrowser';
import SectorDetail from './pages/SectorDetail';
import Replay from './pages/Replay';
import CascadeLog from './pages/CascadeLog';
import NervousSystem from './pages/NervousSystem';
import CityMap from './pages/Citymap';
import SchemaDocs from './pages/SchemaDocs';
import DataIntegrity from './pages/DataIntegrity';
import Chatbot from './pages/Chatbot';

// Runs the background mesh-wide random walk for as long as the app is
// open, regardless of which route is currently mounted. It used to live
// inside Dashboard.jsx, which meant the entire 468-signal mesh froze the
// instant you navigated to any other page — this component renders
// nothing, it just keeps the interval alive at the top of the tree.
function GlobalMockStream() {
  useMockStream(4000);
  return null;
}

export default function App() {
  return (
    <GhostnetProvider>
      <ReplayProvider>
        <BrowserRouter>
          <GlobalMockStream />
          <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: T.bg.root, color: T.text.primary }}>
            <Topbar />
            <div className="flex flex-1 overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-hidden">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/sectors" element={<SectorBrowser />} />
                  <Route path="/cortex" element={<Chatbot />} />
                  <Route path="/sectors/:sectorId" element={<SectorDetail />} />
                  <Route path="/nervous" element={<NervousSystem />} />
                  <Route path="/citymap" element={<CityMap />} />
                  <Route path="/replay" element={<Replay />} />
                  <Route path="/data-integrity" element={<DataIntegrity />} />
                  <Route path="/cascade" element={<CascadeLog />} />
                  <Route path="/schema" element={<SchemaDocs />} />
                </Routes>
              </main>
            </div>
          </div>
        </BrowserRouter>
      </ReplayProvider>
    </GhostnetProvider>
  );
}