import { NextResponse } from 'next/server'
import { getGoogleAuthUrl } from '@/lib/google'

export async function GET() {
    try {
        const url = getGoogleAuthUrl()
        return NextResponse.json({ url })
    } catch (error) {
        console.error('Error generating Google auth URL:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to generate auth URL' },
            { status: 500 }
        )
    }
}
