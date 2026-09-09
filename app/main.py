import os
import secrets
import hashlib
import mimetypes
import io

from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, Response, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import create_engine, String, Integer, Boolean, DateTime, Text, ForeignKey, select, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker, Session, relationship
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from itsdangerous import Signer, BadSignature

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'anshika.db'}")
APP_ENV = os.getenv("APP_ENV", "development").lower()
SECRET_KEY = os.getenv("SECRET_KEY", "")
SESSION_TTL_HOURS = int(os.getenv("SESSION_TTL_HOURS", "12"))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/avif"}

if APP_ENV == "production" and len(SECRET_KEY) < 32:
    raise RuntimeError("SECRET_KEY must be a random value of at least 32 characters in production.")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(48)

engine_kwargs = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    role: Mapped[str] = mapped_column(String(30), default="ADMIN")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class SessionToken(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    user: Mapped[User] = relationship()

class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    price: Mapped[str] = mapped_column(String(60), default="Price on Request")
    tag: Mapped[str] = mapped_column(String(60), default="Collection")
    description: Mapped[str] = mapped_column(String(500), default="Designer piece")
    image_url: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Enquiry(Base):
    __tablename__ = "enquiries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="NEW", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(String(500))

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[str] = mapped_column(String(80))
    before_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    after_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

Base.metadata.create_all(engine)

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
signer = Signer(SECRET_KEY, salt="session")

def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

def hash_ip(request: Request) -> str:
    # Do not store raw IPs in the audit database.
    raw = request.client.host if request.client else "unknown"
    return hashlib.sha256((SECRET_KEY + raw).encode()).hexdigest()

def audit(db: Session, request: Request, user_id: Optional[int], action: str, entity_type: str,
          entity_id: str, before=None, after=None):
    import json
    db.add(AuditLog(
        actor_user_id=user_id, action=action, entity_type=entity_type, entity_id=str(entity_id),
        before_json=json.dumps(before, ensure_ascii=False) if before is not None else None,
        after_json=json.dumps(after, ensure_ascii=False) if after is not None else None,
        ip_hash=hash_ip(request)
    ))

def clean_text(value: str, max_len: int) -> str:
    value = (value or "").strip()
    if len(value) > max_len:
        raise HTTPException(422, "Input is too long.")
    return value

def get_current_session(request: Request, db: Session) -> tuple[User, SessionToken]:
    raw = request.cookies.get("anshika_session")
    if not raw:
        raise HTTPException(401, "Authentication required.")
    try:
        token = signer.unsign(raw).decode()
    except BadSignature:
        raise HTTPException(401, "Invalid session.")
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    s = db.scalar(select(SessionToken).where(SessionToken.token_hash == token_hash))
    now = datetime.now(timezone.utc)
    if not s or s.expires_at < now or not s.user.active:
        raise HTTPException(401, "Session expired.")
    return s.user, s

def require_admin(request: Request, db: Session = Depends(db)):
    user, session = get_current_session(request, db)
    if user.role != "ADMIN":
        raise HTTPException(403, "Administrator access required.")
    return user, session

def require_csrf(request: Request, session: SessionToken):
    supplied = request.headers.get("X-CSRF-Token")
    if not supplied or not secrets.compare_digest(supplied, session.csrf_token):
        raise HTTPException(403, "Invalid CSRF token.")

class LoginIn(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=8, max_length=256)

class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    price: str = Field(min_length=1, max_length=60)
    tag: str = Field(default="Collection", max_length=60)
    description: str = Field(default="Designer piece", max_length=500)
    image_url: Optional[str] = Field(default=None, max_length=300)
    status: str = Field(default="DRAFT", max_length=20)
    sort_order: int = Field(default=0, ge=0, le=100000)

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v not in {"DRAFT", "PUBLISHED", "HIDDEN", "ARCHIVED"}:
            raise ValueError("Invalid product status.")
        return v

class EnquiryIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=7, max_length=40)
    message: str = Field(min_length=1, max_length=2000)
    product_id: Optional[int] = Field(default=None, ge=1)
    website: str = Field(default="", max_length=100)  # honeypot

