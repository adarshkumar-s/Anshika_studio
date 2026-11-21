let csrf = "";

const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function api(url, options={}) {
  const headers = {"Accept":"application/json", ...(options.headers || {})};
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const r = await fetch(url, {...options, headers});
  if (r.status === 401) { csrf = ""; showLogin(); throw new Error("Session expired. Please sign in again."); }
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.detail || "Request failed");
  return data;
}

function showLogin() {
  $("#loginView").hidden = false;
  $("#adminView").hidden = true;
}

function showError(target, message) {
  const el = $(target);
  if (el) { el.textContent = message; el.hidden = !message; }
}

async function boot() {
  try {
    const me = await api("/api/auth/me");
    csrf = me.csrf;
    if (me.user.role !== "ADMIN") throw new Error("Administrator access required");
    $("#loginView").hidden = true;
    $("#adminView").hidden = false;
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
    csrf = data.csrf;
    $("#password").value = "";
    $("#loginView").hidden = true;
    $("#adminView").hidden = false;
    await refresh();
  } catch (err) { $("#loginError").textContent = err.message; }
});

$("#logout").addEventListener("click", async () => {
  try { await api("/api/auth/logout",{method:"POST"}); } finally { csrf=""; showLogin(); }
});

async function refresh() {
  const tasks = [
    ["dashboard", "/api/admin/dashboard"],
    ["products", "/api/admin/products"],
    ["enquiries", "/api/admin/enquiries"],
    ["audit", "/api/admin/audit"],
    ["settings", "/api/admin/settings"]
  ];
  const results = await Promise.allSettled(tasks.map(([,url]) => api(url)));
  const values = {};
  results.forEach((result, index) => {
    const [key] = tasks[index];
    if (result.status === "fulfilled") values[key] = result.value;
    else showError("#adminError", `Some dashboard data could not be loaded (${key}). Use Refresh to try again.`);
  });
  if (values.dashboard) {
    $("#statProducts").textContent = values.dashboard.products;
    $("#statPublished").textContent = values.dashboard.published_products;
    $("#statEnquiries").textContent = values.dashboard.new_enquiries;
  }
  if (values.products) renderProducts(values.products);
  if (values.enquiries) renderEnquiries(values.enquiries);
  if (values.audit) renderAudit(values.audit);
  if (values.settings) $("#whatsappSetting").value = values.settings.whatsapp || "";
}

$("#refreshDashboard").addEventListener("click", refresh);
$("#settingsForm").addEventListener("submit", async e => {
  e.preventDefault();
  showError("#settingsMessage", "");
  try {
    const result = await api("/api/admin/settings", {
      method:"PUT",
      body:JSON.stringify({whatsapp: $("#whatsappSetting").value.trim()})
    });
    $("#whatsappSetting").value = result.whatsapp;
    showError("#settingsMessage", "Studio settings saved.");
  } catch (error) {
    showError("#settingsMessage", error.message);
  }
});

let productFilter = "";
$("#productSearch").addEventListener("input", e => {
  productFilter = e.target.value.trim().toLowerCase();
  document.querySelectorAll(".product-row").forEach(row => {
    row.hidden = !row.dataset.search.includes(productFilter);
  });
});

function renderProducts(products) {
  $("#products").innerHTML = products.length ? products.map(p => `
    <div class="product-row" data-id="${p.id}" data-search="${esc([p.name,p.tag,p.description,p.status].join(" ").toLowerCase())}">
      <div class="preview">${p.image_url ? `<img src="${esc(p.image_url)}" alt="Preview of ${esc(p.name)}" loading="lazy">` : "No image"}</div>
      <input class="name" value="${esc(p.name)}" maxlength="160" aria-label="Product name">
      <input class="price" value="${esc(p.price)}" maxlength="60" aria-label="Price">
      <input class="tag" value="${esc(p.tag)}" maxlength="60" aria-label="Tag">
      <input class="description" value="${esc(p.description)}" maxlength="500" aria-label="Description">
      <select class="status" aria-label="Product status"><option>DRAFT</option><option>PUBLISHED</option><option>HIDDEN</option><option>ARCHIVED</option></select>
      <input class="image" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Replace image">
      <div class="row-actions"><button class="save" type="button">Save</button><button class="archive outline" type="button">Archive</button></div>
    </div>`).join("") : '<p class="muted">No products yet. Add the first piece to your collection.</p>';

  products.forEach(p => {
    const row = document.querySelector(`.product-row[data-id="${p.id}"]`);
    row.querySelector(".status").value = p.status;
    row.querySelector(".save").onclick = () => saveProduct(p.id);
    row.querySelector(".archive").onclick = () => archiveProduct(p.id);
  });
  document.querySelectorAll(".product-row").forEach(row => {
    row.hidden = !row.dataset.search.includes(productFilter);
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
    await api(`/api/admin/products/${id}`, {method:"PUT",body:JSON.stringify(payload)});
    const file = row.querySelector(".image").files[0];
    if (file) {
      const fd = new FormData();
      fd.append("file",file);
      await api(`/api/admin/products/${id}/image`, {method:"POST",body:fd});
    }
    await refresh();
  } catch(e) { alert(e.message); }
}

async function archiveProduct(id) {
  if (!confirm("Archive this piece? It can be restored by changing its status later.")) return;
  try { await api(`/api/admin/products/${id}`,{method:"DELETE"}); await refresh(); }
  catch(e){alert(e.message);}
}

$("#addProduct").onclick = async () => {
  try {
    const created = await api("/api/admin/products",{method:"POST",body:JSON.stringify({
      name:"New Ensemble",price:"Price on Request",tag:"New",description:"Designer piece",status:"DRAFT",sort_order:0
    })});
    await refresh();
    const input = document.querySelector(`.product-row[data-id="${created.id}"] .name`);
    input?.focus();
    input?.scrollIntoView({behavior:"smooth",block:"center"});
  } catch(e){alert(e.message);}
};

function renderEnquiries(rows) {
  const statuses = ["NEW","CONTACTED","CUSTOMIZATION","CONFIRMED","COMPLETED","LOST"];
  $("#enquiries").innerHTML = rows.length ? rows.map(e => `<div class="enquiry">
    <div><b>${esc(e.name)}</b><span>${esc(e.phone)} · ${new Date(e.created_at).toLocaleString()}</span><p>${esc(e.message)}</p></div>
    <select aria-label="Enquiry status" data-id="${e.id}">${statuses.map(s=>`<option ${s===e.status?"selected":""}>${s}</option>`).join("")}</select>
  </div>`).join("") : '<p class="muted">No enquiries yet.</p>';
  $("#enquiries").querySelectorAll("select").forEach(s=>s.onchange=async()=>{
    try { await api(`/api/admin/enquiries/${s.dataset.id}`,{method:"PUT",body:JSON.stringify({status:s.value})}); }
    catch(e){alert(e.message);}
  });
}

function renderAudit(rows) {
  $("#audit").innerHTML = rows.length ? `<div class="audit-list">${rows.map(a=>`<div><b>${esc(a.action)}</b> · ${esc(a.entity_type)} #${esc(a.entity_id)}<span>${new Date(a.created_at).toLocaleString()}</span></div>`).join("")}</div>` : '<p class="muted">No activity yet.</p>';
}

boot();
