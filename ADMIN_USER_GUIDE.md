# Admin and employee workflows

1. Sign in as admin using the demo credentials.
2. Upload a text-based PDF, TXT or Markdown document. The backend indexes it into ChromaDB.
3. Create employee logins from Swagger UI (`/docs`) using `POST /api/auth/users`; authorize with the admin Bearer token.
4. Sign out and sign in as employee. Employees can view the shared library and ask questions, but upload/delete/admin endpoints return HTTP 403.
5. The admin can delete a document with `DELETE /api/documents/{document_id}`. Its file and vector chunks are removed.
