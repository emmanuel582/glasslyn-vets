# Glasslyn Vets — AI Voice Receptionist

An AI-powered out-of-hours voice receptionist for veterinary clinics. Handles inbound calls, collects caller details, triages urgency, and escalates urgent cases to on-call vets via voice call and WhatsApp.

## Architecture

```
Caller → Yeastar Cloud PBX → Retell AI Agent → Backend Server → WhatsApp (WPP Connect)
                                                      ↓
                                                  SQLite DB
```

### How It Works

1. **Caller dials clinic number** → Yeastar PBX forwards to Retell AI via SIP trunk
2. **Retell AI agent** answers with a natural voice, greets the caller
3. **Agent checks database** for existing callers (via `lookup_caller` function)
4. **Agent collects details**: name, phone, Eircode, issue description
5. **Agent runs triage**: determines if case is urgent or non-urgent
6. **If urgent**:
   - Outbound call to primary vet: "Check your WhatsApp"
   - WhatsApp message to vet with full case details + response options
   - 15-minute failover timer starts
   - Vet replies 1 (accept <1hr), 2 (accept >1hr), or 3 (reject)
   - Caller receives WhatsApp notification with vet ETA
   - If vet rejects or doesn't respond → auto-escalate to secondary vet
7. **If non-urgent**: Case logged for clinic follow-up

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Voice AI | Retell AI |
| PBX/SIP | Yeastar Cloud PBX |
| WhatsApp | WPP Connect |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |

## Quick Start

```bash
# 1. Install dependencies
cd vet-receptionist
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your values

# 3. Start with ngrok (development)
ngrok http 3000  # In a separate terminal

# 4. Start the server
npm start
# Scan the WhatsApp QR code when it appears
```

For full setup instructions (including Retell AI, Yeastar PBX, and WhatsApp configuration), see: **[retell-config/setup-guide.md](retell-config/setup-guide.md)**

## Project Structure

```
vet-receptionist/
├── .env.example              # Environment config template
├── package.json              # Dependencies
├── src/
│   ├── index.js              # Main entry point
│   ├── config.js             # Config loader
│   ├── database.js           # SQLite schema + queries
│   ├── routes/
│   │   ├── retellWebhook.js  # Retell call event webhooks
│   │   ├── retellFunctions.js # Custom function handlers
│   │   └── whatsappWebhook.js # WhatsApp message handler
│   ├── services/
│   │   ├── retellService.js  # Retell API (outbound calls)
│   │   ├── whatsappService.js # WPP Connect client
│   │   ├── escalationService.js # Vet notification + failover
│   │   ├── triageService.js  # Urgency classification
│   │   └── caseService.js    # Case management
│   └── utils/
│       ├── logger.js         # Winston logger
│       └── helpers.js        # Phone formatting, utilities
├── retell-config/
│   ├── agent-prompt.md       # Retell AI system prompt
│   ├── functions.md          # Custom function definitions
│   └── setup-guide.md        # Full setup walkthrough
├── data/                     # SQLite database (auto-created)
└── logs/                     # Application logs (auto-created)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check + WhatsApp status |
| `POST` | `/retell/webhook` | Retell call lifecycle events |
| `POST` | `/retell/functions` | Retell custom function calls |
| `POST` | `/whatsapp/webhook` | WhatsApp incoming messages |

## Escalation Flow

```
Urgent Case Detected
       │
       ▼
Call Primary Vet ──→ Send WhatsApp to Primary Vet
       │                      │
       │              Start 15-min Timer
       │                      │
       ▼                      ▼
  Vet Response?          Timer Expires?
       │                      │
   ┌───┴───┐                  │
   │       │                  │
Accept  Reject ───────────────┤
   │                          │
   ▼                          ▼
Notify Caller          Escalate to Secondary Vet
(WhatsApp ETA)              (Repeat flow)
```

## Configuration

See `.env.example` for all required environment variables. Key configurations:

- **RETELL_API_KEY** — From Retell dashboard
- **RETELL_AGENT_ID** — Inbound receptionist agent
- **RETELL_OUTBOUND_AGENT_ID** — Outbound vet notification agent
- **PRIMARY/SECONDARY_VET_PHONE** — On-call vet numbers
- **BASE_URL** — Public URL for webhooks

## GDPR Notes

- All data stored in local SQLite database
- Audit log tracks all events for compliance
- No data sent to third parties except Retell AI (for voice) and WhatsApp (for messaging)
- Deploy on EU-based infrastructure (Ireland recommended)
- Implement data retention policies as needed

## License

Private — Glasslyn Vets
