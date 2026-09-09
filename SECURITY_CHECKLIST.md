# Launch security checklist

- [ ] HTTPS enabled at the hosting/reverse-proxy layer.
- [ ] Strong random SECRET_KEY configured only in environment/secrets manager.
- [ ] Strong unique administrator password configured only in environment/secrets manager.
- [ ] PostgreSQL enabled for production; do not use an ephemeral filesystem database.
- [ ] Persistent/object storage configured for uploads.
- [ ] Automated encrypted database backups enabled and restore tested.
- [ ] Reverse proxy limits request body size.
- [ ] Domain points only to the production service.
- [ ] `/docs` is disabled automatically in production.
- [ ] `.env`, database files and uploads are not committed.
- [ ] Admin URL is protected by server-side authentication, not browser storage.
- [ ] Sensitive changes are protected by CSRF and recorded in audit logs.
- [ ] Account lockout/rate limiting is enabled.
- [ ] Keep FastAPI, SQLAlchemy, Pillow and OS packages patched.
- [ ] Never place API keys or passwords in frontend JavaScript.
