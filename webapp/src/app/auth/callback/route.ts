import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCodeForToken, getClickUpUser } from '@/lib/clickup'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=${encodeURIComponent(error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=no_code`
    )
  }

  try {
    // Exchange code for access token
    const tokens = await exchangeCodeForToken(code)

    // Get ClickUp user info
    const clickUpUser = await getClickUpUser(tokens.access_token)

    // Get or create Supabase client
    const supabase = await createClient()

    // Check if user is authenticated with Supabase
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // Update existing user's ClickUp credentials
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          clickup_access_token: tokens.access_token,
          clickup_user_id: String(clickUpUser.id),
          clickup_username: clickUpUser.username,
          updated_at: new Date().toISOString(),
        })

      if (updateError) {
        console.error('Failed to save ClickUp credentials:', updateError)
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/?error=save_failed`
        )
      }

      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`)
    } else {
      // Store tokens temporarily and redirect to sign up
      // In a real app, you might use a temporary storage or session
      const params = new URLSearchParams({
        clickup_token: tokens.access_token,
        clickup_user_id: String(clickUpUser.id),
        clickup_username: clickUpUser.username,
      })

      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/signup?${params.toString()}`
      )
    }
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/?error=oauth_failed`
    )
  }
}
