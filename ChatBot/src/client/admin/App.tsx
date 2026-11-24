/**
 * Cafe Musafir admin dashboard.
 *
 * Single-page React admin interface for menu management and sales.
 * All calls go to the same-origin backend (HttpOnly session cookie is sent
 * automatically by the browser). Protected by admin session auth + CSRF on
 * state-changing endpoints.
 *
 * Styled with the shared MUSAFIR Café brand tokens (theme.css): dark ground,
 * amber accents, serif headings, solid borders, hard offset shadows.
 */

import { useCallback, useEffect, useState } from "react";

type Product = {
  id: number;
  category_id: number;
  category: string | undefined;
  name: string;
  description: string;
  price_cents: number;
  price_inr: string;
  available: boolean;
  dietary_classification: string;
};

type Ingredient = { id: number; name: string };
type Allergen = { id: number; name: string };
type ProductAllergen = Allergen & { verified: boolean };

type Sale = {
  id: number;
  total_cents: number;
  total_inr: string;
  created_at: string;
};
type SalesStats = {
  transactions: number;
  total_cents: number;
  total_inr: string;
};

const API = "/admin";

function api(path: string, body?: unknown, method = "GET") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (method !== "GET") {
    headers["X-CSRF-Token"] = document.cookie
      .split("; ")
      .find((c) => c.trimStart().startsWith("csrf_token="))
      ?.split("=")[1] ?? "";
  }
  return fetch(`${API}${path}`, {
    method,
    headers,
    credentials: "include",
    ...(body !== undefined && method !== "GET" ? { body: JSON.stringify(body) } : {}),
  });
}

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

