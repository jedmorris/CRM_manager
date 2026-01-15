import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForToken, getGoogleUser } from '@/lib/google'

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 })
    }

    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Exchange code for tokens
        const tokens = await exchangeCodeForToken(code)

        // Get user info (email)
        const googleUser = await getGoogleUser(tokens.access_token)

        // Store in Supabase
        const { error } = await supabase
            .from('profiles')
            .update({
                google_access_token: tokens.access_token,
                google_refresh_token: tokens.refresh_token, // Only present on first grant
                google_email: googleUser.email,
                updated_at: new Date().toISOString(),
            })
            .eq('id', user.id)

        if (error) throw error

        // Redirect back to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.url))
    } catch (error) {
        console.error('Google auth error:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to authenticate with Google' },
            { status: 500 }
        )
    }
}
