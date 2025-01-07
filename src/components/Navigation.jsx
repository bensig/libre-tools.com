import React from 'react';
import { Navbar, Nav, Container } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';

const Navigation = () => {
  const location = useLocation();

  return (
    <Navbar bg="light" expand="lg" className="mb-4">
      <Container>
        <Navbar.Brand as={Link} to="/">Libre Tools</Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            <Nav.Link 
              as={Link} 
              to="/explorer" 
              active={location.pathname === '/explorer'}
            >
              Explorer
            </Nav.Link>
            <Nav.Link 
              as={Link} 
              to="/transactions" 
              active={location.pathname === '/transactions'}
            >
              Transactions
            </Nav.Link>
            <Nav.Link 
              as={Link} 
              to="/btc-tracker" 
              active={location.pathname === '/btc-tracker'}
            >
              BTC Tracker
            </Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Navigation; 