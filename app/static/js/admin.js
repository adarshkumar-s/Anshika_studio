let csrf = "";

const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function api(url, options={}) {
  const headers = {"Accept":"application/json", ...(options.headers || {})};
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const r = await fetch(url, {...options, headers});
  if (r.status === 401) { showLogin(); throw new Error("Session expired"); }
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.detail || "Request failed");
  return data;
}

function showLogin() {
  $("#loginView").hidden = false; $("#adminView").hidden = true;
}

async function boot() {
  try {
    const me = await api("/api/auth/me");
    csrf = me.csrf;
    if (me.user.role !== "ADMIN") throw new Error("Administrator access required");
    $("#loginView").hidden = true; $("#adminView").hidden = false;
    await refresh();
  } catch (_) { showLogin(); }
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginError").textContent = "";
  try {
    const data = await api("/api/auth/login", {method:"POST", body:JSON.stringify({
      username: $("#username").value.trim(), password: $("#password").value
    })});
    csrf = data.csrf; $("#password").value = "";
    $("#loginView").hidden = true; $("#adminView").hidden = false;
    await refresh();
  } catch (err) { $("#loginError").textContent = err.message; }
});

$("#logout").addEventListener("click", async () => {
  try { await api("/api/auth/logout",{method:"POST"}); } finally { csrf=""; showLogin(); }
});

async function refresh() {
  const [stats, products, enquiries, audit] = await Promise.all([
    api("/api/admin/dashboard"), api("/api/admin/products"), api("/api/admin/enquiries"), api("/api/admin/audit")
  ]);
  $("#statProducts").textContent = stats.products;
  $("#statPublished").textContent = stats.published_products;
  $("#statEnquiries").textContent = stats.new_enquiries;
  renderProducts(products); renderEnquiries(enquiries); renderAudit(audit);
}

function renderProducts(products) {
  $("#products").innerHTML = products.map(p => `
    <div class="product-row" data-id="${p.id}">
      <div class="preview" ${p.image_url ? `style="background-image:url('${esc(p.image_url)}')"` : ""}>${p.image_url ? "" : "No image"}</div>
      <input class="name" value="${esc(p.name)}" maxlength="160" aria-label="Name">
      <input class="price" value="${esc(p.price)}" maxlength="60" aria-label="Price">
      <input class="tag" value="${esc(p.tag)}" maxlength="60" aria-label="Tag">
      <input class="description" value="${esc(p.description)}" maxlength="500" aria-label="Description">
      <select class="status"><option>DRAFT</option><option>PUBLISHED</option><option>HIDDEN</option><option>ARCHIVED</option></select>
      <input class="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label="Image">
      <div class="row-actions"><button class="save">Save</button><button class="archive outline">Archive</button></div>
    </div>`).join("");

  products.forEach(p => {
    const row = document.querySelector(`.product-row[data-id="${p.id}"]`);
    row.querySelector(".status").value = p.status;
    row.querySelector(".save").onclick = () => saveProduct(p.id);
    row.querySelector(".archive").onclick = () => archiveProduct(p.id);
  });
}

async function saveProduct(id) {
  const row = document.querySelector(`.product-row[data-id="${id}"]`);
  const payload = {
    name: row.querySelector(".name").value.trim(),
    price: row.querySelector(".price").value.trim(),
    tag: row.querySelector(".tag").value.trim(),
    description: row.querySelector(".description").value.trim(),
    status: row.querySelector(".status").value,
    sort_order: id
  };
  try {
    const p = await api(`/api/admin/products/${id}`, {method:"PUT",body:JSON.stringify(payload)});
    const file = row.querySelector(".image").files[0];
    if (file) {
      const fd = new FormData(); fd.append("file",file);
      await api(`/api/admin/products/${id}/image`, {method:"POST",body:fd});
    }
    await refresh();
  } catch(e) { alert(e.message); }
}

async function archiveProduct(id) {
  if (!confirm("Archive this piece? It can be restored by changing its status later.")) return;
  try { await api(`/api/admin/products/${id}`,{method:"DELETE"}); await refresh(); } catch(e){alert(e.message);}
}

$("#addProduct").onclick = async () => {
  try {
    await api("/api/admin/products",{method:"POST",body:JSON.stringify({
      name:"New Ensemble",price:"Price on Request",tag:"New",description:"Designer piece",status:"DRAFT",sort_order:0
    })});
    await refresh();
    document.querySelector(".product-row .name")?.focus();
  } catch(e){alert(e.message);}
};

function renderEnquiries(rows) {
  const statuses = ["NEW","CONTACTED","CUSTOMIZATION","CONFIRMED","COMPLETED","LOST"];
  $("#enquiries").innerHTML = rows.length ? rows.map(e => `<div class="enquiry">
    <div><b>${esc(e.name)}</b><span>${esc(e.phone)} · ${new Date(e.created_at).toLocaleString()}</span><p>${esc(e.message)}</p></div>
    <select data-id="${e.id}">${statuses.map(s=>`<option ${s===e.status?"selected":""}>${s}</option>`).join("")}</select>
  </div>`).join("") : `<p class="muted">No enquiries yet.</p>`;
  $("#enquiries").querySelectorAll("select").forEach(s=>s.onchange=async()=>{try{await api(`/api/admin/enquiries/${s.dataset.id}`,{method:"PUT",body:JSON.stringify({status:s.value})});}catch(e){alert(e.message);}});
}

function renderAudit(rows) {
  $("#audit").innerHTML = rows.length ? `<div class="audit-list">${rows.map(a=>`<div><b>${esc(a.action)}</b> · ${esc(a.entity_type)} #${esc(a.entity_id)}<span>${new Date(a.created_at).toLocaleString()}</span></div>`).join("")}</div>` : `<p class="muted">No activity yet.</p>`;
}

boot();
