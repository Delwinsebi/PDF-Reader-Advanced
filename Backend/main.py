import os
import logging
import fitz
import numpy as np
import io
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from uuid import uuid4

# Disable the new executor completely for stability on v2.6
os.environ['FLAGS_enable_new_executor'] = '0'

# Silence logs
logging.getLogger("ppocr").setLevel(logging.ERROR)

app = FastAPI()


PDF_STORE: dict[str, bytes] = {}
MAX_STORED_DOCS = 8

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    doc_id: str
    query: str

def normalize_text(value: str) -> str:
    return " ".join(value.split())

def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))

def save_document(data: bytes) -> str:
    doc_id = uuid4().hex
    PDF_STORE[doc_id] = data
    while len(PDF_STORE) > MAX_STORED_DOCS:
        oldest_doc_id = next(iter(PDF_STORE))
        PDF_STORE.pop(oldest_doc_id, None)
    return doc_id

@app.post("/upload")
async def process_pdf(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")

    doc = fitz.open(stream=data, filetype="pdf")
    doc_id = save_document(data)
    parts = []

    # Check for digital text
    digital_text = ""
    for page in doc:
        digital_text += page.get_text()

    if len(digital_text.strip()) > 10:
        # It's a digital PDF
        for page in doc:
            parts.append(f"--- Page {page.number + 1} ---")
            parts.append(page.get_text())
    else:
        # It's a scanned PDF - Trigger OCR
        parts.append("--- [Scanned PDF Detected - Performing OCR] ---")
        
        for page in doc:
            # 1. Increase DPI for better accuracy (Matrix 2.0 = 2x resolution)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img_bytes = pix.tobytes("png")
            
            # 2. Convert bytes to a standard RGB NumPy array
            # PaddleOCR struggles with raw byte streams; this is the "Gold Standard" format
            img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
            img_array = np.array(img)
            
            # 3. Run OCR on the array
            result = ocr.ocr(img_array) 
            
            page_text = ""
            # PaddleOCR returns a nested list: [[ [coords], [text, confidence] ]]
            if result and result[0]:
                for line in result[0]:
                    text_chunk = line[1][0] # The actual recognized string
                    page_text += text_chunk + " "
            
            parts.append(f"--- Page {page.number + 1} ---")
            parts.append(page_text if page_text.strip() else "[No text detected on this page]")
            parts.append("")

    doc.close()
    return {"doc_id": doc_id, "text": "\n".join(parts)}

@app.post("/search")
async def search_text(payload: SearchRequest):
    # (The search logic remains the same as your original snippet)
    # Note: Search only works effectively on digital text. 
    # For scanned text, search results will depend on the OCR accuracy.
    query = normalize_text(payload.query)
    if not query:
        return {"query": "", "hits": []}

    data = PDF_STORE.get(payload.doc_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc = fitz.open(stream=data, filetype="pdf")
    hits: list[dict[str, float | int]] = []

    try:
        for page_number, page in enumerate(doc, start=1):
            page_width = page.rect.width or 1.0
            page_height = page.rect.height or 1.0
            for rect in page.search_for(query):
                hits.append({
                    "page": page_number,
                    "x": clamp01(rect.x0 / page_width),
                    "y": clamp01(rect.y0 / page_height),
                    "w": clamp01(rect.width / page_width),
                    "h": clamp01(rect.height / page_height),
                })
    finally:
        doc.close()

    return {"query": query, "hits": hits}