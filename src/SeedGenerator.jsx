import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Button, Form, Alert } from 'react-bootstrap';
import { WORDLIST } from './word-list';

function SeedGenerator() {
  const [entropy, setEntropy] = useState([]);
  const [seedPhrase, setSeedPhrase] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);
  const [entropyBits, setEntropyBits] = useState(128);
  const [showSeed, setShowSeed] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const timeoutRef = useRef(null);
  
  // Calculate required entropy points based on entropy bits
  const requiredEntropyPoints = useMemo(() => {
    return entropyBits === 128 
      ? Math.floor(Math.random() * (500 - 100 + 1)) + 100    // 100-500 for 128 bits
      : Math.floor(Math.random() * (2000 - 500 + 1)) + 500   // 500-2000 for 256 bits
  }, [entropyBits]);

  const collectMouseEntropy = (event) => {
    if (isCollecting && entropy.length < requiredEntropyPoints) {
      console.log('Collecting mouse/touch entropy point:', entropy.length + 1);
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
      console.log('Collecting keyboard entropy point:', entropy.length + 1);
      // Add multiple entropy points per keypress to make keyboard input more significant
      setEntropy(prev => [...prev, {
        type: 'keyboard',
        key: event.key,
        keyCode: event.keyCode,
        timestamp: Date.now(),
        random: Math.random()
      }, {
        type: 'keyboard',
        key: event.key,
        keyCode: event.keyCode,
        timestamp: Date.now() + 1, // Ensure unique timestamp
        random: Math.random()
      }, {
        type: 'keyboard',
        key: event.key,
        keyCode: event.keyCode,
        timestamp: Date.now() + 2, // Ensure unique timestamp
        random: Math.random()
      }]);
    }
  };

  const generateSeed = async () => {
    try {
      console.log('Generating seed...'); // Debug log
      
      // Convert mouse movements to entropy
      const entropyData = entropy.map(e => 
        `${e.x},${e.y},${e.timestamp}`
      ).join('');
      
      console.log('Entropy data length:', entropyData.length); // Debug log
      
      // Convert string to Uint8Array for crypto operations
      const encoder = new TextEncoder();
      const data = encoder.encode(entropyData);
      
      // Generate random values using Web Crypto API
      const randomBytes = new Uint8Array(entropyBits / 8);
      crypto.getRandomValues(randomBytes);
      
      // Mix user entropy with random values
      const mixedData = new Uint8Array([...data, ...randomBytes]);
      
      console.log('Mixed data length:', mixedData.length); // Debug log
      
      // Generate final hash
      const hashBuffer = await crypto.subtle.digest('SHA-256', mixedData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      
      // Convert to binary string
      const binaryStr = hashArray
        .slice(0, entropyBits / 8)
        .map(b => b.toString(2).padStart(8, '0'))
        .join('');
      
      console.log('Binary string length:', binaryStr.length); // Debug log
      
      // Calculate checksum
      const checksumBits = entropyBits / 32;
      const checksumData = await crypto.subtle.digest(
        'SHA-256',
        new Uint8Array(hashArray.slice(0, entropyBits / 8))
      );
      const checksumArray = new Uint8Array(checksumData);
      const checksum = checksumArray[0].toString(2).padStart(8, '0').slice(0, checksumBits);
      
      console.log('Checksum length:', checksum.length); // Debug log
      
      // Combine entropy and checksum
      const combinedBits = binaryStr + checksum;
      
      console.log('Combined bits length:', combinedBits.length); // Debug log
      
      // Split into 11-bit segments and convert to words
      const words = [];
      for (let i = 0; i < combinedBits.length; i += 11) {
        const index = parseInt(combinedBits.slice(i, i + 11), 2);
        console.log('Word index:', index); // Debug log
        if (index >= WORDLIST.length) {
          throw new Error(`Invalid word index: ${index}`);
        }
        words.push(WORDLIST[index]);
      }
      
      const phrase = words.join(' ');
      console.log('Generated phrase length:', phrase.length); // Debug log
      
      setSeedPhrase(phrase);
      setShowSeed(true);
      setIsCollecting(false);
      setError('');
    } catch (error) {
      console.error('Error generating seed:', error);
      setError('Error generating seed phrase. Please try again.');
      setIsCollecting(false);
    }
  };

  const startCollection = () => {
    console.log('Starting entropy collection...');
    setEntropy([]);
    setIsCollecting(true);
    setShowSeed(false);
    setError('');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(seedPhrase)
      .then(() => {
        setCopySuccess(true);
        timeoutRef.current = setTimeout(() => {
          setCopySuccess(false);
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        setError('Failed to copy to clipboard');
      });
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

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

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
              <div className="p-3 bg-light border rounded d-flex justify-content-between align-items-start">
                <code className="user-select-all">{seedPhrase}</code>
                <Button 
                  variant={copySuccess ? "success" : "outline-secondary"}
                  size="sm"
                  className="ms-2"
                  onClick={handleCopy}
                >
                  {copySuccess ? (
                    <>
                      <i className="bi bi-check"></i> Copied
                    </>
                  ) : (
                    <>
                      <i className="bi bi-clipboard"></i> Copy
                    </>
                  )}
                </Button>
              </div>
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
