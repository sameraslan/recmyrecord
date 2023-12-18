import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET() {
  const artists = await prisma.artist.findMany();
  return new NextResponse(JSON.stringify(artists), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// export async function POST(request: NextRequest) {
//   const data = await request.json();
//   const newArtist = await prisma.artist.create({ data });
//   return new NextResponse(JSON.stringify(newArtist), {
//     status: 201,
//     headers: { 'Content-Type': 'application/json' }
//   });
// }
