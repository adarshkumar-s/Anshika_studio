const $ = (s) => document.querySelector(s);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function showCollectionMessage(message, retry = false) {
  const grid = $("#productGrid");
  grid.innerHTML = "";
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = message;
  grid.append(p);
  if (retry) {
    const button = document.createElement("button");
    button.className = "btn";
    button.textContent = "Try again";
    button.addEventListener("click", loadSite);
    grid.append(button);
  }
}

function setWhatsApp(phone) {
  const link = $("#whatsapp");
  if (!link) return;
  if (phone) {
    link.href = `https://wa.me/${phone}?text=${encodeURIComponent("Hi Label by Anshika, I'd like to enquire about your collection.")}`;
    link.hidden = false;
  } else {
    link.removeAttribute("href");
    link.hidden = true;
    const fallback = $("#contactFallback");
    if (fallback) fallback.hidden = false;
  }
}

async function loadSite() {
  showCollectionMessage("Loading collection…");
  try {
    const [productsRes, settingsRes] = await Promise.all([
      fetch("/api/public/products", {headers: {"Accept":"application/json"}}),
      fetch("/api/public/settings", {headers: {"Accept":"application/json"}})
    ]);
    if (!productsRes.ok) throw new Error("The collection could not be loaded.");
    const products = await productsRes.json();
    const settings = settingsRes.ok ? await settingsRes.json() : {whatsapp:""};
    const grid = $("#productGrid");

    if (!products.length) {
      showCollectionMessage("The next collection is being prepared. Please contact the studio on Instagram.");
    } else {
      grid.innerHTML = products.map(p => `
        <article class="product">
          <div class="product-img">
            ${p.image_url ? `<img src="${escapeHTML(p.image_url)}" alt="${escapeHTML(p.name)}" loading="lazy" decoding="async">` : '<span class="image-placeholder">Image coming soon</span>'}
            <span class="product-tag">${escapeHTML(p.tag)}</span>
          </div>
          <div class="product-info"><div><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.description)} · <b>${escapeHTML(p.price)}</b></p></div>
          <a class="enquire" data-product="${Number(p.id)}" href="#contact">Enquire ↗</a></div>
        </article>`).join("");
      grid.querySelectorAll(".enquire").forEach(a => a.addEventListener("click", e => {
        const product = products.find(x => x.id === Number(a.dataset.product));
        const phone = String(settings.whatsapp || "").replace(/\D/g, "");
        if (phone && product) {
          e.preventDefault();
          const message = `Hi Label by Anshika, I'm interested in the ${product.name} (${product.price}). Is it available?`;
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        }
      }));
    }
    setWhatsApp(String(settings.whatsapp || "").replace(/\D/g, ""));
  } catch (error) {
    showCollectionMessage(error.message || "Something went wrong while loading the collection.", true);
  }
  $("#year").textContent = new Date().getFullYear();
}

function setupMobileNavigation() {
  const button = $(".menu");
  const nav = $("#primaryNav");
  if (!button || !nav) return;
  button.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    button.textContent = open ? "×" : "☰";
  });
  nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
    nav.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Open menu");
    button.textContent = "☰";
  }));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      nav.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Open menu");
      button.textContent = "☰";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupMobileNavigation();
  loadSite();
});
