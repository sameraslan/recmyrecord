import { PrismaClient, Album } from '@prisma/client';
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
    // case 'top-dance-energy':
    //   return handleResponse(await getTopDanceEnergyAlbums());
    case 'longest-albums':
      return handleResponse(await getLongestAlbums());
    case 'instrumental-speechiness':
      return handleResponse(await getAlbumsByInstrumentalnessSpeechiness());
    default:
      return new NextResponse('Query not found', { status: 404 });
  }
}


// Which albums have a higher than average instrumentalness but lower than average speechiness?
async function getAlbumsByInstrumentalnessSpeechiness(): Promise<Album[]> {
  const averages = await prisma.spotifyAudioFeatures.aggregate({
    _avg: {
      Instrumentalness: true,
      Speechiness: true
    }
  });

  return await prisma.album.findMany({
    where: {
      SpotifyAudioFeatures: {
        AND: [
          {
            Instrumentalness: {
              gt: averages._avg.Instrumentalness || 0
            }
          },
          {
            Speechiness: {
              lt: averages._avg.Speechiness || 0
            }
          }
        ]
      }
    },
    include: {
      SpotifyAudioFeatures: true
    }
  });
}


// What are the 3 longest albums?
async function getLongestAlbums() {
  return await prisma.album.findMany({
    take: 3,
    orderBy: {
      SpotifyAudioFeatures: {
        DurationMs: 'desc'
      }
    },
    include: {
      Artist: true,
      SpotifyAudioFeatures: true
    }
  });
}





