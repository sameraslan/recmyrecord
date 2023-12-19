'use client';

import React, { useState } from 'react';
import { HomeButton } from '@/src/global-components/HomeButton';
import {
  Box,
  Text,
  Select,
  Container,
  Heading,
  VStack,
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';

import styles from '../page.module.css';
import ts from 'typescript';

// Define the type for the query options
type QueryOption = {
  label: string;
  value: string;
  endpoint: string;
};

// Array of query options
const QUERY_OPTIONS: QueryOption[] = [
  {
    label: 'What artist has the most albums in the top 500 (AlbumID < 500)?',
    value: 'top-albums-artist',
    endpoint: '/api/artists?query=top-albums-artist',
  },
  {
    label:
      'List all artists whose albums all have high liveness and acousticness (> .75) scores',
    value: 'consistent-high-scores',
    endpoint: '/api/artists?query=consistent-high-scores',
  },
  {
    label: 'What are the 3 longest albums?',
    value: 'longest-albums',
    endpoint: '/api/albums?query=longest-albums',
  },
  {
    label:
      'Which albums have a higher than average instrumentalness but lower than average speechiness?',
    value: 'instrumental-speechiness',
    endpoint: '/api/albums?query=instrumental-speechiness',
  },
];

const Page = () => {
  const [selectedQuery, setSelectedQuery] = useState('');
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle selection change
  const handleSelectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    const query = QUERY_OPTIONS.find(option => option.value === selectedValue);

    if (query) {
      setSelectedQuery(query.label);
      fetchData(query.endpoint);
    } else {
      // Reset data and error when the placeholder option is selected
      setData(null);
      setError('');
      setSelectedQuery('');
    }
  };

  // Fetch data from the API
  const fetchData = async (endpoint: string) => {
    setIsLoading(true);
    setData(null);
    setError('');

    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const result = await response.json();
      setData(result);
    } catch (error) {
      setError('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  // Render function for artist data
  const renderArtistData = (artistData: any) => {
    return (
      <Box>
        <Text fontSize="lg">
          <strong>Artist Name:</strong> {artistData.Name}
        </Text>
        {artistData.SpotifyURI && (
          <Text fontSize="sm">
            <strong>Spotify URI:</strong> {artistData.SpotifyURI}
          </Text>
        )}
      </Box>
    );
  };

  // Render function for album data
  const renderAlbumData = (albumData: any) => {
    return (
      <Box>
        <Text fontSize="lg">
          <strong>Album Title:</strong> {albumData.Title}
        </Text>
        <Text fontSize="sm">
          <strong>Artist:</strong> {albumData.Artist.Name}
        </Text>
      </Box>
    );
  };

  // Render function for album data
  const renderAlbumDataOnly = (albumData: any) => {
    return (
      <Box>
        <Text fontSize="lg">
          <strong>Album Title:</strong> {albumData.Title}
        </Text>
      </Box>
    );
  };

  // Decide which render function to use
  const renderData = () => {
    if (!data) return null;

    switch (selectedQuery) {
      case 'What artist has the most albums in the top 500 (AlbumID < 500)?':
        return renderArtistData(data);
      case 'List all artists whose albums all have high liveness and acousticness (> .75) scores':
        //@ts-ignore
        return data.map((artist) => renderArtistData(artist));
      case 'What are the 3 longest albums?':
      case 'Which albums have a higher than average instrumentalness but lower than average speechiness?':
        //@ts-ignore
        return data.map((album) => renderAlbumDataOnly(album));
      default:
        return <pre>{JSON.stringify(data, null, 2)}</pre>;
    }
  };

  return (
    <main className={styles.main}>
      <HomeButton />
      <Container maxW="container.md">
        <VStack spacing={4} align="stretch">
          <Heading as="h1" size="lg">
            Music Insights
          </Heading>
          <Select placeholder="Select a query" onChange={handleSelectChange}>
            {QUERY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          {isLoading && <Spinner />}
          {error && (
            <Alert status="error">
              <AlertIcon />
              {error}
            </Alert>
          )}
          {data && (
            <Box>
              <Text fontSize="md">
                Results for &quot;{selectedQuery}&quot;:
              </Text>
              {renderData()}
            </Box>
          )}
        </VStack>
      </Container>
    </main>
  );
};

export default Page;
