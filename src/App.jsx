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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explorer" element={<LibreExplorer />} />
          <Route path="/transactions" element={<TransactionDownloader />} />
          <Route path="/btc-tracker" element={<BtcTracker />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;