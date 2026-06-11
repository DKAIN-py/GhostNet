import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GhostnetProvider } from './context/GhostnetContext';
import { ReplayProvider } from './context/ReplayContext';
import { T } from './lib/theme';
import Topbar from './components/shared/Topbar';
import Sidebar from './components/shared/Sidebar';
import CascadeModal from './components/dashboard/CascadeModal';
import Dashboard from './pages/Dashboard';
import Replay from './pages/Replay';
import CascadeLog from './pages/CascadeLog';

export default function App() {
  return (
    <GhostnetProvider>
      <ReplayProvider>
        <BrowserRouter>
          <div className="h-screen w-screen flex flex-col overflow-hidden"
            style={{ background: T.bg.root, color: T.text.primary }}>
            <Topbar />
            <div className="flex flex-1 overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-hidden">
                <Routes>
                  <Route path="/"        element={<Dashboard />}  />
                  <Route path="/replay"  element={<Replay />}     />
                  <Route path="/cascade" element={<CascadeLog />} />
                </Routes>
              </main>
            </div>
            {/* Modal only on live dashboard */}
            <CascadeModal />
          </div>
        </BrowserRouter>
      </ReplayProvider>
    </GhostnetProvider>
  );
}