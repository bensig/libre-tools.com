import { useState, useEffect, useMemo } from 'react';
import { Card, Button, Form, Alert } from 'react-bootstrap';
import { entropyToMnemonic } from 'bip39';
import { deriveLibreKeys } from './rekey/seedBundle';
import SecretReveal from './components/SecretReveal';

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function SeedGenerator() {
  const [entropy, setEntropy] = useState([]);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [wif, setWif] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);
  const [entropyBits, setEntropyBits] = useState(128);
  const [showSeed, setShowSeed] = useState(false);
  const [error, setError] = useState('');
  
  // Calculate required entropy points based on entropy bits
  const requiredEntropyPoints = useMemo(() => {
    return entropyBits === 128 
      ? Math.floor(Math.random() * (500 - 100 + 1)) + 100    // 100-500 for 128 bits
      : Math.floor(Math.random() * (2000 - 500 + 1)) + 500   // 500-2000 for 256 bits
  }, [entropyBits]);

  const collectMouseEntropy = (event) => {
    if (isCollecting && entropy.length < requiredEntropyPoints) {
      const point = {
        type: 'pointer',
        x: event.clientX || (event.touches && event.touches[0].clientX),
        y: event.clientY || (event.touches && event.touches[0].clientY),
        timestamp: Date.now()
      };
      setEntropy(prev => [...prev, point]);
    }
  };

  const collectTouchEntropy = (event) => {
    if (isCollecting && entropy.length < requiredEntropyPoints) {
      // Don't prevent default on button clicks
      if (event.target.tagName === 'BUTTON' || event.target.closest('button')) {
        return;
      }

      // Prevent scrolling while collecting entropy
      event.preventDefault();

      // Collect entropy from all touch points
      Array.from(event.touches).forEach(touch => {
        setEntropy(prev => [...prev, {
          type: 'pointer',
          x: touch.clientX,
          y: touch.clientY,
          timestamp: Date.now()
        }]);
      });
    }
  };

  const collectKeyboardEntropy = (event) => {
    if (isCollecting && entropy.length < requiredEntropyPoints) {
      // Add multiple entropy points per keypress to make keyboard input more significant
      setEntropy(prev => [...prev, {
        type: 'keyboard',
        key: event.key,
        keyCode: event.keyCode,
        timestamp: Date.now()
      }, {
        type: 'keyboard',
        key: event.key,
        keyCode: event.keyCode,
        timestamp: Date.now() + 1
      }, {
        type: 'keyboard',
        key: event.key,
        keyCode: event.keyCode,
        timestamp: Date.now() + 2
      }]);
    }
  };

  const generateSeed = async () => {
    try {
      // Security comes from the CSPRNG bytes; user input is mixed in via SHA-256
      // and can only add entropy, never remove it.
      const userData = new TextEncoder().encode(JSON.stringify(entropy));
      const randomBytes = new Uint8Array(entropyBits / 8);
      crypto.getRandomValues(randomBytes);
      const mixed = new Uint8Array(userData.length + randomBytes.length);
      mixed.set(userData, 0);
      mixed.set(randomBytes, userData.length);
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', mixed));
      const phrase = entropyToMnemonic(bytesToHex(hash.slice(0, entropyBits / 8)));

      setSeedPhrase(phrase);
      try {
        const k = deriveLibreKeys(phrase);
        setPublicKey(k.publicKey);
        setWif(k.wif);
      } catch {
        setPublicKey('');
        setWif('');
      }
      setShowSeed(true);
      setIsCollecting(false);
      setError('');
    } catch {
      setError('Error generating seed phrase. Please try again.');
      setIsCollecting(false);
    }
  };

  const startCollection = () => {
    setEntropy([]);
    setIsCollecting(true);
    setShowSeed(false);
    setError('');
  };

  useEffect(() => {
    // Only add event listeners when actively collecting and haven't reached the goal
    if (isCollecting && entropy.length < requiredEntropyPoints) {
      document.addEventListener('keydown', collectKeyboardEntropy);
      document.addEventListener('touchmove', collectTouchEntropy, { passive: false });
      document.addEventListener('touchstart', collectTouchEntropy, { passive: false });

      // Cleanup function to remove event listeners
      return () => {
        document.removeEventListener('keydown', collectKeyboardEntropy);
        document.removeEventListener('touchmove', collectTouchEntropy);
        document.removeEventListener('touchstart', collectTouchEntropy);
      };
    }
  }, [isCollecting, entropy.length, requiredEntropyPoints]); // Re-run effect when collection state changes

  return (
    <div 
      onMouseMove={collectMouseEntropy}
      onTouchMove={collectTouchEntropy}
      onTouchStart={collectTouchEntropy}
    >
      <div className="d-flex justify-content-between align-items-center mb-4" style={{ marginRight: '20%' }}>
        <h2 className="text-3xl font-bold">Secure Seed Generator</h2>
      </div>
      
      <div className="d-flex justify-content-end" style={{ marginRight: '20%' }}>
        <div style={{ width: '100%' }}>
          <div className="alert alert-info mb-4 d-flex">
            <i className="bi bi-info-circle me-2"></i>
            <div>
              Generate a secure seed phrase by moving your mouse within the entropy collection area below or typing on your keyboard.
              <div className="mt-3 px-3 py-2 bg-white text-info border border-info rounded">
                <strong className="me-1">Quick tip:</strong>
                Mix mouse, keyboard, and touch input while the collector runs to build entropy faster before revealing your seed words.
              </div>
            </div>
          </div>

          <Form.Group className="mb-3" style={{ maxWidth: '300px' }}>
            <Form.Label>Entropy Size</Form.Label>
            <Form.Select 
              value={entropyBits}
              onChange={(e) => setEntropyBits(Number(e.target.value))}
              disabled={isCollecting}
            >
              <option value={128}>128 bits (12 words)</option>
              <option value={256}>256 bits (24 words)</option>
            </Form.Select>
            {entropyBits === 256 ? (
              <div className="text-danger small mt-1">
                <i className="bi bi-exclamation-triangle-fill me-1"></i>
                <strong>24-word phrases do NOT import into the Bitcoin Libre app.</strong> Only
                12-word phrases work there; a 24-word seed is usable only via Anchor (import the WIF below).
              </div>
            ) : (
              <div className="text-muted small mt-1">
                Bitcoin Libre only supports 12-word recovery phrases.
              </div>
            )}
          </Form.Group>

          {error && (
            <Alert variant="danger" className="mb-3">
              {error}
            </Alert>
          )}

          {!isCollecting && !showSeed && (
            <Button 
              variant="primary" 
              onClick={startCollection}
              className="mb-3"
            >
              Start Entropy Collection
            </Button>
          )}

          {isCollecting && (
            <Card className="mb-3">
              <Card.Body>
                {entropy.length < requiredEntropyPoints ? (
                  <>
                    Move your mouse or finger randomly within this box to generate entropy...
                    <div className="progress mt-2">
                      <div 
                        className="progress-bar progress-bar-striped progress-bar-animated" 
                        style={{ width: `${Math.min((entropy.length / requiredEntropyPoints) * 100, 100)}%` }}
                      />
                    </div>
                    <div className="text-muted small mt-2">
                      Progress: {entropy.length} / {requiredEntropyPoints} points
                      ({entropy.filter(e => e.type === 'keyboard').length} from keyboard,
                      {entropy.filter(e => e.type === 'pointer').length} from mouse/touch)
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="mb-3">Entropy collection complete!</div>
                    <Button 
                      variant="success" 
                      onClick={generateSeed}
                    >
                      Generate Seed Phrase
                    </Button>
                  </div>
                )}
              </Card.Body>
            </Card>
          )}

          {showSeed && (
            <div>
              <Alert variant="warning">
                <strong>Important:</strong> Save this seed phrase securely. Anyone with access to it will have access to your funds!
              </Alert>
              <Form.Label className="mb-1">Recovery phrase {entropyBits === 128
                ? <span className="text-muted">(secret — for the Bitcoin Libre app)</span>
                : <span className="text-danger">(secret — 24 words: Anchor/WIF only, NOT the Bitcoin Libre app)</span>}</Form.Label>
              <SecretReveal value={seedPhrase} />
              {wif && (
                <div className="mt-3">
                  <Form.Label className="mb-1">
                    Private Key (WIF) <span className="text-muted">— secret; the form Anchor imports (Manage Wallets → Import Private Key)</span>
                  </Form.Label>
                  <SecretReveal value={wif} />
                  <div className="text-muted small mt-1">
                    The Bitcoin Libre app imports the 12-word phrase above instead; Anchor uses this WIF.
                  </div>
                </div>
              )}
              {publicKey && (
                <div className="mt-3">
                  <Form.Label className="mb-1">
                    Libre Public Key <span className="text-muted">(safe to share — e.g. paste into the re-key tool)</span>
                  </Form.Label>
                  <div className="p-2 bg-light border rounded">
                    <code className="user-select-all" style={{ wordBreak: 'break-all' }}>{publicKey}</code>
                  </div>
                </div>
              )}
              <Button
                variant="primary"
                onClick={startCollection}
                className="mt-3"
              >
                Generate New Seed
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SeedGenerator; 
