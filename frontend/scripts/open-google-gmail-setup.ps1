# Opens Google Cloud pages to create OAuth credentials for this app.
# After creating a "Web application" client, paste Client ID and Secret into .env.local

Write-Host "Opening Google Cloud (Gmail API + Credentials)..."
Start-Process "https://console.cloud.google.com/apis/library/gmail.googleapis.com"
Start-Sleep -Milliseconds 400
Start-Process "https://console.cloud.google.com/apis/credentials"

Write-Host @"

Next steps:
  1) Select or create a project
  2) Enable Gmail API (first tab)
  3) Credentials -> Create Credentials -> OAuth client ID -> Web application
  4) Authorized redirect URI (exactly):
     http://localhost:3000/api/auth/gmail/callback
  5) Copy Client ID + Client Secret into frontend/.env.local as GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET
  6) Restart: npm run dev

"@
