import { useState } from "react";
import { Button } from "react-bootstrap";

// Shows a secret (recovery phrase / WIF) masked by default. "Reveal" toggles
// visibility; "Copy" copies to the clipboard WITHOUT revealing it on screen.
export default function SecretReveal({ value }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can Reveal then select manually */
    }
  };

  return (
    <div className="p-2 bg-light border rounded d-flex justify-content-between align-items-center gap-2">
      <code
        style={{
          wordBreak: "break-all",
          filter: revealed ? "none" : "blur(6px)",
          userSelect: revealed ? "text" : "none",
          transition: "filter 0.1s",
        }}
        aria-hidden={!revealed}
      >
        {value}
      </code>
      <div className="d-flex gap-1 flex-shrink-0">
        <Button size="sm" variant="outline-secondary" onClick={() => setRevealed((r) => !r)}>
          {revealed ? "Hide" : "Reveal"}
        </Button>
        <Button size="sm" variant={copied ? "success" : "outline-secondary"} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
