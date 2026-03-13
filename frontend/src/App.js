import React, { useRef, useState } from 'react';
import axios from 'axios';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc =
  '//unpkg.com/pdfjs-dist@' + pdfjs.version + '/build/pdf.worker.min.mjs';

const PAGE_WIDTH = 720;

function App() {
  const [fileObj, setFileObj] = useState(null);
  const [docId, setDocId] = useState('');
  const [textContent, setTextContent] = useState('');
  const [isExtracting, setIsExtracting] = useState(false); // NEW: Track OCR progress
  const [selectedText, setSelectedText] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [hitsByPage, setHitsByPage] = useState({});

  const rawPaneRef = useRef(null);

  const groupHitsByPage = (hits) => {
    const grouped = {};
    for (const hit of hits) {
      const key = hit.page;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(hit);
    }
    return grouped;
  };

  const handleRawTextMouseUp = async () => {
    if (!docId) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const query = selection.toString().replace(/\s+/g, ' ').trim();
    setSelectedText(query);

    if (!query) {
      setHitsByPage({});
      return;
    }

    try {
      const response = await axios.post('http://localhost:8000/search', {
        doc_id: docId,
        query: query,
      });
      setHitsByPage(groupHitsByPage(response.data.hits || []));
    } catch (err) {
      console.error('Search failed', err);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setFileObj(file);
    setHitsByPage({});
    setSelectedText('');
    setTextContent(''); 
    setIsExtracting(true); // Start Loader

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Ensure this matches your Python endpoint
      const response = await axios.post('http://localhost:8000/upload', formData);
      setDocId(response.data.doc_id || '');
      setTextContent(response.data.text || '');
    } catch (err) {
      console.error('Extraction failed', err);
      setTextContent('Error: Extraction failed. Is the Python server running?');
    } finally {
      setIsExtracting(false); // Stop Loader
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ padding: 15, background: '#2c3e50', color: '#fff', display: 'flex', alignItems: 'center', gap: '20px' }}>
        <input type="file" accept="application/pdf" onChange={handleFileUpload} />
        {isExtracting && <span style={{ color: '#f1c40f' }}>⚙️ Python is performing OCR... Please wait.</span>}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Pane: PDF Viewer */}
        <div style={{ flex: 1, borderRight: '2px solid #ddd', overflow: 'auto', background: '#525659', padding: '20px 0' }}>
          {fileObj ? (
            <Document
              file={fileObj}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            >
              {Array.from({ length: numPages }, (_, i) => {
                const pageNumber = i + 1;
                const pageHits = hitsByPage[pageNumber] || [];

                return (
                  <div key={'page-' + pageNumber} style={{ position: 'relative', width: PAGE_WIDTH, margin: '0 auto 20px', boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }}>
                    <Page
                      pageNumber={pageNumber}
                      width={PAGE_WIDTH}
                      renderTextLayer={true} // Keep true for digital PDFs
                      renderAnnotationLayer={true}
                    />
                    {/* Highlight Layer */}
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
                      {pageHits.map((hit, idx) => (
                        <div
                          key={'hit-' + pageNumber + '-' + idx}
                          style={{
                            position: 'absolute',
                            left: (hit.x * 100) + '%',
                            top: (hit.y * 100) + '%',
                            width: (hit.w * 100) + '%',
                            height: (hit.h * 100) + '%',
                            background: 'rgba(255, 235, 59, 0.4)',
                            border: '1px solid orange'
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </Document>
          ) : (
            <div style={{ color: '#ccc', textAlign: 'center', marginTop: '20%' }}>Upload a PDF to view</div>
          )}
        </div>

        {/* Right Pane: OCR Text */}
        <div
          ref={rawPaneRef}
          style={{ flex: 1, padding: 25, overflowY: 'auto', whiteSpace: 'pre-wrap', backgroundColor: '#fff', lineHeight: '1.6' }}
          onMouseUp={handleRawTextMouseUp}
        >
          {isExtracting ? (
            <div style={{ color: '#888', fontStyle: 'italic' }}>Processing document with PaddleOCR...</div>
          ) : (
            textContent || 'Text content will appear here after upload.'
          )}
          {selectedText && (
            <div style={{ marginTop: 20, padding: 10, background: '#efefef', borderRadius: 4, fontSize: '12px', borderLeft: '4px solid #2c3e50' }}>
              <strong>Search Query:</strong> {selectedText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;