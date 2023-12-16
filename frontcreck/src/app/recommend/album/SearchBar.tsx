'use client';

import { useState, useEffect } from 'react';
import { useDebounce } from 'react-use';
import Fuse from 'fuse.js';
import {
  Box,
  Input,
  VStack,
  Text,
  HStack,
  Icon,
  Spinner,
  Button,
} from '@chakra-ui/react';
import { IoIosMusicalNotes } from 'react-icons/io';

export interface Album {
  Title: string;
  Artist: string;
  AlbumNumber: number;
  CoverURL?: string;
}

interface SearchBarProps {
  data: Album[];
  onRecommendationsFetch: (albums: Album[]) => void;
  onLoading: () => void;
  onFetchError: (error: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  data,
  onRecommendationsFetch,
  onLoading,
  onFetchError,
}) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Album[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [loading, setLoading] = useState(false);
  const [showMore, setShowMore] = useState(5);
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [showSearch, setShowSearch] = useState(true);
  const sliderVal = 0.5;
  const numAlbums = 4000;

  const getAlbums = (albumNumber: number) => {
    const url =
      process.env.NEXT_PUBLIC_API_URL +
      '/flask/getSimilarByNumber/' +
      albumNumber +
      '/' +
      sliderVal +
      '/' +
      numAlbums;
    fetch(url)
      .then((res) => res.json())
      .then((response) => {
        const res = JSON.parse(response.albums);
        onRecommendationsFetch(res.results);
      })
      .catch((error) => {
        onFetchError(error.message);
      });
  };

  const handleAlbumClick = (album: Album) => {
    setShowSearch(false);
    setSearch('');
    onLoading();
    getAlbums(album.AlbumNumber);
  };

  useDebounce(
    () => {
      setDebouncedSearch(search);
    },
    300,
    [search],
  );

  useEffect(() => {
    if (debouncedSearch) {
      setShowSearch(true);
      setLoading(true);
      const fuse = new Fuse(data, {
        keys: ['Title', 'Artist'],
        includeScore: true,
        threshold: 0.3,
      });

      const result = fuse.search(debouncedSearch);
      setResults(result.map((item) => item.item));
      setLoading(false);
      setSearchCompleted(true);
      setShowMore(5);
    } else {
      setResults([]);
      setSearchCompleted(false);
      setLoading(false);
    }
  }, [debouncedSearch, data]);

  return (
    <VStack
      spacing={2}
      minWidth={['300px', '300px', '400px', '600px']}
      width={['90%', '80%', '60%', '50%']}
      align="start"
      mx="auto"
    >
      <Input
        placeholder="Search for an album"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        bg="white"
        borderColor="orange.400"
        focusBorderColor="orange.500"
        borderRadius="2xl"
        borderWidth={1.5}
        _hover={{ borderColor: 'orange.500', borderWidth: 2 }}
      />
      {searchCompleted && showSearch && (
        <VStack
          mt={50}
          position="absolute"
          zIndex="dropdown"
          align="start"
          p={4}
          spacing={0}
          width="100%"
          maxH="md"
          overflowY="auto"
          bg="white"
          borderRadius="2xl"
          borderColor="orange.500"
          borderWidth={1}
          opacity={0.9}
        >
          {loading ? (
            <Spinner />
          ) : results.length > 0 ? (
            results.slice(0, showMore).map((album, index) => (
              <Box
                borderRadius={'xl'}
                key={index}
                width="100%"
                p={2}
                _hover={{ bg: 'orange.100' }}
                as="button"
                onClick={() => handleAlbumClick(album)}
              >
                <HStack spacing={4}>
                  <Icon as={IoIosMusicalNotes} color="orange.500" />
                  <Box as="button">
                    <Text>
                      {album.Title} by {album.Artist}
                    </Text>
                  </Box>
                </HStack>
              </Box>
            ))
          ) : (
            <Text>No results found</Text>
          )}
          {results.length > showMore && (
            <Box height={'40px'}>
              <Button mt={2} onClick={() => setShowMore((prev) => prev + 5)}>
                Show more
              </Button>
            </Box>
          )}
        </VStack>
      )}
    </VStack>
  );
};
