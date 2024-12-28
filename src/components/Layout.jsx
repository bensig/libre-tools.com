import { Navbar, Nav, Container } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import libreLogo from '../assets/LibreLogo.png';
import libreLogoLarge from '../assets/LibreLogo-large.png';

export default function Layout({ children }) {
  const location = useLocation();

  return (
    <>
      <Navbar bg="dark" variant="dark" expand="md">
        <Container fluid>
          <Navbar.Brand as={Link} to="/">
            <img
              src={libreLogo}
              srcSet={`${libreLogo} 1x, ${libreLogoLarge} 2x`}
              alt="LibreLogo"
              height="20"
              className="d-inline-block align-top"
            />
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link 
                as={Link} 
                to="/" 
                active={location.pathname === '/'}
              >
                Table Explorer
              </Nav.Link>
              <Nav.Link 
                as={Link} 
                to="/transactions" 
                active={location.pathname === '/transactions'}
              >
                Transaction Downloader
              </Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container className="mt-4">
        {children}
      </Container>
      <footer className="text-center mt-5 mb-4">
        <p>
          Created by Quantumblok - please{' '}
          <a 
            href="https://dashboard.libre.org/validators" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            vote for our Validator "quantum" on Libre
          </a>
        </p>
      </footer>
    </>
  );
} 