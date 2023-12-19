import { PrismaClient, Artist } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const prisma = new PrismaClient();

// Helper to handle responses
const handleResponse = (data: any) => {
  return new NextResponse(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('query');

  switch (query) {
    case 'top-albums-artist':
      return handleResponse(await getArtistWithMostTopAlbums());
    case 'consistent-high-scores':
      return handleResponse(await getArtistsWithConsistentHighScores());
    default:
      return new NextResponse('Query not found', { status: 404 });
  }
}

// Artist with the most albums with in the top 500 (AlbumID < 500)
async function getArtistWithMostTopAlbums(): Promise<Artist | null> {
  const artists = await prisma.artist.findMany({
    include: {
      _count: {
        select: {
          Albums: {
            where: {
              AlbumID: {
                gt: 500
              }
            }
          }
        }
      }
    },
    orderBy: {
      Albums: {
        _count: 'desc'
      }
    },
    take: 1
  });

  return artists[0] || null;
}

// Artists whose albums consistently have high liveness and acousticness scores
async function getArtistsWithConsistentHighScores(): Promise<Artist[]> {
  return await prisma.artist.findMany({
    where: {
      Albums: {
        every: {
          SpotifyAudioFeatures: {
            AND: [
              { Liveness: { gt: 0.75 } },
              { Acousticness: { gt: 0.75 } }
            ]
          }
        }
      }
    }
  });
}
