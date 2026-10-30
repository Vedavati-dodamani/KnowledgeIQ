# KnowledgeIQ: working local prototype

Includes role-based login, admin-only document management, employee knowledge access, SQLite persistence, and ChromaDB vector retrieval.

## Run on Windows PowerShell
```powershell
cd KNOWLEDGEIQ_WORKING
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
$env:KNOWLEDGEIQ_SECRET = "set-a-long-random-secret-here"
uvicorn main:app --reload
```
Open http://127.0.0.1:8000. API docs: http://127.0.0.1:8000/docs. Python 3.10/3.11 recommended.

## Demo sign-ins
- Admin: `admin@knowledgeiq.ai` / `Admin@123`
- Employee: `employee@knowledgeiq.ai` / `User@123`
Choose the matching role at login. Admins upload/delete PDF, TXT and MD files and create employee accounts using `POST /api/auth/users` (Bearer token required). Employees can browse shared documents and query the knowledge base.

## Vector retrieval
Uploads are text-extracted, split into overlapping chunks, embedded and persisted in ChromaDB (`vector_store/`). Questions retrieve semantically similar passages with filename/chunk citations. The answer is extractive retrieval, not LLM-generated prose. Scanned PDFs need OCR and are not supported.

## Local data
`uploads/` stores source files; `knowledgeiq.db` stores accounts/document metadata/chat history; `vector_store/` stores embeddings. These are created on first run.

## Security
This is a local prototype, not production hardened. Change the secret and demo passwords before deployment; use HTTPS, strict CORS, upload malware scanning, rate limiting, audit logs, and managed secrets for production.
