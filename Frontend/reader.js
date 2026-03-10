import React, { useState } from 'react';

const PDFWorkspace = () => {
  const [pdfPreview, setPdfPreview] = useState(null);
  const [rawText, setRawText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 1. React Side: Create a local URL for the PDF Viewer (Left Pane)
    const localUrl = URL.createObjectURL(file);
    setPdfPreview(localUrl);

    // 2. Python Side: Send to API for Fitz extraction (Right Pane)
    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://127.0.0.1:8000/extract-text', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setRawText(data.text);
    } catch (err) {
      console.error("API Error:", err);
      setRawText("Error extracting text from Python API.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <input type="file" accept="application/pdf" onChange={handleFileChange} />
        {isProcessing && <span style={styles.loader}>Processing via Fitz...</span>}
      </header>

      <main style={styles.main}>
        {/* Left Pane: PDF Viewer */}
        <div style={styles.leftPane}>
          {pdfPreview ? (
            <iframe src={pdfPreview} style={styles.viewer} title="PDF View" />
          ) : (
            <div style={styles.placeholder}>Upload a PDF to begin</div>
          )}
        </div>

        {/* Right Pane: Raw Text from Python */}
        <div style={styles.rightPane}>
          <h3 style={{ marginTop: 0 }}>Extracted Text</h3>
          <pre style={styles.textOutput}>
            {rawText || (isProcessing ? "Extracting..." : "No text loaded.")}
          </pre>
        </div>
      </main>
    </div>
  );
};

// Simple styles for the 2-pane layout
const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' },
  header: { padding: '10px 20px', borderBottom: '1px solid #ddd', backgroundColor: '#f4f4f4' },
  main: { display: 'flex', flex: 1, overflow: 'hidden' },
  leftPane: { flex: 1, borderRight: '1px solid #ddd', backgroundColor: '#525659' },
  rightPane: { flex: 1, padding: '20px', overflowY: 'auto', backgroundColor: '#fff' },
  viewer: { width: '100%', height: '100%', border: 'none' },
  placeholder: { color: '#ccc', textAlign: 'center', marginTop: '20%' },
  textOutput: { whiteSpace: 'pre-wrap', fontSize: '14px', color: '#333', lineHeight: '1.5' },
  loader: { marginLeft: '20px', color: '#007bff', fontWeight: 'bold' }
};

export default PDFWorkspace;