class EnquiryStatusIn(BaseModel):
    status: str = Field(min_length=2, max_length=30)

def serialize_product(p: Product):
    return {"id": p.id, "name": p.name, "price": p.price, "tag": p.tag,
            "description": p.description, "image_url": p.image_url,
            "status": p.status, "sort_order": p.sort_order,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None}

def _cleanup_image_if_unreferenced(db: Session, image_url: Optional[str]) -> None:
    if not image_url or not image_url.startswith("/uploads/"):
        return
    filename = image_url.removeprefix("/uploads/")
    if Path(filename).name != filename or filename.startswith("."):
        return
    if db.scalar(select(Product.id).where(Product.image_url == image_url).limit(1)):
        return
    try:
        (UPLOAD_DIR / filename).unlink(missing_ok=True)
    except OSError:
        pass

app = FastAPI(title="Label by Anshika", docs_url=None if APP_ENV == "production" else "/docs",
              redoc_url=None if APP_ENV == "production" else "/redoc")

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "app" / "static")), name="static")

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
    if request.url.scheme == "https" or APP_ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

@app.get("/")
def home():
    return FileResponse(BASE_DIR / "app" / "templates" / "index.html")

@app.get("/admin")
def admin_page():
    return FileResponse(BASE_DIR / "app" / "templates" / "admin.html")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/public/products")
def public_products(db: Session = Depends(db)):
    products = db.scalars(select(Product).where(Product.status == "PUBLISHED").order_by(Product.sort_order, Product.id)).all()
    return [serialize_product(p) for p in products]

@app.get("/api/public/settings")
def public_settings(db: Session = Depends(db)):
    wa = db.get(Setting, "whatsapp")
    return {"whatsapp": wa.value if wa else ""}

@app.post("/api/public/enquiries")
def create_enquiry(payload: EnquiryIn, request: Request, db: Session = Depends(db)):
    if payload.website:
        return {"ok": True}
    product = db.get(Product, payload.product_id) if payload.product_id else None
    if payload.product_id and (not product or product.status != "PUBLISHED"):
        raise HTTPException(404, "Product not found.")
    phone = "".join(c for c in payload.phone if c.isdigit() or c in "+ -()")
    e = Enquiry(name=clean_text(payload.name,120), phone=clean_text(phone,40),
                message=clean_text(payload.message,2000), product_id=payload.product_id)
    db.add(e)
    db.commit()
    return {"ok": True}

@app.post("/api/auth/login")
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(db)):
    user = db.scalar(select(User).where(User.username == payload.username.strip()))
    now = datetime.now(timezone.utc)
    if not user or not user.active:
        raise HTTPException(401, "Invalid username or password.")
    if user.locked_until and user.locked_until > now:
        raise HTTPException(429, "Too many failed attempts. Try again later.")
    try:
        ph.verify(user.password_hash, payload.password)
    except VerifyMismatchError:
        user.failed_attempts += 1
        if user.failed_attempts >= 5:
            user.locked_until = now + timedelta(minutes=15)
            user.failed_attempts = 0
        db.commit()
        raise HTTPException(401, "Invalid username or password.")
    user.failed_attempts = 0
    user.locked_until = None
    raw = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    csrf = secrets.token_urlsafe(32)
    expires = now + timedelta(hours=SESSION_TTL_HOURS)
    db.add(SessionToken(token_hash=token_hash, user_id=user.id, csrf_token=csrf, expires_at=expires))
    db.commit()
    signed = signer.sign(raw).decode()
    response.set_cookie("anshika_session", signed, max_age=SESSION_TTL_HOURS*3600,
                        httponly=True, secure=(APP_ENV=="production"), samesite="lax", path="/")
    audit(db, request, user.id, "LOGIN", "USER", user.id)
    db.commit()
    return {"ok": True, "user": {"id": user.id, "username": user.username, "role": user.role}, "csrf": csrf}

