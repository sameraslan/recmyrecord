'use client';

import { useState } from 'react';
import albumData from '@/public/album_data833.json';
import { SearchBar } from './SearchBar';
import { Card } from './Card';
import { Album } from './SearchBar';
import { SkeletonCard } from './SkeletonCard';
import { SimpleGrid, VStack, useToast, Box } from '@chakra-ui/react';
import { HomeButton } from '@/src/global-components/HomeButton';

import styles from '../../page.module.css';

export default function AlbumRecommendationPage() {
  const [recommendedAlbums, setRecommendedAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleRecommendationsFetch = (albums: Album[]) => {
    setRecommendedAlbums(albums);
    setLoading(false);
  };

  const handleLoading = () => {
    setLoading(true);
  };

  const handleFetchError = (error: string) => {
    toast({
      title:
        'Unexpected error retrieving recommendations. Please try again shortly.',
      status: 'error',
      duration: 3000,
      isClosable: true,
      position: 'top-right',
    });
    setLoading(false);
  };

  return (
    <main className={styles.main}>
      <HomeButton />
      <Box position="relative">
        <SearchBar
          data={albumData}
          onRecommendationsFetch={handleRecommendationsFetch}
          onLoading={handleLoading}
          onFetchError={handleFetchError}
        />
      </Box>
      {loading && (
        <VStack align="stretch" spacing={6} width="full" px={6}>
          <SkeletonCard isMain={true} />
          <SimpleGrid
            columns={{ base: 1, sm: 1, md: 3, lg: 4, xl: 5 }}
            spacing={10}
            justifyItems="center"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </SimpleGrid>
        </VStack>
      )}
      {recommendedAlbums.length > 0 && !loading && (
        <VStack align="stretch" spacing={6} width="full" px={6}>
          <Card
            key={recommendedAlbums[0].AlbumNumber}
            album={recommendedAlbums[0]}
            isMain={true}
          />
          <SimpleGrid
            columns={{ base: 1, sm: 1, md: 3, lg: 4, xl: 5 }}
            spacing={10}
            justifyItems="center"
          >
            {recommendedAlbums.slice(1).map((album) => (
              <Card key={album.AlbumNumber} album={album} />
            ))}
          </SimpleGrid>
        </VStack>
      )}
    </main>
  );
}
