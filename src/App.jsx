import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './Home';
import LibreExplorer from './LibreExplorer';
import TransactionDownloader from './TransactionDownloader';
import BtcTracker from './BtcTracker';

function App() {
  return (
    <Router>
      <Layout>
        <div className="container-fluid">
          <div className="d-flex justify-content-center">
            <div style={{ width: '95%', maxWidth: '1800px', padding: '20px' }}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/explorer" element={<LibreExplorer />} />
                <Route path="/explorer/:network" element={<LibreExplorer />} />
                <Route path="/explorer/:network/:contract" element={<LibreExplorer />} />
                <Route path="/explorer/:network/:contract/:view" element={<LibreExplorer />} />
                <Route path="/explorer/:network/:contract/:view/:item" element={<LibreExplorer />} />
                <Route path="/explorer/:network/:contract/:view/:item/:scope" element={<LibreExplorer />} />
                <Route path="/transactions" element={<TransactionDownloader />} />
                <Route path="/btc-tracker" element={<BtcTracker />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </div>
        </div>
      </Layout>
    </Router>
  );
}

export default App;