@app.post("/api/auth/logout")
def logout(request: Request, response: Response, db: Session = Depends(db)):
    raw = request.cookies.get("anshika_session")
    if raw:
        try:
            token = signer.unsign(raw).decode()
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            s = db.scalar(select(SessionToken).where(SessionToken.token_hash == token_hash))
            if s:
                db.delete(s)
                db.commit()
        except BadSignature:
            pass
    response.delete_cookie("anshika_session", path="/")
    return {"ok": True}

@app.get("/api/auth/me")
def me(request: Request, db: Session = Depends(db)):
    user, session = get_current_session(request, db)
    return {"user": {"id": user.id, "username": user.username, "role": user.role}, "csrf": session.csrf_token}

@app.get("/api/admin/upload-policy")
def upload_policy(auth=Depends(require_admin)):
    return {"max_bytes": MAX_UPLOAD_BYTES, "allowed_types": sorted(ALLOWED_IMAGE_TYPES)}
@app.get("/api/admin/products")
def admin_products(auth=Depends(require_admin), db: Session = Depends(db)):
    return [serialize_product(p) for p in db.scalars(select(Product).order_by(Product.sort_order, Product.id)).all()]

@app.post("/api/admin/products")
def create_product(payload: ProductIn, request: Request, auth=Depends(require_admin), db: Session = Depends(db)):
    user, session = auth
    require_csrf(request, session)
    p = Product(name=clean_text(payload.name,160), price=clean_text(payload.price,60),
                tag=clean_text(payload.tag,60), description=clean_text(payload.description,500),
                image_url=payload.image_url, status=payload.status, sort_order=payload.sort_order)
    db.add(p)
    db.flush()
    audit(db, request, user.id, "CREATE", "PRODUCT", p.id, after=serialize_product(p))
    db.commit()
    return serialize_product(p)

@app.put("/api/admin/products/{product_id}")
def update_product(product_id: int, payload: ProductIn, request: Request, auth=Depends(require_admin), db: Session = Depends(db)):
    user, session = auth
    require_csrf(request, session)
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found.")
    before = serialize_product(p)
    p.name, p.price, p.tag, p.description = [clean_text(x, n) for x,n in
        [(payload.name,160),(payload.price,60),(payload.tag,60),(payload.description,500)]]
    p.image_url, p.status, p.sort_order = payload.image_url, payload.status, payload.sort_order
    after = serialize_product(p)
    audit(db, request, user.id, "UPDATE", "PRODUCT", p.id, before, after)
    db.commit()
    return after

@app.delete("/api/admin/products/{product_id}")
def archive_product(product_id: int, request: Request, auth=Depends(require_admin), db: Session = Depends(db)):
    user, session = auth
    require_csrf(request, session)
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found.")
    before = serialize_product(p)
    p.status = "ARCHIVED"
    audit(db, request, user.id, "ARCHIVE", "PRODUCT", p.id, before, serialize_product(p))
    db.commit()
    return {"ok": True}

@app.post("/api/admin/products/{product_id}/image")
async def upload_image(product_id: int, request: Request, file: UploadFile = File(...),
                       auth=Depends(require_admin), db: Session = Depends(db)):
    user, session = auth
    require_csrf(request, session)
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found.")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(415, "Only JPEG, PNG, WebP, or AVIF images are allowed.")

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Image is too large. The maximum is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")

    # The browser MIME type is only an initial gate. Pillow verifies the actual file.
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(data)) as im:
            width, height = im.size
            detected_format = (im.format or "").upper()
    except Exception:
        raise HTTPException(415, "The selected file is not a valid, readable image.")

    if width < 1 or height < 1 or width * height > 50_000_000:
        raise HTTPException(422, "Image dimensions are not supported.")

    ext = {"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif"}[file.content_type]

    # Avoid writing the same bytes again when the current image is re-selected.
    if p.image_url and p.image_url.startswith("/uploads/"):
        current_path = UPLOAD_DIR / Path(p.image_url).name
        if current_path.is_file():
            try:
                if hashlib.sha256(current_path.read_bytes()).digest() == hashlib.sha256(data).digest():
                    return {"image_url": p.image_url, "filename": current_path.name, "size": len(data),
                            "width": width, "height": height, "format": detected_format, "duplicate": True}
            except OSError:
                pass

    filename = f"{secrets.token_hex(20)}.{ext}"
    path = UPLOAD_DIR / filename
    old = p.image_url
    path.write_bytes(data)
    p.image_url = f"/uploads/{filename}"
    audit(db, request, user.id, "IMAGE_UPDATE", "PRODUCT", p.id,
          {"image_url": old}, {"image_url": p.image_url})
    try:
        db.commit()
    except Exception:
        db.rollback()
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        raise

    _cleanup_image_if_unreferenced(db, old)
    return {"image_url": p.image_url, "filename": filename, "size": len(data),
            "width": width, "height": height, "format": detected_format, "duplicate": False}

