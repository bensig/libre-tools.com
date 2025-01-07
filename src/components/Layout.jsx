import { Link } from 'react-router-dom';
import { Navbar, Nav, Container } from 'react-bootstrap';

const Layout = ({ children }) => {
  return (
    <>
      <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
        <Container>
          <Navbar.Brand as={Link} to="/">
            <img
              src="/libre-favicon.png"
              width="30"
              height="30"
              className="d-inline-block align-top me-2"
              alt="Libre logo"
            />
            Libre Tools
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link as={Link} to="/">Smart Contract Explorer</Nav.Link>
              <Nav.Link as={Link} to="/transactions">Transaction History</Nav.Link>
              <Nav.Link as={Link} to="/btc-tracker">BTC Tracker</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container>
        {children}
      </Container>
    </>
  );
};

export default Layout; 