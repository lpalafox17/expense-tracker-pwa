# Expense Tracker – AI Personal Finance Assistant

A mobile-friendly progressive web app (PWA) for tracking spending, with an AI assistant that answers questions about your money and takes actions for you, plus receipt scanning powered by computer vision.

Built with **Next.js, TypeScript, Supabase, and Azure OpenAI** (via Azure AI Foundry), deployed on **Vercel**.


---

## Features

**Money tracking**
- Log expenses and income by hand or from a receipt photo
- Monthly budgets by category, with usage tracking
- Savings goals with progress
- Subscriptions and recurring bills, with recurring transactions created automatically on their due dates
- Dashboard with available balance, top categories, daily spending, average daily spend, and end-of-month outlook
- Installable on a phone home screen as a PWA

**AI assistant (agentic)**
- Answers questions in plain language ("How much did I spend on dining this month vs. last month?")
- Grounded in the user's own data: the server builds a JSON summary of totals, top categories, budget usage, goals, and subscriptions, and the model is instructed to use only that context and not invent numbers
- Returns structured actions the app can carry out:
  - `create_transaction`: "Spent $18 on Starbucks today"
  - `update_transaction`: "Change Marcos Tacos on Feb 2 to Dining"
  - `list_transactions`: "Show all dining expenses last month"
  - `propose_budgets`: "Make a budget for next month"
  - `create_goal`: "Save $500 by June"
- **Human in the loop:** every action is shown as a preview, and nothing is saved until the user confirms
- Detects likely subscriptions from repeated charges across 3+ months and recommends which subscriptions and expenses to cut

**Receipt scanning (computer vision + vision LLM)**
1. Capture a receipt with the phone's rear camera
2. Client-side preprocessing auto-crops the receipt using edge detection
3. An Azure OpenAI vision model extracts merchant, date, total, tax, tip, and category as strict JSON, with a confidence score for each key field
4. Results pre-fill the "Add transaction" form for review

More detail: [`docs/receipt-scan-cv.md`](docs/receipt-scan-cv.md)

---

## Architecture

```
Next.js (App Router, React, Tailwind)
   │
   ├── Client pages: dashboard, transactions, budgets, goals,
   │   income, subscriptions, settings
   │
   ├── API routes (server)
   │     /api/ai                 → builds data context → Azure OpenAI → JSON {answer, suggestions, action}
   │     /api/ai/subscriptions   → recurring-charge detection
   │     /api/receipt            → image → Azure OpenAI vision → JSON receipt fields
   │
   └── Supabase (Postgres + Auth)
         transactions, budgets, goals, subscriptions,
         recurring_bills, paychecks, balances
```

## Tech stack

| Area | Tools |
|---|---|
| Front end | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Back end | Next.js API routes |
| Data & auth | Supabase (PostgreSQL + Auth) |
| AI | Azure AI Foundry / Azure OpenAI (chat + vision) |
| Hosting | Vercel |

---

## Running locally

```bash
npm install
npm run dev
```

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AZURE_FOUNDRY_RESPONSES_URL=
AZURE_FOUNDRY_API_KEY=
NEXT_PUBLIC_SHOW_CV_DEBUG=false
```

Then open http://localhost:3000.

## Status

Personal project. The live deployment is currently offline; the code runs locally with your own Supabase project and Azure OpenAI deployment.
