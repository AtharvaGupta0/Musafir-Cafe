import type { Product } from "../lib/api";
import { ProductCard } from "./ProductCard";

interface MessageBubbleProps {
  role: "customer" | "assistant";
  content: string;
  products?: Product[];
}

export function MessageBubble({ role, content, products }: MessageBubbleProps) {
  const isCustomer = role === "customer";

  return (
    <article className={`turn turn--${role}`}>
      <p className="turn__meta">{isCustomer ? "You" : "Musafir"}</p>
      <div className="bubble">{content}</div>
      {products && products.length > 0 && (
        <div className="products">
          <p className="products__label">Related menu items</p>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </article>
  );
}
