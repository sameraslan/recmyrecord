'use client'

import React, { useState } from 'react';
import {
  Box,
  Text,
  Select,
  Container,
  Heading,
  VStack,
  Spinner,
  Alert,
  AlertIcon
} from '@chakra-ui/react';

import styles from '../page.module.css';

// Define the type for the query options
type QueryOption = {
  label: string;
  value: string;
  endpoint: string;
};

// Array of query options
const QUERY_OPTIONS: QueryOption[] = [
  { label: 'Top Albums by Artist', value: 'top-albums-artist', endpoint: '/api/artists?query=top-albums-artist' },
  { label: 'Artists with Consistent High Scores', value: 'consistent-high-scores', endpoint: '/api/artists?query=consistent-high-scores' },
  { label: 'Longest Albums', value: 'longest-albums', endpoint: '/api/albums?query=longest-albums' },
  { label: 'Albums by Instrumentalness and Speechiness', value: 'instrumental-speechiness', endpoint: '/api/albums?query=instrumental-speechiness' }
];

const Page = () => {
  const [selectedQuery, setSelectedQuery] = useState('');
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle selection change
  const handleSelectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const query = QUERY_OPTIONS.find(option => option.value === e.target.value);
    if (query) {
      setSelectedQuery(query.label);
      fetchData(query.endpoint);
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

  return (
    <main className={styles.main}>
        <Container maxW="container.md">
        <VStack spacing={4} align="stretch">
            <Heading as="h1" size="lg">Music Insights</Heading>
            <Select placeholder="Select a query" onChange={handleSelectChange}>
            {QUERY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
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
                <Text fontSize="md">Results for "{selectedQuery}":</Text>
                {/* Render your data here */}
                <pre>{JSON.stringify(data, null, 2)}</pre>
            </Box>
            )}
        </VStack>
        </Container>
    </main>
  );
};

export default Page;
