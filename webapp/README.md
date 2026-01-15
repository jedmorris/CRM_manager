# ClickUp CRM Automation

A web application that lets users automate their ClickUp CRM using natural language commands powered by Claude AI.

## Features

- OAuth authentication with ClickUp
- Natural language chat interface to manage ClickUp
- Create, update, and search tasks
- View workspaces, spaces, and lists
- Add comments to tasks
- Secure token storage with Supabase

## Setup Guide

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once created, go to **Settings > API** and copy:
   - Project URL (`NEXT_PUBLIC_SUPABASE_URL`)
   - Anon/Public key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. Go to **SQL Editor** and run the contents of `supabase-schema.sql`

### 2. Create a ClickUp OAuth App

1. Go to [ClickUp API Settings](https://app.clickup.com/settings/apps)
2. Click **Create an App**
3. Fill in:
   - **App Name**: Your app name (e.g., "CRM Automation")
   - **Redirect URL(s)**: `http://localhost:3000/auth/callback` (add your production URL later)
4. Copy the **Client ID** and **Client Secret**

### 3. Get an Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Copy the key

### 4. Configure Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
```

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# ClickUp OAuth
CLICKUP_CLIENT_ID=your-clickup-client-id
CLICKUP_CLIENT_SECRET=your-clickup-client-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### 5. Install Dependencies and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

1. **User Sign Up/Login**: Users create an account using email/password (stored in Supabase Auth)
2. **Connect ClickUp**: Users click "Connect ClickUp" which initiates OAuth flow
3. **Store Tokens**: After authorization, the access token is stored securely in Supabase
4. **Chat Interface**: Users type natural language commands
5. **Claude Processing**: Messages are sent to Claude with ClickUp tools
6. **Tool Execution**: Claude calls ClickUp API on behalf of the user
7. **Response**: Results are returned to the user in the chat

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repository
3. Add environment variables in Vercel dashboard
4. Update `NEXT_PUBLIC_APP_URL` to your Vercel domain
5. Add your Vercel domain to ClickUp OAuth redirect URLs

### Post-Deployment Checklist

- [ ] Update `NEXT_PUBLIC_APP_URL` to production URL
- [ ] Add production URL to ClickUp OAuth redirect URLs
- [ ] Configure Supabase auth redirect URLs in Supabase dashboard

## Available Commands

Users can ask the AI to:

- "Show me all my workspaces"
- "List spaces in workspace [name]"
- "Get all tasks in [list name]"
- "Create a task called [name] in [list]"
- "Update task [name] to status [status]"
- "Add a comment to task [name]"
- "Search for tasks about [keyword]"

## Tech Stack

- **Frontend**: Next.js 15, React, Tailwind CSS
- **Backend**: Next.js API Routes
- **Auth & Database**: Supabase
- **AI**: Claude API (Anthropic)
- **Deployment**: Vercel
