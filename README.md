# Group Expense Splitter — Full Project

A Node.js + Express + SQLite application for tracking group expenses. Equal split is the default, individual shares can be edited, and users can export only selected fields.

## Requirements
- Node.js 18+
- npm

## Setup
```bash
npm install
npm start
```
Open http://localhost:3000

The SQLite database is created automatically at `database/expenses.db` on first start. No sample/demo records are inserted.

## Features
- Create, rename, and delete participants (deletion is blocked if they are used by saved expenses).
- Add, edit, and delete expenses.
- Choose payer, currency, category, date, and participants who share an expense.
- Equal split by default; override any individual share.
- Validate that shares sum exactly to the total using integer minor units.
- Calculate balances and suggested settlements independently for each currency.
- Export selected fields as CSV or JSON; PDF is generated through the browser print dialog.
- Persistent SQLite storage and a responsive interface.

## Export
Click **Customize download**, choose CSV, JSON, or PDF, select only the fields needed, then download. PDF opens a print-ready report; use the browser's **Save as PDF** option.

## API overview
- `GET /api/participants`
- `POST /api/participants`
- `DELETE /api/participants/:id`
- `GET /api/expenses`
- `POST /api/expenses`
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`
- `GET /api/summary`
- `POST /api/export`

## Notes
- Amounts are stored as integer minor units to reduce floating-point rounding issues.
- The app does not use a currency conversion service. Different currencies are never combined into a single balance.
- No authentication is included; run locally or add authentication before exposing it to a network.
"# groupexpensesplitter" 
