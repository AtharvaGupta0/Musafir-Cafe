import type { Product } from "../lib/api";

/** Display string for a product price. The backend already formats INR. */
function priceLabel(product: Product): string {
  return product.price_inr ?? `₹${(product.price_cents / 100).toFixed(2)}`;
}

/** "dairy_free" → "dairy free"; the kitchen's own classification only. */
function dietaryLabel(classification: string): string | null {
  const normalised = classification.trim().toLowerCase();
  if (!normalised || normalised === "none") return null;
  return normalised.replace(/_/g, " ");
}

export function ProductCard({ product }: { product: Product }) {
  const dietary = dietaryLabel(product.dietary_classification);
  const verifiedAllergens = product.allergens
    .filter((allergen) => allergen.verified)
    .map((allergen) => allergen.name);
  const hasUnverifiedAllergens = product.allergens.some((allergen) => !allergen.verified);

  return (
    <article className="product">
      <div className="product__top">
        <span className="product__category">{product.category ?? "Menu"}</span>
        <span className="product__price">{priceLabel(product)}</span>
      </div>
      <h3 className="product__name">{product.name}</h3>
      <p className="product__desc">{product.description}</p>
      <div className="product__tags">
        <span className={product.available ? "tag tag--available" : "tag tag--unavailable"}>
          {product.available ? "Available" : "Currently unavailable"}
        </span>
        {dietary && <span className="tag">{dietary}</span>}
        {verifiedAllergens.length > 0 && (
          <span className="tag tag--allergen">Contains: {verifiedAllergens.join(", ")}</span>
        )}
        {hasUnverifiedAllergens && (
          <span className="tag tag--uncertain">Allergen data unverified</span>
        )}
      </div>
    </article>
  );
}
