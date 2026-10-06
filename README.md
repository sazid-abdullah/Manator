# Manator

Personal tuition manager: students, daily lesson log, fee contracts, money tracking, and free AI for lesson plans and exams.

- **Students** – class, board, subjects, guardian contact, weekly schedule.
- **Classes** – log what you taught each day, homework, attendance (taught / absent / cancelled).
- **Contracts** – a fee every N days, N months, or N classes, paid in advance or after the cycle. Shows what's due, overdue, and paid.
- **Money** – payments, expenses, monthly income/net, who owes you, CSV export.
- **AI** – lesson plans, exam papers (with separate answer key) and worksheets using free providers: Google Gemini, Groq, OpenRouter free models, or local Ollama. Only class/subject/topics are sent; names, phone numbers and money never leave the device.
- **Backup** – everything lives in your browser (`localStorage`). Download a backup file regularly and restore it on another device.

## Run

It's a static site with no build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or enable GitHub Pages on `main` and open it on your phone; it can be installed as an app (PWA) and works offline (AI needs internet unless you use Ollama).

## AI keys

Settings → AI provider. Free keys: [Gemini](https://aistudio.google.com/apikey), [Groq](https://console.groq.com/keys), [OpenRouter](https://openrouter.ai/keys). Keys are stored only in your browser and are left out of backups unless you tick "Include AI keys".
