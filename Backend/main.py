from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import fitz
from uuid import uuid4

app = FastAPI()

PDF_STORE = {}
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
    doc_id = save_document(data)

    doc = fitz.open(stream=data, filetype="pdf")
    parts = []

    for page in doc:
        parts.append("--- Page " + str(page.number + 1) + " ---")
        parts.append(page.get_text("text"))
        parts.append("")

    doc.close()
    return {"doc_id": doc_id, "text": "\n".join(parts)}

@app.post("/search")
async def search_text(payload: SearchRequest):
    query = normalize_text(payload.query)
    if not query:
        return {"query": "", "hits": []}

    data = PDF_STORE.get(payload.doc_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Document not found. Upload the PDF again.")

    doc = fitz.open(stream=data, filetype="pdf")
    hits = []

    for page_number, page in enumerate(doc, start=1):
        page_width = page.rect.width
        page_height = page.rect.height

        rects = page.search_for(query)
        for rect in rects:
            hits.append(
                {
                    "page": page_number,
                    "x": rect.x0 / page_width,
                    "y": rect.y0 / page_height,
                    "w": rect.width / page_width,
                    "h": rect.height / page_height,
                }
            )

    doc.close()
    return {"query": query, "hits": hits}