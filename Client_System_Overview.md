# Technical System Architecture — Glasslyn Vets Receptionist

## 1. System Overview
The Glasslyn Vets AI Receptionist is a Node.js-based telephony and messaging application designed to handle out-of-hours veterinary emergencies autonomously. The architecture connects the clinic's local PBX system to an LLM-driven voice agent, persists data locally, and orchestrates an automated WhatsApp escalation matrix to on-call veterinarians. 

This document serves as a technical reference to traverse the codebase, understand the integrations, and review the failover logic in place.

---

## 2. Infrastructure & Hosting Environment
* **Server**: Deployed on an external Virtual Private Server (VPS). 
* **Process Manager**: Managed via PM2, ensuring the application runtime (`node src/server.js`) stays alive across software crashes and server hardware reboots.
* **Backend Stack**: Node.js serving Express.js. This provides the RESTful API endpoints and webhook receivers for the frontend and Retell.
* **Frontend Stack**: Vanilla JavaScript (`app.js`), HTML, and CSS (utilizing a Glassmorphism design pattern). Served statically via Express.
* **Database**: `better-sqlite3` running completely locally on the server. The database is initialized in WAL (Write-Ahead Logging) mode to optimize performance, allowing concurrent read/write operations without locking the database during simultaneous live phone calls.

---

## 3. Telephony Routing Mechanism
The entry point of the system relies on the clinic's physical telephony hardware.
* **Yeastar PBX**: The clinic’s on-premises routing system.
* **Route Condition**: When the time constraint equals "out-of-hours", the Yeastar system is configured to route the inbound call audio over a SIP Trunk.
* **SIP Trunk to API**: The SIP Trunk forwards the raw audio stream directly to the Retell AI servers over an IP protocol, initiating the LLM response loop.

---

## 4. Retell AI Integration
Retell AI acts as the system's phonetic engine and conversational LLM layer. It is split into two distinct agents.

### A. The Inbound Agent (Conversational)
Handles live incoming calls. When the LLM reaches decision milestones, it utilizes **Custom API Functions**. It halts generation, sends a JSON payload to our backend via HTTP POST (`/retell/functions`), awaits our JSON response, and resumes conversation dynamically based on the returned values.
* `lookup_caller`: Backend queries `SELECT * FROM callers WHERE phone = ?`. Returns `{"found": boolean}`.
* `save_case_details`: Inserts the parsed symptom payload into the SQLite `cases` table. Returns `{"case_id": string}`.
* `determine_urgency`: Executes triage string-matching/logic on the `issue_description`. Returns `{"urgency": "urgent" | "non_urgent"}`.
* `log_non_urgent_case`: Updates DB status to `logged`. Triggers a standard WhatsApp confirmation payload to the caller's phone.
* `trigger_escalation`: Escalates the case to the primary vet and initiates the outbound notification script below.

### B. The Outbound Notification Agent (Scripted)
A separate Retell Agent triggered purely via a backend REST API call when `trigger_escalation` resolves.
* **Mechanics**: Our Node server sends a POST request to Retell's outbound endpoint containing dynamic variable bindings: `{{vet_name}}` and `{{case_id}}`.
* **AMD (Answering Machine Detection)**: Retell utilizes background processing to distinguish between a human vocal waveform and a voicemail beep, ensuring the message is properly recorded if unanswered.
* **Strict Constraints**: The agent has a static system prompt. It delivers a hardcoded script (*"You have an urgent case, check WhatsApp"*). It is constrained to negate open dialogue; if the vet asks medical questions, the agent terminates the call.

---

## 5. WhatsApp Integration Engine (WPPConnect)
Because official WhatsApp API limits enforce strict 24-hour messaging windows, require manual template approvals, and charge per-conversation, this system instead utilizes a headless browser workaround to directly control the clinic's actual WhatsApp account.

### Implementation Details (`whatsappService.js`)
* **Library**: `@wppconnect-team/wppconnect`. An *unofficial* library that orchestrates WhatsApp Web via Puppeteer.
* **Headless Architecture**: The VPS boots a hidden instance of Google Chrome. Command-line arguments (`headless: true`, `--no-sandbox`, `--disable-setuid-sandbox`) are passed to bypass strict VPS user-permission limitations.
* **Authentication Matrix**: On the first instance startup, WPPConnect prints an ASCII QR code directly into the physical VPS terminal. The clinic manager views the PM2 logs and scans this once via their phone to establish a persistent session token on the server.
* **Inbound Listener**: The service uses `wppClient.onMessage((message) => {...})` to intercept all incoming texts. The Node application parses incoming string values strictly looking for `'1'`, `'2'`, or `'3'` from valid numbers to execute state changes on active cases.

---

## 6. Resilience, Error Control, and Failover Architecture
To ensure zero drop-off during critical medical emergencies, strict fail-safes are actively enforced within the Node.js event loop.

### A. The 15-Minute Watchdog (Failover Automation)
When an emergency case escalates, `escalationService.js` initializes a native Node.js `setTimeout` block scoped precisely to 900,000 milliseconds (15 minutes), mapped in memory to the `case_id`. 
* **If the Vet replies (1 or 2)**: The memory timeout is forcefully aborted via `clearTimeout()`.
* **If the timer expires OR the Vet replies (3) Reject**: The block executes. It pushes a cancellation notice to the primary vet, queries the `vets` SQLite table for the array object with `level_order + 1`, and re-triggers the entire Outbound Call & WhatsApp dispatch script concurrently for the secondary target.

### B. Exception Catching & Session Recovery
* **WPPConnect Event States**: The library monitors its WebSocket connection to Facebook. If `client.onStateChange` detects `CONFLICT` (caused by a user opening WhatsApp Web concurrently on another PC), it programmatically invokes `client.useHere()` to forcefully steal the token session back. If `UNPAIRED`, it throws a fatal error log demanding a new QR scan.
* **Asynchronous Error Wrapping**: Every unhandled API outbound request (WhatsApp dispatches or Retell pings) is wrapped in asynchronous `try/catch` handlers. 
* **Audit Trail Logic**: The codebase rejects silent failures. Exceptions are explicitly caught, serialized, and inserted into the SQLite `audit_log` table (e.g., `EVENT_TYPE: 'whatsapp_send_failed'`, `DATA: { error: 'socket timeout' }`). This ensures any delivery failures have a permanent paper trail.

---

## 7. The Frontend Client (`public/app.js`)
The staff-facing monitoring dashboard is designed as a stateless client layer communicating entirely with the backend APIs.

* **DOM Polling Loop**: Maintaining WebSocket connections for simple dashboard updates introduces unnecessary overhead. Instead, the UI relies on a lightweight polling standard. `Window.setInterval` executes a `fetch()` call hitting `/api/cases`, `/api/logs`, and `/api/callers` every 15000ms.
* **Client-Side Rendering**: The HTML `casesTable` and `logsTable` bodies are cleared and recompiled dynamically utilizing string interpolation. 
* **REST CRUD Execution**: Managing the on-call schedule interacts with standard REST verbs. Requesting an edit on a vet triggers a `PUT /api/vets/:id` command. The backend intercepts this, updates the SQLite `vets` table index, instantly rewiring the failover queue for the next emergency.
