import { Link } from 'react-router-dom';
import { Navbar, Container, Nav } from 'react-bootstrap';

const Layout = ({ children }) => {
  return (
    <>
      <Navbar bg="primary" variant="dark" expand="lg" className="mb-4">
        <Container fluid>
          <Navbar.Brand as={Link} to="/">
            <img
              src="/Libre Favicon White.png"
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
              <Nav.Link as={Link} to="/seed-generator" className="fs-6">Seed Generator</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      {children}
    </>
  );
}

export default Layout; 