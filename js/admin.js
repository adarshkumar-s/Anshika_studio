const PRODUCTS_KEY = "anshika_products";
const WHATSAPP_KEY = "anshika_whatsapp";
const AUTH_KEY = "anshika_admin";
const DEFAULT_PHONE = "919873308566";

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

function getProducts() {
  try {
    return JSON.parse(localStorage.getItem(PRODUCTS_KEY)) || DEFAULT_PRODUCTS;
  } catch {
    return DEFAULT_PRODUCTS;
  }
}

function saveProducts(products) {
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  } catch (err) {
    alert("Storage limit reached! Please use image URLs or smaller image files.");
  }
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
  const container = document.querySelector("#products");
  if (!container) return;

  const products = getProducts();

  if (products.length === 0) {
    container.innerHTML = `
      <div style="background: #fff; padding: 36px; text-align: center; border: 1px solid var(--line); color: var(--ink-soft);">
        <p style="margin: 0 0 14px; font-size: 14px;">No pieces currently in collection.</p>
        <button onclick="document.querySelector('#add').click()" class="btn btn-secondary" type="button">+ Create First Piece</button>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map(product => {
    const hasImage = Boolean(product.img && product.img.trim() !== "");
    return `
      <div class="product-row" data-id="${product.id}">
        
        <div class="img-picker-wrap">
          <div class="thumb-preview" id="preview-${product.id}" style="${hasImage ? `background-image: url('${product.img}');` : ''}">
            ${!hasImage ? `<span class="no-img">No Img</span>` : ''}
          </div>
          
          <div class="img-actions">
            <input 
              class="img-url" 
              type="text" 
              placeholder="Paste Image URL" 
              value="${escapeHTML(product.img || '')}"
              oninput="handleUrlInput(${product.id}, this.value)"
            >
            <label class="btn-file-upload">
              Upload File
              <input 
                type="file" 
                accept="image/*" 
                style="display: none;" 
                onchange="handleImageUpload(${product.id}, this)"
              >
            </label>
          </div>
        </div>

        <input class="name" value="${escapeHTML(product.name)}" placeholder="Piece Title">
        <input class="price" value="${escapeHTML(product.price)}" placeholder="Price (e.g. ₹8,900)">
        <input class="tag" value="${escapeHTML(product.tag || 'New')}" placeholder="Badge Tag">
        <input class="desc" value="${escapeHTML(product.desc || '')}" placeholder="Fabric & Craft Description">
        
        <div class="row-actions">
          <button class="btn-save" onclick="updateProduct(${product.id})" type="button">Save</button>
          <button class="delete" onclick="deleteProduct(${product.id})" type="button">Delete</button>
        </div>

      </div>
    `;
  }).join("");
}

window.handleUrlInput = function(id, url) {
  const thumb = document.querySelector(`#preview-${id}`);
  if (!thumb) return;
  if (url && url.trim() !== "") {
    thumb.style.backgroundImage = `url('${url.trim()}')`;
    thumb.innerHTML = "";
  } else {
    thumb.style.backgroundImage = "none";
    thumb.innerHTML = `<span class="no-img">No Img</span>`;
  }
};

window.handleImageUpload = function(id, input) {
  if (!input.files || !input.files[0]) return;

  const file = input.files[0];
  if (file.size > 2 * 1024 * 1024) {
    alert("Image is too large. Please select an image under 2MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Img = e.target.result;
    const row = document.querySelector(`[data-id="${id}"]`);
    if (row) {
      row.querySelector(".img-url").value = base64Img;
      const thumb = document.querySelector(`#preview-${id}`);
      thumb.style.backgroundImage = `url('${base64Img}')`;
      thumb.innerHTML = "";
    }
  };
  reader.readAsDataURL(file);
};

window.updateProduct = function(id) {
  const row = document.querySelector(`[data-id="${id}"]`);
  if (!row) return;

  const nameVal = row.querySelector(".name").value.trim();
  const priceVal = row.querySelector(".price").value.trim();
  const tagVal = row.querySelector(".tag").value.trim();
  const descVal = row.querySelector(".desc").value.trim();
  const imgVal = row.querySelector(".img-url").value.trim();

  if (!nameVal) {
    alert("Please enter a title for this piece.");
    return;
  }

  const products = getProducts();
  const product = products.find(item => item.id === id);

  if (product) {
    product.name = nameVal;
    product.price = priceVal || "Price on Request";
    product.tag = tagVal || "Collection";
    product.desc = descVal || "Designer piece";
    product.img = imgVal || "";

    saveProducts(products);
    alert(`"${product.name}" saved successfully.`);
  }
};

window.deleteProduct = function(id) {
  const products = getProducts();
  const product = products.find(item => item.id === id);
  const title = product ? `"${product.name}"` : "this piece";

  if (!confirm(`Are you sure you want to remove ${title} from the live boutique?`)) {
    return;
  }

  const updatedProducts = products.filter(item => item.id !== id);
  saveProducts(updatedProducts);
  renderProducts();
};

document.addEventListener("DOMContentLoaded", () => {
  const login = document.querySelector("#login");
  const app = document.querySelector("#app");
  const loginForm = document.querySelector("#loginForm");
  const errorEl = document.querySelector("#error");
  const waInput = document.querySelector("#wa");

  function showAdmin() {
    login.hidden = true;
    app.hidden = false;

    renderProducts();

    const currentWA = localStorage.getItem(WHATSAPP_KEY);
    if (!currentWA || currentWA === "919999999999") {
      localStorage.setItem(WHATSAPP_KEY, DEFAULT_PHONE);
      waInput.value = DEFAULT_PHONE;
    } else {
      waInput.value = currentWA;
    }
  }

  if (sessionStorage.getItem(AUTH_KEY) === "yes") {
    showAdmin();
  }

  if (loginForm) {
    loginForm.onsubmit = event => {
      event.preventDefault();

      const username = document.querySelector("#user").value.trim();
      const password = document.querySelector("#pass").value.trim();

      if (username === "Anshika" && password === "Adarsh@9911") {
        sessionStorage.setItem(AUTH_KEY, "yes");
        errorEl.textContent = "";
        showAdmin();
      } else {
        errorEl.textContent = "Incorrect username or password.";
      }
    };
  }

  const logoutBtn = document.querySelector("#logout");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      sessionStorage.removeItem(AUTH_KEY);
      location.reload();
    };
  }

  const saveSettingsBtn = document.querySelector("#saveSettings");
  if (saveSettingsBtn) {
    saveSettingsBtn.onclick = () => {
      const number = waInput.value.replace(/\D/g, "");

      if (number.length >= 10) {
        localStorage.setItem(WHATSAPP_KEY, number);
        alert(`WhatsApp routing updated to +${number}`);
      } else {
        alert("Please enter a valid phone number with country code (e.g., 919873308566).");
      }
    };
  }

  const addBtn = document.querySelector("#add");
  if (addBtn) {
    addBtn.onclick = () => {
      const products = getProducts();

      products.unshift({
        id: Date.now(),
        name: "New Ensemble",
        price: "₹0",
        tag: "New",
        desc: "Handcrafted Silk & Embroidery",
        img: ""
      });

      saveProducts(products);
      renderProducts();

      const firstRowInput = document.querySelector(".product-row .name");
      if (firstRowInput) {
        firstRowInput.focus();
        firstRowInput.select();
      }
    };
  }
});