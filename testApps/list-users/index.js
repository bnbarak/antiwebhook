/**
 * simplehook list-users — CLI to list all users from the database
 *
 * Usage:
 *   DATABASE_URL=postgres://... node index.js
 */

import pg from "pg";
import chalk from "chalk";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(chalk.red("DATABASE_URL is required"));
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();

  const { rows } = await client.query(
    `SELECT id, name, email, created_at
     FROM users
     ORDER BY created_at DESC`
  );

  if (rows.length === 0) {
    console.log(chalk.yellow("No users found."));
    process.exit(0);
  }

  // Column widths
  const cols = { id: 8, name: 20, email: 30, created: 20 };

  function pad(str, len) {
    if (str.length >= len) return str.slice(0, len);
    return str + " ".repeat(len - str.length);
  }

  const sep = chalk.dim("-".repeat(cols.id + cols.name + cols.email + cols.created + 9));

  console.log();
  console.log(chalk.bold(`  ${rows.length} user${rows.length !== 1 ? "s" : ""}`));
  console.log(`  ${sep}`);
  console.log(
    `  ${chalk.bold(pad("ID", cols.id))} ${chalk.bold(pad("Name", cols.name))} ${chalk.bold(pad("Email", cols.email))} ${chalk.bold(pad("Created", cols.created))}`
  );
  console.log(`  ${sep}`);

  for (const row of rows) {
    const id = row.id.slice(0, cols.id);
    const name = row.name || "";
    const email = row.email;
    const created = new Date(row.created_at).toISOString().replace("T", " ").slice(0, 19);

    console.log(
      `  ${chalk.dim(pad(id, cols.id))} ${chalk.white(pad(name, cols.name))} ${chalk.cyan(pad(email, cols.email))} ${chalk.dim(pad(created, cols.created))}`
    );
  }

  console.log(`  ${sep}`);
  console.log();
} catch (err) {
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
} finally {
  await client.end();
}
