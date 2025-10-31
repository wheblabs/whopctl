import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ 
    message: 'Hello from WhopCtl Test App!',
    timestamp: new Date().toISOString(),
  })
}

