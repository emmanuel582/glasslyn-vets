# Complete Setup Guide — Wealth Clinic AI Voice Receptionist

This guide walks you through setting up the entire system end-to-end.

---

## Prerequisites

- **Node.js 18.10+** installed
- A **Retell AI** account (https://dashboard.retellai.com)
- A **Yeastar Cloud PBX** account (https://www.yeastar.com)
- A **WhatsApp** account on a phone (for WPP Connect)
- **ngrok** installed (for development/testing): https://ngrok.com

---

## Step 1: Backend Server Setup

### 1.1 Install Dependencies
```bash
cd vet-receptionist
npm install
```

### 1.2 Configure Environment
```bash
# Copy the example config
cp .env.example .env

# Edit .env with your actual values
# (see each section below for where to get the values)
```

### 1.3 Start Server
No need for ngrok since you are deploying on your VPS.

```bash
# Start the server directly
npm start
```

On first start, a **QR code** will appear in the terminal. Scan it with WhatsApp to link the device.

---

## Step 2: Retell AI Configuration

### 2.1 Create an Account
1. Go to https://dashboard.retellai.com
2. Sign up / log in
3. Navigate to **Settings > API Keys**
4. Copy your API key → paste into `.env` as `RETELL_API_KEY`

### 2.2 Create the Inbound Agent (Main Receptionist)

1. Go to **Agents** → **+ Create Agent**
2. Set **Agent Name**: `Wealth Clinic Receptionist`
3. Under **Response Engine**, select **Retell LLM**
4. Click **Create LLM** → paste the full system prompt from `retell-config/agent-prompt.md`
5. Choose a **Voice** — pick any warm, natural-sounding English voice
6. Set **Language**: English
7. Save the agent
8. Copy the **Agent ID** → paste into `.env` as `RETELL_AGENT_ID`

### 2.3 Create the Outbound Notification Agent

1. Go to **Agents** → **+ Create Agent**
2. Set **Agent Name**: `Vet Notification Agent`
3. Create a new LLM with the outbound prompt from `retell-config/functions.md` (bottom section)
4. Choose a clear, professional voice
5. Save the agent
6. Copy the **Agent ID** → paste into `.env` as `RETELL_OUTBOUND_AGENT_ID`

### 2.4 Add Custom Functions (Tools)

For the **Wealth Clinic Receptionist** agent:

1. Go to the agent → **Tools** tab
2. For each function in `retell-config/functions.md`:
   - Click **+ Add** → **Custom Function**
   - Enter the function name, description, and parameter schema exactly as documented
   - Set the URL to: `http://187.124.55.32:3000/retell/functions`
   - Method: POST
   - Header: `Content-Type: application/json`
3. Save each function

### 2.5 Set Up Event Webhooks

1. Go to the agent settings → **Webhook** section
2. Set **Webhook URL** to: `http://187.124.55.32:3000/retell/webhook` (This is the Fallback/Events webhook)
3. Enable events: `call_started`, `call_ended`, `call_analyzed`
4. Copy the **Webhook Secret** → paste into `.env` as `RETELL_WEBHOOK_SECRET`

### 2.6 Import/Purchase a Phone Number & Set Inbound Webhook

Because we use multi-clinic dynamic routing, you do NOT attach the agent directly to the number. Instead, you use an Inbound Webhook URL.

1. Go to **Phone Numbers** in the Retell dashboard
2. Either:
   - **Purchase** a new number
   - **Import** your existing number via SIP trunk (see Step 3)
3. Under the phone number settings, look for **Inbound Webhook URL**.
4. Set the Inbound Webhook URL to: `http://187.124.55.32:3000/retell/webhook/inbound`
   *(This webhook dynamically determines the clinic and returns the correct context)*
5. Note down the phone number (DID) and make sure it is added to your internal `clinics` database.
6. Copy the number → paste into `.env` as `RETELL_FROM_NUMBER` (used for outbound calls)

---

## Step 3: Yeastar Cloud PBX → Retell AI (SIP Trunk)

This connects your Yeastar PBX to Retell AI so inbound calls are handled by the AI.

### 3.1 Get Retell SIP Details

In the Retell dashboard:
1. Go to **Phone Numbers** → **Import Number** → **SIP Trunk**
2. Note the following details:
   - **SIP Server**: `sip.retellai.com`
   - **Authentication**: Username/password or IP-based
   - Get the specific credentials for your account

### 3.2 Configure SIP Trunk in Yeastar

1. Log in to your **Yeastar Cloud PBX** management portal
2. Go to **Settings** → **PBX** → **Trunks**
3. Click **Add**
4. Select **General** template (unless Retell appears in the certified list)
5. Configure:

| Setting | Value |
|---------|-------|
| **Trunk Type** | Register Trunk |
| **Hostname/IP** | `sip.retellai.com` |
| **Port** | `5060` (or as specified by Retell) |
| **Domain** | `sip.retellai.com` |
| **Username** | Your Retell SIP username |
| **Password** | Your Retell SIP password |
| **Transport** | UDP (or as specified) |

6. Click **Save** → **Apply**
7. Check the trunk status in **PBX Monitor** — it should show "Registered"

### 3.3 Create Inbound Route

1. Go to **Settings** → **Call Control** → **Inbound Routes**
2. Click **Add**
3. Configure:
   - **Name**: `AI Receptionist`
   - **Member Trunk**: Select the Retell SIP trunk you just created
   - **DID Pattern**: Your clinic's inbound number
   - **Destination**: The Retell trunk (this routes the call directly to Retell)
4. Save and Apply

### 3.4 Configure Time Conditions (Optional but Recommended)

Set up the AI to only handle calls outside business hours:

1. Go to **Settings** → **Call Control** → **Time Conditions**
2. Create a schedule for "Business Hours" (e.g., Mon-Fri 9am-6pm)
3. In your **Inbound Route**, set:
   - **During business hours** → Route to normal extensions/IVR
   - **Outside business hours** → Route to the Retell SIP trunk (AI receptionist)

---

## Step 4: WhatsApp (WPP Connect)

### 4.1 First-Time Setup

1. Start the server: `npm start`
2. A QR code will appear in the terminal
3. On your phone:
   - Open WhatsApp
   - Go to **Settings** → **Linked Devices** → **Link a Device**
   - Scan the QR code displayed in the terminal
4. The session is now authenticated

### 4.2 Important Notes

- The WhatsApp number used here is the number that sends messages to vets and callers
- This should ideally be a **dedicated phone/number** for the clinic (not the vet's personal WhatsApp)
- The session persists between server restarts (tokens are saved locally)
- If the session expires (e.g., phone disconnected from internet for too long), you'll need to scan the QR code again

---

## Step 5: Final Configuration

### 5.1 Complete the .env File

Make sure ALL values are filled in:

```bash
# Your completed .env should look like:
RETELL_API_KEY=key_abc123...
RETELL_AGENT_ID=agent_xyz789...
RETELL_OUTBOUND_AGENT_ID=agent_out456...
RETELL_FROM_NUMBER=+353871234567
RETELL_WEBHOOK_SECRET=whsec_...

WPP_SESSION_NAME=wealth-clinic

PRIMARY_VET_NAME=Dr. Smith
PRIMARY_VET_PHONE=353871111111
SECONDARY_VET_NAME=Dr. Jones
SECONDARY_VET_PHONE=353872222222

PORT=3000
BASE_URL=https://your-production-url.com

CLINIC_NAME=Wealth Clinic
CLINIC_PHONE=+353871234567

ESCALATION_TIMEOUT_MINUTES=15
```

### 5.2 Test the Full Flow

1. **Health Check**: Visit `https://YOUR_URL/health` — should show status: ok
2. **Test Call**: Call your clinic number from a phone
3. The AI should answer and walk through the conversation
4. For an urgent case: the vet should receive a call + WhatsApp message
5. Vet replies "1" on WhatsApp → Caller gets a WhatsApp notification
6. Test "3" (reject) → should escalate to secondary vet
7. Test no response → should auto-escalate after 15 minutes

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| QR code not appearing | Make sure no other WPP session exists. Delete the `tokens/` folder and restart |
| Retell webhooks not firing | Ensure your BASE_URL is publicly accessible (use ngrok for dev) |
| SIP trunk not registering | Check credentials and firewall. Yeastar needs outbound UDP/5060 |
| Outbound call failing | Ensure RETELL_FROM_NUMBER is imported in Retell and KYC is completed |
| WhatsApp messages not sending | Check that the phone number format is correct (country code, no +) |
| "Database not initialised" error | The `data/` directory might not be writable. Check permissions |

---

## Production Deployment

For production, consider:

1. **Use a process manager**: PM2 (`pm2 start src/index.js --name vet-receptionist`)
2. **Use a real domain** with SSL (not ngrok)
3. **Set up monitoring**: Use the health endpoint with an uptime monitor
4. **Database backups**: Regular backups of `data/clinic.db`
5. **GDPR**: Implement data retention policies and provide data access/deletion endpoints
6. **Logs**: Monitor `logs/error.log` for issues
