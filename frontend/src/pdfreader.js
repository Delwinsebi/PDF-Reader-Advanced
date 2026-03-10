import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [pdfURL, setPdfURL] = useState(null);
  const [textContent, setTextContent] = useState("");

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Left Pane: Show PDF locally
    setPdfURL(URL.createObjectURL(file));

    // Right Pane: Get text from Python
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:8000/upload', formData);
      setTextContent(response.data.text);
    } catch (err) {
      console.error("Extraction failed", err);
      setTextContent("Error: Is the Python server running?");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '10px', background: '#333', color: 'white' }}>
        <input type="file" accept="application/pdf" onChange={handleFileUpload} />
      </div>
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Pane */}
        <div style={{ flex: 1, borderRight: '1px solid #ccc' }}>
          {pdfURL && <iframe src={pdfURL} width="100%" height="100%" title="viewer" />}
        </div>
        
        {/* Right Pane */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          {textContent || "Upload a PDF to see text extraction..."}
        </div>
      </div>
    </div>
  );
}

export default App;