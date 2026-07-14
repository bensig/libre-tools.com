import { Card, Row, Col, Button } from "react-bootstrap";

export default function ChoosePathStep({ onChoose }) {
  return (
    <Card>
      <Card.Body>
        <Card.Title>Step 3: Choose how to get your new key</Card.Title>
        <Row className="g-3 mt-2">
          <Col md={6}>
            <Card className="h-100">
              <Card.Body className="d-flex flex-column">
                <Card.Title>Path A -- Generate here (recommended)</Card.Title>
                <Card.Text>
                  This tool generates a brand-new secure key in your browser, using your
                  device&apos;s secure random number generator, and rotates both your owner and
                  active permissions to it in a single transaction. You must back up the new
                  recovery phrase you&apos;re shown.
                </Card.Text>
                <Button className="mt-auto" variant="primary" onClick={() => onChoose("A")}>
                  Generate a new key
                </Button>
              </Card.Body>
            </Card>
          </Col>
          <Col md={6}>
            <Card className="h-100">
              <Card.Body className="d-flex flex-column">
                <Card.Title>Path B -- Paste a key from Anchor / hardware wallet</Card.Title>
                <Card.Text>
                  Advanced: if you already generated a new key pair in Anchor or another wallet,
                  paste its public key here. This tool rotates your active permission first,
                  requires you to prove control of the new key, and only then rotates owner --
                  to protect against a typo permanently locking you out.
                </Card.Text>
                <Button className="mt-auto" variant="outline-primary" onClick={() => onChoose("B")}>
                  Paste a public key
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
}
