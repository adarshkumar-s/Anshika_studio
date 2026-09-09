const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: "Gulab Drape Set",
    price: "₹8,900",
    tag: "Featured",
    desc: "Draped organza · Hand-finished",
    img: ""
  },
  {
    id: 2,
    name: "Noor Co-Ord",
    price: "₹7,500",
    tag: "New",
    desc: "Silk blend · Tailored fit",
    img: ""
  },
  {
    id: 3,
    name: "Mehfil Jacket",
    price: "₹12,500",
    tag: "Statement",
    desc: "Embroidered jacket · Satin",
    img: ""
  },
  {
    id: 4,
    name: "Adaa Corset Kurta",
    price: "₹6,800",
    tag: "Edit",
    desc: "Structured kurta · Cotton silk",
    img: ""
  },
  {
    id: 5,
    name: "Ruhani Skirt Set",
    price: "₹9,600",
    tag: "New",
    desc: "Fluid skirt · Draped blouse",
    img: ""
  },
  {
    id: 6,
    name: "Ziya Cape Dress",
    price: "₹10,900",
    tag: "Limited",
    desc: "Cape silhouette · Crepe",
    img: ""
  }
];

const PRODUCTS_KEY = "anshika_products";
const WHATSAPP_KEY = "anshika_whatsapp";
const DEFAULT_PHONE = "919873308566";

let isViewing = false;

function getWhatsAppNumber() {
  const saved = localStorage.getItem(WHATSAPP_KEY);
  if (!saved || saved === "919999999999") {
    localStorage.setItem(WHATSAPP_KEY, DEFAULT_PHONE);
    return DEFAULT_PHONE;
  }
  return saved;
}

function getProducts() {
  try {
    return JSON.parse(localStorage.getItem(PRODUCTS_KEY)) || DEFAULT_PRODUCTS;
  } catch {
    return DEFAULT_PRODUCTS;
  }
}

function whatsappURL(message) {
  const phone = getWhatsAppNumber().replace(/\D/g, "");
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderProducts() {
  const grid = document.querySelector("#productGrid");
  if (!grid) return;

  const products = getProducts();

  grid.innerHTML = products.map(product => {
    const message = `Hi Label by Anshika, I'm interested in the ${product.name} (${product.price}). Is it available?`;
    const hasImage = Boolean(product.img && product.img.trim() !== "");
    const inlineBg = hasImage ? `style="background-image: url('${product.img}'); background-size: cover; background-position: center;"` : "";

    return `
      <article class="product reveal">
        <div class="product-img" ${inlineBg}>
          <span class="product-badge">${escapeHTML(product.tag || "Collection")}</span>
        </div>

        <div class="product-info">
          <div>
            <h3>${escapeHTML(product.name)}</h3>
            <p>${escapeHTML(product.desc || "Designer piece")} · <b>${escapeHTML(product.price)}</b></p>
          </div>

          <a class="buy" href="${whatsappURL(message)}" target="_blank" rel="noopener noreferrer">
            Enquire ↗
          </a>
        </div>
      </article>
    `;
  }).join("");

  observeReveals();
  attachCursorEvents();
  initProduct3DTilt();
}

function observeReveals() {
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("show");
          obs.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -30px 0px"
    }
  );

  document.querySelectorAll(".reveal:not(.show)").forEach(el => observer.observe(el));
}

function initLuxuryCursor() {
  const dot = document.querySelector(".cursor-dot");
  const ring = document.querySelector(".cursor-ring");

  if (!dot || !ring || window.matchMedia("(pointer: coarse)").matches) return;

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let ringX = mouseX;
  let ringY = mouseY;
  let prevX = mouseX;
  let prevY = mouseY;

  window.addEventListener("mousemove", e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.transform = `translate3d(${mouseX - 3}px, ${mouseY - 3}px, 0)`;
  });

  function renderCursor() {
    ringX += (mouseX - ringX) * 0.16;
    ringY += (mouseY - ringY) * 0.16;

    const deltaX = ringX - prevX;
    const deltaY = ringY - prevY;
    prevX = ringX;
    prevY = ringY;

    const velocity = Math.min(Math.sqrt(deltaX * deltaX + deltaY * deltaY), 15);
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

    const scaleX = isViewing ? 1 : 1 + velocity * 0.025;
    const scaleY = isViewing ? 1 : 1 - velocity * 0.02;

    ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%) rotate(${angle}deg) scale(${scaleX}, ${scaleY})`;

    requestAnimationFrame(renderCursor);
  }
  requestAnimationFrame(renderCursor);

  window.addEventListener("mousedown", () => ring.classList.add("is-clicking"));
  window.addEventListener("mouseup", () => ring.classList.remove("is-clicking"));
}

function attachCursorEvents() {
  const ring = document.querySelector(".cursor-ring");
  const dot = document.querySelector(".cursor-dot");
  const ringText = document.querySelector(".cursor-text");

  if (!ring || !dot || !ringText) return;

  document.querySelectorAll("a, button, .admin-link, .btn, .brand").forEach(el => {
    el.addEventListener("mouseenter", () => {
      ring.classList.add("is-hovering");
      dot.classList.add("is-hovering");
    });
    el.addEventListener("mouseleave", () => {
      ring.classList.remove("is-hovering");
      dot.classList.remove("is-hovering");
    });
  });

  document.querySelectorAll(".product-img, .fabric-card, .story-visual").forEach(card => {
    card.addEventListener("mouseenter", () => {
      isViewing = true;
      ringText.textContent = "VIEW";
      ring.classList.add("is-viewing");
      dot.classList.add("is-viewing");
    });
    card.addEventListener("mouseleave", () => {
      isViewing = false;
      ringText.textContent = "";
      ring.classList.remove("is-viewing");
      dot.classList.remove("is-viewing");
    });
  });

  document.querySelectorAll(".btn, .buy, .brand-crest").forEach(btn => {
    btn.addEventListener("mousemove", e => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - (rect.left + rect.width / 2);
      const y = e.clientY - (rect.top + rect.height / 2);
      btn.style.transition = "transform 0.1s ease-out";
      btn.style.transform = `translate3d(${x * 0.22}px, ${y * 0.22}px, 0)`;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transition = "transform 0.4s var(--ease-editorial, ease-out)";
      btn.style.transform = `translate3d(0px, 0px, 0)`;
    });
  });
}

function initProduct3DTilt() {
  if (window.matchMedia("(pointer: coarse)").matches) return;

  const cards = document.querySelectorAll(".product");

  cards.forEach(card => {
    card.addEventListener("mousemove", e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -6;
      const rotateY = ((x - centerX) / centerX) * 6;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)`;
    });
  });
}

window.addEventListener(
  "scroll",
  () => {
    const header = document.querySelector(".site-header");
    if (!header) return;
    if (window.scrollY > 50) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  },
  { passive: true }
);

document.addEventListener("DOMContentLoaded", () => {
  renderProducts();

  const yearEl = document.querySelector("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const contact = document.querySelector("#contactWhatsapp");
  if (contact) {
    contact.href = whatsappURL("Hi Label by Anshika, I'd like to enquire about your collection.");
  }

  initLuxuryCursor();
});