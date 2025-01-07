import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LibreExplorer from './LibreExplorer';
import TransactionDownloader from './TransactionDownloader';
import BtcTracker from './BtcTracker';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<LibreExplorer />} />
          <Route path="/transactions" element={<TransactionDownloader />} />
          <Route path="/btc-tracker" element={<BtcTracker />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;