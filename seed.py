import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
from app.main import SessionLocal, User, Product, Setting, ph
from sqlalchemy import select

username = os.getenv("ADMIN_USERNAME", "").strip()
password = os.getenv("ADMIN_PASSWORD", "")
if not username or len(password) < 12:
    raise SystemExit("Set ADMIN_USERNAME and ADMIN_PASSWORD (minimum 12 characters) before running seed.py.")

db = SessionLocal()
try:
    if db.scalar(select(User).where(User.username == username)):
        raise SystemExit("That administrator already exists.")
    db.add(User(username=username, password_hash=ph.hash(password), role="ADMIN", active=True))
    if not db.get(Setting, "whatsapp"):
        db.add(Setting(key="whatsapp", value=""))
    if not db.scalar(select(Product)):
        defaults = [
            ("Gulab Drape Set","₹8,900","Featured","Draped organza · Hand-finished"),
            ("Noor Co-Ord","₹7,500","New","Silk blend · Tailored fit"),
            ("Mehfil Jacket","₹12,500","Statement","Embroidered jacket · Satin"),
            ("Adaa Corset Kurta","₹6,800","Edit","Structured kurta · Cotton silk"),
            ("Ruhani Skirt Set","₹9,600","New","Fluid skirt · Draped blouse"),
            ("Ziya Cape Dress","₹10,900","Limited","Cape silhouette · Crepe"),
        ]
        for i,(n,p,t,d) in enumerate(defaults):
            db.add(Product(name=n,price=p,tag=t,description=d,status="DRAFT",sort_order=i))
    db.commit()
    print("Secure admin initialized.")
finally:
    db.close()
