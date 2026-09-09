# Label by Anshika — Secure Studio

## Architecture
FastAPI + SQLAlchemy + PostgreSQL/SQLite + server-side sessions + Argon2 password hashing.

## Local setup
1. Create a virtual environment.
2. Install `requirements.txt`.
3. Copy `.env.example` to `.env`.
4. Set a strong `SECRET_KEY`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`.
5. Run `python seed.py`.
6. Run `python -m uvicorn app.main:app --reload`.

The admin is at `/admin`.

## Production
Use PostgreSQL, HTTPS, a real reverse proxy, secure secrets, backups, and a persistent volume/object store for uploads.

Never commit `.env`, passwords, database files, or uploaded images.
