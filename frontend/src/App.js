import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Document, Page, pdfjs } from 'react-pdf';

// CSS Imports for React-PDF
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// Standard Worker Config
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PAGE_WIDTH = 720;

function App() {
  const [fileUrl, setFileUrl] = useState(null);
  const [docId, setDocId] = useState('');
  const [textContent, setTextContent] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [hitsByPage, setHitsByPage] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  // Cleanup local URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const groupHitsByPage = (hits) => {
    const grouped = {};
    if (!hits) return grouped;
    hits.forEach((hit) => {
      const key = hit.page;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(hit);
    });
    return grouped;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Load PDF in viewer
    const localUrl = URL.createObjectURL(file);
    setFileUrl(localUrl);

    // Reset state
    setHitsByPage({});
    setTextContent('');
    setSearchQuery('');
    setIsExtracting(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:8000/upload', formData);
      setDocId(response.data.doc_id);
      setTextContent(response.data.text); // Your Python returns {"text": "..."}
    } catch (err) {
      console.error('Extraction failed', err);
      setTextContent('Error: Backend failed to process PDF.');
    } finally {
      setIsExtracting(false);
    }
  };

  const runSearch = async (queryText) => {
    const query = queryText.trim();
    if (!docId || !query) return;

    try {
      const response = await axios.post('http://localhost:8000/search', {
        doc_id: docId,
        query,
      });
      setHitsByPage(groupHitsByPage(response.data.hits));
    } catch (err) {
      console.error('Search failed', err);
    }
  };

  const handleTextSelection = async () => {
    if (!docId) return;
    const selection = window.getSelection().toString().trim();
    if (!selection) return;

    setSearchQuery(selection);
    await runSearch(selection);
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    await runSearch(searchQuery);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      {/* Top Bar */}
      <header
        style={{
          padding: '15px 25px',
          background: '#2c3e50',
          color: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <input type="file" accept=".pdf" onChange={handleFileUpload} />
        </div>
        {isExtracting && <span style={{ color: '#f1c40f', fontWeight: 'bold' }}>⚡ Processing Scanned PDF...</span>}
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: PDF Viewer */}
        <div style={{ flex: 1.2, overflowY: 'auto', background: '#525659', padding: '20px' }}>
          {fileUrl && (
            <Document file={fileUrl} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              {Array.from({ length: numPages }, (_, i) => {
                const pageNum = i + 1;
                const pageHits = hitsByPage[pageNum] || [];
                return (
                  <div key={pageNum} style={{ position: 'relative', width: PAGE_WIDTH, margin: '0 auto 20px', background: '#fff' }}>
                    <Page pageNumber={pageNum} width={PAGE_WIDTH} />
                    {/* Highlighting Overlay */}
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
                      {pageHits.map((hit, idx) => (
                        <div
                          key={idx}
                          style={{
                            position: 'absolute',
                            left: `${hit.x * 100}%`,
                            top: `${hit.y * 100}%`,
                            width: `${hit.w * 100}%`,
                            height: `${hit.h * 100}%`,
                            backgroundColor: 'rgba(52, 152, 219, 0.4)',
                            border: '1px solid #2980b9',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </Document>
          )}
        </div>

        {/* Right: Extracted Text Pane */}
        <div
          style={{
            flex: 0.8,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: '#fff',
            borderLeft: '1px solid #ccc',
          }}
        >
          {/* Sticky search bar always visible */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 20,
              background: '#fff',
              borderBottom: '1px solid #e3e3e3',
              padding: '16px 20px',
            }}
          >
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in document..."
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: '1px solid #cfd8dc',
                  borderRadius: '8px',
                  fontSize: '14px',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: '8px',
                  background: '#2c3e50',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Search
              </button>
            </form>
          </div>

          {/* Scrollable text area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '30px',
              whiteSpace: 'pre-wrap',
            }}
            onMouseUp={handleTextSelection}
          >
            {isExtracting ? (
              <div style={{ color: '#7f8c8d', textAlign: 'center', marginTop: '50px' }}>AI is reading the document...</div>
            ) : (
              textContent || 'Upload a PDF to see extracted text here.'
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;