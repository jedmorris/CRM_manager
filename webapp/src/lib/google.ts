export interface GoogleTokens {
    access_token: string
    refresh_token?: string
    scope: string
    token_type: string
    expiry_date?: number
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API_URL = 'https://gmail.googleapis.com/gmail/v1/users/me'

export function getGoogleAuthUrl(): string {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
    const scopes = [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly', // For watching inbox
        'https://www.googleapis.com/auth/userinfo.email'
    ].join(' ')

    return `${GOOGLE_AUTH_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
    )}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`
}

export async function exchangeCodeForToken(code: string): Promise<GoogleTokens> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`,
            grant_type: 'authorization_code',
        }),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to exchange code for token: ${error}`)
    }

    return response.json()
}

export async function getGoogleUser(accessToken: string): Promise<{ email: string }> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    })

    if (!response.ok) {
        throw new Error('Failed to get Google user info')
    }

    return response.json()
}

export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokens> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    })

    if (!response.ok) {
        throw new Error('Failed to refresh token')
    }

    return response.json()
}

export async function sendEmail(
    accessToken: string,
    to: string,
    subject: string,
    body: string
) {
    // Construct raw email
    const emailLines = [
        `To: ${to}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${subject}`,
        '',
        body,
    ]
    const email = emailLines.join('\r\n')
    const encodedEmail = Buffer.from(email).toString('base64url')

    const response = await fetch(`${GMAIL_API_URL}/messages/send`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            raw: encodedEmail,
        }),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to send email: ${error}`)
    }

    return response.json()
}
