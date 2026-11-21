# Label by Anshika — Secure Studio

## Architecture
FastAPI + SQLAlchemy + PostgreSQL/SQLite + server-side sessions + Argon2 password hashing.

## Local setup
1. Create a virtual environment.
2. Install dependencies: `python -m pip install -r requirements.txt`.
3. Copy `.env.example` to `.env`.
4. Set a strong `SECRET_KEY`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` (at least 12 characters).
5. Run `python seed.py` once to create the administrator.
6. Run `python -m uvicorn app.main:app --reload`.

The admin is at `/admin`. Configure the studio's WhatsApp number in **Studio Settings** after signing in. Enter the country code and number, for example `919876543210`.

## Tests and quality checks
Run `pytest -q` and `python -m compileall -q app seed.py`. The GitHub Actions workflow also checks both browser JavaScript files with `node --check`.

## Deploying to Render
The repository includes a `render.yaml` Blueprint with a web service, PostgreSQL database, health check, generated secret, and persistent disk for uploads/data.

1. Create a new Blueprint from this repository in Render.
2. After the first deployment, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` as environment variables on the web service (use a unique password of at least 12 characters).
3. Run `python seed.py` once in the deployed service shell to create the first administrator.
4. Sign in at `/admin` and configure WhatsApp under Studio Settings.

Keep the persistent disk mounted at `/var/data`; uploaded product images are stored under `/var/data/uploads`. Use PostgreSQL backups and keep deployment secrets private.

## Security notes
- Admin passwords are hashed with Argon2; sessions are server-side and CSRF-protected.
- Uploaded images are limited to JPEG, PNG and WebP, checked against their actual file format, size and dimensions.
- Public enquiries have a basic per-process rate limit and a honeypot field. For multi-instance production deployments, use a shared rate-limit store (such as Redis) at the reverse proxy/application layer.
- Expired sessions are pruned during successful logins.
- Use HTTPS, secure secrets, backups, and a persistent volume/object store for uploads.

Never commit `.env`, passwords, database files, or uploaded images.
