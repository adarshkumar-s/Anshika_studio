const $ = (s) => document.querySelector(s);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

async function loadSite() {
  const [productsRes, settingsRes] = await Promise.all([
    fetch("/api/public/products", {headers: {"Accept":"application/json"}}),
    fetch("/api/public/settings", {headers: {"Accept":"application/json"}})
  ]);
  const products = productsRes.ok ? await productsRes.json() : [];
  const settings = settingsRes.ok ? await settingsRes.json() : {whatsapp:""};

  const grid = $("#productGrid");
  if (!products.length) {
    grid.innerHTML = `<p class="muted">The next collection is being prepared. Please enquire with the studio.</p>`;
  } else {
    grid.innerHTML = products.map(p => `
      <article class="product">
        <div class="product-img" ${p.image_url ? `style="background-image:url('${escapeHTML(p.image_url)}')"` : ""}>
          <span>${escapeHTML(p.tag)}</span>
        </div>
        <div class="product-info"><div><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.description)} · <b>${escapeHTML(p.price)}</b></p></div>
        <a class="enquire" data-product="${p.id}" href="#">Enquire ↗</a></div>
      </article>`).join("");
    grid.querySelectorAll(".enquire").forEach(a => a.addEventListener("click", e => {
      e.preventDefault();
      const p = products.find(x => x.id === Number(a.dataset.product));
      const phone = String(settings.whatsapp || "").replace(/\D/g,"");
      if (!phone) { location.hash = "contact"; return; }
      const text = `Hi Label by Anshika, I'm interested in the ${p.name} (${p.price}). Is it available?`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    }));
  }

  const phone = String(settings.whatsapp || "").replace(/\D/g,"");
  if (phone) $("#whatsapp").href = `https://wa.me/${phone}?text=${encodeURIComponent("Hi Label by Anshika, I'd like to enquire about your collection.")}`;
  $("#year").textContent = new Date().getFullYear();
}

document.addEventListener("DOMContentLoaded", loadSite);