export default function App() {
  const [view, setView] = useState<"login" | "menu" | "sales">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Menu view state
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [search, setSearch] = useState("");
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [productIngredients, setProductIngredients] = useState<number[]>([]);
  const [productAllergens, setProductAllergens] = useState<ProductAllergen[]>([]);
  const [newProduct, setNewProduct] = useState({
    category_id: 1,
    name: "",
    description: "",
    price_cents: 5000,
    available: true,
    dietary_classification: "none" as const,
  });

  // Sales view state
  const [sales, setSales] = useState<Sale[]>([]);
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [newSale, setNewSale] = useState({ product_id: 1, quantity: 1, unit_price_cents: 9000 });
  const [csvText, setCsvText] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number; rejected: Array<{ row: number; reason: string }> } | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (view === "menu") {
      void loadMenu();
      void loadReferenceData();
    } else if (view === "sales") {
      void loadSales();
    }
  }, [view]);

  async function checkSession() {
    setLoading(true);
    try {
      const res = await api("/sales");
      if (res.ok) {
        setView("menu");
      } else {
        setView("login");
      }
    } catch {
      setView("login");
    } finally {
      setLoading(false);
    }
  }

  async function login(token: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await api("/login", { token }, "POST");
      if (!res.ok) throw new Error("Invalid admin token.");
      setView("menu");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    try {
      await api("/logout", undefined, "POST");
    } finally {
      setView("login");
      setLoading(false);
    }
  }

  // ---------- Menu ----------
  async function loadMenu() {
    setLoading(true);
    try {
      const res = await api("/menu");
      const data = (await res.json()) as any;
      setProducts(data?.products || []);
    } finally {
      setLoading(false);
    }
  }

  async function loadReferenceData() {
    const [ingRes, allRes] = await Promise.all([
      api("/ingredients"),
      api("/allergens"),
    ]);
    if (ingRes.ok) setIngredients(((await ingRes.json()) as any).ingredients || []);
    if (allRes.ok) setAllergens(((await allRes.json()) as any).allergens || []);
  }

  async function openProductEditor(product: Product) {
    setEditProduct(product);
    const [ingRes, allRes] = await Promise.all([
      api(`/menu/${product.id}/ingredients`),
      api(`/menu/${product.id}/allergens`),
    ]);
    if (ingRes.ok) setProductIngredients(((await ingRes.json()) as any).ingredients.map((i: Ingredient) => i.id));
    if (allRes.ok) setProductAllergens((await allRes.json()) as any);
  }

  async function saveProduct() {
    const p = editProduct!;
    const body = {
      id: p.id,
      category_id: p.category_id,
      name: p.name,
      description: p.description,
      price_cents: p.price_cents,
      available: p.available,
      dietary_classification: p.dietary_classification,
    };
    const res = await api("/menu", body, "PUT");
    if (res.ok) {
      setEditProduct(null);
      loadMenu();
    } else {
      setError("Failed to save product.");
    }
  }

  async function createProduct() {
    const res = await api("/menu", newProduct, "POST");
    if (res.ok) {
      setNewProduct({ category_id: 1, name: "", description: "", price_cents: 5000, available: true, dietary_classification: "none" });
      loadMenu();
    } else {
      setError("Failed to create product.");
    }
  }

  async function deleteProduct(id: number) {
    if (!confirm("Deactivate this product?")) return;
    const res = await api(`/menu/${id}`, undefined, "DELETE");
    if (res.ok) loadMenu();
    else setError("Failed to delete product.");
  }

  async function saveIngredients() {
    if (!editProduct) return;
    const res = await api(`/menu/${editProduct.id}/ingredients`, { ingredient_ids: productIngredients }, "PUT");
    if (!res.ok) setError("Failed to update ingredients.");
  }

  async function toggleAllergen(allergenId: number) {
    if (!editProduct) return;
    const next = !productAllergens.find((a) => a.id === allergenId)?.verified;
    setProductAllergens((prev) =>
      prev.map((a) => (a.id === allergenId ? { ...a, verified: next } : a))
    );
    const res = await api(`/menu/${editProduct.id}/allergens/${allergenId}/verified`, { verified: next }, "PUT");
    if (!res.ok) {
      setError("Failed to update allergen verification.");
      loadMenu(); // revert UI
    }
  }

  // ---------- Sales ----------
  async function loadSales() {
    setLoading(true);
    try {
      const res = await api("/sales");
      const data = (await res.json()) as any;
      setSales(data.list || []);
      setStats(data.stats || null);
    } finally {
      setLoading(false);
    }
  }

  async function recordSale() {
    const res = await api("/sales", { items: [newSale] }, "POST");
    if (res.ok) {
      setNewSale({ product_id: 1, quantity: 1, unit_price_cents: 9000 });
      loadSales();
    } else {
      setError("Failed to record sale.");
    }
  }

  async function importCsv() {
    const res = await api("/sales/import", { csv: csvText }, "POST");
    const data = (await res.json()) as any;
    setImportResult(data);
    if (res.ok) loadSales();
  }

  const filteredProducts = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="admin-loading">
        <p>Loading…</p>
      </div>
    );
  }

  // ---------- Login ----------
  if (view === "login") {
    return (
      <div className="admin-login">
        <div className="admin-login__card admin-card">
          <div className="admin-login__brand">
            <div className="admin-mark">M</div>
            <div>
              <p className="admin-login__name">Musafir <em>Café</em> Admin</p>
              <p className="admin-login__tagline">Coffee for the dreamer</p>
            </div>
          </div>
          {error && (
            <div className="admin-alert">
              <p className="admin-alert__title">Login failed</p>
              <p>{error}</p>
            </div>
          )}
          <div className="admin-login__field admin-field">
            <label className="admin-label" htmlFor="admin-token">Admin token</label>
            <input
              id="admin-token"
              type="password"
              className="admin-input"
              value=""
              onChange={(e) => login(e.target.value)}
              placeholder="Enter admin token"
              autoComplete="off"
            />
          </div>
          <button
            className="admin-btn"
            disabled={loading}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // ---------- Authenticated dashboard ----------
  return (
    <div className="admin-app">
      <header className="admin-header admin-card">
        <div className="admin-brand">
          <div className="admin-mark">M</div>
          <div>
            <p className="admin-name">Musafir <em>Café</em> Admin</p>
            <p className="admin-tagline">Coffee for the dreamer</p>
          </div>
        </div>
        <nav className="admin-nav">
          <button
            onClick={() => setView("menu")}
            className={`admin-nav__btn ${view === "menu" ? "admin-nav__btn--active" : ""}`}
          >
            Menu
          </button>
          <button
            onClick={() => setView("sales")}
            className={`admin-nav__btn ${view === "sales" ? "admin-nav__btn--active" : ""}`}
          >
            Sales
          </button>
          <button onClick={logout} className="admin-signout">
            Sign out
          </button>
        </nav>
      </header>

      <main className="admin-main">
        {error && (
          <div className="admin-alert">
            <p className="admin-alert__title">Error</p>
            <p>{error}</p>
          </div>
        )}

        <section className={`admin-view ${view === "menu" ? "admin-view--active" : ""}`}>
          <div className="admin-view__head">
            <div>
              <h2 className="admin-view__title">Menu Management</h2>
              <p className="admin-view__subtitle">View, add and edit products.</p>
            </div>
            <button
              onClick={() => {
                setEditProduct(null);
                setNewProduct({ category_id: 1, name: "", description: "", price_cents: 5000, available: true, dietary_classification: "none" });
              }}
              className="admin-btn"
            >
              Add product
            </button>
          </div>

          <input
            className="admin-search"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "center" }}>Available</th>
                <th>Dietary</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.category}</td>
                  <td style={{ textAlign: "right" }}>{money(p.price_cents)}</td>
                  <td style={{ textAlign: "center" }}>
                    <span className={`admin-tag ${p.available ? "admin-tag--available" : "admin-tag--unavailable"}`}>
                      {p.available ? "Available" : "Unavailable"}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-tag ${p.dietary_classification === "vegan" ? "admin-tag--vegan" : p.dietary_classification === "vegetarian" ? "admin-tag--vegetarian" : ""}`}>
                      {p.dietary_classification.charAt(0).toUpperCase() + p.dietary_classification.slice(1)}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      onClick={() => openProductEditor(p)}
                      className="admin-btn admin-btn--outline"
                    >
                      Edit
                    </button>
                    {p.available ? (
                      <button
                        onClick={() => deleteProduct(p.id)}
                        className="admin-btn admin-btn--danger"
                      >
                        Deactivate
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--m-text-muted)" }}>
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {editProduct && (
            <div className="admin-card" style={{ marginTop: 20 }}>
              <div className="admin-card__body">
                <h3 className="admin-card__title">Edit {editProduct.name}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div className="admin-field">
                    <label className="admin-label">Name</label>
                    <input
                      className="admin-input"
                      value={editProduct.name}
                      onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })}
                    />
                  </div>
                  <div className="admin-field">
                    <label className="admin-label">Price (paise)</label>
                    <input
                      type="number"
                      className="admin-input"
                      value={editProduct.price_cents}
                      onChange={(e) => setEditProduct({ ...editProduct, price_cents: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="admin-field">
                    <label className="admin-label">Dietary</label>
                    <select
                      className="admin-select"
                      value={editProduct.dietary_classification}
                      onChange={(e) => setEditProduct({ ...editProduct, dietary_classification: e.target.value as any })}
                    >
                      <option>none</option>
                      <option>vegan</option>
                      <option>vegetarian</option>
                      <option>dairy_free</option>
                      <option>lactose_free</option>
                    </select>
                  </div>
                  <div className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={editProduct.available}
                      onChange={(e) => setEditProduct({ ...editProduct, available: e.target.checked })}
                    />
                    <label>Available</label>
                  </div>
                </div>

                <div className="admin-field" style={{ marginTop: 16 }}>
                  <label className="admin-label">Ingredients</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {ingredients.map((ing) => (
                      <button
                        key={ing.id}
                        onClick={() => {
                          if (productIngredients.includes(ing.id)) {
                            setProductIngredients(productIngredients.filter((i) => i !== ing.id));
                          } else {
                            setProductIngredients([...productIngredients, ing.id]);
                          }
                        }}
                        className={`admin-btn admin-btn--outline ${productIngredients.includes(ing.id) ? "" : ""}`}
                        style={{
                          background: productIngredients.includes(ing.id) ? "var(--m-accent)" : "transparent",
                          borderColor: productIngredients.includes(ing.id) ? "var(--m-border-strong)" : "var(--m-border)",
                          color: productIngredients.includes(ing.id) ? "#1b1206" : "var(--m-text)",
                        }}
                      >
                        {ing.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="admin-field" style={{ marginTop: 16 }}>
                  <label className="admin-label">Allergens (verification)</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {productAllergens.map((a) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px", background: "var(--m-surface)", border: "1px solid var(--m-border)", borderRadius: "var(--m-radius)" }}>
                        <input
                          type="checkbox"
                          checked={a.verified}
                          onChange={() => toggleAllergen(a.id)}
                        />
                        <span style={{ color: a.verified ? "var(--m-accent)" : "var(--m-text-secondary)" }}>
                          {a.name} {a.verified ? "&bull; verified" : "&bull; unverified"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 20, display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => {
                      saveIngredients();
                      saveProduct();
                    }}
                    className="admin-btn"
                  >
                    Save changes
                  </button>
                  <button
                    onClick={() => setEditProduct(null)}
                    className="admin-btn admin-btn--outline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="admin-card" style={{ marginTop: 20 }}>
            <div className="admin-card__body">
              <h3 className="admin-card__title">New product</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                <div className="admin-field">
                  <label className="admin-label">Category id</label>
                  <input
                    type="number"
                    className="admin-input"
                    value={newProduct.category_id}
                    onChange={(e) => setNewProduct({ ...newProduct, category_id: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="admin-field">
                  <label className="admin-label">Name</label>
                  <input
                    className="admin-input"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  />
                </div>
                <div className="admin-field">
                  <label className="admin-label">Price (paise)</label>
                  <input
                    type="number"
                    className="admin-input"
                    value={newProduct.price_cents}
                    onChange={(e) => setNewProduct({ ...newProduct, price_cents: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="admin-field">
                  <label className="admin-label">Description</label>
                  <input
                    className="admin-input"
                    value={newProduct.description}
                    onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  />
                </div>
                <div className="admin-field">
                  <label className="admin-label">Dietary</label>
                  <select
                    className="admin-select"
                    value={newProduct.dietary_classification}
                    onChange={(e) => setNewProduct({ ...newProduct, dietary_classification: e.target.value as any })}
                  >
                    <option>none</option>
                    <option>vegan</option>
                    <option>vegetarian</option>
                    <option>dairy_free</option>
                    <option>lactose_free</option>
                  </select>
                </div>
                <div className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={newProduct.available}
                    onChange={(e) => setNewProduct({ ...newProduct, available: e.target.checked })}
                  />
                  <label>Available</label>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <button onClick={createProduct} className="admin-btn">
                  Create product
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={`admin-view ${view === "sales" ? "admin-view--active" : ""}`}>
          <div className="admin-view__head">
            <div>
              <h2 className="admin-view__title">Sales</h2>
              <p className="admin-view__subtitle">Record sales, import CSV, view statistics.</p>
            </div>
          </div>

          {stats && (
            <div className="admin-stats">
              <div className="admin-stat">
                <p className="admin-stat__label">Total transactions</p>
                <p className="admin-stat__value">{stats.transactions}</p>
              </div>
              <div className="admin-stat">
                <p className="admin-stat__label">Total revenue</p>
                <p className="admin-stat__value">{stats.total_inr}</p>
              </div>
              <div className="admin-stat">
                <p className="admin-stat__label">Avg order value</p>
                <p className="admin-stat__value">{stats.total_cents > 0 ? money(Math.round(stats.total_cents / stats.transactions)) : "₹0.00"}</p>
              </div>
            </div>
          )}

          <div className="admin-card" style={{ marginBottom: 20 }}>
            <div className="admin-card__body">
              <h3 className="admin-card__title">Record sale</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
                <div className="admin-field">
                  <label className="admin-label">Product id</label>
                  <input
                    type="number"
                    className="admin-input"
                    value={newSale.product_id}
                    onChange={(e) => setNewSale({ ...newSale, product_id: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="admin-field">
                  <label className="admin-label">Quantity</label>
                  <input
                    type="number"
                    className="admin-input"
                    value={newSale.quantity}
                    onChange={(e) => setNewSale({ ...newSale, quantity: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="admin-field">
                  <label className="admin-label">Unit price (paise)</label>
                  <input
                    type="number"
                    className="admin-input"
                    value={newSale.unit_price_cents}
                    onChange={(e) => setNewSale({ ...newSale, unit_price_cents: Number(e.target.value) || 0 })}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button onClick={recordSale} className="admin-btn">
                    Record
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card__body">
              <h3 className="admin-card__title">Import sales (CSV)</h3>
              <p className="admin-label" style={{ marginBottom: 8 }}>Columns: product_id,quantity,unit_price_cents</p>
              <textarea
                className="admin-input admin-textarea"
                rows={4}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="product_id,quantity,unit_price_cents&#xA;1,2,9000&#xA;17,1,5000"
              />
              <button
                onClick={importCsv}
                className="admin-btn"
                disabled={!csvText.trim()}
              >
                Import
              </button>
              {importResult && (
                <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--m-surface)", border: "1px solid var(--m-border)", borderRadius: "var(--m-radius)" }}>
                  <p style={{ margin: "0 0 6px", fontSize: "12px", color: "var(--m-text-secondary)" }}>
                    Imported: <span style={{ fontWeight: "600" }}>{importResult.imported}</span>{" "}
                    Rejected:{" "}
                    <span style={{ fontWeight: "600", color: "var(--m-accent-soft)" }}>{importResult.rejected.length}</span>
                  </p>
                  {importResult.rejected.slice(0, 5).map((r) => (
                    <p key={r.row} style={{ margin: 0, fontSize: "11px", color: "var(--m-text-muted)" }}>
                      Row {r.row}: {r.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="admin-card" style={{ marginTop: 20 }}>
            <div className="admin-card__body">
              <h3 className="admin-card__title">Recent sales</h3>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Id</th>
                    <th style={{ textAlign: "right" }}>Revenue</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.slice(0, 10).map((s) => (
                    <tr key={s.id}>
                      <td>{s.id}</td>
                      <td style={{ textAlign: "right" }}>{s.total_inr}</td>
                      <td>{s.created_at}</td>
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: "center", color: "var(--m-text-muted)" }}>
                        No sales recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
