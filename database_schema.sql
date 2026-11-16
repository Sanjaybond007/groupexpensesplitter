-- Applied by server.js at startup.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  currency TEXT NOT NULL,
  payer_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  expense_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(length(trim(description)) > 0),
  CHECK(length(trim(currency)) > 0),
  CHECK(length(trim(category)) > 0)
);

CREATE TABLE IF NOT EXISTS expense_shares (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
  PRIMARY KEY(expense_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_payer ON expenses(payer_id);
CREATE INDEX IF NOT EXISTS idx_shares_participant ON expense_shares(participant_id);
