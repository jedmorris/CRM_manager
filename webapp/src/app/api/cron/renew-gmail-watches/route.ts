import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { setupGmailWatch } from '@/lib/gmail-watch'
import { refreshGoogleToken } from '@/lib/google'

// Lazy-initialize admin Supabase client
let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

/**
 * GET /api/cron/renew-gmail-watches
 *
 * Cron job to renew Gmail watches before they expire.
 * Gmail watches expire after 7 days, so we renew any expiring within 24 hours.
 *
 * Call this endpoint daily via:
 * - Vercel Cron: Add to vercel.json
 * - External cron service (e.g., cron-job.org)
 * - GitHub Actions scheduled workflow
 *
 * Security: Verify cron secret to prevent unauthorized calls.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const results: Array<{ automation_id: string; status: string; error?: string }> = []

  try {
    // Find Gmail automations with watches expiring in the next 24 hours
    const expirationThreshold = new Date()
    expirationThreshold.setHours(expirationThreshold.getHours() + 24)

    const { data: automations, error: fetchError } = await supabase
      .from('automations')
      .select('id, user_id, gmail_watch_expiration')
      .like('trigger_type', 'gmail_%')
      .eq('status', 'active')
      .not('gmail_watch_expiration', 'is', null)
      .lt('gmail_watch_expiration', expirationThreshold.toISOString())

    if (fetchError) {
      throw new Error(`Failed to fetch automations: ${fetchError.message}`)
    }

    if (!automations || automations.length === 0) {
      return NextResponse.json({
        message: 'No Gmail watches need renewal',
        renewed: 0,
      })
    }

    console.log(`Found ${automations.length} Gmail watches to renew`)

    // Group automations by user to avoid redundant token refreshes
    const userAutomations = new Map<string, typeof automations>()
    for (const automation of automations) {
      const existing = userAutomations.get(automation.user_id) || []
      existing.push(automation)
      userAutomations.set(automation.user_id, existing)
    }

    // Process each user's automations
    for (const [userId, userAutomationList] of userAutomations) {
      // Get user's Google tokens
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('google_access_token, google_refresh_token')
        .eq('id', userId)
        .single()

      if (profileError || !profile?.google_access_token) {
        for (const automation of userAutomationList) {
          results.push({
            automation_id: automation.id,
            status: 'error',
            error: 'No Google tokens found',
          })
        }
        continue
      }

      let accessToken = profile.google_access_token

      // Try to refresh the token first (it may be expired)
      if (profile.google_refresh_token) {
        try {
          const newTokens = await refreshGoogleToken(profile.google_refresh_token)
          accessToken = newTokens.access_token

          // Update the access token in the database
          await supabase
            .from('profiles')
            .update({ google_access_token: accessToken })
            .eq('id', userId)
        } catch (refreshError) {
          console.error(`Failed to refresh token for user ${userId}:`, refreshError)
          // Continue with existing token, it might still work
        }
      }

      // Renew watch for each automation
      for (const automation of userAutomationList) {
        try {
          await setupGmailWatch(
            supabase,
            automation.id,
            accessToken,
            profile.google_refresh_token
          )

          results.push({
            automation_id: automation.id,
            status: 'renewed',
          })

          console.log(`Renewed Gmail watch for automation ${automation.id}`)
        } catch (watchError) {
          const errorMessage = watchError instanceof Error ? watchError.message : String(watchError)

          // Mark automation as errored
          await supabase
            .from('automations')
            .update({
              status: 'error',
              last_error: `Gmail watch renewal failed: ${errorMessage}`,
            })
            .eq('id', automation.id)

          results.push({
            automation_id: automation.id,
            status: 'error',
            error: errorMessage,
          })

          console.error(`Failed to renew watch for automation ${automation.id}:`, watchError)
        }
      }
    }

    const renewed = results.filter((r) => r.status === 'renewed').length
    const failed = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      message: `Processed ${results.length} Gmail watches`,
      renewed,
      failed,
      results,
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
