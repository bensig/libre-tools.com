import { Link } from 'react-router-dom';
import { Navbar, Container, Nav } from 'react-bootstrap';

const Layout = ({ children }) => {
  return (
    <div className="d-flex flex-column min-vh-100">
      <Navbar bg="primary" variant="dark" expand="lg" className="mb-4">
        <Container fluid>
          <Navbar.Brand as={Link} to="/">
            <img
              src="/LibreLogoWhite.png"
              height="30"
              className="d-inline-block align-top me-2"
              alt="Libre logo"
            />
          Libre Tools
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link as={Link} to="/" className="fs-6">Home</Nav.Link>
              <Nav.Link as={Link} to="/explorer" className="fs-6">Smart Contract Explorer</Nav.Link>
              <Nav.Link as={Link} to="/transactions" className="fs-6">Transaction History</Nav.Link>
              <Nav.Link as={Link} to="/btc-tracker" className="fs-6">BTC Tracker</Nav.Link>
              <Nav.Link as={Link} to="/vault-checker" className="fs-6">Vault Checker</Nav.Link>
              <Nav.Link as={Link} to="/seed-generator" className="fs-6">Seed Generator</Nav.Link>
              <Nav.Link as={Link} to="/multisig" className="fs-6">Multisig Proposals</Nav.Link>
              <Nav.Link as={Link} to="/loans" className="fs-6">Global Loan Stats</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <div className="flex-grow-1">
        {children}
      </div>
      <footer className="mt-auto py-3 bg-light">
        <Container className="text-center">
          <p className="mb-1">
            <a href="https://github.com/bensig/libre-tools.com" 
               target="_blank" 
               rel="noopener noreferrer"
               className="text-primary"
               style={{textDecoration: 'underline'}}
             >
               <i  className="bi bi-github me-1"></i>
               View Source on Github
             </a>
          </p>
          <p className="text-muted small mb-0">
            Released under the MIT License
          </p>
        </Container>
      </footer>
    </div>
  );
}

export default Layout;