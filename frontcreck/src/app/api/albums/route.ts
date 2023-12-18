import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET() {
  const albums = await prisma.album.findMany();
  return new NextResponse(JSON.stringify(albums), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// export async function POST(request: NextRequest) {
//   const data = await request.json();
//   const newAlbum = await prisma.album.create({ data });
//   return new NextResponse(JSON.stringify(newAlbum), {
//     status: 201,
//     headers: { 'Content-Type': 'application/json' }
//   });
// }