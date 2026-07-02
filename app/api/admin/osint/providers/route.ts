import { NextResponse } from "next/server";
import { providerRegistry } from "@/lib/osint/core/providers/provider.registry";

export async function GET() {
  try {
    const stats = providerRegistry.getAllStats();
    
    // Add additional metrics like total cost if it was tracked by scoring engine,
    // but for now registry stats gives us circuit state and rate limiter.
    
    return NextResponse.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
