# Retell AI — Custom Function Definitions

These functions must be created in the Retell dashboard under your agent's **Tools** section.

For **each function** below:
1. Go to your agent in the Retell Dashboard
2. Click **Tools** → **+ Add** → **Custom Function**
3. Fill in the details as specified below
4. Set the **URL** to your backend endpoint

> **All functions use the same endpoint URL:**
> `POST https://YOUR_BASE_URL/retell/functions`
>
> Replace `YOUR_BASE_URL` with your actual server URL (e.g., ngrok URL for development).

---

## Function 1: lookup_caller

| Field | Value |
|-------|-------|
| **Name** | `lookup_caller` |
| **Description** | Look up the caller's phone number in the database to check if they are a known client. Call this at the start of every call. |
| **URL** | `http://187.124.55.32:3000/retell/functions` |
| **Method** | POST |
| **Headers** | Content-Type: application/json |

### Parameters (JSON Schema)
```json
{
  "type": "object",
  "properties": {
    "phone": {
      "type": "string",
      "description": "The caller's phone number from the call metadata"
    }
  },
  "required": ["phone"]
}
```

### Expected Response
```json
{
  "result": "{\"found\": true, \"name\": \"John Murphy\", \"eircode\": \"D02 XY45\"}"
}
```

---

## Function 2: save_case_details

| Field | Value |
|-------|-------|
| **Name** | `save_case_details` |
| **Description** | Save the caller's details and pet issue to create a new case. Call this after collecting and confirming all required information from the caller. |
| **URL** | `http://187.124.55.32:3000/retell/functions` |
| **Method** | POST |
| **Headers** | Content-Type: application/json |

### Parameters (JSON Schema)
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Caller's full name"
    },
    "phone": {
      "type": "string",
      "description": "The phone number the caller is calling FROM (the calling number)"
    },
    "whatsapp_number": {
      "type": "string",
      "description": "The caller's WhatsApp phone number. If the caller confirmed their calling number IS their WhatsApp, pass the same number. If they provided a DIFFERENT WhatsApp number, pass that number here. Always pass the actual digits, never a placeholder."
    },
    "eircode": {
      "type": "string",
      "description": "Caller's Eircode or address"
    },
    "issue_description": {
      "type": "string",
      "description": "Detailed description of the pet's issue as described by the caller"
    },
    "clinic_id": {
      "type": "string",
      "description": "The clinic ID from the dynamic variable {{clinic_id}}. Always pass {{clinic_id}} here."
    }
  },
  "required": ["name", "phone", "whatsapp_number", "issue_description", "clinic_id"]
}
```

### Expected Response
```json
{
  "result": "{\"case_id\": \"WC-20260409-A3F2\", \"status\": \"open\", \"message\": \"Case WC-20260409-A3F2 has been created successfully.\"}"
}
```

---

## Function 3: determine_urgency

| Field | Value |
|-------|-------|
| **Name** | `determine_urgency` |
| **Description** | Analyse the pet's issue to determine if it is urgent (requires immediate vet attention) or non-urgent (can wait until clinic reopens). Call this after saving the case details. |
| **URL** | `http://187.124.55.32:3000/retell/functions` |
| **Method** | POST |
| **Headers** | Content-Type: application/json |

### Parameters (JSON Schema)
```json
{
  "type": "object",
  "properties": {
    "issue_description": {
      "type": "string",
      "description": "The description of the pet's issue"
    },
    "case_id": {
      "type": "string",
      "description": "The case ID returned from save_case_details"
    }
  },
  "required": ["issue_description"]
}
```

### Expected Response
```json
{
  "result": "{\"urgency\": \"urgent\", \"reason\": \"Urgent indicators detected: bleeding, vomiting blood\"}"
}
```

---

## Function 4: trigger_escalation

| Field | Value |
|-------|-------|
| **Name** | `trigger_escalation` |
| **Description** | Trigger the vet escalation workflow for an urgent case. This will call the on-call vet and send them a WhatsApp message with the case details. Call this only when the urgency is determined to be 'urgent'. |
| **URL** | `http://187.124.55.32:3000/retell/functions` |
| **Method** | POST |
| **Headers** | Content-Type: application/json |

### Parameters (JSON Schema)
```json
{
  "type": "object",
  "properties": {
    "case_id": {
      "type": "string",
      "description": "The case ID to escalate"
    }
  },
  "required": ["case_id"]
}
```

### Expected Response
```json
{
  "result": "{\"status\": \"escalating\", \"message\": \"The on-call veterinarian is being contacted now.\"}"
}
```

---

## Function 5: log_non_urgent_case

| Field | Value |
|-------|-------|
| **Name** | `log_non_urgent_case` |
| **Description** | Log a non-urgent case for clinic follow-up when they reopen. The caller will receive a WhatsApp confirmation. Call this when the case is non-urgent and the caller wants to log it. |
| **URL** | `http://187.124.55.32:3000/retell/functions` |
| **Method** | POST |
| **Headers** | Content-Type: application/json |

### Parameters (JSON Schema)
```json
{
  "type": "object",
  "properties": {
    "case_id": {
      "type": "string",
      "description": "The case ID to log for follow-up"
    }
  },
  "required": ["case_id"]
}
```

### Expected Response
```json
{
  "result": "{\"status\": \"logged\", \"message\": \"Your case has been logged. The clinic will follow up when they reopen.\"}"
}
```
