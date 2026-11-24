/**
 * scripts/make-repo-db.js
 *
 * Builds a SQLite database file at the repository root from the ChatBot
 * schema and seed SQL files. The resulting cafe-musafir.db contains the
 * full cafe menu (categories, products, ingredients, allergens) plus seed
 * sales transactions, and can be shared by the chatbot and website teams.
 *
 * Usage (from ChatBot/): node scripts/make-repo-db.js
 */

const fs = require("fs");
const path = require("path");

async function main() {
  // Dynamically import sql.js (ESM) from the ChatBot node_modules.
  const sqljs = await import("sql.js");
  const init = sqljs.default || sqljs;
  const { Database } = await init();
  const db = new Database();

  const chatbot = path.resolve(__dirname, "..");
  const schema = fs.readFileSync(path.join(chatbot, "db", "schema.sql"), "utf8");
  const seed = fs.readFileSync(
    path.join(chatbot, "db", "seeds", "seed.sql"),
    "utf8"
  );

  db.exec(schema);
  db.exec(seed);

  const repoRoot = path.resolve(chatbot, "..");
  const out = path.join(repoRoot, "cafe-musafir.db");

  const data = db.export();
  fs.writeFileSync(out, Buffer.from(data));

  const catCount = db
    .prepare("SELECT COUNT(*) AS c FROM categories")
    .getAsObject();
  const prodCount = db.prepare("SELECT COUNT(*) AS c FROM products").getAsObject();

  console.log(`Seeded repository database -> ${out}`);
  console.log(
    `Schema: ${catCount.c} categories, ${prodCount.c} products (plus ingredients, allergens, and seed sales).`
  );

  db.close();
}

main().catch((err) => {
  console.error("make-repo-db failed:", err);
  process.exit(1);
});
