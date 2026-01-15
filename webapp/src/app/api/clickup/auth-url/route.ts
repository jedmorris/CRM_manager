import { NextResponse } from 'next/server'
import { getClickUpAuthUrl } from '@/lib/clickup'

export async function GET() {
  const authUrl = getClickUpAuthUrl()
  return NextResponse.json({ url: authUrl })
}
