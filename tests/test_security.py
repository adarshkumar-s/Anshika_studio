import os
os.environ["APP_ENV"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-123456"
from fastapi.testclient import TestClient
from app.main import app, SessionLocal, User, Product, ph
from sqlalchemy import select

client = TestClient(app)

def setup_module():
    db = SessionLocal()
    if not db.scalar(select(User).where(User.username=="testadmin")):
        db.add(User(username="testadmin", password_hash=ph.hash("CorrectPassword123!"), role="ADMIN", active=True))
        db.commit()
    db.close()

def test_public_does_not_expose_admin():
    r = client.get("/api/admin/products")
    assert r.status_code == 401

def test_login_sets_cookie_and_csrf():
    r = client.post("/api/auth/login", json={"username":"testadmin","password":"CorrectPassword123!"})
    assert r.status_code == 200
    assert "anshika_session" in r.cookies
    assert r.json()["csrf"]

def test_wrong_password():
    r = client.post("/api/auth/login", json={"username":"testadmin","password":"wrongwrongwrong"})
    assert r.status_code == 401
