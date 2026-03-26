import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Pega o IP real do cliente
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  
  // Tenta diferentes headers para encontrar o IP real
  let ip = realIP || 
           (forwarded ? forwarded.split(',')[0].trim() : null) || 
           cfConnectingIP || 
           'unknown';
  
  const info: any = {
    timestamp: new Date().toISOString(),
    requestIP: ip,
    headers: {
      'x-forwarded-for': forwarded,
      'x-real-ip': realIP,
      'cf-connecting-ip': cfConnectingIP,
      'x-vercel-ip-city': request.headers.get('x-vercel-ip-city'),
      'x-vercel-ip-country': request.headers.get('x-vercel-ip-country'),
      'x-vercel-ip-region': request.headers.get('x-vercel-ip-region'),
    },
    vercelInfo: {
      deploymentUrl: process.env.VERCEL_URL,
      environment: process.env.NODE_ENV || 'unknown',
      region: process.env.VERCEL_REGION || 'unknown',
    }
  };
  
  // Se não conseguir o IP, tenta fazer uma requisição externa
  if (ip === 'unknown') {
    try {
      const externalResponse = await fetch('https://api.ipify.org?format=json');
      const externalData = await externalResponse.json();
      ip = externalData.ip;
      info.requestIP = ip;
      info.externalIP = true;
    } catch (e) {
      info.externalIPError = 'Failed to fetch external IP';
    }
  }
  
  return NextResponse.json(info);
}