@app.delete("/api/admin/products/{product_id}/image")
def remove_image(product_id: int, request: Request, auth=Depends(require_admin), db: Session = Depends(db)):
    user, session = auth
    require_csrf(request, session)
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found.")
    old = p.image_url
    if not old:
        return {"ok": True, "image_url": None}
    p.image_url = None
    audit(db, request, user.id, "IMAGE_REMOVE", "PRODUCT", p.id,
          {"image_url": old}, {"image_url": None})
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    _cleanup_image_if_unreferenced(db, old)
    return {"ok": True, "image_url": None}

@app.get("/uploads/{filename}")
def uploaded_image(filename: str):
    # Filename is generated server-side; disallow path traversal.
    if Path(filename).name != filename or filename.startswith("."):
        raise HTTPException(404, "Not found.")
    path = UPLOAD_DIR / filename
    if not path.is_file():
        raise HTTPException(404, "Not found.")
    media = mimetypes.guess_type(filename)[0]
    if filename.lower().endswith(".avif"):
        media = "image/avif"
    media = media or "application/octet-stream"
    return FileResponse(path, media_type=media, headers={"X-Content-Type-Options":"nosniff"})

@app.get("/api/admin/enquiries")
def admin_enquiries(auth=Depends(require_admin), db: Session = Depends(db)):
    rows = db.scalars(select(Enquiry).order_by(Enquiry.created_at.desc()).limit(200)).all()
    return [{"id": e.id, "product_id": e.product_id, "name": e.name, "phone": e.phone,
             "message": e.message, "status": e.status, "created_at": e.created_at.isoformat()} for e in rows]

@app.put("/api/admin/enquiries/{enquiry_id}")
def update_enquiry(enquiry_id: int, payload: EnquiryStatusIn, request: Request,
                   auth=Depends(require_admin), db: Session = Depends(db)):
    user, session = auth
    require_csrf(request, session)
    allowed = {"NEW","CONTACTED","CUSTOMIZATION","CONFIRMED","COMPLETED","LOST"}
    if payload.status not in allowed:
        raise HTTPException(422, "Invalid enquiry status.")
    e = db.get(Enquiry, enquiry_id)
    if not e:
        raise HTTPException(404, "Enquiry not found.")
    before = {"status": e.status}
    e.status = payload.status
    audit(db, request, user.id, "STATUS_UPDATE", "ENQUIRY", e.id, before, {"status": e.status})
    db.commit()
    return {"ok": True}

@app.get("/api/admin/audit")
def admin_audit(auth=Depends(require_admin), db: Session = Depends(db)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(250)).all()
    return [{"id": a.id, "actor_user_id": a.actor_user_id, "action": a.action,
             "entity_type": a.entity_type, "entity_id": a.entity_id,
             "before": a.before_json, "after": a.after_json,
             "created_at": a.created_at.isoformat()} for a in rows]

@app.get("/api/admin/dashboard")
def dashboard(auth=Depends(require_admin), db: Session = Depends(db)):
    total = db.scalar(select(func.count(Product.id))) or 0
    published = db.scalar(select(func.count(Product.id)).where(Product.status=="PUBLISHED")) or 0
    enquiries = db.scalar(select(func.count(Enquiry.id)).where(Enquiry.status=="NEW")) or 0
    return {"products": total, "published_products": published, "new_enquiries": enquiries}
