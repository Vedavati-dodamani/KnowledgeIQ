from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from main import app

ROOT = Path(__file__).resolve().parent
client = TestClient(app)


def get_admin_token() -> str:
    response = client.post("/api/auth/login", json={"email": "admin@knowledgeiq.ai", "password": "Admin@123"})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_admin_login():
    r = client.post("/api/auth/login", json={"email": "admin@knowledgeiq.ai", "password": "Admin@123"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin"


def test_employee_login():
    r = client.post("/api/auth/login", json={"email": "employee@knowledgeiq.ai", "password": "User@123"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "employee"


def test_upload_requires_auth():
    r = client.post("/api/documents/upload", files={"files": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 401


def test_upload_txt_document_and_metadata():
    token = get_admin_token()
    response = client.post(
        "/api/documents/upload",
        files={"files": ("leave_policy.txt", b"Annual leave policy. Employees get 20 days per year.", "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["count"] == 1
    assert payload["documents"][0]["name"] == "leave_policy.txt"
    assert payload["documents"][0]["version"] == "1.0"


def test_grounded_answer_uses_citations_and_not_covered_for_unsupported_questions(monkeypatch):
    token = get_admin_token()
    upload = client.post(
        "/api/documents/upload",
        files={"files": ("hr.txt", b"Annual leave policy states employees receive 20 days of annual leave.", "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert upload.status_code == 200, upload.text

    def fake_llm(prompt):
        return {
            "status": "answered",
            "answer": "Employees receive 20 days of annual leave.",
            "citations": [{"chunk_id": "chunk_001"}],
            "missing_information": [],
            "confidence": "high",
        }

    import main
    monkeypatch.setattr(main, "call_llm", fake_llm)

    ask = client.post(
        "/api/assistant/ask",
        json={"question": "How many annual leave days do employees receive?"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert ask.status_code == 200, ask.text
    body = ask.json()
    assert body["status"] == "answered"
    assert body["citations"][0]["document_name"] == "hr.txt"

    unsupported = client.post(
        "/api/assistant/ask",
        json={"question": "What is the secret company formula?"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert unsupported.status_code == 200
    assert unsupported.json()["status"] in {"not covered", "partially answered"}


def test_documents_endpoint_requires_auth():
    r = client.get("/api/documents")
    assert r.status_code == 401


def test_ui_is_english_only():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "login-language" not in html
    assert "language-select" not in html
    assert "Kannada" not in html and "Hindi" not in html
