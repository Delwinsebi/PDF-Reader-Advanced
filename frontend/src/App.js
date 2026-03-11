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
  const [selectedText, setSelectedText] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [hitsByPage, setHitsByPage] = useState({});

  const rawPaneRef = useRef(null);

  const groupHitsByPage = (hits) => {
    const grouped = {};
    for (const hit of hits) {
      const key = hit.page;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(hit);
    }
    return grouped;
  };

  const handleRawTextMouseUp = async () => {
    if (!docId) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const anchorNode = selection.anchorNode;
    if (!anchorNode || !rawPaneRef.current || !rawPaneRef.current.contains(anchorNode)) {
      return;
    }

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
      setHitsByPage({});
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setFileObj(file);
    setHitsByPage({});
    setSelectedText('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:8000/upload', formData);
      setDocId(response.data.doc_id || '');
      setTextContent(response.data.text || '');
    } catch (err) {
      console.error('Extraction failed', err);
      setDocId('');
      setTextContent('Error: Is the Python server running?');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: 10, background: '#333', color: '#fff' }}>
        <input type="file" accept="application/pdf" onChange={handleFileUpload} />
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, borderRight: '1px solid #ccc', overflow: 'auto', padding: '12px 0' }}>
          {fileObj && (
            <Document
              file={fileObj}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            >
              {Array.from({ length: numPages }, (_, i) => {
                const pageNumber = i + 1;
                const pageHits = hitsByPage[pageNumber] || [];

                return (
                  <div
                    key={'page-' + pageNumber}
                    style={{ position: 'relative', width: PAGE_WIDTH, margin: '0 auto 16px' }}
                  >
                    <Page
                      pageNumber={pageNumber}
                      width={PAGE_WIDTH}
                      renderTextLayer
                      renderAnnotationLayer
                    />

                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        zIndex: 5,
                      }}
                    >
                      {pageHits.map((hit, idx) => (
                        <div
                          key={'hit-' + pageNumber + '-' + idx}
                          style={{
                            position: 'absolute',
                            left: (hit.x * 100) + '%',
                            top: (hit.y * 100) + '%',
                            width: (hit.w * 100) + '%',
                            height: (hit.h * 100) + '%',
                            background: 'rgba(255, 235, 59, 0.45)',
                            borderRadius: 2,
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

        <div
          ref={rawPaneRef}
          style={{ flex: 1, padding: 20, overflowY: 'auto', whiteSpace: 'pre-wrap' }}
          onMouseUp={handleRawTextMouseUp}
        >
          {textContent || 'Upload a PDF to see text extraction...'}
          {selectedText ? '\n\nSelected: ' + selectedText : ''}
        </div>
      </div>
    </div>
  );
}

export default App;