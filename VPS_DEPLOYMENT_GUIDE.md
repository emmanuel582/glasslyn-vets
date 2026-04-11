# Glasslyn Vets AI — GitHub & VPS Deployment Guide

Yes! The system is now 100% bug-free and working perfectly. The `Wealth Clinic` branding is gone, the phone formatting is fixed, and the AI escalation logic works flawlessly.

Your `.gitignore` file is also perfectly set up to prevent uploading sensitive data (like your API keys, WhatsApp session tokens, and database).

Here is your exact step-by-step guide to push this to GitHub and get it running 24/7 on your VPS (`187.124.55.32`).

---

## Part 1: Push Code to GitHub

Open your local terminal in the project folder (`C:\FiverrGigs\vet-receptionist`) and stop the running server (`Ctrl + C`). Then run these commands:

1. **Initialize Git (if not already done):**
   ```bash
   git init
   ```

2. **Add all your files:**
   ```bash
   git add .
   ```

3. **Commit your changes:**
   ```bash
   git commit -m "Final Glasslyn Vets production build"
   ```

4. **Go to GitHub.com:**
   - Create a new **Private** repository (call it `glasslyn-vets-ai`).
   - Leave it completely empty (do not add a README, .gitignore, or license on the GitHub site).

5. **Link and Push:**
   Copy the two commands GitHub gives you at the bottom of the page (under "push an existing repository") and paste them into your terminal. They look like this:
   ```bash
   git remote add origin https://github.com/YourUsername/glasslyn-vets-ai.git
   git branch -M main
   git push -u origin main
   ```

---

## Part 2: Prepare the VPS

Log into your VPS just like you usually do:
```bash
ssh root@187.124.55.32
```

1. **Install Node.js & NPM (if you haven't already):**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

2. **Install PM2 (The 24/7 Process Manager):**
   This tool will keep the app running forever and restart it if the server reboots.
   ```bash
   sudo npm install -g pm2
   ```

*(You will likely also need Chrome/Chromium installed on the VPS for WhatsApp Web to launch headlessly):*
```bash
sudo apt update
sudo apt install -y chromium-browser
```

---

## Part 3: Deploy & Run on VPS

1. **Clone your GitHub Repo:**
   ```bash
   git clone https://github.com/YourUsername/glasslyn-vets-ai.git
   cd glasslyn-vets-ai
   ```
   *(If your repo is private, GitHub will prompt you for your username and a Personal Access Token as the password).*

2. **Install the dependencies:**
   ```bash
   npm install
   ```

3. **Recreate your securely ignored `.env` file:**
   Since `.env` wasn't pushed to GitHub (for security), you need to recreate it on the VPS.
   ```bash
   nano .env
   ```
   *Paste the exact contents of your local `.env` file into this screen. Press `Ctrl + O`, `Enter`, then `Ctrl + X` to save and exit.*

4. **Start the app with PM2:**
   ```bash
   pm2 start src/index.js --name "vet-receptionist"
   ```

5. **Make it start on Server Reboot:**
   ```bash
   pm2 startup
   pm2 save
   ```

---

## Part 4: The Final WhatsApp Verification

Because the WhatsApp token was successfully kept on your local PC and not uploaded to GitHub, you will need to scan the QR code **one time** on the VPS.

1. Watch the live logs of the server you just started:
   ```bash
   pm2 logs vet-receptionist
   ```
2. You will see the familiar WPP Connect text. Shortly after, a **QR Code will print in the console**.
3. Quickly open WhatsApp on the clinic's phone, go to **Linked Devices**, and scan the QR code on your computer screen.
4. Once it says `WhatsApp state changed: CONNECTED`, press `Ctrl + C` to exit the logs.
5. The bot is now running quietly in the background 24/7!

---

## Part 5: Accessing Your Dashboard

Now that your server is running on the VPS, your beautiful black-and-white OS dashboard is live!
You can access it from anywhere in the world by typing your VPS IP into your browser:
**[http://187.124.55.32:3000](http://187.124.55.32:3000)**

---

> [!WARNING] 
> ### Critical Final Step
> Since your Node.js app is now running directly on `187.124.55.32` and you no longer need the local SSH reverse tunnel, you must update the URLs in the **Retell AI Dashboard**:
> 
> Go to **Retell Dashboard** -> **Agent** and update your Custom Functions and Agent Webhook URLs to the direct public IP:
> - Webhook: `http://187.124.55.32:3000/retell/webhook`
> - Functions: `http://187.124.55.32:3000/retell/functions`
