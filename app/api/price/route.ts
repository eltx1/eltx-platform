import { NextResponse } from 'next/server';
export async function GET(){
  try{
    if(process.env.PRICE_URL){
      const r = await fetch(process.env.PRICE_URL, { cache: 'no-store' });
      const j = await r.json();
      return NextResponse.json(j);
    }
  }catch(e){}
  return NextResponse.json({ price: null, time: new Date().toISOString() });
}
