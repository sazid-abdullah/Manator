# Manator

Personal tuition manager: students, daily lesson log, fee contracts, money tracking, and free AI for lesson plans and exams.

- **Students** – class, board, subjects, guardian contact, weekly schedule.
- **Classes** – log what you taught each day, homework, attendance (taught / absent / cancelled).
- **Contracts** – a fee every N days, N months, or N classes, paid in advance or after the cycle. Shows what's due, overdue, and paid.
- **Money** – payments, expenses, monthly income/net, who owes you, CSV export, savings goals (how much to save per month for a big purchase) and an optional AI money advisor that only sees totals, never names.
- **AI** – lesson plans, exam papers (with separate answer key) and worksheets using free providers (or import papers you wrote in Word .docx / text): Google Gemini, Groq, OpenRouter free models, or local Ollama. Only class/subject/topics are sent; names, phone numbers and money never leave the device.
  - Exam papers can follow the Bangladesh board pattern: creative questions (stimulus + ক/খ/গ/ঘ, or ক2 খ4 গ4 for maths) and board-style MCQ, with exact marks.
  - Attach a past paper or textbook pages (PDF, photo, Word or text) so the AI writes similar new questions, or teaches only from that material. Gemini reads PDFs and photos directly (including scans); other providers get the PDF's text.
  - A second AI pass checks the answers and lists possible problems; "Fix these problems" or the change box revises the paper without starting over.
- **Exam mode** – press **Start exam** on any exam paper (AI-made or imported) to run it on this device: countdown timer, tap-to-answer MCQs, answer boxes for creative and written questions, and automatic submission when time runs out. MCQs are marked automatically; you mark written answers (with optional AI suggestions). Results are saved per student. The paper is turned into an on-screen exam with one AI call; after that the exam works offline.
- **Backup** – everything lives in your browser (`localStorage`). Download a backup file regularly and restore it on another device.

## Run

It's a static site with no build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or enable GitHub Pages on `main` and open it on your phone; it can be installed as an app (PWA) and works offline (AI needs internet unless you use Ollama).

Opened this way, each tutor pastes their own free AI key (below).

## Server: accounts, AI credits and Pro

`server/` is an optional Node server (Node 22.13+, no npm packages) that serves the same app and adds accounts and paid AI:

```bash
GEMINI_API_KEY=... npm start   # http://localhost:8787
```

- **Accounts** – email + password sign-up (scrypt hashes, HTTP-only session cookie). Students, classes and money still stay in the browser; the account only holds AI credits and Pro.
- **AI on the server** – the server holds the Gemini/Groq/OpenRouter keys, picks a working model with fallback, and charges 1 credit per request (refunded if it fails). Pro users (and admins given the right) are unlimited.
- **Free credits** – 3 for new accounts, +1 per watched ad (minimum watch time and a daily cap are checked by the server).
- **Pro** – ৳149/month or ৳1,199/year through SSLCommerz (bKash, Nagad, Rocket, cards), confirmed with SSLCommerz's validation API before Pro is granted. The gateway starts **Off** (Pro not on sale). "Test mode" uses a local fake payment page where anyone gets Pro free, so only use it for trying things out.
- **Owner and admins** – only `OWNER_EMAIL` (default `abdullahsazid109@gmail.com`) is the owner. Until that account is the owner, signing up or signing in with it needs the one-time setup code the server prints at start-up (or `OWNER_SETUP_CODE`), so nobody else can claim it. The owner's Admin page has prices, credits, ads, gateway, AI keys, users and payments, and lets the owner make other accounts admins with chosen rights: see users, give credits or Pro, see payments, edit prices and free credits, edit the gateway, edit AI keys, unlimited AI.

Environment: `PORT` (8787), `DATA_DIR` (`./data`, SQLite), `PUBLIC_URL` (needed behind a proxy for SSLCommerz callbacks), `OWNER_EMAIL`, `OWNER_SETUP_CODE`, `TRUST_PROXY` (number of proxies in front of the server, e.g. `1`, or `2` for a CDN plus a proxy; forwarded headers are then trusted only from loopback/private addresses), `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASS`. These win over the same keys saved on the Admin page.

## AI keys

Settings → AI provider. Free keys: [Gemini](https://aistudio.google.com/apikey), [Groq](https://console.groq.com/keys), [OpenRouter](https://openrouter.ai/keys). Keys are stored only in your browser and are left out of backups unless you tick "Include AI keys".
