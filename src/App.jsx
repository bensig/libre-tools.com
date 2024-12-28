import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LibreExplorer from './LibreExplorer';
import TransactionDownloader from './TransactionDownloader';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<LibreExplorer />} />
          <Route path="/transactions" element={<TransactionDownloader />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;